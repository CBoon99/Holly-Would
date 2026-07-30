import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { getVoiceProvider, isLiveVoiceConfigured } from "../providers/registry";
import {
  getVoiceProfile,
  recordGeneration,
  upsertVoiceProfile,
} from "../providers/voice-profiles";
import { synthesizeSeedLine, runFfmpeg, probeDurationMs, hasFfmpeg } from "./ffmpeg";
import { isOpenAiTtsConfigured, synthesizeOpenAiLine } from "./openai-tts";
import { getStorage } from "../storage";
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
 * Partner line audio chain (never hum if we can help it):
 * 1. ElevenLabs (if key + quota)
 * 2. OpenAI TTS (OPENAI_API_KEY — already on Railway)
 * 3. espeak-ng (free offline speech in Docker)
 * 4. offline seed only if ALLOW_SINE_PARTNER=1
 */
export async function generatePartnerLineAudio(input: {
  text: string;
  sceneId: string;
  sequence: number;
  voiceProfileId?: string;
  ownerDialogueEventId: string;
}): Promise<PartnerLineResult> {
  const errors: string[] = [];

  if (isLiveVoiceConfigured()) {
    try {
      return await generateViaElevenLabs(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`elevenlabs: ${msg.slice(0, 120)}`);
      console.warn(`ElevenLabs line ${input.sequence} failed:`, msg.slice(0, 160));
    }
  }

  if (isOpenAiTtsConfigured()) {
    try {
      return await generateViaOpenAi(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`openai: ${msg.slice(0, 120)}`);
      console.warn(`OpenAI TTS line ${input.sequence} failed:`, msg.slice(0, 160));
    }
  }

  if (hasEspeak()) {
    try {
      return await generateViaEspeak(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`espeak: ${msg.slice(0, 120)}`);
      console.warn(`espeak line ${input.sequence} failed:`, msg.slice(0, 160));
    }
  }

  // Explicit opt-in only — default is NO 220Hz hum
  if (process.env.ALLOW_SINE_PARTNER === "1") {
    return generateViaOfflineSeed(input);
  }

  throw new Error(
    `No partner speech available for line ${input.sequence}. Tried: ${errors.join(" | ") || "no providers"}. Set OPENAI_API_KEY or install espeak-ng.`
  );
}

function hasEspeak(): boolean {
  try {
    execFileSync("espeak-ng", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    try {
      execFileSync("espeak", ["--version"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }
}

async function storePartnerWav(
  input: {
    sceneId: string;
    sequence: number;
    ownerDialogueEventId: string;
  },
  tmpWav: string,
  meta: Record<string, unknown>
): Promise<PartnerLineResult> {
  const durationMs = probeDurationMs(tmpWav);
  const assetId = stableId("asset", input.ownerDialogueEventId, "partner");
  const objectKey = getStorage().masterKey([
    "scenes",
    input.sceneId,
    "partner",
    `line_${input.sequence}.wav`,
  ]);
  const stored = await getStorage().putFile(objectKey, tmpWav, {
    overwrite: true,
  });
  try {
    fs.unlinkSync(tmpWav);
  } catch {
    /* ignore */
  }

  run(`DELETE FROM media_assets WHERE id = ? OR object_key = ?`, [
    assetId,
    stored.objectKey,
  ]);
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
      JSON.stringify(meta),
      nowIso(),
    ]
  );

  return {
    assetId,
    objectKey: stored.objectKey,
    durationMs,
    provider: String(meta.provider || "unknown"),
  };
}

async function generateViaOpenAi(input: {
  text: string;
  sceneId: string;
  sequence: number;
  ownerDialogueEventId: string;
}): Promise<PartnerLineResult> {
  const tmpWav = path.join(os.tmpdir(), `${id("oai")}.wav`);
  const { durationMs, model, voice } = await synthesizeOpenAiLine(
    input.text,
    tmpWav
  );
  const profileId = upsertVoiceProfile({
    provider: "openai",
    providerVoiceId: voice,
    displayName: `OpenAI ${voice}`,
    description: "Partner TTS via OpenAI",
    language: "en",
    styleTags: ["partner", "openai"],
  });
  const result = await storePartnerWav(input, tmpWav, {
    provider: "openai",
    model,
    voice,
    text: input.text,
    character_count: input.text.length,
  });
  const generationId = recordGeneration({
    provider: "openai",
    model,
    providerRequestId: id("oai-req"),
    voiceProfileId: profileId,
    inputText: input.text,
    outputAssetId: result.assetId,
    characterCount: input.text.length,
    costUsdEstimate: (input.text.length / 1000) * 0.015,
    approvalState: "approved_seed",
  });
  return { ...result, generationId, durationMs };
}

async function generateViaEspeak(input: {
  text: string;
  sceneId: string;
  sequence: number;
  ownerDialogueEventId: string;
}): Promise<PartnerLineResult> {
  const bin = hasEspeakBin("espeak-ng") ? "espeak-ng" : "espeak";
  const tmpWav = path.join(os.tmpdir(), `${id("esp")}.wav`);
  const raw = path.join(os.tmpdir(), `${id("esp")}.raw.wav`);
  execFileSync(bin, ["-v", "en", "-s", "140", "-w", raw, input.text], {
    stdio: "pipe",
  });
  if (hasFfmpeg()) {
    await runFfmpeg([
      "-y",
      "-i",
      raw,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      tmpWav,
    ]);
    try {
      fs.unlinkSync(raw);
    } catch {
      /* ignore */
    }
  } else {
    fs.renameSync(raw, tmpWav);
  }
  return storePartnerWav(input, tmpWav, {
    provider: "espeak",
    model: bin,
    text: input.text,
  });
}

function hasEspeakBin(name: string): boolean {
  try {
    execFileSync(name, ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
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
    try {
      const voices = await provider.listVoices();
      if (!voices.length) throw new Error("no voices");
      const pick =
        voices.find((v) =>
          /adam|daniel|josh|sam|antoni|bill|george/i.test(v.name)
        ) || voices[0];
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
      providerVoiceId = "pNInz6obpgDQGcFmaJgB";
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
  try {
    fs.unlinkSync(tmpMp3);
  } catch {
    /* ignore */
  }

  const stored = await storePartnerWav(input, tmpWav, {
    provider: result.provider,
    model: result.model,
    provider_request_id: result.providerRequestId,
    provider_voice_id: result.providerVoiceId,
    voice_profile_id: profileId,
    text: input.text,
    character_count: result.characterCount,
    cost_usd_estimate: result.costUsdEstimate,
  });

  const generationId = recordGeneration({
    provider: result.provider,
    model: result.model,
    providerRequestId: result.providerRequestId,
    voiceProfileId: profileId!,
    inputText: input.text,
    outputAssetId: stored.assetId,
    characterCount: result.characterCount,
    costUsdEstimate: result.costUsdEstimate,
    approvalState: "approved_seed",
  });

  return { ...stored, generationId };
}

async function generateViaOfflineSeed(input: {
  text: string;
  sceneId: string;
  sequence: number;
  ownerDialogueEventId: string;
}): Promise<PartnerLineResult> {
  const tmpWav = path.join(
    os.tmpdir(),
    `seed_${input.sequence}_${id("off")}.wav`
  );
  await synthesizeSeedLine(input.text, tmpWav);
  return storePartnerWav(input, tmpWav, {
    provider: "seed",
    model: "macos-say|sine-fallback",
    text: input.text,
  });
}
