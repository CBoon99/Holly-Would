# Plan — M0-V1-SPRINT

## Approach

1. Scaffold Next.js modular monolith under `apps/web`
2. SQLite domain schema matching brief entities
3. Rights engine before catalogue visibility
4. Seed original scene + partner audio (macOS say / sine fallback)
5. Performance session API + line-by-line studio UI
6. FFmpeg mix job with versioned derivative
7. Verify + smoke evidence

## Risks accepted for sprint

- Auth is local DEV_USER only
- Mix runs in request path for V1 complete endpoint (acceptable for short scenes; queue later)
- Partner TTS not live ElevenLabs (adapter stub + seed files)

## Out of scope confirmed

No Railway, payments, share, video, film library.
