# Polyglot

A logbook with a voice, for five languages over five years. Japanese · Korean · Chinese · Spanish · Russian. One user, one shared vocabulary store, one daily check.

Expo (iOS + web) · Supabase · Anthropic API.

## Status

- **Phase 1 — Skeleton: done.** Setup flow, tabs, local store, schema, design tokens.
- **Phase 2 — Found, Record: done.** Free-text capture parsed into structured items, hours counted forever, the session log.
- **Phase 3 — Feed and packs: done.** Swipeable deck, three card types, build-time pack generator, background sync.
- Phase 4 — Check and drift: next. The one place seal red is allowed.
- Phase 5 — Mirror and report.

See `docs/direction-v2.md` for the current product direction and what it changed.

## The five screens

| Tab | What it is |
|---|---|
| **Today** | Today's mission and nothing else. Two or three lines, an estimate, no analytics. |
| **Found** | Where everything you learned out in the world goes. Type it messily; it gets parsed, shown for confirmation, and filed. |
| **Feed** | A deck of cards for the idle four minutes. Swipe right if you have it, left to see it again. |
| **Check** | The daily two-minute conversation. Phase 4. |
| **Record** | Hours all-time, Day N of 1825, and every session note in reverse order. The thing you reread in 2031. |

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
app/                  sign-in, setup, (tabs)/{today,found,feed,check,record}
api/dump.ts           Vercel function: free text → structured items. Key server-side, session-gated.
components/           Screen wrapper, the three card faces
constants/theme.ts    The five design tokens. The only colors in the app.
lib/local-store/      get/set/list — expo-sqlite native, idb-keyval web. Nothing else knows which.
lib/scheduler.ts      The only file that knows about strength and intervals.
lib/deck.ts           Builds the Feed: due items, sino triples, false friends
lib/packs.ts          Pack cache and the background sync worker
lib/repo.ts           Items, sessions, and the retrying outbox
packs/                Reviewed pack JSON
scripts/              Build-time pack generator and uploader
supabase/migrations/  Schema — RLS'd per user; packs are shared, read-only
```

## Rules the code keeps

- Monochrome: ink `#16181D`, paper `#F2EFE9`, slate `#6B7078`, rule `#2A2D34`. Seal red `#A8342A` is reserved for the Phase-4 drift indicator — one color, one meaning.
- Languages are a character from their own script — 日 한 中 ñ Я — never a flag.
- A language stays in script mode until its script is marked learned. No vocabulary through romanization.
- No streaks, no confetti, no guilt copy, no visible algorithm. The counter going up is the celebration.
