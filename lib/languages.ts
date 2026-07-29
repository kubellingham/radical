import type { LanguageConfig } from './types';

// The five. Spanish starts with its script learned — it's the Latin
// alphabet — so it begins active. Everything else starts in script mode.
export const DEFAULT_LANGUAGES: LanguageConfig[] = [
  {
    code: 'ja',
    name: 'Japanese',
    glyph: '日',
    script: 'Kana + Kanji',
    scriptLearned: false,
    rhythmSlot: 'any',
    sortOrder: 0,
    status: 'script',
  },
  {
    code: 'ko',
    name: 'Korean',
    glyph: '한',
    script: 'Hangul',
    scriptLearned: false,
    rhythmSlot: 'any',
    sortOrder: 1,
    status: 'script',
  },
  {
    code: 'zh',
    name: 'Chinese',
    glyph: '中',
    script: 'Hanzi',
    scriptLearned: false,
    rhythmSlot: 'any',
    sortOrder: 2,
    status: 'script',
  },
  {
    code: 'es',
    name: 'Spanish',
    glyph: 'ñ',
    script: 'Latin',
    scriptLearned: true,
    rhythmSlot: 'any',
    sortOrder: 3,
    status: 'active',
  },
  {
    code: 'ru',
    name: 'Russian',
    glyph: 'Я',
    script: 'Cyrillic',
    scriptLearned: false,
    rhythmSlot: 'any',
    sortOrder: 4,
    status: 'script',
  },
];

export function languageByCode(code: string): LanguageConfig | undefined {
  return DEFAULT_LANGUAGES.find((l) => l.code === code);
}
