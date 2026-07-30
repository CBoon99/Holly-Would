import { NextResponse } from "next/server";
import { z } from "zod";
import { createPerformanceSession } from "@/lib/performance/service";
import { getDevUser } from "@/lib/auth";
import { ensureAppReady } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sceneVersionId: z.string().min(1),
  selectedCharacterId: z.string().min(1),
});

export async function POST(req: Request) {
  // Seed catalogue on this instance if /tmp is empty (Netlify multi-instance)
  await ensureAppReady();
  try {
    const json = await req.json();
    const body = bodySchema.parse(json);
    const user = getDevUser();
    const result = createPerformanceSession({
      userId: user.id,
      sceneVersionId: body.sceneVersionId,
      selectedCharacterId: body.selectedCharacterId,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
