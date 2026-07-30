import { listPublishedScenes } from "@/lib/scene/manifest";
import { migrate } from "@/lib/db/migrate";
import { ensureDataDirs } from "@/lib/paths";
import { SceneCatalogue } from "@/components/SceneCatalogue";

export const dynamic = "force-dynamic";

export default function HomePage() {
  ensureDataDirs();
  migrate();
  const scenes = listPublishedScenes();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-stage-mint">
          Hollywood practice · audio first
        </p>
        <h1 className="font-display text-4xl leading-tight text-white md:text-5xl">
          Act like the movies.
          <br />
          <span className="text-stage-mist">Filter. Pick a role. Listen back.</span>
        </h1>
        <p className="max-w-2xl text-stage-mist">
          Ten-plus original scenes with classic Hollywood energy — noir cafés, western
          streets, southern estates, rom-coms, courtrooms. Filter by difficulty, tone,
          rudeness, funny, or character style (cowboy lead, southern fire, and more).
        </p>
        <p className="max-w-2xl text-xs text-stage-mist/70">
          Rights-safe: platform-original dialogue inspired by eras and archetypes — not
          licensed scripts from Casablanca, Gone with the Wind, or John Wayne films.
        </p>
      </section>

      <SceneCatalogue scenes={scenes} />
    </div>
  );
}
