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

/** Generate a short spoken partner line via macOS `say` + ffmpeg, or sine fallback. */
export async function synthesizeSeedLine(
  text: string,
  outWav: string
): Promise<{ durationMs: number }> {
  fs.mkdirSync(path.dirname(outWav), { recursive: true });
  const aiff = outWav.replace(/\.wav$/i, ".aiff");

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
    // Fallback: 1.2s tone (when `say` unavailable)
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:duration=1.2",
      "-ar",
      "48000",
      "-ac",
      "1",
      outWav,
    ]);
  }

  return { durationMs: probeDurationMs(outWav) };
}

export type MixTrack = {
  path: string;
  startMs: number;
  gainDb?: number;
};

/**
 * Mix multiple mono/stereo stems onto a timeline → AAC.
 * Manifest-reproducible; masters untouched.
 */
export async function mixTimeline(
  tracks: MixTrack[],
  outputPath: string,
  totalDurationMs: number
): Promise<void> {
  assertFfmpeg();
  if (tracks.length === 0) throw new Error("No tracks to mix");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

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
    outputPath,
  ];

  await runFfmpeg(args);
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
