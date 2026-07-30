import fs from "fs";
import path from "path";
import { projectRoot } from "../lib/paths";
import { resetVoiceProvider, getVoiceProvider, isLiveVoiceConfigured } from "../lib/providers/registry";

function loadEnvLocal() {
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(projectRoot(), "apps/web/.env.local"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
    console.log("Loaded", p);
  }
  resetVoiceProvider();
}

async function main() {
  loadEnvLocal();
  if (!isLiveVoiceConfigured()) {
    console.error("ELEVENLABS_API_KEY not set. Add it to apps/web/.env.local");
    process.exit(1);
  }
  const p = getVoiceProvider();
  console.log("Provider:", p.name);
  const pinned = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (pinned) {
    console.log("Pinned ELEVENLABS_VOICE_ID:", pinned);
    console.log("Pinned name:", process.env.ELEVENLABS_VOICE_NAME || "(none)");
  }

  // Restricted API keys often lack voices_read — TTS can still work with a pinned ID.
  try {
    const voices = await p.listVoices();
    console.log(`Voices available: ${voices.length}`);
    for (const v of voices.slice(0, 15)) {
      console.log(`  - ${v.name}  (${v.providerVoiceId})`);
    }
    if (voices.length > 15) console.log(`  … +${voices.length - 15} more`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("listVoices failed (common on restricted keys):", msg.slice(0, 200));
    if (!pinned) {
      console.error(
        "Set ELEVENLABS_VOICE_ID to a known voice (e.g. Adam pNInz6obpgDQGcFmaJgB) then re-run."
      );
      process.exit(1);
    }
  }

  // Live synthesize smoke test
  const voiceId = pinned || "pNInz6obpgDQGcFmaJgB";
  console.log("Synthesize smoke test with voice", voiceId, "…");
  const result = await p.synthesize({
    text: "Smoke test. Partner line ready.",
    voiceProfileId: "check",
    providerVoiceId: voiceId,
  });
  console.log(
    "OK synthesize:",
    result.mimeType,
    result.assetBytes.length,
    "bytes",
    "chars",
    result.characterCount
  );
  console.log("Ready: npm run db:seed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
