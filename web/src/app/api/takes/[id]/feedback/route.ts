import { NextResponse } from "next/server";
import { one } from "@/lib/db/client";
import { generateTakeFeedback } from "@/lib/feedback/generate";
import { migrate } from "@/lib/db/migrate";
import { ensureDataDirs } from "@/lib/paths";
import { loadEnvFiles } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  loadEnvFiles();
  ensureDataDirs();
  migrate();
  const { id } = await ctx.params;
  const take = one<{ score_summary_json: string | null }>(
    `SELECT score_summary_json FROM takes WHERE id = ?`,
    [id]
  );
  if (!take) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (take.score_summary_json) {
    return NextResponse.json({ feedback: JSON.parse(take.score_summary_json) });
  }
  try {
    const feedback = await generateTakeFeedback(id);
    return NextResponse.json({ feedback });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Feedback failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
