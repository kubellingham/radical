// Items, item state, and the session log. Local first, always; Supabase gets
// the same writes through an outbox that drains whenever it can.
import * as Crypto from 'expo-crypto';

import { localStore } from './local-store';
import { loadSetup } from './setup';
import { supabase } from './supabase';
import type {
  DailyLine,
  DraftItem,
  Item,
  ItemState,
  LanguageCode,
  SessionEntry,
  SessionKind,
} from './types';

const SESSIONS_KEY = 'sessions.log';
const OUTBOX_KEY = 'outbox.queue';
const LANGUAGE_IDS_KEY = 'languages.ids';

interface OutboxEntry {
  id: string;
  items: Item[];
  states: ItemState[];
  session: SessionEntry | null;
  /**
   * A day's line. Read with `?? null` because entries queued before lines
   * existed have no such field.
   */
  line?: DailyLine | null;
}

/** Queue a day's line for Supabase. Drained by the same outbox as everything else. */
export async function enqueueLine(line: DailyLine): Promise<{ synced: boolean }> {
  await enqueue({ id: newId(), items: [], states: [], session: null, line });
  return { synced: await flushOutbox() };
}

// crypto.randomUUID is missing on insecure web origins (plain-http dev
// servers); build the v4 uuid from random bytes there.
export function newId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    const b = Crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

// The kv store has no transactions, so read-modify-write sequences on a
// shared key must not interleave — a stale write-back silently drops the
// other writer's data. One promise-chain lock per contended key.
function makeLock() {
  let chain: Promise<unknown> = Promise.resolve();
  return function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}

const withOutboxLock = makeLock();
const withSessionsLock = makeLock();

/** The user's local day as YYYY-MM-DD — never the UTC day. */
export function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function saveDump(input: {
  drafts: DraftItem[];
  minutes: number;
  note: string;
}): Promise<{ itemCount: number; synced: boolean }> {
  const now = new Date().toISOString();
  const today = localDay();

  // Script gate, enforced at the write: no vocabulary for a language whose
  // script isn't learned, whatever the screen above did.
  const setup = await loadSetup();
  const unlocked = new Set(setup.languages.filter((l) => l.scriptLearned).map((l) => l.code));
  const drafts = input.drafts.filter((d) => unlocked.has(d.languageCode));

  const items: Item[] = drafts.map((d) => ({
    id: newId(),
    languageCode: d.languageCode,
    term: d.term.trim(),
    reading: blank(d.reading),
    meaning: d.meaning.trim(),
    example: blank(d.example),
    exampleMeaning: blank(d.exampleMeaning),
    contextTag: d.contextTag === '' ? null : d.contextTag,
    sinoRoot: blank(d.sinoRoot),
    origin: 'dump',
    createdAt: now,
  }));
  const states: ItemState[] = items.map((item) => ({
    itemId: item.id,
    strength: 0,
    lastSeen: null,
    nextDue: today,
    timesSeen: 0,
    timesMissed: 0,
  }));
  const session: SessionEntry = {
    id: newId(),
    date: today,
    kind: 'dump',
    languageCode: soleLanguage(items),
    minutes: input.minutes,
    note: blank(input.note),
    createdAt: now,
  };

  for (const item of items) await localStore.set(`item.${item.id}`, item);
  for (const state of states) await localStore.set(`item_state.${state.itemId}`, state);
  await appendSession(session);
  await enqueue({ id: newId(), items, states, session });
  const synced = await flushOutbox();

  // Bring what you captured back as full sets — all five languages — so it
  // joins the Feed rather than sitting in a single-language corner. Behind
  // the save; nothing waits on it.
  if (items.length > 0) {
    import('./sets')
      .then((m) =>
        m.expandCaptured(
          items.map((i) => ({
            term: i.term,
            languageCode: i.languageCode,
            meaning: i.meaning,
          }))
        )
      )
      .catch(() => {});
  }
  return { itemCount: items.length, synced };
}

export async function logSession(input: {
  kind: SessionKind;
  minutes: number;
  note: string;
  languageCode: LanguageCode | null;
}): Promise<{ synced: boolean }> {
  const session: SessionEntry = {
    id: newId(),
    date: localDay(),
    kind: input.kind,
    languageCode: input.languageCode,
    minutes: input.minutes,
    note: blank(input.note),
    createdAt: new Date().toISOString(),
  };
  await appendSession(session);
  await enqueue({ id: newId(), items: [], states: [], session });
  const synced = await flushOutbox();
  return { synced };
}

export async function loadItems(): Promise<Item[]> {
  try {
    return (await localStore.list<Item>('item.')).map((r) => r.value);
  } catch {
    return [];
  }
}

export async function loadItemStates(): Promise<ItemState[]> {
  try {
    return (await localStore.list<ItemState>('item_state.')).map((r) => r.value);
  } catch {
    return [];
  }
}

export async function saveItemState(state: ItemState): Promise<void> {
  await localStore.set(`item_state.${state.itemId}`, state);
  await enqueue({ id: newId(), items: [], states: [state], session: null });
}

/** Add pack-sourced items to the rotation, local first then queued to sync. */
export async function addItems(items: Item[], states: ItemState[]): Promise<void> {
  for (const item of items) await localStore.set(`item.${item.id}`, item);
  for (const state of states) await localStore.set(`item_state.${state.itemId}`, state);
  await enqueue({ id: newId(), items, states, session: null });
}

export async function loadSessions(): Promise<SessionEntry[]> {
  try {
    return (await localStore.get<SessionEntry[]>(SESSIONS_KEY)) ?? [];
  } catch {
    return [];
  }
}

/** True when nothing is waiting to reach Supabase. */
export async function outboxEmpty(): Promise<boolean> {
  const queue = (await localStore.get<OutboxEntry[]>(OUTBOX_KEY)) ?? [];
  return queue.length === 0;
}

async function appendSession(session: SessionEntry): Promise<void> {
  await withSessionsLock(async () => {
    const log = (await localStore.get<SessionEntry[]>(SESSIONS_KEY)) ?? [];
    log.unshift(session);
    await localStore.set(SESSIONS_KEY, log);
  });
}

async function enqueue(entry: OutboxEntry): Promise<void> {
  await withOutboxLock(async () => {
    const queue = (await localStore.get<OutboxEntry[]>(OUTBOX_KEY)) ?? [];
    queue.push(entry);
    await localStore.set(OUTBOX_KEY, queue);
  });
}

let flushInFlight: Promise<boolean> | null = null;

/**
 * Push everything queued to Supabase. Entries that fail stay queued for the
 * next launch or save. Returns true when this call left nothing behind.
 */
export function flushOutbox(): Promise<boolean> {
  // One flush at a time; concurrent callers share the in-flight result.
  if (!flushInFlight) {
    flushInFlight = doFlush().finally(() => {
      flushInFlight = null;
    });
  }
  return flushInFlight;
}

async function doFlush(): Promise<boolean> {
  const queue = await withOutboxLock(
    async () => (await localStore.get<OutboxEntry[]>(OUTBOX_KEY)) ?? []
  );
  if (queue.length === 0) return true;
  if (!supabase) return false;
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return false;

  // Not a precondition for the whole queue. Only items — and sessions that
  // name a language — need the code-to-uuid map; sessions without one and
  // daily lines do not. Bailing here meant one failed languages fetch held
  // back everything behind it, including writing that has no language id in
  // it at all.
  const ids = (await languageIds()) ?? {};

  const pushed = new Set<string>();
  for (const entry of queue) {
    const ok = await pushEntry(entry, ids);
    if (ok) pushed.add(entry.id);
  }
  // Re-read under the lock and remove only what was pushed — entries
  // enqueued while the network was in flight must survive.
  await withOutboxLock(async () => {
    const current = (await localStore.get<OutboxEntry[]>(OUTBOX_KEY)) ?? [];
    await localStore.set(
      OUTBOX_KEY,
      current.filter((e) => !pushed.has(e.id))
    );
  });
  return pushed.size === queue.length;
}

async function pushEntry(
  entry: OutboxEntry,
  ids: Record<string, string>
): Promise<boolean> {
  if (!supabase) return false;
  try {
    if (entry.items.length > 0) {
      const rows = entry.items.map((i) => ({
        id: i.id,
        language_id: ids[i.languageCode],
        term: i.term,
        reading: i.reading,
        meaning: i.meaning,
        example: i.example,
        example_meaning: i.exampleMeaning,
        context_tag: i.contextTag,
        sino_root: i.sinoRoot,
        origin: i.origin,
        created_at: i.createdAt,
      }));
      if (rows.some((r) => !r.language_id)) return false;
      const res = await supabase.from('items').upsert(rows, { onConflict: 'id' });
      if (res.error) return false;
    }
    if (entry.states.length > 0) {
      const rows = entry.states.map((s) => ({
        item_id: s.itemId,
        strength: s.strength,
        last_seen: s.lastSeen,
        next_due: s.nextDue,
        times_seen: s.timesSeen,
        times_missed: s.timesMissed,
      }));
      const res = await supabase.from('item_state').upsert(rows, { onConflict: 'item_id' });
      if (res.error) return false;
    }
    if (entry.session) {
      const s = entry.session;
      // A session that names a language waits for the map rather than
      // syncing with the language quietly dropped.
      if (s.languageCode && !ids[s.languageCode]) return false;
      const res = await supabase.from('sessions').upsert(
        [
          {
            id: s.id,
            date: s.date,
            kind: s.kind,
            language_id: s.languageCode ? ids[s.languageCode] : null,
            minutes: s.minutes,
            note: s.note,
            created_at: s.createdAt,
          },
        ],
        { onConflict: 'id' }
      );
      if (res.error) return false;
    }
    if (entry.line) {
      const l = entry.line;
      const res = await supabase.from('daily_lines').upsert(
        [
          {
            date: l.date,
            language_code: l.languageCode,
            text: l.text,
            created_at: l.createdAt,
          },
        ],
        { onConflict: 'user_id,date' }
      );
      if (res.error) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * code → Supabase languages.id for this account. Cached locally after the
 * first successful fetch; setup sync stores it too.
 */
export async function languageIds(): Promise<Record<string, string> | null> {
  const cached = await localStore.get<Record<string, string>>(LANGUAGE_IDS_KEY);
  if (cached && Object.keys(cached).length > 0) return cached;
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('languages').select('id, code');
    if (error || !data || data.length === 0) return null;
    const map = Object.fromEntries(data.map((r) => [r.code, r.id]));
    await localStore.set(LANGUAGE_IDS_KEY, map);
    return map;
  } catch {
    return null;
  }
}

/**
 * Adopt the session log already in Supabase (fresh install, second device).
 * Local entries win on id collision; the merged log is cached.
 */
export async function pullSessions(): Promise<SessionEntry[] | null> {
  if (!supabase) return null;
  try {
    const ids = await languageIds();
    const { data, error } = await supabase
      .from('sessions')
      .select('id, date, kind, language_id, minutes, note, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error || !data) return null;
    const codeById = ids
      ? Object.fromEntries(Object.entries(ids).map(([code, id]) => [id, code]))
      : {};
    const remote: SessionEntry[] = data.map((r) => ({
      id: r.id,
      date: r.date,
      kind: r.kind,
      languageCode: (r.language_id ? (codeById[r.language_id] ?? null) : null) as
        | LanguageCode
        | null,
      minutes: r.minutes,
      note: r.note,
      createdAt: r.created_at,
    }));
    // Merge under the lock so a session logged while the fetch was in
    // flight can't be clobbered by this write-back.
    return await withSessionsLock(async () => {
      const local = (await localStore.get<SessionEntry[]>(SESSIONS_KEY)) ?? [];
      const seen = new Set(local.map((s) => s.id));
      const merged = [...local, ...remote.filter((s) => !seen.has(s.id))].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      await localStore.set(SESSIONS_KEY, merged);
      return merged;
    });
  } catch {
    return null;
  }
}

function blank(s: string): string | null {
  const t = s.trim();
  return t.length === 0 ? null : t;
}

function soleLanguage(items: Item[]): LanguageCode | null {
  const codes = [...new Set(items.map((i) => i.languageCode))];
  return codes.length === 1 ? codes[0] : null;
}
