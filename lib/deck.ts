// Builds the Feed's deck. Nothing here surfaces a strength, an interval, or
// a due date — the deck is simply what should be in front of you now.
import { cachedPacks, falseFriendsFrom, materializePack, markPackUsed, unusedPacks } from './packs';
import { addItems, loadItems, loadItemStates, localDay } from './repo';
import { isDue } from './scheduler';
import type { ContextTag, Item, ItemState, LanguageCode } from './types';

const SINO_LANGUAGES: LanguageCode[] = ['zh', 'ja', 'ko'];

export type Card =
  | {
      kind: 'standard';
      key: string;
      itemIds: string[];
      languageCode: LanguageCode;
      term: string;
      reading: string | null;
      meaning: string;
      example: string | null;
    }
  | {
      kind: 'triple';
      key: string;
      itemIds: string[];
      root: string;
      meaning: string;
      readings: { code: LanguageCode; term: string; reading: string | null }[];
    }
  | {
      kind: 'friend';
      key: string;
      itemIds: string[];
      term: string;
      a: { code: LanguageCode; meaning: string };
      b: { code: LanguageCode; meaning: string };
    };

export interface DeckInput {
  /** Languages whose script is learned — the only ones that may show vocabulary. */
  unlocked: LanguageCode[];
  context: ContextTag | 'any';
  limit?: number;
}

export interface Deck {
  cards: Card[];
  /** True when nothing is due and no pack content is left to draw. */
  exhausted: boolean;
}

export async function buildDeck(input: DeckInput): Promise<Deck> {
  const today = localDay();
  const unlocked = new Set(input.unlocked);

  let items = await loadItems();
  let states = await loadItemStates();

  // Nothing due and nothing new? Draw the next pack into the rotation.
  const hasDue = () =>
    states.some((s) => {
      const item = items.find((i) => i.id === s.itemId);
      return item && unlocked.has(item.languageCode) && isDue(s, today);
    });

  if (!hasDue()) {
    const packs = (await unusedPacks()).filter((p) => unlocked.has(p.language_code));
    const next = packs[0];
    if (next) {
      // Matched triples only work if the whole set enters the rotation at
      // once — draw any sibling pack sharing a sino root alongside it.
      const roots = new Set(next.items.map((i) => i.sino_root).filter(Boolean));
      const siblings = packs
        .slice(1)
        .filter((p) => p.items.some((i) => i.sino_root && roots.has(i.sino_root)));

      for (const pack of [next, ...siblings]) {
        const fresh = await materializePack(pack);
        await addItems(fresh.items, fresh.states);
        await markPackUsed(pack.id);
        items = [...items, ...fresh.items];
        states = [...states, ...fresh.states];
      }
    }
  }

  const stateById = new Map(states.map((s) => [s.itemId, s]));
  const due = items
    .filter((i) => unlocked.has(i.languageCode))
    .filter((i) => {
      const s = stateById.get(i.id);
      return s ? isDue(s, today) : false;
    })
    .filter((i) => input.context === 'any' || i.contextTag === input.context)
    .sort((a, b) => sortKey(stateById.get(a.id)).localeCompare(sortKey(stateById.get(b.id))));

  const cards = composeCards(due, unlocked, await falseFriendPairs());
  const limit = input.limit ?? 40;
  return { cards: cards.slice(0, limit), exhausted: cards.length === 0 };
}

function sortKey(state: ItemState | undefined): string {
  if (!state) return '9';
  // Oldest due first, then the ones seen least.
  return `${state.nextDue}-${String(state.timesSeen).padStart(4, '0')}`;
}

async function falseFriendPairs() {
  // Every cached pack, not just unused ones — the pairing metadata has to
  // outlive the pack being drawn into the rotation.
  return falseFriendsFrom(await cachedPacks());
}

function composeCards(
  due: Item[],
  unlocked: Set<LanguageCode>,
  friends: Awaited<ReturnType<typeof falseFriendPairs>>
): Card[] {
  const cards: Card[] = [];
  const consumed = new Set<string>();

  // Sino triples first — the signature card. One root, the readings fanned
  // beneath it. Only when at least two of zh/ja/ko are unlocked and present.
  const byRoot = new Map<string, Item[]>();
  for (const item of due) {
    if (!item.sinoRoot || !SINO_LANGUAGES.includes(item.languageCode)) continue;
    const group = byRoot.get(item.sinoRoot) ?? [];
    group.push(item);
    byRoot.set(item.sinoRoot, group);
  }
  for (const [root, group] of byRoot) {
    const codes = new Set(group.map((i) => i.languageCode));
    if (codes.size < 2) continue;
    const readings = SINO_LANGUAGES.filter((code) => unlocked.has(code))
      .map((code) => {
        const item = group.find((i) => i.languageCode === code);
        return item ? { code, term: item.term, reading: item.reading } : null;
      })
      .filter((r): r is { code: LanguageCode; term: string; reading: string | null } => r !== null);
    if (readings.length < 2) continue;
    for (const item of group) consumed.add(item.id);
    cards.push({
      kind: 'triple',
      key: `triple-${root}`,
      itemIds: group.map((i) => i.id),
      root,
      meaning: group[0].meaning,
      readings,
    });
  }

  // False friends — memorable because they're absurd.
  for (const pair of friends) {
    const match = due.find((i) => i.term === pair.term && !consumed.has(i.id));
    if (!match) continue;
    consumed.add(match.id);
    cards.push({
      kind: 'friend',
      key: `friend-${pair.term}`,
      itemIds: [match.id],
      term: pair.term,
      a: pair.a,
      b: pair.b,
    });
  }

  // Everything else, plain.
  for (const item of due) {
    if (consumed.has(item.id)) continue;
    cards.push({
      kind: 'standard',
      key: `item-${item.id}`,
      itemIds: [item.id],
      languageCode: item.languageCode,
      term: item.term,
      reading: item.reading,
      meaning: item.meaning,
      example: item.example,
    });
  }

  return cards;
}

/**
 * What's waiting, counted in cards rather than items — a Sino triple is one
 * card that happens to carry three languages, so it belongs to none of them
 * and gets its own line on Today.
 */
export async function missionCounts(
  unlocked: LanguageCode[]
): Promise<{ perLanguage: Map<LanguageCode, number>; shared: number }> {
  const today = localDay();
  const allowed = new Set(unlocked);
  const [items, states, friends] = await Promise.all([
    loadItems(),
    loadItemStates(),
    falseFriendPairs(),
  ]);
  const stateById = new Map(states.map((s) => [s.itemId, s]));
  const due = items.filter((i) => {
    const s = stateById.get(i.id);
    return allowed.has(i.languageCode) && s !== undefined && isDue(s, today);
  });

  const perLanguage = new Map<LanguageCode, number>();
  let shared = 0;
  for (const card of composeCards(due, allowed, friends)) {
    if (card.kind === 'triple') {
      shared += 1;
    } else if (card.kind === 'friend') {
      perLanguage.set(card.a.code, (perLanguage.get(card.a.code) ?? 0) + 1);
    } else {
      perLanguage.set(card.languageCode, (perLanguage.get(card.languageCode) ?? 0) + 1);
    }
  }
  return { perLanguage, shared };
}
