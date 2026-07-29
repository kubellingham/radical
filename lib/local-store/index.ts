// The platform switch happens here, at bundle time: Metro resolves ./store
// to store.native.ts (expo-sqlite) on iOS/Android and store.ts (idb-keyval)
// on web. Resolving per-platform at build time — rather than branching on
// Platform.OS at runtime — keeps sqlite out of the web bundle entirely.
// Nothing outside this module knows which backend is in use.
export { localStore } from './store';
export type { LocalStore } from './types';
