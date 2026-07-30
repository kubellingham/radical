# Mission Control — working notes

Personal five-language learning logbook. Expo SDK 54 + Expo Router + TypeScript, Supabase, deployed to iOS (EAS) and web (Vercel, `npx expo export -p web`). The authoritative product spec lives with the owner; phases 2–5 (Dump/Record → Feed/packs → Check/drift → Mirror/report) build on this skeleton.

## Hard rules

- **Colors:** only the five tokens in `constants/theme.ts` (ink, paper, slate, rule, seal). Seal red is reserved for the Phase-4 drift indicator — exactly one language may ever show it, nowhere else. Never introduce another color.
- **No flags.** A language is represented by a character from its own script (日 한 中 ñ Я).
- **Script gate.** A language stays `status='script'` until `script_learned` — no vocabulary features for it before then.
- **Storage:** all local persistence goes through `lib/local-store` (`get`/`set`/`list`). Only that module knows whether sqlite (native) or IndexedDB (web) is underneath; keep it that way.
- **Supabase may be unconfigured** (`supabase === null`): every feature must degrade to local-only, quietly. Failure states are one flat line, not error walls.
- **Copy is flat and factual.** "Korean, 5 days dark." No cheerleading, no streaks, no confetti; swipe physics on the Feed will be the only animation.
- **Secrets:** the Anthropic key lives in Vercel serverless functions (`/api/*`, Phases 2+), never in the app bundle. Only `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` are client-side.

## Checks before committing

```bash
npm run typecheck
npm run lint
npm run export:web   # must succeed; deploy artifact is dist/
```

## Schema

`supabase/migrations/` is the source of truth (languages, items, item_state, packs, pack_downloads, sessions, checks, mirrors, rhythm). User tables are RLS'd to `user_id = auth.uid()` with `user_id` defaulting to `auth.uid()` so clients never send it; `packs` is shared content — keyed by `language_code`, read-only to clients, written only by the build-time generator via service role. `date` columns carry the user's local day and are always sent by the client (no UTC `current_date` defaults). Scheduling is simplified SM-2: strength 0–5, intervals [1,2,4,8,16,32] days.
