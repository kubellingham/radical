// The bundled bank. Ships inside the app so the Feed is full on first open,
// with no network and no account. Everything after this is generated.
import starter from '@/packs/starter-sets.json';

import { localStore } from './local-store';
import { newId } from './repo';
import { addSets } from './sets';
import type { ContextTag, LexemeSet, Rendering } from './types';

const SEEDED_KEY = 'sets.seeded';

interface WireSet {
  gloss: string;
  sino_root?: string;
  contextTag?: string;
  renderings: { language_code: string; term: string; reading: string; say?: string }[];
}

function toSet(w: WireSet, kind: 'word' | 'sentence'): LexemeSet {
  return {
    id: newId(),
    gloss: w.gloss,
    kind,
    renderings: w.renderings.map((r) => ({
      languageCode: r.language_code as Rendering['languageCode'],
      term: r.term,
      reading: r.reading,
      say: r.say ?? '',
    })),
    sinoRoot: w.sino_root ?? null,
    contextTag: (w.contextTag as ContextTag) ?? null,
    origin: 'starter',
    createdAt: new Date().toISOString(),
  };
}

/** Idempotent: seeds the bundled bank once. */
export async function seedStarterSets(): Promise<void> {
  try {
    if (await localStore.get<boolean>(SEEDED_KEY)) return;
    await addSets([
      ...(starter.words as WireSet[]).map((w) => toSet(w, 'word')),
      ...(starter.sentences as WireSet[]).map((w) => toSet(w, 'sentence')),
    ]);
    await localStore.set(SEEDED_KEY, true);
  } catch {
    // A failed seed just means an empty bank until next launch.
  }
}
