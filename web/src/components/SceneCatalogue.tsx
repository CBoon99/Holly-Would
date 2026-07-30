"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CatalogueScene } from "@/lib/scene/manifest";

export function SceneCatalogue({ scenes }: { scenes: CatalogueScene[] }) {
  const [difficulty, setDifficulty] = useState<string>("all");
  const [tone, setTone] = useState<string>("all");
  const [rudeness, setRudeness] = useState<string>("all");
  const [funnyOnly, setFunnyOnly] = useState(false);
  const [style, setStyle] = useState<string>("all");
  const [q, setQ] = useState("");

  const styleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of scenes) {
      s.styleTags.forEach((t) => set.add(t));
      s.playableCharacters.forEach((c) => c.styleTags.forEach((t) => set.add(t)));
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

  return (
    <div className="space-y-6">
      <div className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-white">Hollywood catalogue</h2>
            <p className="text-xs text-stage-mist">
              Original scenes with classic movie energy · filter like a casting board
            </p>
          </div>
          <p className="text-sm text-stage-gold">
            {filtered.length} scene{filtered.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-stage-mist">
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="noir, cowboy, funny…"
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
          <label className="flex items-center gap-2 pt-6 text-sm text-white">
            <input
              type="checkbox"
              checked={funnyOnly}
              onChange={(e) => setFunnyOnly(e.target.checked)}
              className="h-4 w-4"
            />
            Funny only
          </label>
        </div>

        <p className="text-[11px] leading-relaxed text-stage-mist/80">
          Tip: pick <span className="text-stage-gold">western-hero</span> /{" "}
          <span className="text-stage-gold">john-wayne-type</span> to act as the
          tough cowboy.{" "}
          <span className="text-stage-gold">southern-belle</span> for Scarlett-energy.
          These are original scripts inspired by Hollywood eras — not licensed studio
          films.
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-8 text-stage-mist">
          No scenes match those filters. Clear a filter and try again.
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.id} className="panel flex flex-col p-6">
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {s.genre && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5">{s.genre}</span>
                )}
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
                ~{Math.round(s.durationMs / 1000)}s
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {s.sceneVersionId &&
                  s.playableCharacters.map((c) => {
                    const isWayne = c.styleTags.some((t) =>
                      /wayne|western-hero|sheriff/i.test(t)
                    );
                    const isScarlett = c.styleTags.some((t) =>
                      /southern-belle|fiery/i.test(t)
                    );
                    return (
                      <Link
                        key={c.id}
                        href={`/perform/${s.sceneVersionId}?character=${c.id}`}
                        className="btn-primary w-full text-center"
                      >
                        Perform as {c.name}
                        {isWayne ? " · cowboy lead" : ""}
                        {isScarlett ? " · southern fire" : ""}
                      </Link>
                    );
                  })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

function labelStyle(tag: string): string {
  const map: Record<string, string> = {
    "john-wayne-type": "John Wayne–type (cowboy lead)",
    "western-hero": "Western hero",
    "southern-belle": "Southern belle (Scarlett energy)",
    "cafe-owner": "Café owner (Casablanca energy)",
    "old-flame": "Old flame",
    "femme-fatale": "Femme fatale",
    detective: "Detective",
    "rom-com-lead": "Rom-com lead",
    screwball: "Screwball comedy",
    smuggler: "Space smuggler",
    diva: "Stage diva",
  };
  return map[tag] || tag.replace(/-/g, " ");
}
