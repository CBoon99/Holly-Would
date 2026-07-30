import { NextResponse } from "next/server";
import { ensureAppReady } from "@/lib/bootstrap";
import { one } from "@/lib/db/client";
import { loadEnvFiles } from "@/lib/env";
import { dataDir } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Force seed/migrate — hit after Netlify deploy when /tmp is empty */
export async function POST() {
  loadEnvFiles();
  await ensureAppReady();
  const n = one<{ n: number }>(
    `SELECT COUNT(*) as n FROM scenes WHERE publication_status = 'published'`
  );
  return NextResponse.json({
    ok: true,
    publishedScenes: n?.n ?? 0,
    dataDir: dataDir(),
    netlify: Boolean(process.env.NETLIFY),
  });
}

export async function GET() {
  return POST();
}
