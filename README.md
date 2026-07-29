# Mission Control

A logbook with a voice, for five languages over five years. Japanese · Korean · Chinese · Spanish · Russian. One user, one shared vocabulary store, one daily check.

Expo (iOS + web) · Supabase · Anthropic API.

## Status

- **Phase 1 — Skeleton: built.** Setup flow, five tabs (Today / Dump / Feed / Check / Record), local store, Supabase schema + client, design tokens.
- Phase 2 — Dump, log, counter: next.
- Phase 3 — Feed and packs.
- Phase 4 — Check and drift.
- Phase 5 — Mirror and report.

## First run

1. **Supabase.** Create a project, then apply `supabase/migrations/20260729000000_init.sql` (SQL editor, `supabase db push`, or the Supabase MCP). Enable email auth (it's on by default).
2. **Env.** Copy `.env.example` to `.env` and fill in the project URL and anon key. Without them the app runs local-only and starts syncing once they exist.
3. **Run.**

   ```bash
   npm install
   npm run web      # browser
   npm run ios      # simulator / device via Expo Go or a dev build
   ```

4. First launch: sign in (create the account on first run), mark which scripts you can read, assign rhythm slots, Begin.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm run export:web  # static web build → dist/, deploys to Vercel as-is
```

## Layout

```
app/                  Expo Router: sign-in, setup, (tabs)/{today,dump,feed,check,record}
components/           Screen wrapper, stubs — small, typographic
constants/theme.ts    The five design tokens. The only colors in the app.
lib/local-store/      get/set/list — expo-sqlite on native, idb-keyval on web.
                      Nothing outside the module knows which.
lib/supabase.ts       Env-driven client; null (local-only mode) when unconfigured
lib/setup.ts          Setup persistence: local first, then Supabase
supabase/migrations/  Schema — all tables RLS'd to the owning user
```

## Rules the code keeps

- Monochrome everywhere: ink `#16181D`, paper `#F2EFE9`, slate `#6B7078`, rule `#2A2D34`. Seal red `#A8342A` exists in the tokens and is **reserved for the drift indicator in Phase 4** — one color, one meaning.
- Languages are shown as a character from their own script — 日 한 中 ñ Я — never a flag.
- A language stays in script mode until its script is marked learned. No vocabulary through romanization.
- No streaks, no confetti, no guilt copy. The counter going up is the celebration.
