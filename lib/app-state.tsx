import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { syncPacks } from './packs';
import { flushOutbox, pullSessions } from './repo';
import { backfillCaptured, backfillPronunciations, pullSets, refillIfLow } from './sets';
import { hasPendingPush, loadSetup, persistSetup, pullSetup, retryPendingPush } from './setup';
import { seedStarterPacks } from './starter-packs';
import { seedStarterSets } from './starter-sets';
import { supabase, supabaseConfigured } from './supabase';
import type { LanguageCode, SetupState } from './types';

interface AppState {
  /** Local store has been read. The app can render from here on. */
  ready: boolean;
  /** True while a signed-in fresh install checks Supabase for existing setup. */
  resolving: boolean;
  /**
   * The session question has been settled one way or the other. Reading it
   * costs a network round trip when the token needs refreshing, so nothing
   * that can be answered locally is allowed to wait on it.
   */
  authResolved: boolean;
  session: Session | null;
  setup: SetupState;
  /** True when the setup exists locally but hasn't landed in Supabase yet. */
  pendingSync: boolean;
  completeSetup: (state: SetupState, synced: boolean) => void;
}

const AppContext = createContext<AppState | null>(null);

const INITIAL_SETUP: SetupState = { completed: false, completedAt: null, languages: [] };

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [authResolved, setAuthResolved] = useState(!supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [setup, setSetup] = useState<SetupState>(INITIAL_SETUP);
  const [pendingSync, setPendingSync] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Local first, and only local: this decides how fast the app opens, so
    // nothing here is allowed to touch the network.
    (async () => {
      try {
        const local = await loadSetup();
        if (cancelled) return;
        setSetup(local);
        setPendingSync(await hasPendingPush());
      } catch {
        // Whatever failed, the app still opens with defaults.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    // Everything below is off the critical path.
    seedStarterSets()
      .then(() => seedStarterPacks())
      .catch(() => {});

    if (supabase) {
      // getSession refreshes an expired token over the network, which can
      // take a second or more. Let it settle in its own time.
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!cancelled) setSession(data.session);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setAuthResolved(true);
        });
    }

    const auth = supabase?.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthResolved(true);
    });
    return () => {
      cancelled = true;
      auth?.data.subscription.unsubscribe();
    };
  }, []);

  // A signed-in account with no local setup: adopt what's already in
  // Supabase before letting the router show the setup form, so a second
  // device can't silently overwrite the first one's config.
  const completed = setup.completed;
  useEffect(() => {
    if (!ready || !session || completed) return;
    let cancelled = false;
    setResolving(true);
    withTimeout(pullSetup(), 3000, null)
      .then(async (remote) => {
        if (cancelled) return;
        if (remote) {
          await persistSetup(remote);
          if (cancelled) return;
          setSetup(remote);
          setPendingSync(false);
        }
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session, completed]);

  // A setup that saved locally but never reached Supabase: retry once we're
  // signed in, quietly.
  useEffect(() => {
    if (!ready || !session || !completed || !pendingSync) return;
    let cancelled = false;
    retryPendingPush().then((synced) => {
      if (synced && !cancelled) setPendingSync(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, session, completed, pendingSync]);

  // Drain anything the Found/Record screens queued while offline, adopt the
  // session log from other devices, and top up the pack cache. Quiet on
  // failure; retried next boot.
  const languageKey = setup.languages.map((l) => l.code).join(',');
  useEffect(() => {
    if (!ready || !session || !completed) return;
    flushOutbox().catch(() => {});
    pullSessions().catch(() => {});
    syncPacks(languageKey ? (languageKey.split(',') as LanguageCode[]) : []).catch(() => {});
    // Adopt the account's bank, bring anything captured before sets existed
    // into it, then top up if it's still thin.
    pullSets()
      .then(() => backfillCaptured())
      .then(() => backfillPronunciations())
      .then(() => refillIfLow('word'))
      .then(() => refillIfLow('sentence'))
      .catch(() => {});
  }, [ready, session, completed, languageKey]);

  const completeSetup = useCallback((state: SetupState, synced: boolean) => {
    setSetup(state);
    setPendingSync(!synced);
  }, []);

  return (
    <AppContext.Provider
      value={{ ready, resolving, authResolved, session, setup, pendingSync, completeSetup }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export { supabaseConfigured };
