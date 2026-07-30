// Items, item state, and the session log. Local first, always; Supabase gets
// the same writes through an outbox that drains whenever it can.
import * as Crypto from 'expo-crypto';

import { localStore } from './local-store';
import { supabase } from './supabase';
import type { DraftItem, Item, ItemState, LanguageCode, SessionEntry, SessionKind } from './types';

const SESSIONS_KEY = 'sessions.log';
const OUTBOX_KEY = 'outbox.queue';
const LANGUAGE_IDS_KEY = 'languages.ids';

interface OutboxEntry {
  items: Item[];
  states: ItemState[];
  session: SessionEntry | null;
}

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

  const items: Item[] = input.drafts.map((d) => ({
    id: Crypto.randomUUID(),
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
    id: Crypto.randomUUID(),
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
  await enqueue({ items, states, session });
  const synced = await flushOutbox();
  return { itemCount: items.length, synced };
}

export async function logSession(input: {
  kind: SessionKind;
  minutes: number;
  note: string;
  languageCode: LanguageCode | null;
}): Promise<{ synced: boolean }> {
  const session: SessionEntry = {
    id: Crypto.randomUUID(),
    date: localDay(),
    kind: input.kind,
    languageCode: input.languageCode,
    minutes: input.minutes,
    note: blank(input.note),
    createdAt: new Date().toISOString(),
  };
  await appendSession(session);
  await enqueue({ items: [], states: [], session });
  const synced = await flushOutbox();
  return { synced };
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
  const log = await loadSessions();
  log.unshift(session);
  await localStore.set(SESSIONS_KEY, log);
}

async function enqueue(entry: OutboxEntry): Promise<void> {
  const queue = (await localStore.get<OutboxEntry[]>(OUTBOX_KEY)) ?? [];
  queue.push(entry);
  await localStore.set(OUTBOX_KEY, queue);
}

/**
 * Push everything queued to Supabase. Entries that fail stay queued for the
 * next launch or save. Returns true when the queue is empty afterwards.
 */
export async function flushOutbox(): Promise<boolean> {
  const queue = (await localStore.get<OutboxEntry[]>(OUTBOX_KEY)) ?? [];
  if (queue.length === 0) return true;
  if (!supabase) return false;
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return false;

  const ids = await languageIds();
  if (!ids) return false;

  const remaining: OutboxEntry[] = [];
  for (const entry of queue) {
    const ok = await pushEntry(entry, ids);
    if (!ok) remaining.push(entry);
  }
  await localStore.set(OUTBOX_KEY, remaining);
  return remaining.length === 0;
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
      const res = await supabase.from('sessions').upsert(
        [
          {
            id: s.id,
            date: s.date,
            kind: s.kind,
            language_id: s.languageCode ? (ids[s.languageCode] ?? null) : null,
            minutes: s.minutes,
            note: s.note,
            created_at: s.createdAt,
          },
        ],
        { onConflict: 'id' }
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
    const local = await loadSessions();
    const seen = new Set(local.map((s) => s.id));
    const merged = [...local, ...remote.filter((s) => !seen.has(s.id))].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    await localStore.set(SESSIONS_KEY, merged);
    return merged;
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
