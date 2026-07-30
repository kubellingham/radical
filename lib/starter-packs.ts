// Starter packs ship inside the app so the Feed has something to show on
// first open and keeps working with no network at all. Everything after
// these arrives from Supabase through the sync worker.
import esCafe from '@/packs/es-cafe-1.json';
import jaFalseFriends from '@/packs/ja-false-friends-1.json';
import jaSino from '@/packs/ja-sino-1.json';
import koSino from '@/packs/ko-sino-1.json';
import zhSino from '@/packs/zh-sino-1.json';

import { localStore } from './local-store';
import { cachedPacks, type Pack } from './packs';

const SEEDED_KEY = 'packs.seeded';

const STARTERS = [
  { id: 'starter-zh-sino-1', pack: zhSino },
  { id: 'starter-ja-sino-1', pack: jaSino },
  { id: 'starter-ko-sino-1', pack: koSino },
  { id: 'starter-ja-false-friends-1', pack: jaFalseFriends },
  { id: 'starter-es-cafe-1', pack: esCafe },
];

/** Idempotent: writes the bundled packs into the local cache once. */
export async function seedStarterPacks(): Promise<void> {
  try {
    if (await localStore.get<boolean>(SEEDED_KEY)) return;
    const have = new Set((await cachedPacks()).map((p) => p.id));
    for (const { id, pack } of STARTERS) {
      if (have.has(id)) continue;
      await localStore.set(`pack.${id}`, { id, ...pack } as unknown as Pack);
    }
    await localStore.set(SEEDED_KEY, true);
  } catch {
    // A failed seed just means an empty Feed until next launch.
  }
}
