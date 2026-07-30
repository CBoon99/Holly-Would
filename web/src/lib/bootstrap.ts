import { ensureDataDirs } from "./paths";
import { migrate } from "./db/migrate";
import { one } from "./db/client";
import { stableId } from "./ids";

let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;

/** Canonical scene from catalogue — proves stable-ID seed is present */
const CANONICAL_VERSION_ID = stableId("sv", "after-the-fire", "v1");

/**
 * Ensure DB exists and catalogue is seeded (critical on Netlify /tmp).
 * In-process seed — no child process (works in serverless).
 * Safe to call on every request; concurrent callers share one seed promise.
 */
export async function ensureAppReady(): Promise<void> {
  if (bootstrapped) return;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    ensureDataDirs();
    migrate();

    // Require stable IDs (old random-ID seeds break cross-instance clicks)
    const hasStable = one<{ id: string }>(
      `SELECT id FROM scene_versions WHERE id = ?`,
      [CANONICAL_VERSION_ID]
    );
    if (hasStable) {
      bootstrapped = true;
      return;
    }

    try {
      const { seedHollywoodCatalogue } = await import(
        "../scripts/seed-hollywood"
      );
      process.env.HOLLYWOOD_SEED_LIVE_TTS = "0";
      await seedHollywoodCatalogue({ forceOffline: true });
      console.log("ensureAppReady: seeded hollywood catalogue (stable ids)");
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
}

/** Sync migrate for pages that cannot await */
export function ensureMigrated(): void {
  ensureDataDirs();
  migrate();
}
