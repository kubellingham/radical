// Generates a fresh batch of lexeme sets — one meaning rendered in all five
// languages at once. Called in the background whenever the local bank runs
// low, so the Feed can never bottom out. Key stays server-side; a valid
// Supabase session is required because this spends real credit.
const LANGUAGES = ['ja', 'ko', 'zh', 'es', 'ru'] as const;
const CONTEXTS = ['café', 'class', 'transit', 'gym', 'home', 'street'] as const;

const SET_SCHEMA = {
  type: 'object',
  properties: {
    sets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          gloss: { type: 'string' },
          context_tag: { type: 'string', enum: [...CONTEXTS, ''] },
          sino_root: { type: 'string' },
          renderings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                language_code: { type: 'string', enum: [...LANGUAGES] },
                term: { type: 'string' },
                reading: { type: 'string' },
              },
              required: ['language_code', 'term', 'reading'],
              additionalProperties: false,
            },
          },
        },
        required: ['gloss', 'context_tag', 'sino_root', 'renderings'],
        additionalProperties: false,
      },
    },
  },
  required: ['sets'],
  additionalProperties: false,
} as const;

const SYSTEM = `You build parallel vocabulary for someone learning Japanese, Korean, Mandarin Chinese, Spanish and Russian at the same time.

Every entry is ONE meaning rendered in ALL FIVE languages. Never omit a language.

- gloss: the meaning in plain English. This is the entry's identity.
- renderings: exactly five, one per language_code (ja, ko, zh, es, ru).
  - term: the native script, always. Japanese in kanji/kana, Korean in Hangul, Chinese in simplified Hanzi, Spanish in Latin script, Russian in Cyrillic. Never romanization in this field.
  - reading: Japanese "kana · romaji", Korean Revised Romanization, Chinese pinyin with tone marks, Russian romanization with the stressed vowel marked. Empty string for Spanish.
- sino_root: when the Japanese, Korean and Chinese words all descend from the same Classical Chinese root, give that root in Chinese characters (e.g. 時間). Otherwise an empty string.
- context_tag: one of café/class/transit/gym/home/street when the entry clearly belongs somewhere; otherwise an empty string.

Choose words and phrases a real adult actually meets, in rough frequency order. Natural, current usage — not textbook curiosities. Each entry must be the most idiomatic way to say that thing in each language, not a word-for-word calque.
Reply with JSON only — no prose, no code fences.`;

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://vjedphmlpmricpvrnzsw.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_sRN92h10e4r9xQ65sf_KWQ_ztUKSZUP';

async function authorized(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function extractJson(raw: string): { sets: unknown[] } {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(text) as { sets: unknown[] };
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no json in response');
    return JSON.parse(text.slice(start, end + 1)) as { sets: unknown[] };
  }
}

export async function POST(request: Request): Promise<Response> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!openRouterKey && !anthropicKey) {
    return json({ error: 'generator not configured' }, 503);
  }
  if (!(await authorized(request))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let input: {
    kind?: string;
    count?: number;
    avoid?: string[];
    context?: string;
    expand?: { term?: string; language_code?: string; meaning?: string }[];
  };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  const kind = input.kind === 'sentence' ? 'sentence' : 'word';
  const count = Math.min(Math.max(Number(input.count) || 20, 1), 40);
  const avoid = Array.isArray(input.avoid) ? input.avoid.slice(0, 200) : [];
  const context = typeof input.context === 'string' ? input.context : '';

  // Expansion mode: a word captured in one language comes back rendered in
  // all five, so what you found out in the world joins the same rotation.
  const expand = Array.isArray(input.expand)
    ? input.expand.filter((e) => e.term?.trim()).slice(0, 30)
    : [];

  const ask = expand.length
    ? `Each line below is a word the learner captured in ONE language. For each, produce one entry whose gloss is its English meaning and whose renderings give the equivalent in all five languages. Keep the learner's original word as that language's rendering when it is already idiomatic.\n\n${expand
        .map((e) => `- ${e.term} (${e.language_code ?? '?'})${e.meaning ? ` = ${e.meaning}` : ''}`)
        .join('\n')}`
    : `Produce ${count} entries of kind "${kind}".` +
      (kind === 'sentence'
        ? ' Each gloss is a short, everyday sentence someone would really say — a greeting, a request, a question, a reaction.'
        : ' Each gloss is a single everyday word or short phrase.') +
      (context ? ` Focus on the context: ${context}.` : '') +
      (avoid.length
        ? `\n\nDo NOT repeat any of these, which are already known:\n${avoid.join(', ')}`
        : '');

  try {
    const text = openRouterKey
      ? await viaOpenRouter(openRouterKey, ask)
      : await viaAnthropic(anthropicKey as string, ask);
    const parsed = extractJson(text);
    if (!Array.isArray(parsed.sets)) throw new Error('no sets');
    // Only keep entries that actually cover all five languages — a partial
    // set would render as a hole in the card.
    const sets = parsed.sets.filter((s) => {
      const r = (s as { renderings?: { language_code?: string }[] }).renderings;
      if (!Array.isArray(r)) return false;
      const codes = new Set(r.map((x) => x.language_code));
      return LANGUAGES.every((l) => codes.has(l));
    });
    return json({ sets, kind: expand.length ? 'word' : kind });
  } catch {
    return json({ error: 'generation failed' }, 502);
  }
}

async function viaOpenRouter(apiKey: string, ask: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'x-title': 'Polyglot',
    },
    body: JSON.stringify({
      model: process.env.SETS_MODEL || process.env.DUMP_MODEL || 'anthropic/claude-sonnet-5',
      max_tokens: 16000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: ask },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'lexeme_sets', strict: true, schema: SET_SCHEMA },
      },
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (body.error) throw new Error(body.error.message ?? 'openrouter error');
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty response');
  return content;
}

async function viaAnthropic(apiKey: string, ask: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model: process.env.SETS_MODEL || 'claude-opus-5',
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SET_SCHEMA } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: ask }],
  });
  if (response.stop_reason === 'refusal') throw new Error('declined');
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('no output');
  return block.text;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
