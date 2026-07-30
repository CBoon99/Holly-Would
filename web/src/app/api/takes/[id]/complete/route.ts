import { NextResponse } from "next/server";
import { completeTakeAndMix } from "@/lib/performance/service";
import { migrate } from "@/lib/db/migrate";
import { ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  ensureDataDirs();
  migrate();
  const { id: takeId } = await ctx.params;
  try {
    const result = await completeTakeAndMix(takeId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Mix failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
