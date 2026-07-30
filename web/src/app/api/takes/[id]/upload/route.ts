import { NextResponse } from "next/server";
import { uploadSegment } from "@/lib/performance/service";
import { migrate } from "@/lib/db/migrate";
import { ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  ensureDataDirs();
  migrate();
  const { id: takeId } = await ctx.params;
  try {
    const form = await req.formData();
    const dialogueEventId = String(form.get("dialogueEventId") || "");
    const file = form.get("file");
    if (!dialogueEventId || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "dialogueEventId and file required" },
        { status: 400 }
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "audio/webm";
    const result = await uploadSegment({
      takeId,
      dialogueEventId,
      bytes: buf,
      mimeType,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
