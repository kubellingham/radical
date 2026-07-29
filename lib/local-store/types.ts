export interface LocalStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  /** All entries whose key starts with `prefix`, ordered by key. */
  list<T>(prefix: string): Promise<{ key: string; value: T }[]>;
}
