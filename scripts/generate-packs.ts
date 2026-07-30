/**
 * Build-time pack generator. Calls the Anthropic API, writes pack JSON to
 * packs/ for review, and stops there — nothing here runs at app runtime,
 * which is what keeps Polyglot instant and free to open.
 *
 *   ANTHROPIC_API_KEY=sk-... npm run packs:generate -- --language ko --context café --level 1
 *   ANTHROPIC_API_KEY=sk-... npm run packs:generate -- --sino --level 1
 *
 * --sino generates the matched triples: one list of shared roots, three
 * packs (zh/ja/ko) with the same root at the same index in each deck.
 * Review the JSON, then upload with npm run packs:upload.
 */
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'packs');
const MODEL = process.env.PACK_MODEL || 'claude-opus-5';
const SIZE = Number(process.env.PACK_SIZE || 40);

type LanguageCode = 'ja' | 'ko' | 'zh' | 'es' | 'ru';

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Mandarin Chinese',
  es: 'Spanish',
  ru: 'Russian',
};

const SCRIPT_NOTE: Record<LanguageCode, string> = {
  ja: 'Write terms in Japanese script (kanji/kana as normally written). reading = hiragana.',
  ko: 'Write terms in Hangul. reading = Revised Romanization.',
  zh: 'Write terms in simplified Hanzi. reading = pinyin with tone marks.',
  es: 'Write terms in Spanish. Leave reading empty.',
  ru: 'Write terms in Cyrillic. reading = romanization with stress marked.',
};

// The release order from the spec, per language.
const CONTEXT_ORDER = [
  'script',
  'survival',
  'numbers',
  'self',
  'café',
  'transit',
  'class',
  'street',
  'feelings',
  'abstract',
];

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          reading: { type: 'string' },
          meaning: { type: 'string' },
          example: { type: 'string' },
          example_meaning: { type: 'string' },
          sino_root: { type: 'string' },
        },
        required: ['term', 'reading', 'meaning', 'example', 'example_meaning', 'sino_root'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const ROOTS_SCHEMA = {
  type: 'object',
  properties: {
    roots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          root: { type: 'string' },
          meaning: { type: 'string' },
        },
        required: ['root', 'meaning'],
        additionalProperties: false,
      },
    },
  },
  required: ['roots'],
  additionalProperties: false,
} as const;

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set. This is a build-time script; the key never ships.');
    process.exit(1);
  }
  return new Anthropic({ apiKey });
}

type JsonSchema = { [key: string]: unknown };

async function ask<T>(
  anthropic: Anthropic,
  system: string,
  user: string,
  schema: JsonSchema
): Promise<T> {
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason === 'refusal') throw new Error('model declined');
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('no output');
  return JSON.parse(block.text) as T;
}

function write(pack: object, name: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(pack, null, 2)}\n`);
  console.log(`wrote ${path}`);
}

const SYSTEM = `You write vocabulary packs for a serious adult learner who studies Japanese, Korean, Chinese, Spanish and Russian at once.
Rules:
- Everything in the native script. Never romanization in the term field.
- Choose words the learner will actually meet, in frequency order, not textbook curiosities.
- Examples are short, natural, and something a person would really say.
- meaning is concise English. No parenthetical essays.
- Do not repeat a term within a pack.`;

async function generateSingle(language: LanguageCode, context: string, level: number) {
  const anthropic = client();
  const data = await ask<{ items: unknown[] }>(
    anthropic,
    SYSTEM,
    `Write ${SIZE} ${LANGUAGE_NAMES[language]} vocabulary items for the context "${context}", level ${level} (1 = first contact, 3 = confident).
${SCRIPT_NOTE[language]}
Leave sino_root as an empty string in this pack.`,
    ITEM_SCHEMA
  );
  write(
    {
      language_code: language,
      context_tag: context,
      level,
      title: `${LANGUAGE_NAMES[language]} · ${context} · ${level}`,
      version: 1,
      sort_order: CONTEXT_ORDER.indexOf(context) * 10 + level,
      items: data.items,
    },
    `${language}-${context}-${level}`
  );
}

/**
 * Matched triples: one root list, then zh/ja/ko packs where index i is the
 * same root in each. That alignment is what makes the triple card possible.
 */
async function generateSino(level: number) {
  const anthropic = client();
  const { roots } = await ask<{ roots: { root: string; meaning: string }[] }>(
    anthropic,
    SYSTEM,
    `List ${SIZE} Sino-Xenic vocabulary roots — words written with the same Chinese characters that exist as everyday vocabulary in all three of Mandarin, Japanese and Korean, with closely related meanings (e.g. 時間 time, 準備 preparation, 電話 telephone).
Level ${level}: level 1 is the most common everyday words, level 3 is less common but still useful.
root = the characters in traditional/shared form. meaning = concise English.
Order by usefulness to a beginner. No duplicates.`,
    ROOTS_SCHEMA
  );

  for (const language of ['zh', 'ja', 'ko'] as const) {
    const data = await ask<{ items: { term: string; sino_root: string }[] }>(
      anthropic,
      SYSTEM,
      `For each of these Sino-Xenic roots, give the ${LANGUAGE_NAMES[language]} word.
${SCRIPT_NOTE[language]}
Return exactly ${roots.length} items in the SAME ORDER as the input list — index i must be the word for root i. Set sino_root to the input root string, unchanged.
Roots:
${roots.map((r, i) => `${i + 1}. ${r.root} — ${r.meaning}`).join('\n')}`,
      ITEM_SCHEMA
    );

    if (data.items.length !== roots.length) {
      console.warn(
        `${language}: got ${data.items.length} items for ${roots.length} roots — alignment must be checked by hand before upload.`
      );
    }
    // Re-stamp sino_root from the input so an index slip can't silently
    // break the triples.
    const items = data.items.map((item, i) => ({ ...item, sino_root: roots[i]?.root ?? '' }));

    write(
      {
        language_code: language,
        context_tag: 'any',
        level,
        title: `${LANGUAGE_NAMES[language]} · sino roots · ${level}`,
        version: 1,
        sort_order: 5 + level,
        items,
      },
      `${language}-sino-${level}`
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const level = Number(flag('level') || 1);

  if (args.includes('--sino')) {
    await generateSino(level);
    return;
  }
  const language = flag('language') as LanguageCode | undefined;
  const context = flag('context');
  if (!language || !context) {
    console.error('usage: --language <ja|ko|zh|es|ru> --context <name> [--level 1] | --sino [--level 1]');
    process.exit(1);
  }
  await generateSingle(language, context, level);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
