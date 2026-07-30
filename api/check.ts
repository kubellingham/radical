// The daily Check: one short conversation, once a day, built over the sets
// already in rotation. The model runs the conversation and grades each answer
// silently — nothing about the grading ever reaches the screen. Key stays
// server-side; a valid Supabase session is required because this spends real
// credit.
const LANGUAGES = ['ja', 'ko', 'zh', 'es', 'ru'] as const;

const NAMES: Record<string, string> = {
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Mandarin Chinese',
  es: 'Spanish',
  ru: 'Russian',
};

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    // Split deliberately. When the question lived inside one free-form
    // "reply" field the model kept dropping it — answering "Right, agua."
    // and leaving the next question only in the metadata, which strands the
    // screen waiting for an answer to a question nobody was shown. Two
    // fields make that failure visible and recoverable.
    reaction: { type: 'string' },
    question: { type: 'string' },
    ask: {
      type: 'object',
      properties: {
        set_id: { type: 'string' },
        language_code: { type: 'string', enum: [...LANGUAGES, ''] },
      },
      required: ['set_id', 'language_code'],
      additionalProperties: false,
    },
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          set_id: { type: 'string' },
          language_code: { type: 'string', enum: [...LANGUAGES] },
          result: { type: 'string', enum: ['solid', 'shaky', 'missed'] },
        },
        required: ['set_id', 'language_code', 'result'],
        additionalProperties: false,
      },
    },
    done: { type: 'boolean' },
  },
  required: ['reaction', 'question', 'ask', 'verdicts', 'done'],
  additionalProperties: false,
} as const;

const SYSTEM = `You run a two-minute daily check for someone learning Japanese, Korean, Mandarin Chinese, Spanish and Russian at the same time. It is a short conversation, not a quiz.

You are given the words in play (each with its English meaning and its rendering in every language), which language codes you are allowed to ask about, what you asked for last turn, and the conversation so far.

Every turn, do three things.

1. Grade the learner's last answer against what you asked, silently.
   - solid: they produced it. Native script or a sensible romanization both count. Ignore spacing, capitalisation, punctuation and accents.
   - shaky: close but not right — a wrong ending, a missing syllable, the right word in the wrong language, or the right idea in the wrong register.
   - missed: blank, wrong, or any form of "I don't know".
   Return one verdict for what you asked last turn, and nothing else. On the first turn there is nothing to grade, so return no verdicts.

2. Write "reaction": one or two short sentences on the last answer. Say plainly whether it was right. When it wasn't, give the answer. No praise, no encouragement, no exclamation marks, no emoji, no "great", no "nice". On the first turn there is nothing to react to, so leave it empty.

3. Write "question": the next question, in full, as the learner will read it. Name a language and a small everyday situation, and ask for one word or phrase from the list. Put the same word and language in "ask" as set_id and language_code.

"question" and "ask" must always agree, and neither may be left out while the other is filled in. The learner is shown "reaction" and "question" and nothing else — if the question is not written out in "question", they are staring at a blank prompt with no idea what was asked. Putting it only in "ask" is the single worst thing you can do here.

Rules:
- Only ever ask about the allowed language codes. Never any other language.
- Only ever ask about a word that is in the list you were given.
- Never ask about the same language twice in a row.
- Never mention scores, levels, strength, streaks, intervals, due dates or how any of this is judged. The learner must not be able to tell that grading exists.
- Write in English. The only foreign text you produce is a word you are giving away because they missed it.
- Keep it human. "Someone hands you a coffee. How do you say thank you in Korean?" — not "Translate: thank you (Korean)". This holds for the opening question too: start in a situation, not with a preamble about starting.
- When told this is the final turn: set done to true, leave question empty and ask empty (set_id "" and language_code ""), grade the last answer, and close with one flat line in "reaction". No summary of how they did, no encouragement.

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

function extractJson(raw: string): Record<string, unknown> {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no json in response');
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  }
}

interface WireSet {
  id?: string;
  gloss?: string;
  renderings?: { language_code?: string; term?: string; reading?: string; say?: string }[];
}

export async function POST(request: Request): Promise<Response> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!openRouterKey && !anthropicKey) {
    return json({ error: 'check not configured' }, 503);
  }
  if (!(await authorized(request))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let input: {
    sets?: WireSet[];
    languages?: string[];
    transcript?: { role?: string; text?: string }[];
    asked?: { set_id?: string; language_code?: string } | null;
    turn?: number;
    total?: number;
  };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  // The script gate again, on the server: a language whose script isn't
  // learned yet must never be asked about, whatever the screen sent.
  const allowed = (Array.isArray(input.languages) ? input.languages : []).filter((c): c is string =>
    (LANGUAGES as readonly string[]).includes(c)
  );
  if (allowed.length === 0) return json({ error: 'no languages' }, 400);

  const sets = (Array.isArray(input.sets) ? input.sets : [])
    .filter((s) => s.id && s.gloss && Array.isArray(s.renderings))
    .slice(0, 20);
  if (sets.length === 0) return json({ error: 'no sets' }, 400);

  const transcript = (Array.isArray(input.transcript) ? input.transcript : [])
    .filter((t) => typeof t.text === 'string' && t.text.trim())
    .slice(-24);

  const turn = Math.min(Math.max(Number(input.turn) || 1, 1), 20);
  const total = Math.min(Math.max(Number(input.total) || 6, 1), 20);
  const last = turn >= total;

  // Only the allowed languages are ever put in front of the model, so it
  // has nothing to leak even if it ignores the instruction.
  const catalogue = sets
    .map((s) => {
      const parts = (s.renderings ?? [])
        .filter((r) => r.language_code && allowed.includes(r.language_code))
        .map((r) => `${r.language_code}=${r.term}${r.say ? ` (${r.say})` : ''}`)
        .join('  ');
      return `- ${s.id} | ${s.gloss} | ${parts}`;
    })
    .join('\n');

  const asked =
    input.asked?.set_id && input.asked.language_code
      ? `Last turn you asked for set ${input.asked.set_id} in ${
          NAMES[input.asked.language_code] ?? input.asked.language_code
        } (${input.asked.language_code}). Grade the learner's most recent message against that.`
      : 'Nothing has been asked yet. Open the conversation.';

  const said = transcript.length
    ? transcript.map((t) => `${t.role === 'you' ? 'Learner' : 'You'}: ${t.text}`).join('\n')
    : '(nothing yet)';

  const ask = `Words in play (set_id | meaning | renderings):
${catalogue}

Allowed languages: ${allowed.map((c) => `${NAMES[c]} (${c})`).join(', ')}.

${asked}

Conversation so far:
${said}

This is turn ${turn} of ${total}.${last ? ' This is the FINAL turn — grade, close, and ask nothing.' : ''}`;

  try {
    const text = openRouterKey
      ? await viaOpenRouter(openRouterKey, ask)
      : await viaAnthropic(anthropicKey as string, ask);
    const parsed = extractJson(text);

    const knownIds = new Set(sets.map((s) => s.id));
    const rawAsk = parsed.ask as { set_id?: string; language_code?: string } | undefined;
    const reaction = typeof parsed.reaction === 'string' ? parsed.reaction.trim() : '';
    const question = typeof parsed.question === 'string' ? parsed.question.trim() : '';

    // An ask survives only if it points at a set we sent, in a language that
    // is unlocked, AND the question was actually written out for the learner
    // to read. A question nobody can see is worse than no question: the
    // screen would sit waiting on an answer to nothing.
    const nextAsk =
      rawAsk?.set_id &&
      knownIds.has(rawAsk.set_id) &&
      allowed.includes(rawAsk.language_code ?? '') &&
      question.length > 0
        ? { set_id: rawAsk.set_id, language_code: rawAsk.language_code }
        : null;

    const verdicts = (Array.isArray(parsed.verdicts) ? parsed.verdicts : [])
      .filter((v): v is { set_id: string; language_code: string; result: string } => {
        const x = v as { set_id?: string; language_code?: string; result?: string };
        return (
          !!x.set_id &&
          knownIds.has(x.set_id) &&
          allowed.includes(x.language_code ?? '') &&
          ['solid', 'shaky', 'missed'].includes(x.result ?? '')
        );
      })
      .slice(0, 4);

    const done = parsed.done === true || last || !nextAsk;
    // One visible turn: what just happened, then what's being asked. The
    // question is dropped when the ask didn't survive, so the two can never
    // disagree on screen.
    const reply = [reaction, done ? '' : question].filter(Boolean).join(' ');
    // Nothing to show is a broken turn, not a quiet one. Fail so the screen
    // falls back instead of rendering a blank line.
    if (!reply) throw new Error('empty turn');
    return json({
      reply,
      ask: done ? null : nextAsk,
      verdicts,
      done,
    });
  } catch {
    return json({ error: 'check failed' }, 502);
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
      model: process.env.CHECK_MODEL || process.env.DUMP_MODEL || 'anthropic/claude-sonnet-5',
      max_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: ask },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'check_turn', strict: true, schema: CHECK_SCHEMA },
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
    model: process.env.CHECK_MODEL || 'claude-opus-5',
    max_tokens: 2000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: CHECK_SCHEMA } },
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
