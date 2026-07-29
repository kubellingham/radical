// Web backend: IndexedDB via idb-keyval. The native (expo-sqlite) backend
// lives in store.native.ts; Metro picks it for iOS/Android builds.
import { createStore, entries, get, set } from 'idb-keyval';

import type { LocalStore } from './types';

const store = createStore('mission-control', 'kv');

export const localStore: LocalStore = {
  async get<T>(key: string): Promise<T | null> {
    const value = await get<T>(key, store);
    return value === undefined ? null : value;
  },

  async set<T>(key: string, value: T): Promise<void> {
    await set(key, value, store);
  },

  async list<T>(prefix: string): Promise<{ key: string; value: T }[]> {
    const all = await entries<IDBValidKey, T>(store);
    return all
      .filter(([key]) => typeof key === 'string' && key.startsWith(prefix))
      .map(([key, value]) => ({ key: key as string, value }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  },
};
