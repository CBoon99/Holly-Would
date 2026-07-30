import { NextResponse } from "next/server";
import { listPublishedScenes } from "@/lib/scene/manifest";
import { migrate } from "@/lib/db/migrate";
import { ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureDataDirs();
  migrate();
  const scenes = listPublishedScenes();
  return NextResponse.json({ scenes });
}
