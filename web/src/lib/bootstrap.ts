import { ensureDataDirs } from "./paths";
import { migrate } from "./db/migrate";
import { one, getSqlite } from "./db/client";
import { stableId } from "./ids";
import { resetVoiceProvider } from "./providers/registry";
import { isLiveVoiceConfigured } from "./providers/voice";

let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;

/** Canonical scene from catalogue — proves stable-ID seed is present */
const CANONICAL_VERSION_ID = stableId("sv", "after-the-fire", "v1");

function catalogueLooksSeeded(): boolean {
  const hasStable = one<{ id: string }>(
    `SELECT id FROM scene_versions WHERE id = ?`,
    [CANONICAL_VERSION_ID]
  );
  const hasLatestWave = one<{ id: string }>(
    `SELECT id FROM scenes WHERE slug = 'bright-road'`
  );
  const count = one<{ n: number }>(
    `SELECT COUNT(*) as n FROM scenes WHERE publication_status = 'published'`
  );
  return Boolean(hasStable && hasLatestWave && (count?.n ?? 0) >= 18);
}

/** Offline seed marks provider "seed" — live TTS uses elevenlabs */
function partnerAudioIsHum(): boolean {
  const row = one<{ n: number }>(
    `SELECT COUNT(*) as n FROM media_assets
     WHERE asset_type = 'dialogue'
       AND (
         metadata_json LIKE '%"provider":"seed"%'
         OR metadata_json LIKE '%macos-say%'
         OR metadata_json LIKE '%sine-fallback%'
       )`
  );
  return (row?.n ?? 0) > 0;
}

/**
 * Ensure DB exists and catalogue is seeded.
 * Uses live ElevenLabs when key is present and HOLLYWOOD_SEED_LIVE_TTS is not "0".
 */
export async function ensureAppReady(opts?: {
  force?: boolean;
  liveTts?: boolean;
}): Promise<{ seeded: boolean; liveTts: boolean; scenes: number }> {
  if (bootstrapped && !opts?.force) {
    const n = one<{ n: number }>(
      `SELECT COUNT(*) as n FROM scenes WHERE publication_status = 'published'`
    );
    return {
      seeded: false,
      liveTts: isLiveVoiceConfigured(),
      scenes: n?.n ?? 0,
    };
  }
  if (bootstrapPromise && !opts?.force) {
    await bootstrapPromise;
    const n = one<{ n: number }>(
      `SELECT COUNT(*) as n FROM scenes WHERE publication_status = 'published'`
    );
    return {
      seeded: false,
      liveTts: isLiveVoiceConfigured(),
      scenes: n?.n ?? 0,
    };
  }

  const liveTts =
    opts?.liveTts === true ||
    (opts?.liveTts !== false &&
      process.env.HOLLYWOOD_SEED_LIVE_TTS !== "0" &&
      isLiveVoiceConfigured());

  bootstrapPromise = (async () => {
    ensureDataDirs();
    migrate();

    const needsSeed =
      opts?.force ||
      !catalogueLooksSeeded() ||
      (liveTts && partnerAudioIsHum());

    if (!needsSeed) {
      bootstrapped = true;
      return;
    }

    try {
      const { seedHollywoodCatalogue } = await import(
        "../scripts/seed-hollywood"
      );
      if (liveTts) {
        process.env.HOLLYWOOD_SEED_LIVE_TTS = "1";
        // Prefer real speech: OpenAI when EL is out of quota (never silent hum)
        process.env.PARTNER_AUDIO_LIVE_ONLY = "0";
      } else {
        process.env.HOLLYWOOD_SEED_LIVE_TTS = "0";
      }
      resetVoiceProvider();
      // forceOffline only means "skip ElevenLabs first hop" — OpenAI/espeak still run
      await seedHollywoodCatalogue({ forceOffline: !liveTts });
      console.log(
        `ensureAppReady: seeded catalogue (liveTts=${liveTts})`
      );
    } catch (e) {
      console.warn("ensureAppReady seed error", e);
    }

    bootstrapped = true;
  })();

  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }

  const n = one<{ n: number }>(
    `SELECT COUNT(*) as n FROM scenes WHERE publication_status = 'published'`
  );
  return {
    seeded: true,
    liveTts,
    scenes: n?.n ?? 0,
  };
}

/** Wipe catalogue + dialogue media so a live reseed can replace hums. */
export function wipeCatalogueForReseed(): void {
  const db = getSqlite();
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM take_segments;
    DELETE FROM takes;
    DELETE FROM performance_sessions;
    DELETE FROM dialogue_events;
    DELETE FROM characters;
    DELETE FROM scene_versions;
    DELETE FROM rights_assets;
    DELETE FROM scenes;
    DELETE FROM editions;
    DELETE FROM films;
    DELETE FROM media_assets;
    DELETE FROM generation_records;
    DELETE FROM voice_profiles;
    PRAGMA foreign_keys = ON;
  `);
  // Remove partner wav files from volume so putFile doesn't hit immutable masters
  try {
    const { storageRoot } = require("./paths") as typeof import("./paths");
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const masters = path.join(storageRoot(), "masters", "scenes");
    if (fs.existsSync(masters)) {
      fs.rmSync(masters, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn("wipe media files", e);
  }
  bootstrapped = false;
}

/** Sync migrate for pages that cannot await */
export function ensureMigrated(): void {
  ensureDataDirs();
  migrate();
}
