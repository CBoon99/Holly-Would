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

  // If SSR returned empty (cold start / failed seed), recover from API
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
        if (!cancelled) setLoadError("Could not load scenes. Refresh and try again.");
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
      <div className="panel p-8 text-stage-mist">
        <p className="font-medium text-white">Loading scene catalogue…</p>
        <p className="mt-2 text-sm">Preparing partner lines and rights records.</p>
      </div>
    );
  }

  if (loadError && scenes.length === 0) {
    return (
      <div className="panel space-y-3 p-8">
        <p className="font-medium text-stage-coral">Catalogue unavailable</p>
        <p className="text-sm text-stage-mist">{loadError}</p>
        <p className="text-sm text-stage-mist">
          Production:{" "}
          <a
            className="text-stage-gold underline"
            href="https://holly-would-web-production.up.railway.app"
          >
            holly-would-web-production.up.railway.app
          </a>
        </p>
        <button type="button" className="btn-primary" onClick={() => location.reload()}>
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-white">Scene catalogue</h2>
            <p className="text-xs text-stage-mist">
              Original acting scenes · classic Hollywood craft energy · rights-safe
            </p>
          </div>
          <p className="text-sm text-stage-gold">
            {filtered.length} of {scenes.length} scene
            {scenes.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-stage-mist">
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="noir, western, courtroom…"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
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
            label="Rudeness"
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
          <label className="flex items-end gap-2 text-xs text-stage-mist">
            <input
              type="checkbox"
              checked={funnyOnly}
              onChange={(e) => setFunnyOnly(e.target.checked)}
              className="mb-2.5"
            />
            Funny only
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel space-y-3 p-8 text-stage-mist">
          <p className="font-medium text-white">No scenes match these filters</p>
          <p className="text-sm">
            {scenes.length} scene{scenes.length === 1 ? "" : "s"} in the catalogue — clear
            filters to see them all.
          </p>
          <button type="button" className="btn-primary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.id} className="panel flex flex-col p-5">
              <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wide">
                {s.difficulty && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    {s.difficulty}
                  </span>
                )}
                {s.tone && (
                  <span className="rounded-full bg-stage-gold/15 px-2 py-0.5 text-stage-gold">
                    {s.tone}
                  </span>
                )}
                {s.funny && (
                  <span className="rounded-full bg-stage-mint/15 px-2 py-0.5 text-stage-mint">
                    funny
                  </span>
                )}
                {s.rudeness && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    {s.rudeness}
                  </span>
                )}
              </div>
              <h3 className="font-display text-xl text-white">{s.title}</h3>
              {s.hollywoodVibe && (
                <p className="mt-1 text-xs italic text-stage-mist">{s.hollywoodVibe}</p>
              )}
              <p className="mt-2 flex-1 text-sm leading-relaxed text-stage-mist">
                {s.description}
              </p>
              <p className="mt-3 text-xs text-stage-mist">
                ~{Math.round(s.durationMs / 1000)}s · original dialogue
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {s.sceneVersionId &&
                  s.playableCharacters.map((c) => (
                    <Link
                      key={c.id}
                      href={`/perform/${s.sceneVersionId}?character=${c.id}`}
                      className="btn-primary w-full text-center"
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
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
      >
        {options.map(([v, lab]) => (
          <option key={v} value={v}>
            {lab}
          </option>
        ))}
      </select>
    </label>
  );
}
