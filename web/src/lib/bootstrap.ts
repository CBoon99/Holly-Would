import { ensureDataDirs } from "./paths";
import { migrate } from "./db/migrate";
import { one } from "./db/client";

let bootstrapped = false;

/**
 * Ensure DB exists and catalogue is seeded (critical on Netlify /tmp).
 * In-process seed — no child process (works in serverless).
 */
export async function ensureAppReady(): Promise<void> {
  if (bootstrapped) return;
  ensureDataDirs();
  migrate();

  const count = one<{ n: number }>(
    `SELECT COUNT(*) as n FROM scenes WHERE publication_status = 'published'`
  );
  if ((count?.n ?? 0) > 0) {
    bootstrapped = true;
    return;
  }

  try {
    const { seedHollywoodCatalogue } = await import(
      "../scripts/seed-hollywood"
    );
    process.env.HOLLYWOOD_SEED_LIVE_TTS = "0";
    await seedHollywoodCatalogue({ forceOffline: true });
    console.log("ensureAppReady: seeded hollywood catalogue");
  } catch (e) {
    console.warn("ensureAppReady seed error", e);
  }

  bootstrapped = true;
}

/** Sync migrate for pages that cannot await */
export function ensureMigrated(): void {
  ensureDataDirs();
  migrate();
}
