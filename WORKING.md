# WORKING.md — Acting Platform

**Stage:** Phase 0 / V1 sprint in progress  
**Profile:** `PROJECT_AGENT_PROFILE.md` v1.0  
**Mission:** `missions/M0-V1-SPRINT/`

## Locked decisions

| Decision | Choice |
|----------|--------|
| Initial release | Audio-first, video-ready models |
| Phase 0 content | One original two-person scene (no bulk film ingest) |
| V1 sprint stack | Next.js modular monolith + SQLite + local storage + FFmpeg |
| NestJS / Python workers / Postgres / Redis | Deferred to M1–M2 after vertical slice proven |
| Partner voice V1 | Pre-baked seed audio (TTS adapter interface present) |
| Auth V1 | Local dev user session |

## Status

| Area | State |
|------|-------|
| Docs / profile / brief | Present |
| Application code | **V1 Phase 0 loop runnable** (M0-V1-SPRINT) |
| Deploy | **Primary: Netlify** `https://holly-would.netlify.app` · Railway parked (build fail) |
| Verify | typecheck + unit tests + API mix smoke pass |

## How to run

```bash
cd "Documents/Acting practice, in real movies scences"
npm install --prefix web
npm run db:seed --prefix web
npm run dev --prefix web
# open http://localhost:3000
```

## Changelog

### 2026-07-30 (Railway parked — Netlify primary)

- Attempted Railway project `holly-would` (volume `/data`, domain created).
- Build failed: Nixpacks tried to cache-mount `tsconfig.tsbuildinfo` as a directory (`not a directory`).
- **Decision:** stop fighting Railway for now. Primary live host = **Netlify**.
- Railway project left in account for a later Dockerfile-based retry.
- Stable-ID catalogue seed + session bootstrap already on Netlify.

### 2026-07-30 (Netlify layout + holly-would)

- Restructured app to repo-root `web/` (same pattern as Devils Advocates).
- Root + `web/netlify.toml`: base `web`, Next plugin, `DATA_DIR=/tmp/holly-would-data`.
- Netlify site name for now: **holly-would** → `https://holly-would.netlify.app`
- Seed JSON also at `web/content/seed/` for serverless file tracing.
- After green deploy: open `/api/bootstrap` once to seed catalogue on cold storage.


### 2026-07-30 (GitHub + Holly Would brand)

- **Repo live:** https://github.com/CBoon99/Holly-Would (`main` pushed)
- Brand: **Holly Would** — series · technical · hilarious
- Netlify methodology copied from Devils Advocates (`web/netlify.toml`, base `web`)
- Secrets **not** committed; local tokens remain in `web/.env.local`
- Next: connect Netlify site → set env vars → green deploy

### 2026-07-30 (Hollywood catalogue)

- **11 original scenes** seeded (Casablanca/Scarlett/Wayne *energy*, not licensed scripts).
- Filters: difficulty, tone, rudeness, funny, style (incl. `john-wayne-type`, `southern-belle`, café noir).
- Command: `npm run db:seed:hollywood --prefix web`
- Rights: all `platform_original` / approved.

### 2026-07-30 (Token harvest from disk)

- No screen access; scanned local `.env` files.
- Reused from Devils Advocates (API-only): `OPENAI_API_KEY`, `DEEPGRAM_API_KEY` → Acting Platform `.env.local`.
- STT auto chain: Deepgram → OpenAI → ElevenLabs. Smoke: Deepgram live.
- **Not** copied: `CLERK_*`, `DATABASE_URL` (other products / shared DB risk).

### 2026-07-30 (Full automation layer)

- One-command: `npm run automate --prefix web` (env → migrate → seed TTS → verify).
- Automated feedback on mix complete (STT via ElevenLabs Scribe when permitted; timing always).
- Continuous guided mode (auto-advance user windows).
- Token inventory: `TOKENS.md` + `GET /api/system/status`.
- Services not yet configured show as empty slots (Railway, S3, Postgres, Clerk, etc.).

### 2026-07-30 (M3 live)

- ElevenLabs key stored in `web/.env.local` only (gitignored). **Rotate key** — it was shared in chat.
- Restricted key: no `voices_read`; TTS works with pinned voice Adam `pNInz6obpgDQGcFmaJgB`.
- Reseeded **The Last Call** partner lines (5) via ElevenLabs live TTS — observed.

### 2026-07-29 (M3)

- Picked **ElevenLabs adapter** next (easiest with API token; scales partner TTS).
- `VoiceSynthesisProvider` + `ElevenLabsVoiceProvider`; internal `voice_profiles` + `generation_records`.
- Seed uses live TTS when `ELEVENLABS_API_KEY` is in `web/.env.local`; else offline fallback.
- Commands: `npm run voices:check --prefix web`, then `npm run db:seed --prefix web`.

### 2026-07-29

- Mission M0-V1-SPRINT completed for local V1: catalogue → line-by-line perform → upload stems → FFmpeg mix → review playback.
- Seed scene: **The Last Call** (platform original, rights approved).
- ADRs 001–002 accepted (modular monolith; node:sqlite local).
- Evidence: `missions/M0-V1-SPRINT/evidence/verify.txt`.
