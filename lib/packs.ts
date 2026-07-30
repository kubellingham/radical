// Content packs: a pack is ~40 items for one language, one context, one
// level. Generated at build time, reviewed, uploaded with the service role,
// then pulled here a couple at a time and cached forever.
import { localStore } from './local-store';
import { localDay, newId } from './repo';
import { supabase } from './supabase';
import type { ContextTag, Item, ItemState, LanguageCode } from './types';

export interface PackItem {
  term: string;
  reading?: string;
  meaning: string;
  example?: string;
  example_meaning?: string;
  sino_root?: string;
  /** The absurd counterpart for a false-friend card, e.g. toilet paper [zh]. */
  false_friend?: { language_code: LanguageCode; meaning: string };
}

export interface Pack {
  id: string;
  language_code: LanguageCode;
  context_tag: ContextTag | 'any';
  level: number;
  title: string;
  version: number;
  sort_order: number;
  items: PackItem[];
}

const PACK_PREFIX = 'pack.';
const USED_KEY = 'packs.used';

export async function cachedPacks(): Promise<Pack[]> {
  try {
    const rows = await localStore.list<Pack>(PACK_PREFIX);
    return rows.map((r) => r.value).sort((a, b) => a.sort_order - b.sort_order);
  } catch {
    return [];
  }
}

async function usedPackIds(): Promise<string[]> {
  return (await localStore.get<string[]>(USED_KEY)) ?? [];
}

export async function markPackUsed(packId: string): Promise<void> {
  const used = await usedPackIds();
  if (!used.includes(packId)) {
    used.push(packId);
    await localStore.set(USED_KEY, used);
  }
}

/** Packs cached locally whose items haven't been drawn into the deck yet. */
export async function unusedPacks(): Promise<Pack[]> {
  const [packs, used] = await Promise.all([cachedPacks(), usedPackIds()]);
  return packs.filter((p) => !used.includes(p.id));
}

/**
 * Sync worker: on app open, if fewer than 3 unused packs are cached, pull
 * the next 2 in the background. Cached packs are never deleted.
 */
export async function syncPacks(languages: LanguageCode[]): Promise<number> {
  if (!supabase || languages.length === 0) return 0;
  try {
    const unused = await unusedPacks();
    if (unused.length >= 3) return 0;

    const have = (await cachedPacks()).map((p) => p.id);
    let query = supabase
      .from('packs')
      .select('id, language_code, context_tag, level, title, payload, version, sort_order')
      .in('language_code', languages)
      .order('sort_order')
      .limit(2);
    if (have.length > 0) query = query.not('id', 'in', `(${have.join(',')})`);

    const { data, error } = await query;
    if (error || !data || data.length === 0) return 0;

    for (const row of data) {
      const payload = row.payload as { items?: PackItem[] } | null;
      const pack: Pack = {
        id: row.id,
        language_code: row.language_code,
        context_tag: row.context_tag,
        level: row.level,
        title: row.title,
        version: row.version,
        sort_order: row.sort_order,
        items: payload?.items ?? [],
      };
      await localStore.set(`${PACK_PREFIX}${pack.id}`, pack);
      if (supabase) {
        await supabase
          .from('pack_downloads')
          .upsert([{ pack_id: pack.id, downloaded_at: new Date().toISOString() }], {
            onConflict: 'user_id,pack_id',
          });
      }
    }
    return data.length;
  } catch {
    return 0;
  }
}

/**
 * Turn a pack's items into real items + state so they join the rotation.
 * Idempotent per pack: a used pack is never materialized twice.
 */
export async function materializePack(
  pack: Pack
): Promise<{ items: Item[]; states: ItemState[] }> {
  const now = new Date().toISOString();
  const today = localDay();
  const items: Item[] = pack.items.map((p) => ({
    id: newId(),
    languageCode: pack.language_code,
    term: p.term,
    reading: p.reading ?? null,
    meaning: p.meaning,
    example: p.example ?? null,
    exampleMeaning: p.example_meaning ?? null,
    contextTag: pack.context_tag === 'any' ? null : pack.context_tag,
    sinoRoot: p.sino_root ?? null,
    origin: 'pack',
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
  return { items, states };
}

/** False-friend pairs carried alongside packs, keyed by the shared glyph. */
export function falseFriendsFrom(packs: Pack[]): {
  term: string;
  a: { code: LanguageCode; meaning: string };
  b: { code: LanguageCode; meaning: string };
}[] {
  const out: ReturnType<typeof falseFriendsFrom> = [];
  for (const pack of packs) {
    for (const item of pack.items) {
      if (item.false_friend) {
        out.push({
          term: item.term,
          a: { code: pack.language_code, meaning: item.meaning },
          b: { code: item.false_friend.language_code, meaning: item.false_friend.meaning },
        });
      }
    }
  }
  return out;
}
