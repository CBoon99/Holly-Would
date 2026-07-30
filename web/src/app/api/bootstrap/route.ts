import { NextResponse } from "next/server";
import {
  ensureAppReady,
  wipeCatalogueForReseed,
} from "@/lib/bootstrap";
import { one } from "@/lib/db/client";
import { loadEnvFiles } from "@/lib/env";
import { dataDir } from "@/lib/paths";
import { isLiveVoiceConfigured } from "@/lib/providers/voice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Live ElevenLabs reseed of 21 scenes can take several minutes */
export const maxDuration = 800;

/**
 * GET/POST /api/bootstrap
 *   ?force=1&live=1  — wipe hum catalogue and reseed with ElevenLabs voices
 *   ?live=1          — seed with live TTS if empty / still hum
 */
async function handle(req: Request) {
  loadEnvFiles();
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const live =
    url.searchParams.get("live") === "1" ||
    process.env.HOLLYWOOD_SEED_LIVE_TTS === "1";

  // Never wipe-before-seed on a flaky host: that left the catalogue empty.
  // Force reseed overwrites per-scene (seedOne deletes by slug) without blanking the library first.
  if (force && url.searchParams.get("wipe") === "1") {
    wipeCatalogueForReseed();
  }

  const result = await ensureAppReady({
    force,
    liveTts: live || force,
  });

  const humLeft = one<{ n: number }>(
    `SELECT COUNT(*) as n FROM media_assets
     WHERE asset_type = 'dialogue'
       AND metadata_json LIKE '%"provider":"seed"%'`
  );
  const liveLines = one<{ n: number }>(
    `SELECT COUNT(*) as n FROM media_assets
     WHERE asset_type = 'dialogue'
       AND metadata_json LIKE '%elevenlabs%'`
  );

  return NextResponse.json({
    ok: true,
    publishedScenes: result.scenes,
    seeded: result.seeded,
    liveTts: result.liveTts,
    elevenLabsConfigured: isLiveVoiceConfigured(),
    dialogueHumAssets: humLeft?.n ?? 0,
    dialogueLiveAssets: liveLines?.n ?? 0,
    dataDir: dataDir(),
    hint:
      (humLeft?.n ?? 0) > 0
        ? "Still hearing hum? Call /api/bootstrap?force=1&live=1 once (takes a few minutes)."
        : "Partner lines should be real TTS audio.",
  });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
