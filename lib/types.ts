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
