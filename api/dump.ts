// Vercel serverless function: parse a messy free-text capture into
// structured vocabulary items. The API key lives here, server-side, never in
// the app bundle. When no key is configured or the model declines, the
// client falls back to its local parser — the app is never blocked.
//
// Two providers, whichever is configured (OpenRouter wins if both are):
//   OPENROUTER_API_KEY  → openrouter.ai, OpenAI-compatible
//   ANTHROPIC_API_KEY   → api.anthropic.com direct
import Anthropic from '@anthropic-ai/sdk';

const LANGUAGES = ['ja', 'ko', 'zh', 'es', 'ru'] as const;
const CONTEXTS = ['café', 'class', 'transit', 'gym', 'home', 'street', ''] as const;

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          language_code: { type: 'string', enum: [...LANGUAGES] },
          term: { type: 'string' },
          reading: { type: 'string' },
          meaning: { type: 'string' },
          example: { type: 'string' },
          example_meaning: { type: 'string' },
          context_tag: { type: 'string', enum: [...CONTEXTS] },
          sino_root: { type: 'string' },
        },
        required: [
          'language_code',
          'term',
          'reading',
          'meaning',
          'example',
          'example_meaning',
          'context_tag',
          'sino_root',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const SYSTEM = `You parse a language learner's messy notes into structured vocabulary items.
The learner studies Japanese (ja), Korean (ko), Chinese (zh), Spanish (es), and Russian (ru).

For each vocabulary item in the text:
- language_code: which of the five languages the term belongs to.
- term: the word or phrase in its native script. If the learner wrote romanization for a language they study in another script, convert to the native script.
- reading: pronunciation (kana for Japanese, pinyin for Chinese, romanization for Korean/Russian). Empty string for Spanish.
- meaning: concise English meaning.
- example: a short, natural example sentence in the language, only if the learner provided one or the term begs an obvious one; otherwise empty string.
- example_meaning: English translation of the example, or empty string.
- context_tag: one of café/class/transit/gym/home/street if the note implies where it was learned, else empty string.
- sino_root: for Japanese/Korean/Chinese words derived from a shared Classical Chinese root, the root in Chinese characters (e.g. 時間 for Japanese jikan / Korean sigan / Chinese shíjiān). Empty string for native words and for Spanish/Russian.

Split multi-word notes into separate items. Preserve what the learner actually wrote; fill gaps conservatively. Do not invent items that are not in the text.
Reply with JSON only — no prose, no code fences.`;

// The Supabase URL and publishable key are client-public values by design;
// here they only serve to verify the caller's session token.
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://vjedphmlpmricpvrnzsw.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_sRN92h10e4r9xQ65sf_KWQ_ztUKSZUP';

// This endpoint spends real credit, so it accepts only requests carrying a
// valid Supabase session token.
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

/** Models sometimes wrap JSON in prose or fences despite being told not to. */
function extractJson(raw: string): { items: unknown[] } {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(text) as { items: unknown[] };
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no json in response');
    return JSON.parse(text.slice(start, end + 1)) as { items: unknown[] };
  }
}

async function viaOpenRouter(apiKey: string, text: string): Promise<{ items: unknown[] }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      // Optional attribution headers OpenRouter uses for its rankings.
      'x-title': 'Polyglot',
    },
    body: JSON.stringify({
      model: process.env.DUMP_MODEL || 'anthropic/claude-sonnet-5',
      max_tokens: 8000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: text },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'captured_items', strict: true, schema: ITEM_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`openrouter ${res.status}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    error?: { message?: string };
  };
  if (body.error) throw new Error(body.error.message ?? 'openrouter error');
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty response');
  return extractJson(content);
}

async function viaAnthropic(apiKey: string, text: string): Promise<{ items: unknown[] }> {
  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model: process.env.DUMP_MODEL || 'claude-opus-5',
    max_tokens: 8000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ITEM_SCHEMA } },
    // Safety classifiers can decline a request; retry it server-side on the
    // recommended fallback model instead of failing the capture.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: text }],
  });
  if (response.stop_reason === 'refusal') throw new Error('declined');
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('no output');
  return extractJson(block.text);
}

// Web-handler form: Vercel's Node runtime dispatches method-named exports
// with (Request) => Response; a default export would get the legacy
// (req, res) signature and hang.
export async function POST(request: Request): Promise<Response> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!openRouterKey && !anthropicKey) {
    // Not configured yet — the client degrades to local parsing, quietly.
    return json({ error: 'parser not configured' }, 503);
  }
  if (!(await authorized(request))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let text: unknown;
  try {
    const body = (await request.json()) as { text?: unknown };
    text = body.text;
  } catch {
    return json({ error: 'invalid body' }, 400);
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return json({ error: 'text required' }, 400);
  }
  if (text.length > 4000) {
    return json({ error: 'text too long' }, 400);
  }

  try {
    const parsed = openRouterKey
      ? await viaOpenRouter(openRouterKey, text)
      : await viaAnthropic(anthropicKey as string, text);
    if (!Array.isArray(parsed.items)) throw new Error('no items');
    return json({ items: parsed.items });
  } catch {
    return json({ error: 'parse failed' }, 502);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
