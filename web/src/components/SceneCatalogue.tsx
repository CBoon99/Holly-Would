"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CatalogueScene } from "@/lib/scene/manifest";

export function SceneCatalogue({
  scenes: initialScenes,
}: {
  scenes: CatalogueScene[];
}) {
  const [scenes, setScenes] = useState(initialScenes);
  const [loading, setLoading] = useState(initialScenes.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string>("all");
  const [tone, setTone] = useState<string>("all");
  const [rudeness, setRudeness] = useState<string>("all");
  const [funnyOnly, setFunnyOnly] = useState(false);
  const [style, setStyle] = useState<string>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (initialScenes.length > 0) {
      setScenes(initialScenes);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await fetch("/api/bootstrap", { cache: "no-store" });
        const res = await fetch("/api/scenes", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const next = (data.scenes || []) as CatalogueScene[];
        setScenes(next);
        if (next.length === 0) {
          setLoadError(
            "Catalogue is empty on this host. Use the Railway production URL if you landed on a stale deploy."
          );
        }
      } catch {
        if (!cancelled)
          setLoadError("Could not load scenes. Refresh and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialScenes]);

  const styleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of scenes) {
      s.styleTags.forEach((t) => set.add(t));
      s.playableCharacters.forEach((c) =>
        c.styleTags.forEach((t) => set.add(t))
      );
    }
    return Array.from(set).sort();
  }, [scenes]);

  const filtered = useMemo(() => {
    return scenes.filter((s) => {
      // Hide internal padding scenes if any
      if (s.genre === "internal") return false;
      if (difficulty !== "all" && s.difficulty !== difficulty) return false;
      if (tone !== "all" && s.tone !== tone) return false;
      if (rudeness !== "all" && s.rudeness !== rudeness) return false;
      if (funnyOnly && !s.funny) return false;
      if (style !== "all") {
        const tags = [
          ...s.styleTags,
          ...s.playableCharacters.flatMap((c) => c.styleTags),
        ];
        if (!tags.includes(style)) return false;
      }
      if (q.trim()) {
        const hay = [
          s.title,
          s.description,
          s.genre,
          s.hollywoodVibe,
          ...s.styleTags,
          ...s.playableCharacters.map((c) => c.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [scenes, difficulty, tone, rudeness, funnyOnly, style, q]);

  const clearFilters = () => {
    setDifficulty("all");
    setTone("all");
    setRudeness("all");
    setFunnyOnly(false);
    setStyle("all");
    setQ("");
  };

  if (loading) {
    return (
      <div className="panel p-10 text-center text-stage-mist">
        <p className="font-display text-xl text-stage-chalk">
          Loading scenes…
        </p>
        <p className="mt-2 text-sm">Preparing the shelf.</p>
      </div>
    );
  }

  if (loadError && scenes.length === 0) {
    return (
      <div className="panel space-y-4 p-8">
        <p className="font-display text-xl text-stage-coral">
          Catalogue unavailable
        </p>
        <p className="text-sm text-stage-mist">{loadError}</p>
        <button type="button" className="btn-primary" onClick={() => location.reload()}>
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="panel space-y-5 p-6 md:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-stage-chalk md:text-3xl">
              Scene shelf
            </h2>
            <p className="mt-1 text-sm text-stage-mist">
              Original dialogue · classic craft · pick a role
            </p>
          </div>
          <p className="text-sm tabular-nums text-stage-mist">
            <span className="text-stage-gold">{filtered.length}</span>
            <span className="text-white/30"> / </span>
            {scenes.filter((s) => s.genre !== "internal").length}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-stage-mist">
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="noir, western, courtroom…"
              className="field"
            />
          </label>
          <FilterSelect
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={[
              ["all", "All levels"],
              ["beginner", "Beginner"],
              ["intermediate", "Intermediate"],
              ["advanced", "Advanced"],
            ]}
          />
          <FilterSelect
            label="Tone"
            value={tone}
            onChange={setTone}
            options={[
              ["all", "All tones"],
              ["funny", "Funny"],
              ["dramatic", "Dramatic"],
              ["romantic", "Romantic"],
              ["tense", "Tense"],
            ]}
          />
          <FilterSelect
            label="Language"
            value={rudeness}
            onChange={setRudeness}
            options={[
              ["all", "Any"],
              ["clean", "Clean"],
              ["mild", "Mild"],
              ["racy", "Racy"],
            ]}
          />
          <FilterSelect
            label="Style / vibe"
            value={style}
            onChange={setStyle}
            options={[
              ["all", "Any style"],
              ...styleOptions.map((t) => [t, labelStyle(t)] as [string, string]),
            ]}
          />
          <label className="flex items-end gap-2.5 pb-2.5 text-xs text-stage-mist">
            <input
              type="checkbox"
              checked={funnyOnly}
              onChange={(e) => setFunnyOnly(e.target.checked)}
              className="rounded border-white/20 bg-black/30"
            />
            Funny only
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel space-y-3 p-10 text-center">
          <p className="font-display text-xl text-stage-chalk">
            No scenes match
          </p>
          <p className="text-sm text-stage-mist">
            Clear filters to see the full shelf.
          </p>
          <button type="button" className="btn-ghost" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.id} className="scene-card p-0">
              <div className="flex flex-1 flex-col p-6">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {s.audioSource === "public_domain_film" && (
                    <span className="chip-gold">PD film voice</span>
                  )}
                  {s.difficulty && (
                    <span className="chip">{s.difficulty}</span>
                  )}
                  {s.tone && <span className="chip-gold">{s.tone}</span>}
                  {s.funny && <span className="chip">funny</span>}
                  {s.genre && (
                    <span className="chip">{s.genre.replace(/-/g, " ")}</span>
                  )}
                </div>
                <h3 className="font-display text-2xl leading-tight text-stage-chalk">
                  {s.title}
                </h3>
                {s.hollywoodVibe && (
                  <p className="mt-1.5 text-xs italic leading-relaxed text-stage-gold/80">
                    {s.hollywoodVibe}
                  </p>
                )}
                <p className="mt-3 flex-1 text-sm leading-relaxed text-stage-mist">
                  {s.description}
                </p>
                <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-white/35">
                  ~{Math.round(s.durationMs / 1000)}s · original dialogue
                </p>
              </div>
              <div className="flex flex-col gap-2 border-t border-white/[0.06] bg-black/20 p-4">
                {s.sceneVersionId &&
                  s.playableCharacters.map((c, idx) => (
                    <Link
                      key={c.id}
                      href={`/perform/${s.sceneVersionId}?character=${c.id}`}
                      className={
                        idx === 0
                          ? "btn-primary w-full text-center"
                          : "btn-ghost w-full text-center"
                      }
                    >
                      Perform as {c.name}
                    </Link>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function labelStyle(t: string): string {
  return t.replace(/-/g, " ");
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block text-xs text-stage-mist">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
        {options.map(([v, lab]) => (
          <option key={v} value={v}>
            {lab}
          </option>
        ))}
      </select>
    </label>
  );
}
