import fs from "fs";
import path from "path";
import os from "os";
import { getVoiceProvider, isLiveVoiceConfigured } from "../providers/registry";
import {
  getVoiceProfile,
  recordGeneration,
  upsertVoiceProfile,
} from "../providers/voice-profiles";
import { synthesizeSeedLine, runFfmpeg, probeDurationMs } from "./ffmpeg";
import { storage } from "../storage/local";
import { id, stableId, nowIso } from "../ids";
import { run } from "../db/client";

export type PartnerLineResult = {
  assetId: string;
  objectKey: string;
  durationMs: number;
  provider: string;
  generationId?: string;
};

/**
 * Produce partner dialogue audio via ElevenLabs when configured,
 * otherwise offline seed (macOS say / sine).
 */
export async function generatePartnerLineAudio(input: {
  text: string;
  sceneId: string;
  sequence: number;
  voiceProfileId?: string;
  ownerDialogueEventId: string;
}): Promise<PartnerLineResult> {
  if (isLiveVoiceConfigured()) {
    try {
      return await generateViaElevenLabs(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `ElevenLabs failed for line ${input.sequence}, using offline seed:`,
        msg.slice(0, 160)
      );
      return generateViaOfflineSeed(input);
    }
  }
  return generateViaOfflineSeed(input);
}

async function generateViaElevenLabs(input: {
  text: string;
  sceneId: string;
  sequence: number;
  voiceProfileId?: string;
  ownerDialogueEventId: string;
}): Promise<PartnerLineResult> {
  const provider = getVoiceProvider();
  let profileId = input.voiceProfileId;
  let providerVoiceId = process.env.ELEVENLABS_VOICE_ID?.trim();

  if (profileId) {
    const profile = getVoiceProfile(profileId);
    if (!profile) throw new Error(`Unknown voice profile ${profileId}`);
    providerVoiceId = profile.providerVoiceId;
  } else if (providerVoiceId) {
    profileId = upsertVoiceProfile({
      provider: "elevenlabs",
      providerVoiceId,
      displayName: process.env.ELEVENLABS_VOICE_NAME || "Jordan (ElevenLabs)",
      description: "Default partner voice from ELEVENLABS_VOICE_ID",
      language: "en",
      styleTags: ["partner", "drama"],
    });
  } else {
    // Restricted keys often cannot list voices — fall back to known public Adam voice
    try {
      const voices = await provider.listVoices();
      if (!voices.length) throw new Error("no voices");
      const pick =
        voices.find((v) => /adam|daniel|josh|sam|antoni|bill|george/i.test(v.name)) ||
        voices[0];
      providerVoiceId = pick.providerVoiceId;
      profileId = upsertVoiceProfile({
        provider: "elevenlabs",
        providerVoiceId: pick.providerVoiceId,
        displayName: pick.name,
        description: "Auto-selected partner voice",
        language: "en",
        styleTags: ["partner", "auto"],
      });
    } catch {
      providerVoiceId = "pNInz6obpgDQGcFmaJgB"; // Adam
      profileId = upsertVoiceProfile({
        provider: "elevenlabs",
        providerVoiceId,
        displayName: "Adam (default partner)",
        description: "Fallback when voices_read is missing",
        language: "en",
        styleTags: ["partner", "fallback"],
      });
    }
  }

  const result = await provider.synthesize({
    text: input.text,
    voiceProfileId: profileId!,
    providerVoiceId: providerVoiceId!,
  });

  // Normalize to WAV 48k mono for consistent FFmpeg mixes
  const tmpMp3 = path.join(os.tmpdir(), `${id("tts")}.mp3`);
  const tmpWav = path.join(os.tmpdir(), `${id("tts")}.wav`);
  fs.writeFileSync(tmpMp3, result.assetBytes);
  await runFfmpeg([
    "-y",
    "-i",
    tmpMp3,
    "-ar",
    "48000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    tmpWav,
  ]);
  const durationMs = probeDurationMs(tmpWav);

  const assetId = stableId("asset", input.ownerDialogueEventId, "partner");
  const objectKey = storage.masterKey([
    "scenes",
    input.sceneId,
    "partner",
    `line_${input.sequence}.wav`,
  ]);
  const stored = await storage.putFile(objectKey, tmpWav);

  try {
    fs.unlinkSync(tmpMp3);
    fs.unlinkSync(tmpWav);
  } catch {
    /* ignore */
  }

  run(
    `INSERT INTO media_assets
      (id, owner_type, owner_id, asset_type, storage_provider, bucket, object_key,
       mime_type, size_bytes, checksum_sha256, duration_ms, sample_rate, channels,
       codec, status, metadata_json, created_at)
     VALUES (?, 'dialogue_event', ?, 'dialogue', 'local', 'private', ?,
             'audio/wav', ?, ?, ?, 48000, 1, 'pcm_s16le', 'ready', ?, ?)`,
    [
      assetId,
      input.ownerDialogueEventId,
      stored.objectKey,
      stored.sizeBytes,
      stored.checksumSha256,
      durationMs,
      JSON.stringify({
        provider: result.provider,
        model: result.model,
        provider_request_id: result.providerRequestId,
        provider_voice_id: result.providerVoiceId,
        voice_profile_id: profileId,
        text: input.text,
        character_count: result.characterCount,
        cost_usd_estimate: result.costUsdEstimate,
      }),
      nowIso(),
    ]
  );

  const generationId = recordGeneration({
    provider: result.provider,
    model: result.model,
    providerRequestId: result.providerRequestId,
    voiceProfileId: profileId!,
    inputText: input.text,
    outputAssetId: assetId,
    characterCount: result.characterCount,
    costUsdEstimate: result.costUsdEstimate,
    approvalState: "approved_seed",
  });

  return {
    assetId,
    objectKey: stored.objectKey,
    durationMs,
    provider: result.provider,
    generationId,
  };
}

async function generateViaOfflineSeed(input: {
  text: string;
  sceneId: string;
  sequence: number;
  ownerDialogueEventId: string;
}): Promise<PartnerLineResult> {
  const tmpWav = path.join(os.tmpdir(), `seed_${input.sequence}_${id("off")}.wav`);
  const { durationMs } = await synthesizeSeedLine(input.text, tmpWav);
  const assetId = stableId("asset", input.ownerDialogueEventId, "partner");
  const objectKey = storage.masterKey([
    "scenes",
    input.sceneId,
    "partner",
    `line_${input.sequence}.wav`,
  ]);
  const stored = await storage.putFile(objectKey, tmpWav);
  try {
    fs.unlinkSync(tmpWav);
  } catch {
    /* ignore */
  }

  run(
    `INSERT INTO media_assets
      (id, owner_type, owner_id, asset_type, storage_provider, bucket, object_key,
       mime_type, size_bytes, checksum_sha256, duration_ms, sample_rate, channels,
       codec, status, metadata_json, created_at)
     VALUES (?, 'dialogue_event', ?, 'dialogue', 'local', 'private', ?,
             'audio/wav', ?, ?, ?, 48000, 1, 'pcm_s16le', 'ready', ?, ?)`,
    [
      assetId,
      input.ownerDialogueEventId,
      stored.objectKey,
      stored.sizeBytes,
      stored.checksumSha256,
      durationMs,
      JSON.stringify({
        provider: "seed",
        model: "macos-say|sine-fallback",
        text: input.text,
      }),
      nowIso(),
    ]
  );

  return {
    assetId,
    objectKey: stored.objectKey,
    durationMs,
    provider: "seed",
  };
}
