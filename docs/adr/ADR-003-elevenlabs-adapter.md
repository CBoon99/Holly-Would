# ADR-003: ElevenLabs behind VoiceSynthesisProvider

**Status:** Accepted  
**Date:** 2026-07-29

## Context

Brief requires provider independence and ElevenLabs as the initial TTS vendor. Phase 0 used offline seed audio.

## Decision

- All TTS goes through `VoiceSynthesisProvider`.
- `ElevenLabsVoiceProvider` is the only module that speaks ElevenLabs HTTP.
- Internal `voice_profiles.id` is the PK; `provider_voice_id` is a mapped external reference.
- Every generation writes a `generation_records` row (provenance + cost estimate).
- Seed uses live provider when `ELEVENLABS_API_KEY` is set; otherwise offline fallback.

## Consequences

- Swapping vendors does not rewrite scene/domain code.
- Secrets stay in env / `.env.local` (gitignored).
