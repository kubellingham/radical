import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { flushOutbox, pullSessions } from './repo';
import { hasPendingPush, loadSetup, persistSetup, pullSetup, retryPendingPush } from './setup';
import { supabase, supabaseConfigured } from './supabase';
import type { SetupState } from './types';

interface AppState {
  ready: boolean;
  /** True while a signed-in fresh install checks Supabase for existing setup. */
  resolving: boolean;
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
  const [session, setSession] = useState<Session | null>(null);
  const [setup, setSetup] = useState<SetupState>(INITIAL_SETUP);
  const [pendingSync, setPendingSync] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const local = await loadSetup();
        if (cancelled) return;
        setSetup(local);
        setPendingSync(await hasPendingPush());
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (cancelled) return;
          setSession(data.session);
        }
      } catch {
        // Whatever failed, the app still opens; local-only, defaults if need be.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    const auth = supabase?.auth.onAuthStateChange((_event, next) => {
      setSession(next);
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
    withTimeout(pullSetup(), 6000, null)
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

  // Drain anything the Dump/Record screens queued while offline, and adopt
  // the session log from other devices. Quiet on failure; retried next boot.
  useEffect(() => {
    if (!ready || !session || !completed) return;
    flushOutbox().catch(() => {});
    pullSessions().catch(() => {});
  }, [ready, session, completed]);

  const completeSetup = useCallback((state: SetupState, synced: boolean) => {
    setSetup(state);
    setPendingSync(!synced);
  }, []);

  return (
    <AppContext.Provider value={{ ready, resolving, session, setup, pendingSync, completeSetup }}>
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
