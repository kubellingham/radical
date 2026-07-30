import { Redirect } from 'expo-router';
import React from 'react';

import { Booting } from '@/components/booting';
import { supabaseConfigured, useApp } from '@/lib/app-state';

export default function Index() {
  const { ready, resolving, authResolved, session, setup } = useApp();

  // Reading the local store takes a few milliseconds. Nothing else waits.
  if (!ready) return <Booting />;

  // Setup already done on this device: open the app now. The data is local,
  // so there is nothing to wait for — signing in only decides whether it
  // also syncs, and that can settle behind the first screen.
  if (setup.completed) {
    if (supabaseConfigured && authResolved && !session) return <Redirect href="/sign-in" />;
    return <Redirect href="/today" />;
  }

  // No local setup. Now the session genuinely matters: signed in means the
  // config may already exist in the account, and showing the setup form
  // would let this device overwrite it.
  if (supabaseConfigured && !authResolved) return <Booting />;
  if (supabaseConfigured && !session) return <Redirect href="/sign-in" />;
  if (resolving) return <Booting note="Looking for your languages…" />;
  return <Redirect href="/setup" />;
}
