import { NextResponse } from "next/server";
import { listPublishedScenes } from "@/lib/scene/manifest";
import { ensureAppReady, ensureMigrated } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  ensureMigrated();
  let scenes = listPublishedScenes();
  if (scenes.length === 0) {
    await ensureAppReady();
    scenes = listPublishedScenes();
  }
  return NextResponse.json({ scenes });
}
