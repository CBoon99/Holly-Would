import { NextResponse } from "next/server";
import { one } from "@/lib/db/client";
import { storage } from "@/lib/storage/local";
import { ensureAppReady } from "@/lib/bootstrap";
import fs from "fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await ensureAppReady();
  const { id } = await ctx.params;
  let asset = one<{
    object_key: string;
    mime_type: string;
    status: string;
  }>(`SELECT object_key, mime_type, status FROM media_assets WHERE id = ?`, [id]);
  if (!asset || asset.status !== "ready") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const full = storage.resolve(asset.object_key);
  if (!fs.existsSync(full)) {
    return NextResponse.json({ error: "Missing file" }, { status: 404 });
  }
  const buf = fs.readFileSync(full);
  // Browsers need a real audio/* type to play takes
  let mime = asset.mime_type || "application/octet-stream";
  const key = asset.object_key.toLowerCase();
  if (key.endsWith(".m4a") || key.endsWith(".mp4") || mime === "audio/mp4") {
    mime = "audio/mp4";
  } else if (key.endsWith(".mp3") || mime === "audio/mpeg") {
    mime = "audio/mpeg";
  } else if (key.endsWith(".wav")) {
    mime = "audio/wav";
  } else if (key.endsWith(".webm")) {
    mime = "audio/webm";
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buf.length),
      "Cache-Control": "private, no-cache",
      "Accept-Ranges": "bytes",
    },
  });
}
