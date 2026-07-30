"use client";

import { useEffect, useState } from "react";

type TakeRow = {
  takeId: string;
  sessionId: string;
  takeNumber: number;
  status: string;
  mixAssetId: string | null;
  createdAt: string;
};

export default function LibraryPage() {
  const [takes, setTakes] = useState<TakeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/takes", { cache: "no-store" });
      const data = await res.json();
      setTakes(data.takes || []);
    } catch {
      setError("Could not load takes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const remove = async (id: string) => {
    const res = await fetch(`/api/takes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || "Delete failed");
      return;
    }
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">My takes</h1>
          <p className="text-sm text-stage-mist">Private library · listen anytime</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error && <p className="text-sm text-stage-coral">{error}</p>}
      {loading ? (
        <p className="text-stage-mist">Loading…</p>
      ) : takes.length === 0 ? (
        <div className="panel p-6 text-stage-mist">
          No takes yet.{" "}
          <a href="/" className="text-stage-gold underline">
            Perform a scene
          </a>
        </div>
      ) : (
        <ul className="space-y-4">
          {takes.map((t) => {
            const canPlay = Boolean(t.mixAssetId);
            const playUrl = t.mixAssetId
              ? `/api/media/${t.mixAssetId}/play?t=${encodeURIComponent(t.createdAt)}`
              : null;
            return (
              <li key={t.takeId} className="panel space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">
                      Take #{t.takeNumber}{" "}
                      <span className="text-sm font-normal text-stage-mist">
                        · {t.status}
                      </span>
                    </p>
                    <p className="text-xs text-stage-mist">{t.createdAt}</p>
                    <p className="mt-1 font-mono text-[10px] text-stage-mist/70">
                      {t.takeId}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => void remove(t.takeId)}
                  >
                    Delete
                  </button>
                </div>

                {canPlay && playUrl ? (
                  <div className="space-y-2">
                    <audio
                      key={playUrl}
                      controls
                      preload="metadata"
                      className="w-full"
                      src={playUrl}
                    />
                    <a
                      href={playUrl}
                      download={`take-${t.takeNumber}.m4a`}
                      className="text-sm text-stage-gold underline"
                    >
                      Download
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-stage-mist">
                    {t.status === "failed"
                      ? "Mix failed for this take — try performing again."
                      : t.status === "recording" || t.status === "processing"
                        ? "Still processing — hit Refresh in a moment."
                        : "No mix yet — finish the scene and tap “Mix scene + listen”."}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
