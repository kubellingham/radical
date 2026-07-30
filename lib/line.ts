// The daily line — the Mirror's real form.
//
// One sentence a day, in one of your languages, written by you. Not a
// journal entry and not a prompt-and-response: a single line. Five years is
// 1,825 of them, and they are the only thing in this app that could not be
// regenerated — every card in the bank is vocabulary a model could produce
// again, and none of the lines are.
//
// The day is the identity, so it is the key: `line.2026-07-30`. Rewriting
// today's line overwrites it, and an anniversary is a lookup rather than a
// scan.
import { localStore } from './local-store';
import { enqueueLine, localDay } from './repo';
import { supabase } from './supabase';
import type { DailyLine, LanguageCode, LanguageConfig } from './types';

const LINE_PREFIX = 'line.';

/** Every line ever written, newest first. */
export async function loadLines(): Promise<DailyLine[]> {
  try {
    const rows = await localStore.list<DailyLine>(LINE_PREFIX);
    return rows.map((r) => r.value).sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export async function lineFor(day: string): Promise<DailyLine | null> {
  try {
    return await localStore.get<DailyLine>(`${LINE_PREFIX}${day}`);
  } catch {
    return null;
  }
}

/**
 * The languages a line may be written in. The script gate applies here as
 * everywhere else: writing in a script you can't read yet would be writing
 * romanization, and romanization has to be unlearned.
 */
export function writableLanguages(languages: LanguageConfig[]): LanguageCode[] {
  return languages.filter((l) => l.scriptLearned).map((l) => l.code);
}

/**
 * Which language today's line wants to be in. The one you have written in
 * least often, so that over five years the corpus comes out even rather than
 * eighty percent whichever language was easiest in year one. Always
 * overridable — this is a suggestion, not an assignment.
 */
export async function suggestedLanguage(
  languages: LanguageConfig[]
): Promise<LanguageCode | null> {
  const writable = writableLanguages(languages);
  if (writable.length === 0) return null;
  const lines = await loadLines();
  const counts = new Map<LanguageCode, number>(writable.map((c) => [c, 0]));
  for (const line of lines) {
    const n = counts.get(line.languageCode);
    if (n !== undefined) counts.set(line.languageCode, n + 1);
  }
  // Ties go to setup order, so the choice is stable from one day to the next.
  let best = writable[0];
  for (const code of writable) {
    if ((counts.get(code) ?? 0) < (counts.get(best) ?? 0)) best = code;
  }
  return best;
}

/**
 * Write (or rewrite) today's line. Local first and always: a line written
 * with no signal must survive, so it lands on disk before anything else is
 * attempted.
 *
 * Only today. A past line is what you could write on that day, and the
 * anniversary echo becomes a lie the moment old lines can be edited into
 * something you could not have written then. Do not "fix" this.
 *
 * The script gate is enforced again here, independent of the screen above —
 * the same way saveDump re-checks it.
 */
export async function saveLine(input: {
  text: string;
  languageCode: LanguageCode;
  languages: LanguageConfig[];
}): Promise<DailyLine | null> {
  const text = input.text.trim();
  if (!text) return null;
  if (!writableLanguages(input.languages).includes(input.languageCode)) return null;

  const line: DailyLine = {
    date: localDay(),
    languageCode: input.languageCode,
    text,
    createdAt: new Date().toISOString(),
  };
  await localStore.set(`${LINE_PREFIX}${line.date}`, line);
  // Through the outbox, not fire-and-forget. "Syncing is a convenience" is
  // a fair thing to say about a bank a model can generate again; it is not a
  // fair thing to say about a sentence written by hand once. A failed push
  // has to be retried, not dropped.
  await enqueueLine(line);
  return line;
}

/** Adopt the lines already in the account (fresh device). Local wins. */
export async function pullLines(): Promise<number> {
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase
      .from('daily_lines')
      .select('date, language_code, text, created_at')
      .order('date', { ascending: false })
      .limit(2000);
    if (error || !data) return 0;
    let added = 0;
    for (const row of data) {
      // A line written on this device is the one that was actually typed
      // here; never overwrite it with the remote copy.
      if (await lineFor(row.date)) continue;
      await localStore.set(`${LINE_PREFIX}${row.date}`, {
        date: row.date,
        languageCode: row.language_code as LanguageCode,
        text: row.text,
        createdAt: row.created_at,
      } satisfies DailyLine);
      added += 1;
    }
    return added;
  } catch {
    return 0;
  }
}
