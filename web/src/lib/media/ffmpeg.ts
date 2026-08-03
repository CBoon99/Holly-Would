import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";

export function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

export function ffprobeBin(): string {
  return process.env.FFPROBE_PATH || "ffprobe";
}

export function assertFfmpeg(): void {
  try {
    execFileSync(ffmpegBin(), ["-version"], { stdio: "pipe" });
  } catch {
    throw new Error("ffmpeg not found on PATH. Install ffmpeg or set FFMPEG_PATH.");
  }
}

export function probeDurationMs(filePath: string): number {
  const out = execFileSync(
    ffprobeBin(),
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { encoding: "utf8" }
  );
  const sec = parseFloat(out.trim());
  if (Number.isNaN(sec)) return 0;
  return Math.round(sec * 1000);
}

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => {
      err += d.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${err.slice(-800)}`));
    });
  });
}

/** Write a minimal mono 16-bit PCM WAV without ffmpeg (serverless-safe). */
export function writeSilentWav(
  outWav: string,
  durationMs: number,
  sampleRate = 48000
): number {
  const samples = Math.max(1, Math.floor((durationMs / 1000) * sampleRate));
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  // soft click tone so audio element has signal
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 10) * Math.min(1, (durationMs / 1000 - t) * 10);
    const sample = Math.sin(2 * Math.PI * 220 * t) * 0.15 * env;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(sample * 32767))), 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(outWav), { recursive: true });
  fs.writeFileSync(outWav, buf);
  return durationMs;
}

export function hasFfmpeg(): boolean {
  try {
    execFileSync(ffmpegBin(), ["-version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Generate a short spoken partner line via macOS `say` + ffmpeg, or pure WAV fallback. */
export async function synthesizeSeedLine(
  text: string,
  outWav: string
): Promise<{ durationMs: number }> {
  fs.mkdirSync(path.dirname(outWav), { recursive: true });
  const aiff = outWav.replace(/\.wav$/i, ".aiff");
  // ~80ms per word, min 1.2s
  const approxMs = Math.max(1200, Math.round(text.split(/\s+/).length * 320));

  if (!hasFfmpeg()) {
    writeSilentWav(outWav, approxMs);
    return { durationMs: approxMs };
  }

  try {
    execFileSync("say", ["-v", "Daniel", "-o", aiff, text], { stdio: "pipe" });
    await runFfmpeg([
      "-y",
      "-i",
      aiff,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      outWav,
    ]);
    try {
      fs.unlinkSync(aiff);
    } catch {
      /* ignore */
    }
  } catch {
    try {
      await runFfmpeg([
        "-y",
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=220:duration=${(approxMs / 1000).toFixed(2)}`,
        "-ar",
        "48000",
        "-ac",
        "1",
        outWav,
      ]);
    } catch {
      writeSilentWav(outWav, approxMs);
      return { durationMs: approxMs };
    }
  }

  try {
    return { durationMs: probeDurationMs(outWav) };
  } catch {
    return { durationMs: approxMs };
  }
}

export type MixTrack = {
  path: string;
  startMs: number;
  gainDb?: number;
};

/**
 * Mix multiple mono/stereo stems onto a timeline.
 * Prefer ffmpeg → AAC (.m4a). On serverless (Netlify) fall back to pure-JS WAV mix.
 */
export async function mixTimeline(
  tracks: MixTrack[],
  outputPath: string,
  totalDurationMs: number
): Promise<{ mimeType: string; engine: string }> {
  if (tracks.length === 0) throw new Error("No tracks to mix");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (hasFfmpeg()) {
    const inputs: string[] = [];
    const filters: string[] = [];
    tracks.forEach((t, i) => {
      inputs.push("-i", t.path);
      const delay = Math.max(0, t.startMs);
      const gain = t.gainDb ?? 0;
      filters.push(
        `[${i}:a]aformat=sample_rates=48000:channel_layouts=mono,volume=${dbToLinear(gain)},adelay=${delay}|${delay}[a${i}]`
      );
    });

    const mixInputs = tracks.map((_, i) => `[a${i}]`).join("");
    filters.push(
      `${mixInputs}amix=inputs=${tracks.length}:duration=longest:dropout_transition=0,alimiter=limit=0.95[out]`
    );

    const durationSec = Math.max(totalDurationMs / 1000, 1);
    // Prefer .m4a when ffmpeg is present
    const out =
      outputPath.endsWith(".m4a") || outputPath.endsWith(".mp4")
        ? outputPath
        : outputPath.replace(/\.[^.]+$/, "") + ".m4a";
    const args = [
      "-y",
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-t",
      String(durationSec),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      out,
    ];
    await runFfmpeg(args);
    if (out !== outputPath && fs.existsSync(out)) {
      fs.copyFileSync(out, outputPath);
    }
    return { mimeType: "audio/mp4", engine: "ffmpeg" };
  }

  // Netlify / serverless: pure JS mix (WAV out)
  const wavOut = outputPath.replace(/\.(m4a|mp4|aac)$/i, ".wav");
  await mixTimelinePureWav(tracks, wavOut, totalDurationMs);
  if (wavOut !== outputPath) {
    fs.copyFileSync(wavOut, outputPath.endsWith(".wav") ? outputPath : wavOut);
    // Caller may expect .m4a path — write beside it and also as outputPath if .wav
    if (!outputPath.endsWith(".wav")) {
      // Keep wav at wavOut; also copy bytes so putFile gets something playable
      fs.copyFileSync(wavOut, outputPath);
    }
  }
  return { mimeType: "audio/wav", engine: "pure-js" };
}

/** Read PCM samples from a 16-bit mono/stereo WAV (no ffmpeg). */
function readWavPcm(filePath: string): {
  sampleRate: number;
  channels: number;
  samples: Int16Array;
} | null {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
    const channels = buf.readUInt16LE(22);
    const sampleRate = buf.readUInt32LE(24);
    const bits = buf.readUInt16LE(34);
    if (bits !== 16) return null;
    // find data chunk
    let offset = 12;
    let dataOffset = 44;
    let dataSize = buf.length - 44;
    while (offset + 8 <= buf.length) {
      const id = buf.toString("ascii", offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      if (id === "data") {
        dataOffset = offset + 8;
        dataSize = size;
        break;
      }
      offset += 8 + size;
    }
    const frameCount = Math.floor(dataSize / (2 * channels));
    const mono = new Int16Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      if (channels === 1) {
        mono[i] = buf.readInt16LE(dataOffset + i * 2);
      } else {
        const l = buf.readInt16LE(dataOffset + i * 4);
        const r = buf.readInt16LE(dataOffset + i * 4 + 2);
        mono[i] = Math.max(-32768, Math.min(32767, Math.floor((l + r) / 2)));
      }
    }
    return { sampleRate, channels: 1, samples: mono };
  } catch {
    return null;
  }
}

function writeWavPcm(
  outPath: string,
  samples: Int16Array,
  sampleRate = 48000
): void {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
}

/**
 * Serverless-safe timeline mix: only WAV stems are mixed; non-WAV (webm/mp4)
 * user takes are skipped in the mix but scene still completes.
 */
async function mixTimelinePureWav(
  tracks: MixTrack[],
  outputPath: string,
  totalDurationMs: number
): Promise<void> {
  const sampleRate = 48000;
  const totalSamples = Math.max(
    1,
    Math.floor((Math.max(totalDurationMs, 1000) / 1000) * sampleRate)
  );
  const mix = new Float32Array(totalSamples);
  let any = false;

  for (const t of tracks) {
    const wav = readWavPcm(t.path);
    if (!wav) {
      // Non-WAV (e.g. iPhone webm/mp4) — cannot decode without ffmpeg; skip stem
      continue;
    }
    any = true;
    const gain = dbToLinear(t.gainDb ?? 0);
    // Resample if needed (nearest neighbour — good enough for review mix)
    const start = Math.floor((Math.max(0, t.startMs) / 1000) * sampleRate);
    for (let i = 0; i < wav.samples.length; i++) {
      const srcIdx =
        wav.sampleRate === sampleRate
          ? i
          : Math.floor((i * wav.sampleRate) / sampleRate);
      if (srcIdx >= wav.samples.length) break;
      const dest =
        wav.sampleRate === sampleRate
          ? start + i
          : start + Math.floor((i * sampleRate) / wav.sampleRate);
      if (dest < 0 || dest >= totalSamples) continue;
      mix[dest] += (wav.samples[srcIdx] / 32768) * gain;
    }
  }

  if (!any) {
    // Last resort: copy first track file as-is if it exists (may be webm)
    if (tracks[0] && fs.existsSync(tracks[0].path)) {
      fs.copyFileSync(tracks[0].path, outputPath);
      return;
    }
    writeSilentWav(outputPath, Math.max(totalDurationMs, 1500));
    return;
  }

  const out = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const s = Math.max(-1, Math.min(1, mix[i]));
    out[i] = Math.floor(s * 32767);
  }
  writeWavPcm(outputPath, out, sampleRate);
}

/** Duration probe that works without ffprobe for WAV files. */
export function probeDurationMsSafe(filePath: string): number {
  try {
    if (hasFfmpeg()) return probeDurationMs(filePath);
  } catch {
    /* fall through */
  }
  const wav = readWavPcm(filePath);
  if (wav && wav.sampleRate > 0) {
    return Math.round((wav.samples.length / wav.sampleRate) * 1000);
  }
  try {
    const st = fs.statSync(filePath);
    // crude estimate for compressed audio
    return Math.max(1000, Math.round(st.size / 16));
  } catch {
    return 0;
  }
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
