// Vercel serverless function: parse a messy free-text dump into structured
// vocabulary items. The Anthropic key lives here, server-side, never in the
// app bundle. When the key is missing or the model declines, the client
// falls back to its local heuristic parser — the app is never blocked.
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

Split multi-word notes into separate items. Preserve what the learner actually wrote; fill gaps conservatively. Do not invent items that are not in the text.`;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Not configured yet — the client degrades to local parsing, quietly.
    return json({ error: 'parser not configured' }, 503);
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

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.beta.messages.create({
      model: process.env.DUMP_MODEL || 'claude-opus-5',
      max_tokens: 8000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: ITEM_SCHEMA },
      },
      // Safety classifiers can decline a request; retry it server-side on
      // the recommended fallback model instead of failing the dump.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    });

    if (response.stop_reason === 'refusal') {
      return json({ error: 'parser declined' }, 502);
    }
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') {
      return json({ error: 'no output' }, 502);
    }
    const parsed = JSON.parse(block.text) as { items: unknown[] };
    return json({ items: parsed.items });
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? 502 : 500;
    return json({ error: 'parse failed' }, status);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
