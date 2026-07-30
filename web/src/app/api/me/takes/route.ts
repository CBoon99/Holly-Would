import { NextResponse } from "next/server";
import { listUserTakes } from "@/lib/performance/service";
import { getDevUser } from "@/lib/auth";
import { migrate } from "@/lib/db/migrate";
import { ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureDataDirs();
  migrate();
  const user = getDevUser();
  const takes = listUserTakes(user.id);
  return NextResponse.json({ takes });
}
