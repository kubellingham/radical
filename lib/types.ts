export type LanguageCode = 'ja' | 'ko' | 'zh' | 'es' | 'ru';

export type LanguageStatus = 'script' | 'active' | 'maintenance' | 'dormant';

export type RhythmSlot = 'morning' | 'afternoon' | 'evening' | 'any';

export interface LanguageConfig {
  code: LanguageCode;
  name: string;
  /** A character from the language's own script. Never a flag. */
  glyph: string;
  script: string;
  /**
   * A language stays locked to script mode until its script is marked
   * learned — vocabulary in a script you can't read is romanization,
   * and romanization has to be unlearned.
   */
  scriptLearned: boolean;
  rhythmSlot: RhythmSlot;
  sortOrder: number;
  status: LanguageStatus;
}

export interface SetupState {
  completed: boolean;
  completedAt: string | null;
  languages: LanguageConfig[];
}

export type ContextTag = 'café' | 'class' | 'transit' | 'gym' | 'home' | 'street';

/** An item as parsed from a dump, before confirmation. */
export interface DraftItem {
  languageCode: LanguageCode;
  term: string;
  reading: string;
  meaning: string;
  example: string;
  exampleMeaning: string;
  contextTag: ContextTag | '';
  sinoRoot: string;
}

/** A confirmed vocabulary item, as stored locally and in Supabase. */
export interface Item {
  id: string;
  languageCode: LanguageCode;
  term: string;
  reading: string | null;
  meaning: string;
  example: string | null;
  exampleMeaning: string | null;
  contextTag: ContextTag | null;
  sinoRoot: string | null;
  origin: 'dump' | 'pack';
  createdAt: string;
}

export interface ItemState {
  itemId: string;
  strength: number;
  lastSeen: string | null;
  nextDue: string;
  timesSeen: number;
  timesMissed: number;
}

export type SessionKind = 'dump' | 'feed' | 'check' | 'external';

export interface SessionEntry {
  id: string;
  /** The user's local day, YYYY-MM-DD. */
  date: string;
  kind: SessionKind;
  languageCode: LanguageCode | null;
  minutes: number;
  /** The one line about what was learned. The thing reread in 2031. */
  note: string | null;
  createdAt: string;
}
