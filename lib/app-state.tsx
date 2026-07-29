import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { loadSetup, pullSetup } from './setup';
import { supabase, supabaseConfigured } from './supabase';
import type { SetupState } from './types';

interface AppState {
  ready: boolean;
  session: Session | null;
  setup: SetupState;
  setSetup: (state: SetupState) => void;
}

const AppContext = createContext<AppState | null>(null);

const INITIAL_SETUP: SetupState = { completed: false, completedAt: null, languages: [] };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [setup, setSetup] = useState<SetupState>(INITIAL_SETUP);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const local = await loadSetup();
      if (cancelled) return;
      setSetup(local);
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session);
      }
      setReady(true);
    })();

    const auth = supabase?.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      auth?.data.subscription.unsubscribe();
    };
  }, []);

  // On a fresh install with an existing account, adopt the setup already in
  // Supabase instead of asking again.
  const completed = setup.completed;
  useEffect(() => {
    if (!ready || !session || completed) return;
    let cancelled = false;
    pullSetup().then((remote) => {
      if (remote && !cancelled) setSetup(remote);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, session, completed]);

  const update = useCallback((state: SetupState) => setSetup(state), []);

  return (
    <AppContext.Provider value={{ ready, session, setup, setSetup: update }}>
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
