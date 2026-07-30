import { listPublishedScenes } from "@/lib/scene/manifest";
import { ensureAppReady, ensureMigrated } from "@/lib/bootstrap";
import { SceneCatalogue } from "@/components/SceneCatalogue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  ensureMigrated();
  try {
    await ensureAppReady();
  } catch {
    /* seed may already be running */
  }
  let scenes = listPublishedScenes();
  // One more attempt if empty (cold volume / race)
  if (scenes.length === 0) {
    try {
      await ensureAppReady({ force: false, liveTts: true });
      scenes = listPublishedScenes();
    } catch {
      /* client catalogue will recover */
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-stage-mint">
          Audio-first acting practice
        </p>
        <h1 className="font-display text-4xl leading-tight text-white md:text-5xl">
          Holly Would.
          <br />
          <span className="text-stage-mist">
            Choose a scene. Play a role. Hear the take.
          </span>
        </h1>
        <p className="max-w-2xl text-stage-mist">
          Professional scene practice with original, rights-safe dialogue — noir,
          western, romance, thriller, courtroom. Filter by craft, not by pirated
          scripts.
        </p>
        <p className="max-w-2xl text-xs text-stage-mist/70">
          Platform-original scenes inspired by classic Hollywood energy. Not
          licensed studio film dialogue.
        </p>
      </section>

      <SceneCatalogue scenes={scenes} />
    </div>
  );
}
