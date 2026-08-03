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
  audioSource?: string | null;
  voiceDisclaimer?: string | null;
  sourceAttribution?: string | null;
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
  | "need_mic"
  | "record"
  | "idle"
  | "uploading"
  | "mixing"
  | "review"
  | "error";

function micErrorMessage(e: unknown): string {
  const name =
    e && typeof e === "object" && "name" in e
      ? String((e as { name: string }).name)
      : "";
  const msg = e instanceof Error ? e.message : String(e);
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    /permission denied|not allowed|denied/i.test(msg)
  ) {
    return "Microphone blocked. Tap “Allow” when the browser asks, or enable Microphone for this site in phone Settings → Safari/Chrome → Microphone.";
  }
  if (name === "NotFoundError" || /not found|no device/i.test(msg)) {
    return "No microphone found. Plug in a mic or check phone permissions.";
  }
  if (name === "NotReadableError" || /could not start|in use/i.test(msg)) {
    return "Microphone is busy. Close other apps using the mic and try again.";
  }
  return msg || "Microphone failed — allow access and try again.";
}

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
  const [starting, setStarting] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

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
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "This browser cannot access the microphone. Try Safari or Chrome."
      );
    }
    try {
      // Simple constraints first — aggressive options break some iPhones
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        new Promise<MediaStream>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "Microphone request timed out. Tap Allow if prompted, or enable mic in Settings."
                )
              ),
            8000
          )
        ),
      ]);
      streamRef.current = stream;
      startMeter(stream);
      return stream;
    } catch (e) {
      throw new Error(micErrorMessage(e));
    }
  }, []);

  /** iOS Safari prefers mp4; Chrome prefers webm */
  const pickRecorderMime = () => {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "audio/mp4",
      "audio/aac",
      "audio/webm;codecs=opus",
      "audio/webm",
    ];
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  };

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
   * Other actor speaks — automatic server track, no voice picker.
   * Must run soon after a user tap so mobile browsers allow audio.
   */
  const playPartnerLine = useCallback(async (line: ManifestLine) => {
    if (cancelledRef.current) return;
    stopPartnerAudio();
    setPhase("partner");

    if (!line.partnerAudioUrl) {
      await new Promise((r) =>
        setTimeout(r, Math.max(900, Math.min(line.expectedDurationMs, 4000)))
      );
      return;
    }

    const src = line.partnerAudioUrl.startsWith("http")
      ? line.partnerAudioUrl
      : `${window.location.origin}${line.partnerAudioUrl}`;

    await new Promise<void>((resolve) => {
      const audio = document.createElement("audio");
      audio.setAttribute("playsinline", "true");
      audio.setAttribute("webkit-playsinline", "true");
      audio.preload = "auto";
      audio.controls = false;
      audio.volume = 1;
      audio.muted = false;
      // Visible off-screen — some mobile browsers refuse fully hidden audio
      audio.style.cssText =
        "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;bottom:0;left:0;z-index:0";
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

      // Don't hang the scene if play fails on mobile
      const maxMs = Math.max(line.expectedDurationMs + 2500, 8000);
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
        const p = audio.play();
        if (p && typeof p.then === "function") {
          p.catch(() => {
            // Still advance after a reading beat so the convo never freezes
            setTimeout(() => {
              clearTimeout(t);
              finish();
            }, Math.min(line.expectedDurationMs || 2000, 3500));
          });
        }
      };

      audio.src = src;
      audio.load();
      // Immediate play — preserves mobile user-gesture when possible
      tryPlay();
      audio.oncanplay = () => {
        audio.oncanplay = null;
        tryPlay();
      };
    });
  }, []);

  const finishUserLineRef = useRef<
    (forcedLine?: ManifestLine) => Promise<void>
  >(async () => undefined);

  const startRecordingLine = useCallback(
    async (line: ManifestLine) => {
      if (cancelledRef.current) return;
      try {
        const stream = await ensureMic();
        chunksRef.current = [];
        if (typeof MediaRecorder === "undefined") {
          throw new Error(
            "Recording is not supported in this browser. Try Safari or Chrome."
          );
        }
        const mime = pickRecorderMime();
        const mr = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = mr;
        mr.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        mr.start(100);
        setRecording(true);
        setPhase("record");

        if (modeRef.current === "continuous_guided") {
          const ms = Math.min(
            Math.max(line.expectedDurationMs + 1500, 2500),
            12000
          );
          if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
          autoTimerRef.current = setTimeout(() => {
            void finishUserLineRef.current(line);
          }, ms);
        }
      } catch (e) {
        // Don't kill the whole scene — ask again with a tap (mobile needs a gesture)
        setError(micErrorMessage(e));
        setPhase("need_mic");
      }
    },
    [ensureMic]
  );

  const beginUserLine = useCallback(
    async (line: ManifestLine) => {
      if (cancelledRef.current) return;
      setError(null);
      // If mic not ready yet, stop here and wait for an explicit tap (keeps mobile happy)
      if (!streamRef.current) {
        setPhase("need_mic");
        return;
      }
      setPhase("countdown");
      for (let i = 2; i >= 1; i--) {
        if (cancelledRef.current) return;
        setCountdown(i);
        await new Promise((r) => setTimeout(r, 450));
      }
      setCountdown(0);
      await startRecordingLine(line);
    },
    [startRecordingLine]
  );

  /** User taps to enable mic — must be a real button press on mobile */
  const enableMicAndRecord = async () => {
    setError(null);
    const m = manifestRef.current;
    const line = m?.lines[lineIndexRef.current];
    if (!line?.isUser) return;
    try {
      await ensureMic();
      setPhase("countdown");
      for (let i = 2; i >= 1; i--) {
        if (cancelledRef.current) return;
        setCountdown(i);
        await new Promise((r) => setTimeout(r, 450));
      }
      setCountdown(0);
      await startRecordingLine(line);
    } catch (e) {
      setError(micErrorMessage(e));
      setPhase("need_mic");
    }
  };

  /**
   * Run the scene from `index` forward through any partner lines,
   * then stop on the next user line (or idle if done).
   * Non-recursive + single-flight lock = no partner glitch loop.
   * `force` resets the lock so Start take always works on iPhone.
   */
  const goToIndex = useCallback(
    async (startIndex: number, force = false) => {
      // Start take (force) must recover from Strict Mode / stale cancelled flags
      if (force) cancelledRef.current = false;
      else if (cancelledRef.current) return;
      if (advancingRef.current && !force) return;
      advancingRef.current = true;

      try {
        const m = manifestRef.current;
        if (!m || !m.lines?.length) {
          setError("Scene script not loaded yet. Wait a second and tap Start again.");
          setPhase("error");
          return;
        }

        let index = startIndex;
        while (index < m.lines.length) {
          if (cancelledRef.current) {
            // User navigated away mid-scene
            return;
          }

          lineIndexRef.current = index;
          setLineIndex(index);
          const line = m.lines[index];
          if (!line) break;

          if (line.isUser) {
            await beginUserLine(line);
            return;
          }

          setStatusNote(`Partner line ${index + 1} of ${m.lines.length}`);
          await playPartnerLine(line);
          index += 1;
        }

        lineIndexRef.current = m.lines.length;
        setLineIndex(m.lines.length);
        setPhase("idle");
        setStatusNote(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not run scene");
        setPhase("error");
      } finally {
        advancingRef.current = false;
        setStarting(false);
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
            const done = () =>
              resolve(
                new Blob(chunksRef.current, {
                  type: mr.mimeType || "audio/webm",
                })
              );
            mr.onstop = done;
            try {
              mr.stop();
            } catch {
              done();
            }
            // iOS can fail to fire onstop — never hang forever
            setTimeout(done, 2500);
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
        const ext = (mr?.mimeType || blob.type || "").includes("mp4")
          ? "mp4"
          : (mr?.mimeType || blob.type || "").includes("aac")
            ? "m4a"
            : "webm";
        form.append(
          "file",
          blob,
          `line-${line.sequenceNumber}.${ext}`
        );

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
        // Continue from the *next* line (force so lock cannot silently freeze)
        await goToIndex(idx + 1, true);
      } finally {
        uploadingRef.current = false;
      }
    },
    [goToIndex]
  );

  finishUserLineRef.current = finishUserLine;

  const startScene = async () => {
    // iPhone: never silent-return; always change visible state
    if (starting) return;
    setStarting(true);
    setError(null);
    setStatusNote("Starting scene…");

    // Watchdog — if anything hangs, unlock the button
    const watchdog = setTimeout(() => {
      setStarting(false);
      setStatusNote(null);
    }, 15000);

    try {
      if (!manifestRef.current) {
        setError(
          "Still loading the script. Wait a moment, then tap Start take again."
        );
        setPhase("error");
        return;
      }

      stopPartnerAudio();
      setUploaded({});
      setMixUrl(null);
      setFeedback(null);
      lineIndexRef.current = 0;
      setLineIndex(0);
      advancingRef.current = false;
      cancelledRef.current = false;

      // Leave prep UI immediately so the button never looks dead
      setPhase("partner");
      setStatusNote("Playing dialogue…");

      // Unlock autoplay — NEVER hang (iOS can leave play() unsettled)
      try {
        const unlock = document.createElement("audio");
        unlock.setAttribute("playsinline", "true");
        unlock.setAttribute("webkit-playsinline", "true");
        unlock.src =
          "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
        unlock.volume = 0.01;
        await Promise.race([
          unlock.play().catch(() => undefined),
          new Promise((r) => setTimeout(r, 400)),
        ]);
        try {
          unlock.pause();
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }

      // Try to resume AudioContext under the user gesture (helps iOS)
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          await Promise.race([
            ctx.resume().catch(() => undefined),
            new Promise((r) => setTimeout(r, 300)),
          ]);
          try {
            await ctx.close();
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }

      await goToIndex(0, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start dialogue");
      setPhase("error");
    } finally {
      clearTimeout(watchdog);
      setStarting(false);
      setStatusNote(null);
    }
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
      <div className="panel space-y-4 p-6">
        <h2 className="font-display text-xl text-stage-coral">Something went wrong</h2>
        <p className="text-sm leading-relaxed text-stage-mist">{error}</p>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary"
            onClick={() => {
              setError(null);
              setPhase("prep");
            }}
          >
            Try again
          </button>
          <button className="btn-ghost" onClick={() => window.location.reload()}>
            Reload page
          </button>
          <a className="btn-ghost" href="/">
            Scene shelf
          </a>
        </div>
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
          {(manifest.voiceDisclaimer ||
            manifest.audioSource === "public_domain_film") && (
            <div className="rounded-2xl border border-stage-gold/25 bg-stage-gold/[0.07] p-4 text-sm leading-relaxed text-stage-chalk/90">
              <p className="label-caps text-stage-gold mb-2">Voice disclaimer</p>
              <p>
                {manifest.voiceDisclaimer ||
                  "Partner lines use unaltered archival public-domain film audio. Quality may sound rough or “terminal.” Not AI-cloned celebrity voices."}
              </p>
              {manifest.sourceAttribution && (
                <p className="mt-2 text-xs text-stage-mist">
                  {manifest.sourceAttribution}
                </p>
              )}
            </div>
          )}
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
            Tap Start take — dialogue begins immediately. Microphone is only
            needed when it is your line.
          </p>
          {statusNote && (
            <p className="text-center text-sm text-stage-gold">{statusNote}</p>
          )}
          <button
            type="button"
            className="btn-primary w-full select-none py-3.5 text-base"
            disabled={starting}
            style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void startScene();
            }}
          >
            {starting ? "Starting…" : "Start take"}
          </button>
        </div>
      )}

      {(phase === "countdown" ||
        phase === "partner" ||
        phase === "need_mic" ||
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
          {statusNote && (
            <p className="text-center text-sm text-stage-gold">{statusNote}</p>
          )}
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
                  : phase === "record" || phase === "need_mic"
                    ? "rounded-2xl border border-stage-cream/15 bg-white/[0.03] p-5"
                    : "space-y-2"
              }
            >
              <p className="label-caps">
                {phase === "partner"
                  ? manifest.audioSource === "public_domain_film"
                    ? "Archival film voice (unaltered) — volume up"
                    : "Other actor speaking — volume up"
                  : phase === "need_mic"
                    ? "Your line — microphone needed"
                  : phase === "countdown"
                    ? "Get ready"
                    : phase === "record"
                      ? "Your line — recording"
                      : phase === "uploading"
                        ? "Saving your line…"
                        : "Scene complete"}
              </p>
              {phase === "partner" &&
                manifest.audioSource === "public_domain_film" && (
                  <p className="text-xs text-stage-mist/80">
                    Archival quality may sound rough or terminal — original film track.
                  </p>
                )}
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

          {phase === "need_mic" && (
            <div className="space-y-3 rounded-2xl border border-stage-coral/30 bg-stage-coral/10 p-5">
              <p className="text-sm leading-relaxed text-stage-chalk">
                {error ||
                  "Your line is next. Allow the microphone so we can record your take."}
              </p>
              <p className="text-xs text-stage-mist">
                On iPhone: if you blocked it earlier, Settings → Safari →
                Microphone → Allow for this site.
              </p>
              <button
                type="button"
                className="btn-primary w-full py-3.5 text-base"
                onClick={() => void enableMicAndRecord()}
              >
                Allow microphone &amp; record
              </button>
            </div>
          )}

          {phase !== "need_mic" && (
            <div className="space-y-2">
              <p className="label-caps">Microphone</p>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-stage-mint/80 transition-[width] duration-75"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>
            </div>
          )}

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
