import { NextResponse } from "next/server";
import { loadEnvFiles, serviceInventory } from "@/lib/env";
import { isLiveVoiceConfigured } from "@/lib/providers/registry";
import { isSttConfigured } from "@/lib/providers/stt-registry";

export const dynamic = "force-dynamic";

/** Non-secret automation readiness report */
export async function GET() {
  loadEnvFiles();
  return NextResponse.json({
    voiceLive: isLiveVoiceConfigured(),
    sttConfigured: isSttConfigured(),
    services: serviceInventory(),
    automation: {
      seed: "npm run db:seed --prefix apps/web",
      verify: "npm run verify --prefix apps/web",
      full: "npm run automate --prefix apps/web",
    },
  });
}
