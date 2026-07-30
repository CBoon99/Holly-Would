import { NextResponse } from "next/server";
import { getVoiceProvider, isLiveVoiceConfigured } from "@/lib/providers/registry";
import { listVoiceProfiles } from "@/lib/providers/voice-profiles";
import { migrate } from "@/lib/db/migrate";
import { ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

/** List internal voice profiles + whether live provider is configured. Never returns raw API key. */
export async function GET() {
  ensureDataDirs();
  migrate();
  const live = isLiveVoiceConfigured();
  let remoteCount = 0;
  if (live) {
    try {
      const voices = await getVoiceProvider().listVoices();
      remoteCount = voices.length;
    } catch (e) {
      return NextResponse.json(
        {
          live: true,
          error: e instanceof Error ? e.message : "listVoices failed",
          profiles: listVoiceProfiles(),
        },
        { status: 502 }
      );
    }
  }
  return NextResponse.json({
    live,
    provider: live ? "elevenlabs" : "stub",
    remoteVoiceCount: remoteCount,
    profiles: listVoiceProfiles(),
  });
}
