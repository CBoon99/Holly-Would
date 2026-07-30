import { NextResponse } from "next/server";
import { getSession } from "@/lib/performance/service";
import { migrate } from "@/lib/db/migrate";
import { ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  ensureDataDirs();
  migrate();
  const { id } = await ctx.params;
  const data = getSession(id);
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
