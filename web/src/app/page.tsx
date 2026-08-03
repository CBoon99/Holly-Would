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
  if (scenes.length === 0) {
    try {
      await ensureAppReady({ force: false, liveTts: true });
      scenes = listPublishedScenes();
    } catch {
      /* client catalogue will recover */
    }
  }

  return (
    <div className="space-y-12">
      <section className="relative space-y-5">
        <p className="label-caps text-stage-gold/90">Audio-first acting practice</p>
        <div className="hero-rule" />
        <h1 className="max-w-3xl font-display text-[2.6rem] leading-[1.08] tracking-tight text-stage-chalk md:text-6xl">
          Step into the scene.
          <span className="mt-2 block font-display text-[1.65rem] font-normal leading-snug text-stage-mist md:text-3xl">
            Choose a role. Play opposite a partner. Hear the take.
          </span>
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-stage-mist md:text-lg">
          Original, rights-safe dialogue with classic craft energy — noir,
          romance, western, courtroom. Train like you mean it.
        </p>
        <div className="flex flex-wrap gap-3 pt-1 text-xs text-stage-mist/70">
          <span className="chip">27 original scenes</span>
          <span className="chip">Both roles playable</span>
          <span className="chip">Free partner voice</span>
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-stage-mist/55">
          Most scenes use original scripts + free partner audio. Scenes tagged{" "}
          <span className="text-stage-gold/90">PD film voice</span> play
          unaltered public-domain film tracks (may sound rough / archival). We
          do not AI-clone modern movie stars.
        </p>
        <p className="max-w-xl text-xs leading-relaxed text-stage-gold/80">
          Best experience (full partner audio files):{" "}
          <a
            className="underline underline-offset-2"
            href="https://holly-would-web-production.up.railway.app"
          >
            holly-would-web-production.up.railway.app
          </a>
          . Netlify may fall back to device speech if media files are not on that
          instance.
        </p>
      </section>

      <SceneCatalogue scenes={scenes} />
    </div>
  );
}
