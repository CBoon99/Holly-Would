import { NextResponse } from "next/server";
import { one } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";
import { ensureAppReady } from "@/lib/bootstrap";

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
  let buf: Buffer;
  try {
    const store = getStorage();
    const exists = await Promise.resolve(store.exists(asset.object_key));
    if (!exists) {
      return NextResponse.json({ error: "Missing file" }, { status: 404 });
    }
    buf = Buffer.from(await Promise.resolve(store.read(asset.object_key)));
  } catch {
    return NextResponse.json({ error: "Missing file" }, { status: 404 });
  }
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
