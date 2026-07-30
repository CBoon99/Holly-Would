import { NextResponse } from "next/server";
import { deleteTake } from "@/lib/performance/service";
import { getDevUser } from "@/lib/auth";
import { migrate } from "@/lib/db/migrate";
import { ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  ensureDataDirs();
  migrate();
  const { id } = await ctx.params;
  try {
    const user = getDevUser();
    const result = deleteTake(id, user.id);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
