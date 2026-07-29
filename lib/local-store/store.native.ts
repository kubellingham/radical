import * as SQLite from 'expo-sqlite';

import type { LocalStore } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('mission-control.db');
      await database.execAsync(
        'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)'
      );
      return database;
    })();
  }
  return dbPromise;
}

function escapeLike(prefix: string): string {
  return prefix.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const localStore: LocalStore = {
  async get<T>(key: string): Promise<T | null> {
    const row = await (
      await db()
    ).getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    await (
      await db()
    ).runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
  },

  async list<T>(prefix: string): Promise<{ key: string; value: T }[]> {
    const rows = await (
      await db()
    ).getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM kv WHERE key LIKE ? ESCAPE '\\' ORDER BY key",
      `${escapeLike(prefix)}%`
    );
    return rows.map((r) => ({ key: r.key, value: JSON.parse(r.value) as T }));
  },
};
