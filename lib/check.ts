// The daily Check. One short conversation a day, run over the sets already
// in rotation, grading quietly as it goes. After the pivot every card shows
// all five languages at once, so the Check is the only place a single
// language stands on its own — which makes it the only honest source of the
// drift signal in `drift.ts`.
import { localStore } from './local-store';
import { localDay, newId } from './repo';
import { grade } from './scheduler';
import { dueSets, loadSets, loadSetStates, pushSetStates, saveSetState } from './sets';
import { supabase } from './supabase';
import type {
  CheckAsk,
  CheckRecord,
  CheckResult,
  CheckTurn,
  CheckVerdict,
  LanguageCode,
  LanguageConfig,
  LexemeSet,
} from './types';

const CHECK_PREFIX = 'check.';
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

/** How many exchanges a Check runs for. Two minutes, near enough. */
export const TURNS = 6;
/** How many sets go into the conversation's pool. */
const POOL = 10;
/** How many questions the offline fallback asks. */
export const TAP_COUNT = 10;

export async function loadChecks(): Promise<CheckRecord[]> {
  try {
    const rows = await localStore.list<CheckRecord>(CHECK_PREFIX);
    return rows.map((r) => r.value).sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export async function checkedToday(): Promise<boolean> {
  const today = localDay();
  return (await loadChecks()).some((c) => c.date === today);
}

/**
 * The languages a Check may put on the spot. The script gate applies here as
 * much as anywhere: a language you can't read yet can't be asked about.
 */
export function checkableLanguages(languages: LanguageConfig[]): LanguageCode[] {
  return languages.filter((l) => l.scriptLearned).map((l) => l.code);
}

/**
 * The pool for today's conversation: due sets first, then whatever else the
 * bank holds, keeping only sets that actually render every target language.
 */
export async function checkPool(languages: LanguageCode[]): Promise<LexemeSet[]> {
  const covers = (s: LexemeSet) =>
    languages.every((code) => s.renderings.some((r) => r.languageCode === code && r.term));

  const due = (await dueSets('word', 'any')).filter(covers);
  if (due.length >= POOL) return due.slice(0, POOL);

  // Not enough waiting: fill from the rest of the bank rather than cutting
  // the conversation short.
  const seen = new Set(due.map((s) => s.id));
  const rest = (await loadSets()).filter((s) => s.kind === 'word' && !seen.has(s.id) && covers(s));
  return [...due, ...rest].slice(0, POOL);
}

export interface CheckReply {
  reply: string;
  ask: CheckAsk | null;
  verdicts: CheckVerdict[];
  done: boolean;
}

interface WireAsk {
  set_id: string;
  language_code: string;
}

/**
 * One turn of the conversation. Returns null when the server can't be
 * reached — the screen falls back to the offline tap check rather than
 * showing an error wall.
 */
export async function converse(input: {
  sets: LexemeSet[];
  languages: LanguageCode[];
  transcript: CheckTurn[];
  asked: CheckAsk | null;
  turn: number;
}): Promise<CheckReply | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(`${API_BASE}/api/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sets: input.sets.map((s) => ({
            id: s.id,
            gloss: s.gloss,
            renderings: s.renderings.map((r) => ({
              language_code: r.languageCode,
              term: r.term,
              reading: r.reading,
              say: r.say,
            })),
          })),
          languages: input.languages,
          transcript: input.transcript,
          asked: input.asked
            ? { set_id: input.asked.setId, language_code: input.asked.languageCode }
            : null,
          turn: input.turn,
          total: TURNS,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        reply?: string;
        ask?: WireAsk | null;
        verdicts?: { set_id: string; language_code: string; result: string }[];
        done?: boolean;
      };
      if (!body.reply) return null;
      return {
        reply: body.reply,
        ask: body.ask?.set_id
          ? { setId: body.ask.set_id, languageCode: body.ask.language_code as LanguageCode }
          : null,
        verdicts: (body.verdicts ?? []).map((v) => ({
          setId: v.set_id,
          languageCode: v.language_code as LanguageCode,
          result: v.result as CheckResult,
        })),
        done: body.done === true,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

const WORST: Record<CheckResult, number> = { missed: 0, shaky: 1, solid: 2 };

/**
 * Feed the conversation's verdicts back into the curve. A set can pick up
 * several verdicts across languages in one Check; the weakest one wins,
 * because a meaning you only half-hold in one language isn't held.
 */
export async function applyVerdicts(verdicts: CheckVerdict[]): Promise<void> {
  if (verdicts.length === 0) return;
  const worstBySet = new Map<string, CheckResult>();
  for (const v of verdicts) {
    const current = worstBySet.get(v.setId);
    if (!current || WORST[v.result] < WORST[current]) worstBySet.set(v.setId, v.result);
  }
  const states = await loadSetStates();
  const byId = new Map(states.map((s) => [s.setId, s]));
  for (const [setId, result] of worstBySet) {
    const state = byId.get(setId);
    if (!state) continue;
    await saveSetState(grade(state, result));
  }
  // Once the day's grading has landed, mirror it to the account.
  pushSetStates();
}

/** Store the day's conversation, locally first and then in the account. */
export async function saveCheck(input: {
  transcript: CheckTurn[];
  verdicts: CheckVerdict[];
  minutes: number;
}): Promise<CheckRecord> {
  const record: CheckRecord = {
    id: newId(),
    date: localDay(),
    transcript: input.transcript,
    verdicts: input.verdicts,
    minutes: input.minutes,
    createdAt: new Date().toISOString(),
  };
  await localStore.set(`${CHECK_PREFIX}${record.id}`, record);
  await pushCheck(record);
  return record;
}

async function pushCheck(record: CheckRecord): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('checks').upsert(
      [
        {
          id: record.id,
          date: record.date,
          transcript: record.transcript,
          verdicts: record.verdicts,
          language_codes: [...new Set(record.verdicts.map((v) => v.languageCode))],
          minutes: record.minutes,
          created_at: record.createdAt,
        },
      ],
      { onConflict: 'id' }
    );
  } catch {
    // Checks are local-first; syncing is a convenience.
  }
}

/** Adopt the check history already in the account (fresh device). */
export async function pullChecks(): Promise<number> {
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase
      .from('checks')
      .select('id, date, transcript, verdicts, minutes, created_at')
      .order('date', { ascending: false })
      .limit(400);
    if (error || !data) return 0;
    const have = new Set((await loadChecks()).map((c) => c.id));
    let added = 0;
    for (const row of data) {
      if (have.has(row.id)) continue;
      await localStore.set(`${CHECK_PREFIX}${row.id}`, {
        id: row.id,
        date: row.date,
        transcript: (row.transcript ?? []) as CheckTurn[],
        verdicts: (row.verdicts ?? []) as CheckVerdict[],
        minutes: row.minutes ?? 0,
        createdAt: row.created_at,
      } satisfies CheckRecord);
      added += 1;
    }
    return added;
  } catch {
    return 0;
  }
}
