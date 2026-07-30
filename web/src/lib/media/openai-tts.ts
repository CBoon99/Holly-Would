import fs from "fs";
import path from "path";
import os from "os";
import { id } from "../ids";
import { runFfmpeg, probeDurationMs, hasFfmpeg } from "./ffmpeg";

/**
 * OpenAI TTS — real speech without ElevenLabs free-tier cap.
 * Uses OPENAI_API_KEY already on Railway.
 */
export async function synthesizeOpenAiLine(
  text: string,
  outWav: string
): Promise<{ durationMs: number; model: string; voice: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const voice =
    process.env.OPENAI_TTS_VOICE?.trim() || "alloy";
  const model =
    process.env.OPENAI_TTS_MODEL?.trim() || "tts-1";

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI TTS failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const ab = await res.arrayBuffer();
  const tmpMp3 = path.join(os.tmpdir(), `${id("oai")}.mp3`);
  fs.writeFileSync(tmpMp3, Buffer.from(ab));

  fs.mkdirSync(path.dirname(outWav), { recursive: true });

  if (hasFfmpeg()) {
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
      outWav,
    ]);
  } else {
    // last resort: keep mp3 renamed (media play accepts mp3 too if mime set)
    fs.copyFileSync(tmpMp3, outWav.replace(/\.wav$/i, ".mp3"));
    throw new Error("ffmpeg required to normalize OpenAI mp3 → wav");
  }

  try {
    fs.unlinkSync(tmpMp3);
  } catch {
    /* ignore */
  }

  return {
    durationMs: probeDurationMs(outWav),
    model,
    voice,
  };
}

export function isOpenAiTtsConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
