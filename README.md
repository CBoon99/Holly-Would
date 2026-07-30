# Holly Would

**Series · technical · hilarious.**  
Audio-first Hollywood acting practice — perform classic *vibes*, not pirated scripts.

> *Holly Would if she could. She can. Hit record.*

## What it is

Users pick a rights-safe scene, choose a role (cowboy lead, southern fire, noir café, rom-com…), act line-by-line against a partner voice, then **listen to the mix**. Filter by difficulty, tone, rudeness, funny, and character style.

All catalogue dialogue is **platform-original** (Hollywood energy, not licensed Casablanca / GWTW / Wayne scripts).

## Stack

| Layer | Choice |
|--------|--------|
| App | Next.js (App Router) + TypeScript + Tailwind |
| Local DB | SQLite (`node:sqlite`) |
| Media | FFmpeg mix, browser MediaRecorder |
| TTS | ElevenLabs (adapter) + offline fallback |
| STT feedback | Deepgram → OpenAI → ElevenLabs |
| Host | **Netlify** Next runtime (same methodology as [Devils Advocates](https://evils-advocates.netlify.app)) |

## Quick start (local)

```bash
cd web
npm install
npm run db:seed:hollywood   # 11 original scenes
npm run dev -- -p 3456
```

Open http://localhost:3456

## One-command automation

```bash
cd web
npm run automate:hollywood
```

## Secrets (never commit)

Copy `web/.env.example` → `web/.env.local`:

- `ELEVENLABS_API_KEY` (+ optional voice IDs)
- `DEEPGRAM_API_KEY` / `OPENAI_API_KEY` (feedback STT)
- Later: `DATABASE_URL`, Clerk, Sentry, etc.

See `TOKENS.md`.

## Netlify deploy (Devils Advocates methodology)

Same pattern as [evils-advocates.netlify.app](https://evils-advocates.netlify.app): Next app in **`web/`**.

1. Connect GitHub repo **Holly-Would** to Netlify  
2. **Base directory:** `web`  
3. **Build command:** `npm run build`  
4. **Publish directory:** leave **blank**  
5. **Node:** 22  
6. Env: `DATA_DIR=/tmp/holly-would-data` + API keys  
7. Trigger **Clear cache and deploy**  
8. After green: visit `/api/bootstrap` once, then `/`

`web/netlify.toml` includes `@netlify/plugin-nextjs`.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local server (from repo root or `web/`) |
| `npm run verify` | Typecheck + unit tests |
| `npm run db:seed:hollywood` | Seed catalogue |
| `npm run automate` | Env → migrate → seed → verify |

## Product docs

- `PROJECT_AGENT_PROFILE.md` — agent rules  
- `Acting Platform Master Product Brief.txt` — full product/tech spec  
- `WORKING.md` — living status  
- `missions/` — evidence packets  

## License / rights

Original interactive scene packages. Do **not** bulk-ingest copyrighted film audio or scripts without executed licenses.
