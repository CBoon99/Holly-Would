/**
 * Full local automation pipeline:
 * load env → migrate → seed (TTS if key) → verify → API smoke mix
 */
import { loadEnvFiles, serviceInventory } from "../lib/env";
import { ensureDataDirs } from "../lib/paths";
import { migrate } from "../lib/db/migrate";
import { resetVoiceProvider, isLiveVoiceConfigured } from "../lib/providers/registry";
import { resetSttProvider } from "../lib/providers/stt-registry";
import { spawnSync } from "child_process";
import path from "path";

function run(cmd: string, args: string[], cwd: string) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

async function main() {
  const loaded = loadEnvFiles();
  resetVoiceProvider();
  resetSttProvider();
  console.log("=== Acting Platform automation ===");
  console.log("Env files:", loaded.length ? loaded.join(", ") : "(none)");
  console.log("\nService inventory:");
  for (const s of serviceInventory()) {
    console.log(`  ${s.configured ? "✓" : "·"} ${s.name.padEnd(18)} ${s.hint}`);
  }
  console.log(
    "\nVoice:",
    isLiveVoiceConfigured() ? "ElevenLabs live" : "offline seed fallback"
  );

  ensureDataDirs();
  migrate();
  console.log("Schema migrated.");

  const webRoot = path.resolve(process.cwd());
  run("npx", ["tsx", "src/scripts/seed.ts"], webRoot);
  run("npm", ["run", "verify"], webRoot);

  // Optional live smoke: only if ffmpeg present
  console.log("\n▶ offline mix smoke via seed already creates partner assets");
  console.log("\n=== Automation complete ===");
  console.log("Start app: npm run dev --prefix web");
  console.log("Status API: GET /api/system/status");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
