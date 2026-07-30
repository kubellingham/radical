// The bank. A set is one meaning in every language at once, and the Feed
// draws from here. The bank must never run dry: when it gets low, a fresh
// batch is generated in the background, and the user never waits for it.
import { localStore } from './local-store';
import { localDay, newId } from './repo';
import { isDue } from './scheduler';
import { supabase } from './supabase';
import type { ContextTag, LexemeSet, Rendering, SetState } from './types';

const SET_PREFIX = 'set.';
const STATE_PREFIX = 'set_state.';

/** Below this many unseen sets, top the bank up. */
const LOW_WATER = 12;
/**
 * How many to ask for each time. Kept modest because generating all five
 * languages for one entry is real work — a batch takes tens of seconds, and
 * a smaller batch that lands beats a bigger one that times out.
 */
const BATCH = 16;

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

export async function loadSets(): Promise<LexemeSet[]> {
  try {
    return (await localStore.list<LexemeSet>(SET_PREFIX)).map((r) => r.value);
  } catch {
    return [];
  }
}

export async function loadSetStates(): Promise<SetState[]> {
  try {
    return (await localStore.list<SetState>(STATE_PREFIX)).map((r) => r.value);
  } catch {
    return [];
  }
}

export async function saveSetState(state: SetState): Promise<void> {
  await localStore.set(`${STATE_PREFIX}${state.setId}`, state);
}

/** Adds sets the bank doesn't already hold, keyed by gloss + kind. */
export async function addSets(incoming: LexemeSet[]): Promise<number> {
  const have = new Set((await loadSets()).map(key));
  let added = 0;
  for (const set of incoming) {
    if (have.has(key(set))) continue;
    await localStore.set(`${SET_PREFIX}${set.id}`, set);
    await localStore.set(`${STATE_PREFIX}${set.id}`, freshState(set.id));
    have.add(key(set));
    added += 1;
  }
  return added;
}

function key(set: { kind: string; gloss: string }): string {
  return `${set.kind}:${set.gloss.trim().toLowerCase()}`;
}

function freshState(setId: string): SetState {
  return {
    setId,
    strength: 0,
    lastSeen: null,
    nextDue: localDay(),
    timesSeen: 0,
    timesMissed: 0,
  };
}

/** Sets that have never been seen — the part of the bank still ahead of you. */
export async function unseenCount(): Promise<number> {
  const states = await loadSetStates();
  return states.filter((s) => s.timesSeen === 0).length;
}

let refillInFlight: Promise<number> | null = null;

/**
 * Top the bank up if it's running low. Fire-and-forget: callers never await
 * this, so an empty deck is the only thing the user could ever notice, and
 * the starter bank plus this keeps that from happening.
 */
export function refillIfLow(kind: 'word' | 'sentence' = 'word'): Promise<number> {
  if (refillInFlight) return refillInFlight;
  refillInFlight = (async () => {
    try {
      if ((await unseenCount()) >= LOW_WATER) return 0;
      return await generateBatch(kind, BATCH);
    } catch {
      return 0;
    } finally {
      refillInFlight = null;
    }
  })();
  return refillInFlight;
}

/** Ask the server for a fresh batch. Requires a session; fails quietly. */
export async function generateBatch(
  kind: 'word' | 'sentence',
  count: number,
  context?: ContextTag
): Promise<number> {
  if (!supabase) return 0;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 0;

  // Send what we already have so the model doesn't hand back duplicates.
  const existing = await loadSets();
  const avoid = existing
    .filter((s) => s.kind === kind)
    .slice(-120)
    .map((s) => s.gloss);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${API_BASE}/api/sets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, count, avoid, context }),
      signal: controller.signal,
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as { sets?: WireSet[]; kind?: 'word' | 'sentence' };
    if (!body.sets?.length) return 0;
    // Trust what we asked for; the envelope only ever echoes it back.
    const added = await addSets(body.sets.map((w) => fromWire(w, body.kind ?? kind)));
    await pushSets(await loadSets());
    return added;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

const BACKFILL_KEY = 'sets.backfilled';
const SAY_KEY = 'sets.pronounced';

/**
 * Sets built before say-lines existed have no pronunciation. Fill them in
 * without regenerating the vocabulary itself — the words are already right,
 * only the how-to-say-it line is missing. Runs a batch per launch until done.
 */
export async function backfillPronunciations(): Promise<number> {
  if (!supabase) return 0;
  try {
    if (await localStore.get<boolean>(SAY_KEY)) return 0;
    const sets = await loadSets();
    const missing = sets.filter((s) => s.renderings.some((r) => !r.say));
    if (missing.length === 0) {
      await localStore.set(SAY_KEY, true);
      return 0;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return 0;

    const batch = missing.slice(0, 25);
    const res = await fetch(`${API_BASE}/api/sets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        pronounce: batch.map((s) => ({
          gloss: s.gloss,
          renderings: s.renderings.map((r) => ({
            language_code: r.languageCode,
            term: r.term,
          })),
        })),
      }),
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as { sets?: WireSet[] };
    if (!body.sets?.length) return 0;

    // Merge say-lines into the sets we already hold; never replace wording.
    const byGloss = new Map(body.sets.map((w) => [w.gloss.trim().toLowerCase(), w]));
    let filled = 0;
    for (const set of batch) {
      const w = byGloss.get(set.gloss.trim().toLowerCase());
      if (!w) continue;
      const sayFor = new Map(w.renderings.map((r) => [r.language_code, (r.say ?? '').trim()]));
      const updated: LexemeSet = {
        ...set,
        renderings: set.renderings.map((r) => ({
          ...r,
          say: r.say || sayFor.get(r.languageCode) || '',
        })),
      };
      await localStore.set(`${SET_PREFIX}${set.id}`, updated);
      filled += 1;
    }
    if (filled > 0) await pushSets(await loadSets());
    if (missing.length <= batch.length) await localStore.set(SAY_KEY, true);
    return filled;
  } catch {
    return 0;
  }
}

/**
 * Words captured before sets existed would otherwise never appear again —
 * the Feed draws sets, and expansion only runs on new saves. Runs once.
 */
export async function backfillCaptured(): Promise<number> {
  try {
    if (await localStore.get<boolean>(BACKFILL_KEY)) return 0;
    const { loadItems } = await import('./repo');
    const items = await loadItems();
    if (items.length === 0) {
      await localStore.set(BACKFILL_KEY, true);
      return 0;
    }
    // Skip anything whose meaning is already a set.
    const known = new Set((await loadSets()).map((s) => s.gloss.trim().toLowerCase()));
    const pending = items.filter((i) => i.meaning && !known.has(i.meaning.trim().toLowerCase()));
    if (pending.length === 0) {
      await localStore.set(BACKFILL_KEY, true);
      return 0;
    }
    const added = await expandCaptured(
      pending.map((i) => ({ term: i.term, languageCode: i.languageCode, meaning: i.meaning }))
    );
    // Only mark done when the call actually succeeded, so a failure retries.
    if (added > 0 || pending.length === 0) await localStore.set(BACKFILL_KEY, true);
    return added;
  } catch {
    return 0;
  }
}

/**
 * A word captured in one language comes back rendered in all five, so what
 * you found out in the world joins the same rotation as everything else.
 * Fire-and-forget: filing never waits on it.
 */
export async function expandCaptured(
  captured: { term: string; languageCode: string; meaning: string }[]
): Promise<number> {
  if (!supabase || captured.length === 0) return 0;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return 0;

    // Ask about each word once. Sent the same term twice, the model answers
    // twice in slightly different words — "the bill" and "the bill (check)" —
    // and those are two different glosses, so the bank's kind:gloss key
    // cannot see they are the same card. Deduping the question is the only
    // place this is cheap to fix: stripping parentheticals from the answer
    // would merge "bank (river)" into "bank (money)".
    const seen = new Set<string>();
    const unique = captured.filter((c) => {
      const k = `${c.languageCode}:${c.term.trim().toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const res = await fetch(`${API_BASE}/api/sets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        expand: unique.slice(0, 30).map((c) => ({
          term: c.term,
          language_code: c.languageCode,
          meaning: c.meaning,
        })),
      }),
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as { sets?: WireSet[] };
    if (!body.sets?.length) return 0;
    // A captured word expands into a word, never a sentence.
    const sets = body.sets.map((w) => ({ ...fromWire(w, 'word'), origin: 'captured' as const }));
    const added = await addSets(sets);
    await pushSets(sets);
    return added;
  } catch {
    return 0;
  }
}

interface WireSet {
  gloss: string;
  context_tag?: string;
  sino_root?: string;
  renderings: { language_code: string; term: string; reading: string; say?: string }[];
}

/**
 * The kind comes from the response envelope, never from the entry. The
 * generator's schema is `additionalProperties: false` and does not include
 * kind, so an entry can't carry one — reading it off the entry silently
 * filed every generated sentence as a word, which is why the sentence bank
 * never grew past the bundled starters and Today kept rotating the same few.
 */
function fromWire(w: WireSet, kind: 'word' | 'sentence'): LexemeSet {
  return {
    id: newId(),
    gloss: (w.gloss ?? '').trim(),
    kind,
    renderings: (w.renderings ?? [])
      .filter((r) => r.term?.trim())
      .map((r) => ({
        languageCode: r.language_code as Rendering['languageCode'],
        term: r.term.trim(),
        reading: (r.reading ?? '').trim(),
        say: (r.say ?? '').trim(),
      })),
    sinoRoot: w.sino_root?.trim() ? w.sino_root.trim() : null,
    contextTag: (w.context_tag?.trim() as ContextTag) || null,
    origin: 'generated',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Mirror the bank to Supabase so a second device inherits it rather than
 * paying to generate the same sets again. Quiet on failure.
 */
export async function pushSets(sets: LexemeSet[]): Promise<void> {
  if (!supabase || sets.length === 0) return;
  try {
    const rows = sets.map((s) => ({
      id: s.id,
      gloss: s.gloss,
      kind: s.kind,
      renderings: s.renderings,
      sino_root: s.sinoRoot,
      context_tag: s.contextTag,
      origin: s.origin,
      created_at: s.createdAt,
    }));
    await supabase.from('lexeme_sets').upsert(rows, { onConflict: 'user_id,kind,gloss' });
  } catch {
    // The bank is local-first; syncing is a convenience.
  }
}

/**
 * Mirror scheduling state too. Keyed by kind + gloss rather than by set id,
 * because each device mints its own id and the bank upserts on the natural
 * key — state filed under a second device's id would point at nothing.
 *
 * Without this the bank survives a device change but everything in it looks
 * unseen again, which quietly throws away the only record of what you have
 * actually worked. Quiet on failure; retried on the next save.
 */
export async function pushSetStates(): Promise<void> {
  if (!supabase) return;
  try {
    const [sets, states] = await Promise.all([loadSets(), loadSetStates()]);
    const byId = new Map(sets.map((s) => [s.id, s]));
    const rows = [];
    for (const state of states) {
      const set = byId.get(state.setId);
      // Untouched state carries no information worth a round trip.
      if (!set || state.timesSeen === 0) continue;
      rows.push({
        kind: set.kind,
        gloss: set.gloss,
        strength: state.strength,
        last_seen: state.lastSeen,
        next_due: state.nextDue,
        times_seen: state.timesSeen,
        times_missed: state.timesMissed,
      });
    }
    if (rows.length === 0) return;
    await supabase.from('lexeme_set_state').upsert(rows, { onConflict: 'user_id,kind,gloss' });
  } catch {
    // State is local-first; syncing is a convenience.
  }
}

/** Adopt the bank already in the account (fresh device), state included. */
export async function pullSets(): Promise<number> {
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase
      .from('lexeme_sets')
      .select('id, gloss, kind, renderings, sino_root, context_tag, origin, created_at')
      .limit(2000);
    if (error || !data) return 0;
    const added = await addSets(
      data.map((r) => ({
        id: r.id,
        gloss: r.gloss,
        kind: r.kind,
        renderings: r.renderings as Rendering[],
        sinoRoot: r.sino_root,
        contextTag: r.context_tag,
        origin: r.origin,
        createdAt: r.created_at,
      }))
    );
    await pullSetStates();
    return added;
  } catch {
    return 0;
  }
}

/**
 * Bring remote scheduling state onto this device. The more-worked side wins
 * per set: a set seen ten times elsewhere and never here is genuinely ten
 * times seen, and taking the maximum means two devices converge instead of
 * sawing each other's progress off.
 */
export async function pullSetStates(): Promise<number> {
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase
      .from('lexeme_set_state')
      .select('kind, gloss, strength, last_seen, next_due, times_seen, times_missed')
      .limit(4000);
    if (error || !data || data.length === 0) return 0;

    const remote = new Map(data.map((r) => [`${r.kind}:${r.gloss.trim().toLowerCase()}`, r]));
    const [sets, states] = await Promise.all([loadSets(), loadSetStates()]);
    const stateBySet = new Map(states.map((s) => [s.setId, s]));
    let adopted = 0;

    for (const set of sets) {
      const r = remote.get(key(set));
      if (!r) continue;
      const local = stateBySet.get(set.id);
      if (local && local.timesSeen >= r.times_seen) continue;
      await saveSetState({
        setId: set.id,
        strength: r.strength,
        lastSeen: r.last_seen,
        nextDue: r.next_due ?? localDay(),
        timesSeen: r.times_seen,
        timesMissed: r.times_missed,
      });
      adopted += 1;
    }
    return adopted;
  } catch {
    return 0;
  }
}

/** The sets waiting right now, oldest-due first. */
export async function dueSets(kind: 'word' | 'sentence', context: ContextTag | 'any') {
  const today = localDay();
  const [sets, states] = await Promise.all([loadSets(), loadSetStates()]);
  const stateById = new Map(states.map((s) => [s.setId, s]));
  return sets
    .filter((s) => s.kind === kind)
    .filter((s) => context === 'any' || s.contextTag === context)
    .filter((s) => {
      const st = stateById.get(s.id);
      return st ? isDue(st, today) : true;
    })
    .sort((a, b) => {
      const sa = stateById.get(a.id);
      const sb = stateById.get(b.id);
      return `${sa?.nextDue ?? ''}${sa?.timesSeen ?? 0}`.localeCompare(
        `${sb?.nextDue ?? ''}${sb?.timesSeen ?? 0}`
      );
    });
}

/** The sentence to sit at the top of Today — stable for the whole day. */
export async function sentenceOfTheDay(): Promise<LexemeSet | null> {
  const sets = (await loadSets()).filter((s) => s.kind === 'sentence');
  if (sets.length === 0) return null;
  const states = await loadSetStates();
  const seen = new Map(states.map((s) => [s.setId, s.timesSeen]));
  // Rotate by day so it changes daily, preferring ones you've seen least.
  const ordered = [...sets].sort(
    (a, b) => (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0) || a.id.localeCompare(b.id)
  );
  const dayIndex = Number(localDay().replaceAll('-', '')) % Math.max(1, ordered.length);
  const pool = ordered.slice(0, Math.max(1, Math.min(5, ordered.length)));
  return pool[dayIndex % pool.length] ?? ordered[0];
}
