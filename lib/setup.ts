import { DEFAULT_LANGUAGES, languageByCode } from './languages';
import { localStore } from './local-store';
import { supabase } from './supabase';
import type { LanguageConfig, LanguageStatus, RhythmSlot, SetupState } from './types';

const SETUP_KEY = 'setup.state';
const PENDING_PUSH_KEY = 'setup.pendingPush';

const EMPTY: SetupState = {
  completed: false,
  completedAt: null,
  languages: DEFAULT_LANGUAGES,
};

export async function loadSetup(): Promise<SetupState> {
  try {
    const cached = await localStore.get<SetupState>(SETUP_KEY);
    return cached ?? EMPTY;
  } catch {
    // A corrupted local entry must not strand the app on boot.
    return EMPTY;
  }
}

export async function hasPendingPush(): Promise<boolean> {
  try {
    return (await localStore.get<boolean>(PENDING_PUSH_KEY)) === true;
  } catch {
    return false;
  }
}

/**
 * Persist the setup locally first, then push to Supabase. The local write is
 * the source of truth for the running app; a failed push sets a pending flag
 * that boot retries until it lands.
 */
export async function saveSetup(
  languages: LanguageConfig[]
): Promise<{ state: SetupState; synced: boolean }> {
  const state: SetupState = {
    completed: true,
    completedAt: new Date().toISOString(),
    languages,
  };
  await localStore.set(SETUP_KEY, state);
  const synced = await pushSetup(languages);
  await localStore.set(PENDING_PUSH_KEY, !synced);
  return { state, synced };
}

/**
 * Retry a push that failed at save time. Returns true when nothing is
 * pending anymore.
 */
export async function retryPendingPush(): Promise<boolean> {
  if (!(await hasPendingPush())) return true;
  const state = await loadSetup();
  if (!state.completed) return true;
  const synced = await pushSetup(state.languages);
  if (synced) await localStore.set(PENDING_PUSH_KEY, false);
  return synced;
}

async function pushSetup(languages: LanguageConfig[]): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;

    const rows = languages.map((l) => ({
      code: l.code,
      name: l.name,
      script: l.script,
      status: l.status,
      script_learned: l.scriptLearned,
      rhythm_slot: l.rhythmSlot,
      sort_order: l.sortOrder,
    }));
    const upsert = await supabase.from('languages').upsert(rows, { onConflict: 'user_id,code' });
    if (upsert.error) return false;

    // The rhythm table mirrors the per-language slots as slot → language ids,
    // which is the shape the Today screen will read in Phase 4.
    const langRows = await supabase.from('languages').select('id, code, rhythm_slot');
    if (langRows.error || !langRows.data) return false;
    // Cache code → id so items and sessions can reference languages offline.
    await localStore.set(
      'languages.ids',
      Object.fromEntries(langRows.data.map((r) => [r.code, r.id]))
    );
    const slots: RhythmSlot[] = ['morning', 'afternoon', 'evening', 'any'];
    const rhythmRows = slots.map((slot) => ({
      slot,
      language_ids: langRows.data.filter((r) => r.rhythm_slot === slot).map((r) => r.id),
    }));
    const rhythm = await supabase.from('rhythm').upsert(rhythmRows, { onConflict: 'user_id,slot' });
    return !rhythm.error;
  } catch {
    return false;
  }
}

/**
 * Fetch any setup already in Supabase so phone and web stay one account with
 * one config. Pure read — the caller decides whether to persist it, so a
 * stale response can never overwrite a fresher local save.
 */
export async function pullSetup(): Promise<SetupState | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('languages')
      .select('id, code, name, script, status, script_learned, rhythm_slot, sort_order, created_at')
      .order('sort_order');
    if (error || !data || data.length === 0) return null;

    await localStore.set(
      'languages.ids',
      Object.fromEntries(data.map((r) => [r.code, r.id]))
    );
    const languages: LanguageConfig[] = data.map((row) => ({
      code: row.code,
      name: row.name,
      glyph: languageByCode(row.code)?.glyph ?? row.name.slice(0, 1),
      script: row.script,
      scriptLearned: row.script_learned,
      rhythmSlot: row.rhythm_slot as RhythmSlot,
      sortOrder: row.sort_order,
      status: row.status as LanguageStatus,
    }));
    return {
      completed: true,
      completedAt: data[0].created_at ?? new Date().toISOString(),
      languages,
    };
  } catch {
    return null;
  }
}

export async function persistSetup(state: SetupState): Promise<void> {
  await localStore.set(SETUP_KEY, state);
  await localStore.set(PENDING_PUSH_KEY, false);
}
