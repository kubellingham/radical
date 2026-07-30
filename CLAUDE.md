# Polyglot — working notes

Personal five-language learning logbook. Expo SDK 54 + Expo Router + TypeScript, Supabase, deployed to iOS (EAS) and web (Vercel, `npx expo export -p web`). The build spec and the v2 direction update live with the owner; `docs/direction-v2.md` records what changed and what was pushed back on.

Phases: 1 skeleton ✓ · 2 Found/Record ✓ · 3 Feed/packs ✓ · 4 Check/drift · 5 Mirror/report.

## Hard rules

- **Colors:** only the five tokens in `constants/theme.ts` (ink, paper, slate, rule, seal). Seal red is reserved for the Phase-4 drift indicator — exactly one language may ever show it, nowhere else. Never introduce another color.
- **No flags.** A language is represented by a character from its own script (日 한 中 ñ Я).
- **Script gate.** A language stays `status='script'` until `script_learned` — no vocabulary features for it before then. Enforced in the Found screen *and* again in `saveDump`.
- **Hide the algorithms.** Nothing in the interface may name a strength, an interval, a due date, or SM-2. Scheduling lives only in `lib/scheduler.ts`. Cards simply appear when they should.
- **Storage:** all local persistence goes through `lib/local-store` (`get`/`set`/`list`). Only that module knows whether sqlite (native) or IndexedDB (web) is underneath; keep it that way. Shared keys are written under the promise-chain locks in `lib/repo.ts` — the kv store has no transactions.
- **Supabase may be unconfigured** (`supabase === null`): every feature must degrade to local-only, quietly. Failure states are one flat line, not error walls.
- **Copy is flat and factual.** "Korean, 5 days dark." No cheerleading, no streaks, no confetti; swipe physics on the Feed is the only animation.
- **Secrets:** the Anthropic key lives in Vercel serverless functions (`/api/*`), never in the app bundle. `/api/dump` requires a valid Supabase session token — it spends real credit. Only `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `_API_URL` are client-side.

## Checks before committing

```bash
npm run typecheck
npm run lint
npm run export:web   # must succeed; deploy artifact is dist/
```

## Content packs

`packs/*.json` are reviewed pack files. `npm run packs:generate` (needs `ANTHROPIC_API_KEY`) writes new ones; `npm run packs:upload` (needs `SUPABASE_SERVICE_ROLE_KEY`) pushes them. Packs are shared content — clients read, never write. Sino packs must be **matched triples**: the same `sino_root` at the same index across zh/ja/ko, or the triple card can't form. `lib/starter-packs.ts` bundles a few so the Feed works offline on first open.

## Schema

`supabase/migrations/` is the source of truth (languages, items, item_state, packs, pack_downloads, sessions, checks, mirrors, rhythm). User tables are RLS'd to `user_id = auth.uid()` with `user_id` defaulting to `auth.uid()` so clients never send it; `packs` is shared content — keyed by `language_code`, read-only to clients, written only by the build-time generator via service role. `date` columns carry the user's local day and are always sent by the client (no UTC `current_date` defaults). Scheduling is simplified SM-2: strength 0–5, intervals [1,2,4,8,16,32].
