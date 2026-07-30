# Polyglot

A logbook with a voice, for five languages over five years. Japanese · Korean · Chinese · Spanish · Russian. One user, one shared vocabulary store, one daily check.

Expo (iOS + web) · Supabase · Anthropic API.

## Status

- **Phase 1 — Skeleton: done.** Setup flow, tabs, local store, schema, design tokens.
- **Phase 2 — Found, Record: done.** Free-text capture parsed into structured items, hours counted forever, the session log.
- **Phase 3 — Feed and packs: done.** Swipeable deck, three card types, build-time pack generator, background sync.
- **Phase 4 — Check and drift: done.** The daily conversation, silent grading, the drift indicator — the one place seal red is allowed.
- **Phase 5 — The line and the report: done.** One sentence a day kept forever, the column it stacks into, and a report that is one line and usually absent.

See `docs/direction-v2.md` for the current product direction and what it changed.

## The five screens

| Tab | What it is |
|---|---|
| **Today** | Today's mission and nothing else. Two or three lines, an estimate, no analytics. |
| **Found** | Where everything you learned out in the world goes. Type it messily; it gets parsed, shown for confirmation, and filed. |
| **Feed** | A deck of cards for the idle four minutes. Swipe right if you have it, left to see it again. |
| **Check** | The daily two-minute conversation. It asks for one language at a time, grades silently, and is what tells Today which language has gone dark. |
| **Record** | Hours all-time, Day N of 1825, and every session note in reverse order. The way in to the line. |
| **The line** | Not a tab. One sentence a day, in one of your languages, and every one before it. The thing you reread in 2031. |

## First run

1. **Supabase.** Live project: `mission-control` (`vjedphmlpmricpvrnzsw`, ap-south-1), schema applied from `supabase/migrations/20260729000000_init.sql`. For a fresh project, apply that file.
2. **Env.** Copy `.env.example` to `.env` and fill in the project URL and publishable key. Same values go in Vercel. Without them the app runs local-only and starts syncing once they exist.
3. **Run.**

   ```bash
   npm install
   npm run web      # browser
   npm run ios      # simulator / device
   ```

4. Sign in, mark which scripts you can read, assign rhythm slots, Begin. Scripts stay editable from Today.

## Checks

```bash
npm run typecheck
npm run lint
npm run export:web
```

## The Found parser

`/api/dump` turns messy text into structured items. It works with either provider — set **one** of these in Vercel's environment variables (Production), never in the repo:

| Variable | Notes |
|---|---|
| `OPENROUTER_API_KEY` | Takes precedence. Default model `anthropic/claude-sonnet-5`, ~half a cent per capture. |
| `ANTHROPIC_API_KEY` | Direct. Default model `claude-opus-5`. |
| `DUMP_MODEL` | Optional override, e.g. `anthropic/claude-haiku-4.5` for a cheaper run. |

The endpoint requires a valid Supabase session token, so only the signed-in app can spend credit. With no key set — or if the call fails for any reason — Found silently falls back to its local parser, which handles `X = Y` and `X means Y` but won't convert romanization to native script or fill in Sino roots.

`/api/sets` (the bank, `SETS_MODEL`) and `/api/check` (the daily conversation, `CHECK_MODEL`) read the same two keys and are gated the same way.

## The Check and drift

Once a day, six exchanges, about two minutes. The server runs the conversation over sets already in rotation, asking for one named language at a time, and grades each answer `solid` / `shaky` / `missed` — silently. Nothing about the grading reaches the screen; it only feeds `lib/scheduler.ts`.

Asking one language at a time is the point. Every Feed card shows all five at once, so the Feed can't tell them apart — it lights all of them or none. The Check can, and a language that keeps not coming up, or keeps being missed, goes dark while the others stay lit. Four days dark and Today says so, once, in seal red:

> Korean, 5 days dark.

Never two at once — a page with two warnings on it has no warning on it — and never before the first Check exists, because until then everything is equally untested.

With no network or no session the conversation is replaced by ten tapped questions, one language each. Same verdicts, same curve, same drift signal, so a week offline doesn't blind it. The script gate applies here too, on the client *and* again in `api/check.ts`: a language you can't read yet is never asked about.

## The line, and the report

Once a day, one sentence, in one of your languages, written by you. Not a journal entry and not a prompt-and-response — a single line. Five years is 1,825 of them, and they are the only thing in this app that could not be regenerated: every card in the bank is vocabulary a model could produce again, and none of the lines are.

The day is the identity, so the day is the key (`line.<YYYY-MM-DD>`). Rewriting today overwrites it, an anniversary is a lookup, and there can never be two lines for one day. Only today is writable — a past line is what you could write *then*, and the anniversary echo becomes a lie the moment old lines can be edited. The blank line is the whole problem with writing daily, so the box is never blank: it shows today's sentence in the language you are about to write in.

The suggested language is whichever you have written in least, so the corpus comes out even over five years instead of eighty percent whatever was easiest in year one. It is a suggestion; the chips override it.

**The report is not a screen.** A page of statistics gets opened twice and never again, because the third time you already know what it says. So it is at most one observation, at the head of the column, and most days there is nothing there at all. Each one is arithmetic on counts you produced yourself, each has a threshold below which it is simply absent, and the ones that report a direction report the opposite direction in identical words — an observation that only fires when the news is good has forfeited the right to be believed when it isn't.

What it will not say, however tempting: anything read off `timesMissed` or `timesSeen`. "The word you keep missing" would tell you the app has been scoring your answers, which is the one thing `api/check.ts` spends its entire system prompt preventing. `lib/observations.ts` says so where the next person will look.

## Content packs

A pack is ~40 items: one language, one context, one level. Generated at build time, reviewed by hand, then uploaded — never generated at runtime, which is what keeps the app instant and free to open.

```bash
ANTHROPIC_API_KEY=... npm run packs:generate -- --language ko --context café --level 1
ANTHROPIC_API_KEY=... npm run packs:generate -- --sino --level 1   # matched zh/ja/ko triples
# review packs/*.json by hand, then:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run packs:upload
```

The Sino packs are the point: the same root at the same index in all three decks, which is what lets one card show 時間 / じかん / 시간 / shíjiān at once. A handful of reviewed packs ship inside the app so the Feed works offline from first launch.

## Layout

```
app/                  sign-in, setup, line, (tabs)/{today,found,feed,check,record}
api/dump.ts           Vercel function: free text → structured items. OpenRouter or Anthropic,
                      key server-side, session-gated.
api/sets.ts           Generates the bank: one meaning in all five languages. Also expands a
                      captured word, and fills in pronunciations.
api/check.ts          Runs one turn of the daily conversation and grades the last answer.
components/           Screen wrapper, the card faces, the offline tap check
constants/theme.ts    The five design tokens. The only colors in the app.
lib/local-store/      get/set/list — expo-sqlite native, idb-keyval web. Nothing else knows which.
lib/scheduler.ts      The only file that knows about strength and intervals.
lib/sets.ts           The bank: load, refill, sync. Never runs dry.
lib/check.ts          The daily conversation, its verdicts, and its history
lib/drift.ts          Which language has gone dark. The only source of seal red.
lib/line.ts           The daily line: one a day, keyed by day, today only.
lib/observations.ts   The report. At most one thing, usually nothing.
lib/deck.ts           Builds the Feed: due items, sino triples, false friends
lib/packs.ts          Pack cache and the background sync worker
lib/repo.ts           Items, sessions, and the retrying outbox
packs/                Reviewed pack JSON
scripts/              Build-time pack generator and uploader
supabase/migrations/  Schema — RLS'd per user; packs are shared, read-only
```

## Rules the code keeps

- Monochrome: ink `#16181D`, paper `#F2EFE9`, slate `#6B7078`, rule `#2A2D34`. Seal red `#A8342A` belongs to the drift line and nothing else — one color, one meaning.
- Languages are a character from their own script — 日 한 中 ñ Я — never a flag.
- A language stays in script mode until its script is marked learned. No vocabulary through romanization.
- No streaks, no confetti, no guilt copy, no visible algorithm. The counter going up is the celebration.
