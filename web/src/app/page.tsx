import { listPublishedScenes } from "@/lib/scene/manifest";
import { ensureAppReady, ensureMigrated } from "@/lib/bootstrap";
import { SceneCatalogue } from "@/components/SceneCatalogue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  ensureMigrated();
  // Always ensure seed on this instance (Netlify /tmp is per-function)
  await ensureAppReady();
  const scenes = listPublishedScenes();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-stage-mint">
          Hollywood practice · audio first
        </p>
        <h1 className="font-display text-4xl leading-tight text-white md:text-5xl">
          Holly Would.
          <br />
          <span className="text-stage-mist">Filter. Pick a role. Listen back.</span>
        </h1>
        <p className="max-w-2xl text-stage-mist">
          Series · technical · hilarious. Original Hollywood-energy scenes — noir
          cafés, western streets, southern estates, rom-coms. Filter by difficulty,
          tone, rudeness, funny, or character style.
        </p>
        <p className="max-w-2xl text-xs text-stage-mist/70">
          Rights-safe platform-original dialogue — not licensed studio film scripts.
        </p>
      </section>

      {scenes.length === 0 ? (
        <div className="panel space-y-3 p-8 text-stage-mist">
          <p className="font-medium text-white">Catalogue is warming up…</p>
          <p className="text-sm">
            If this stays empty on Netlify, open{" "}
            <a className="text-stage-gold underline" href="/api/bootstrap">
              /api/bootstrap
            </a>{" "}
            once, then refresh.
          </p>
        </div>
      ) : (
        <SceneCatalogue scenes={scenes} />
      )}
    </div>
  );
}
