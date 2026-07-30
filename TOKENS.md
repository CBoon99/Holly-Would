# Tokens for full automation

Paste secrets into **`web/.env.local`** only (gitignored). Never commit.

After pasting, run:

```bash
npm run automate --prefix web
```

## Required for current automation

| Variable | Service | Used for |
|----------|---------|----------|
| `ELEVENLABS_API_KEY` | ElevenLabs | Partner TTS + STT feedback |
| `ELEVENLABS_VOICE_ID` | ElevenLabs | Pin partner voice (needed if key lacks `voices_read`) |

**Already set** if you completed the earlier key step.

For best results, enable on the ElevenLabs key (if restricted):

- text_to_speech
- speech_to_text (for script accuracy feedback)
- voices_read (optional)

## Optional — paste when you have them

| Variable | Service | Used for |
|----------|---------|----------|
| `OPENAI_API_KEY` | OpenAI | Whisper STT fallback (wire next) |
| `DEEPGRAM_API_KEY` | Deepgram | STT alternative (wire next) |
| `DATABASE_URL` | Postgres | Production DB |
| `REDIS_URL` | Redis | Job queue |
| `S3_ENDPOINT` + `S3_ACCESS_KEY` + `S3_SECRET_KEY` + `S3_BUCKET` | S3/R2/B2 | Object storage |
| `R2_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` + `R2_BUCKET` | Cloudflare R2 | Object storage |
| `SENTRY_DSN` | Sentry | Errors |
| `RAILWAY_TOKEN` | Railway | Deploy automation |
| `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk | Auth |
| `BETTER_AUTH_SECRET` | Better Auth | Auth alternative |

## Drop format (chat or file)

```
ELEVENLABS_API_KEY=...
RAILWAY_TOKEN=...
DATABASE_URL=...
...
```

I will write them into `.env.local` and re-run `npm run automate`.
