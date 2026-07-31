"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ManifestLine = {
  dialogueEventId: string;
  sequenceNumber: number;
  characterName: string;
  isUser: boolean;
  text: string;
  emotionTag: string | null;
  partnerAudioUrl: string | null;
  expectedDurationMs: number;
  pauseAfterMs: number;
};

type Manifest = {
  sceneTitle: string;
  selectedCharacterName: string;
  lines: ManifestLine[];
  preparation: {
    situationBefore: string | null;
    relationship: string | null;
    directorNote: string | null;
    objective: string | null;
    obstacles: string | null;
    emotionalStart: string | null;
  };
  rights: {
    canRecordUser: boolean;
    canDisplayScript: boolean;
  };
};

type TakeFeedback = {
  disclaimer: string;
  summary: string[];
  sttUsed: boolean;
  provider: string | null;
  lines: Array<{
    sequenceNumber: number;
    expectedText: string;
    transcriptText: string;
    scriptCoverage: number;
    observations: string[];
  }>;
};

type Phase =
  | "loading"
  | "prep"
  | "countdown"
  | "partner"
  | "record"
  | "idle"
  | "uploading"
  | "mixing"
  | "review"
  | "error";

type Mode = "line_by_line" | "continuous_guided";

/**
 * Scene runner with ref-based index (no stale closures) and a lock so
 * partner audio cannot re-enter / glitch-loop.
 */
export function PerformanceStudio({
  sceneVersionId,
  characterId,
}: {
  sceneVersionId: string;
  characterId: string;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [takeId, setTakeId] = useState<string | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [level, setLevel] = useState(0);
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({});
  const [mixUrl, setMixUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [mode, setMode] = useState<Mode>("line_by_line");
  const [feedback, setFeedback] = useState<TakeFeedback | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const modeRef = useRef<Mode>("line_by_line");
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerAudioRef = useRef<HTMLAudioElement | null>(null);

  /** Always-current index — prevents partner loop from stale closures */
  const lineIndexRef = useRef(0);
  const manifestRef = useRef<Manifest | null>(null);
  const takeIdRef = useRef<string | null>(null);
  /** Prevent re-entrant advance (the glitch-loop root cause) */
  const advancingRef = useRef(false);
  const sessionBusyRef = useRef(false);
  const cancelledRef = useRef(false);

  const userLinesDone = manifest
    ? manifest.lines
        .filter((l) => l.isUser)
        .every((l) => uploaded[l.dialogueEventId])
    : false;

  const stopMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const stopPartnerAudio = () => {
    const a = partnerAudioRef.current;
    if (a) {
      try {
        a.onended = null;
        a.onerror = null;
        a.oncanplay = null;
        a.pause();
        a.removeAttribute("src");
        a.load();
        a.remove();
      } catch {
        /* ignore */
      }
      partnerAudioRef.current = null;
    }
  };

  const startMeter = (stream: MediaStream) => {
    if (audioCtxRef.current) return;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const ensureMic = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    });
    streamRef.current = stream;
    startMeter(stream);
    return stream;
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);

  useEffect(() => {
    takeIdRef.current = takeId;
  }, [takeId]);

  useEffect(() => {
    cancelledRef.current = false;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/performance-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneVersionId,
            selectedCharacterId: characterId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to start session");
        if (!alive || cancelledRef.current) return;
        setSessionId(data.sessionId);
        setTakeId(data.takeId);
        takeIdRef.current = data.takeId;
        setManifest(data.manifest);
        manifestRef.current = data.manifest;
        lineIndexRef.current = 0;
        setLineIndex(0);
        setPhase("prep");
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Failed");
          setPhase("error");
        }
      }
    })();
    return () => {
      alive = false;
      cancelledRef.current = true;
      stopMeter();
      stopPartnerAudio();
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      try {
        audioCtxRef.current?.close();
      } catch {
        /* ignore */
      }
      audioCtxRef.current = null;
    };
  }, [sceneVersionId, characterId]);

  const currentLine = manifest?.lines[lineIndex] ?? null;

  /**
   * Other actor speaks — automatic, no voice picker.
   * Always plays the standard server partner track (baked at seed).
   * No system "select a voice" dialogs.
   */
  const playPartnerLine = useCallback(async (line: ManifestLine) => {
    if (cancelledRef.current) return;
    stopPartnerAudio();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setPhase("partner");

    if (!line.partnerAudioUrl) {
      // No baked audio — short beat then continue (never open a voice picker)
      await new Promise((r) => setTimeout(r, Math.max(800, line.expectedDurationMs * 0.4)));
      return;
    }

    const src = line.partnerAudioUrl.startsWith("http")
      ? line.partnerAudioUrl
      : `${window.location.origin}${line.partnerAudioUrl}`;

    await new Promise<void>((resolve) => {
      const audio = document.createElement("audio");
      audio.setAttribute("playsinline", "true");
      audio.preload = "auto";
      audio.volume = 1;
      audio.muted = false;
      // Keep in DOM — more reliable than detached Audio() on Safari
      audio.style.position = "fixed";
      audio.style.left = "-9999px";
      document.body.appendChild(audio);
      partnerAudioRef.current = audio;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        audio.oncanplay = null;
        try {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
          audio.remove();
        } catch {
          /* ignore */
        }
        if (partnerAudioRef.current === audio) partnerAudioRef.current = null;
        resolve();
      };

      const maxMs = Math.max(line.expectedDurationMs + 5000, 16000);
      const t = setTimeout(finish, maxMs);

      audio.onended = () => {
        clearTimeout(t);
        finish();
      };
      audio.onerror = () => {
        clearTimeout(t);
        finish();
      };

      const tryPlay = () => {
        void audio
          .play()
          .then(() => {
            /* playing */
          })
          .catch(() => {
            // Retry once after a tick (gesture / decode race)
            setTimeout(() => {
              void audio.play().catch(() => {
                clearTimeout(t);
                finish();
              });
            }, 120);
          });
      };

      audio.src = src;
      if (audio.readyState >= 3) tryPlay();
      else {
        audio.oncanplay = () => {
          audio.oncanplay = null;
          tryPlay();
        };
        audio.load();
        setTimeout(tryPlay, 300);
      }
    });
  }, []);

  const startRecordingLine = useCallback(async (line: ManifestLine) => {
    if (cancelledRef.current) return;
    try {
      const stream = await ensureMic();
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.start(100);
      setRecording(true);
      setPhase("record");

      if (modeRef.current === "continuous_guided") {
        const ms = Math.min(Math.max(line.expectedDurationMs + 1500, 2500), 12000);
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        autoTimerRef.current = setTimeout(() => {
          void finishUserLine(line);
        }, ms);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone failed");
      setPhase("error");
    }
  }, [ensureMic]);

  const beginUserLine = useCallback(
    async (line: ManifestLine) => {
      if (cancelledRef.current) return;
      setPhase("countdown");
      for (let i = 3; i >= 1; i--) {
        if (cancelledRef.current) return;
        setCountdown(i);
        await new Promise((r) => setTimeout(r, 550));
      }
      setCountdown(0);
      await startRecordingLine(line);
    },
    [startRecordingLine]
  );

  /**
   * Run the scene from `index` forward through any partner lines,
   * then stop on the next user line (or idle if done).
   * Non-recursive + single-flight lock = no partner glitch loop.
   */
  const goToIndex = useCallback(
    async (startIndex: number) => {
      if (cancelledRef.current) return;
      if (advancingRef.current) return;
      advancingRef.current = true;

      try {
        const m = manifestRef.current;
        if (!m) return;

        let index = startIndex;
        while (index < m.lines.length) {
          if (cancelledRef.current) return;

          lineIndexRef.current = index;
          setLineIndex(index);
          const line = m.lines[index];

          if (line.isUser) {
            // Hand control to the user — exit loop until they finish the line
            await beginUserLine(line);
            return;
          }

          await playPartnerLine(line);
          index += 1;
        }

        // Past last line
        lineIndexRef.current = m.lines.length;
        setLineIndex(m.lines.length);
        setPhase("idle");
      } finally {
        advancingRef.current = false;
      }
    },
    [beginUserLine, playPartnerLine]
  );

  const uploadingRef = useRef(false);

  const finishUserLine = useCallback(
    async (forcedLine?: ManifestLine) => {
      if (cancelledRef.current) return;
      if (uploadingRef.current) return;
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }

      const m = manifestRef.current;
      const idx = lineIndexRef.current;
      const line = forcedLine || m?.lines[idx];
      const tid = takeIdRef.current;
      if (!line || !tid || !line.isUser) return;

      uploadingRef.current = true;
      setRecording(false);
      setPhase("uploading");

      try {
        const mr = mediaRecorderRef.current;
        let blob: Blob;
        if (mr && mr.state !== "inactive") {
          blob = await new Promise<Blob>((resolve) => {
            mr.onstop = () => {
              resolve(
                new Blob(chunksRef.current, {
                  type: mr.mimeType || "audio/webm",
                })
              );
            };
            mr.stop();
          });
        } else {
          blob = new Blob(chunksRef.current, { type: "audio/webm" });
        }
        mediaRecorderRef.current = null;
        chunksRef.current = [];

        if (blob.size < 100) {
          setError("Recording was empty — check your microphone and try again.");
          setPhase("error");
          return;
        }

        const form = new FormData();
        form.append("dialogueEventId", line.dialogueEventId);
        form.append("file", blob, `line-${line.sequenceNumber}.webm`);

        const res = await fetch(`/api/takes/${tid}/upload`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Upload failed");
          setPhase("error");
          return;
        }

        setUploaded((u) => ({ ...u, [line.dialogueEventId]: true }));
        // Continue from the *next* line (partners auto-play until next user line)
        await goToIndex(idx + 1);
      } finally {
        uploadingRef.current = false;
      }
    },
    [goToIndex]
  );

  const startScene = async () => {
    if (!manifestRef.current) return;
    stopPartnerAudio();
    setUploaded({});
    setMixUrl(null);
    setFeedback(null);
    lineIndexRef.current = 0;
    setLineIndex(0);
    advancingRef.current = false;
    // Unlock HTML audio in the same click as "Start take" (standard path — no voice menus)
    try {
      const unlock = document.createElement("audio");
      unlock.src =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
      unlock.volume = 0.01;
      await unlock.play().catch(() => undefined);
      unlock.pause();
    } catch {
      /* ignore */
    }
    try {
      await ensureMic();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mic permission denied");
      setPhase("error");
      return;
    }
    await goToIndex(0);
  };

  const finishMix = async () => {
    const tid = takeIdRef.current;
    if (!tid) return;
    stopPartnerAudio();
    setPhase("mixing");
    setError(null);
    const res = await fetch(`/api/takes/${tid}/complete`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Mix failed");
      setPhase("error");
      return;
    }
    const url = `/api/media/${data.mixAssetId}/play?t=${Date.now()}`;
    setMixUrl(url);
    if (data.feedback) setFeedback(data.feedback);
    else {
      try {
        const fr = await fetch(`/api/takes/${tid}/feedback`);
        const fj = await fr.json();
        if (fj.feedback) setFeedback(fj.feedback);
      } catch {
        /* ignore */
      }
    }
    setPhase("review");
  };

  const anotherTake = async () => {
    if (!sessionId) return;
    stopPartnerAudio();
    const res = await fetch(`/api/performance-sessions/${sessionId}/new-take`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not start take");
      return;
    }
    setTakeId(data.takeId);
    takeIdRef.current = data.takeId;
    setUploaded({});
    setMixUrl(null);
    setFeedback(null);
    lineIndexRef.current = 0;
    setLineIndex(0);
    advancingRef.current = false;
    setPhase("prep");
  };

  if (phase === "loading") {
    return <p className="text-stage-mist">Preparing scene session…</p>;
  }

  if (phase === "error") {
    return (
      <div className="panel space-y-3 p-6">
        <h2 className="font-display text-xl text-stage-coral">Something went wrong</h2>
        <p className="text-sm text-stage-mist">{error}</p>
        <button className="btn-ghost" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }

  if (!manifest) return null;

  const progress = Math.round(
    (Object.keys(uploaded).length /
      Math.max(1, manifest.lines.filter((l) => l.isUser).length)) *
      100
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <p className="label-caps text-stage-gold/90">
          Playing as {manifest.selectedCharacterName}
        </p>
        <div className="hero-rule" />
        <h1 className="font-display text-3xl tracking-tight text-stage-chalk md:text-4xl">
          {manifest.sceneTitle}
        </h1>
      </div>

      {phase === "prep" && (
        <div className="panel-elevated space-y-6 p-7 md:p-8">
          <h2 className="font-display text-xl text-stage-chalk">Ready when you are</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <PrepRow label="Situation" value={manifest.preparation.situationBefore} />
            <PrepRow label="Relationship" value={manifest.preparation.relationship} />
            <PrepRow label="Your objective" value={manifest.preparation.objective} />
            <PrepRow label="Director" value={manifest.preparation.directorNote} />
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-5">
            <p className="label-caps mb-3">Script</p>
            <ol className="space-y-2.5 text-sm leading-relaxed">
              {manifest.lines.map((l) => (
                <li
                  key={l.dialogueEventId}
                  className={
                    l.isUser ? "text-stage-chalk" : "text-stage-mist/90"
                  }
                >
                  <span
                    className={
                      l.isUser
                        ? "font-medium text-stage-gold"
                        : "font-medium text-stage-mist"
                    }
                  >
                    {l.characterName}
                    {l.isUser ? " · you" : " · partner"}:{" "}
                  </span>
                  {manifest.rights.canDisplayScript ? l.text : "—"}
                </li>
              ))}
            </ol>
          </div>
          <p className="text-center text-xs text-stage-mist">
            Partner lines play automatically — no voice menus.
          </p>
          <button className="btn-primary w-full py-3.5 text-base" onClick={() => void startScene()}>
            Start take
          </button>
        </div>
      )}

      {(phase === "countdown" ||
        phase === "partner" ||
        phase === "record" ||
        phase === "uploading" ||
        phase === "idle") && (
        <div className="panel-elevated space-y-6 p-7 md:p-8">
          <div className="flex items-center justify-between text-xs text-stage-mist">
            <span>
              Line {Math.min(lineIndex + 1, manifest.lines.length)} /{" "}
              {manifest.lines.length}
            </span>
            <span>Your lines {progress}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-stage-cream/90 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {currentLine && (
            <div
              className={
                phase === "partner"
                  ? "rounded-2xl border border-stage-gold/20 bg-stage-gold/[0.06] p-5"
                  : phase === "record"
                    ? "rounded-2xl border border-stage-cream/15 bg-white/[0.03] p-5"
                    : "space-y-2"
              }
            >
              <p className="label-caps">
                {phase === "partner"
                  ? "Other actor speaking — volume up"
                  : phase === "countdown"
                    ? "Get ready"
                    : phase === "record"
                      ? "Your line — recording"
                      : phase === "uploading"
                        ? "Saving your line…"
                        : "Scene complete"}
              </p>
              <p className="mt-2 font-display text-2xl leading-snug text-stage-chalk md:text-3xl">
                <span className="text-stage-mist">
                  {currentLine.characterName}:{" "}
                </span>
                {currentLine.text}
              </p>
            </div>
          )}

          {phase === "countdown" && (
            <p className="font-display text-7xl tabular-nums text-stage-cream/90">
              {countdown || "—"}
            </p>
          )}

          <div className="space-y-2">
            <p className="label-caps">Microphone</p>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-stage-mint/80 transition-[width] duration-75"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
          </div>

          {phase === "record" && (
            <button
              className="btn-primary w-full py-3.5 text-base"
              onClick={() => void finishUserLine()}
            >
              {recording ? "Done with line — next" : "Stop"}
            </button>
          )}

          {phase === "idle" && (
            <div className="space-y-3">
              <p className="text-sm text-stage-mist">
                All lines captured. Mix the scene and listen back.
              </p>
              <button
                className="btn-primary w-full py-3.5 text-base"
                disabled={!userLinesDone}
                onClick={() => void finishMix()}
              >
                Mix scene + listen
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "mixing" && (
        <div className="panel p-8 text-center text-stage-mist">
          Mixing your take with the partner…
        </div>
      )}

      {phase === "review" && (
        <div className="panel-elevated space-y-5 p-7 md:p-8">
          <h2 className="font-display text-2xl text-stage-chalk">
            Listen to your take
          </h2>
          {mixUrl ? (
            <div className="space-y-3">
              <audio
                key={mixUrl}
                controls
                controlsList="nodownload"
                className="w-full"
                src={mixUrl}
                preload="auto"
              />
              <a
                className="text-sm text-stage-gold underline-offset-2 hover:underline"
                href={mixUrl}
                download={`take-${takeId || "mix"}.m4a`}
              >
                Download mix
              </a>
            </div>
          ) : (
            <p className="text-sm text-stage-coral">
              Mix missing — try another take, then mix again.
            </p>
          )}

          {feedback && (
            <div className="space-y-3 rounded-2xl border border-white/[0.07] bg-black/20 p-5">
              <p className="label-caps text-stage-mint">Notes</p>
              <p className="text-xs text-stage-mist">{feedback.disclaimer}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-stage-chalk/90">
                {feedback.summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              {feedback.lines.map((l) => (
                <div
                  key={l.sequenceNumber}
                  className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm"
                >
                  <p className="font-medium text-stage-chalk">
                    Line {l.sequenceNumber} ·{" "}
                    {Math.round(l.scriptCoverage * 100)}% words detected
                  </p>
                  {l.transcriptText ? (
                    <p className="mt-1 text-stage-mist">
                      Heard: “{l.transcriptText}”
                    </p>
                  ) : null}
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-stage-mist">
                    {l.observations.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => void anotherTake()}>
              Another take
            </button>
            <a className="btn-ghost" href="/library">
              My takes
            </a>
            <a className="btn-ghost" href="/">
              Scene shelf
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function PrepRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="label-caps">{label}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-stage-chalk/90">{value}</p>
    </div>
  );
}
