/**
 * Deterministic performance feedback — guidance only.
 * Never judges "acting quality" or emotion authenticity.
 */

export type LineFeedback = {
  dialogueEventId: string;
  sequenceNumber: number;
  expectedText: string;
  transcriptText: string;
  /** 0–1 token overlap score */
  scriptCoverage: number;
  missingWords: string[];
  extraWords: string[];
  durationMs: number | null;
  expectedDurationMs: number;
  durationDeltaMs: number | null;
  observations: string[];
};

export type TakeFeedback = {
  takeId: string;
  provider: string | null;
  sttUsed: boolean;
  generatedAt: string;
  lines: LineFeedback[];
  summary: string[];
  /** Explicitly non-judgmental framing for UI */
  disclaimer: string;
};

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function coverageScore(expected: string, actual: string): {
  score: number;
  missing: string[];
  extra: string[];
} {
  const exp = normalizeWords(expected);
  const act = normalizeWords(actual);
  if (exp.length === 0) {
    return { score: 1, missing: [], extra: act };
  }
  const actSet = new Map<string, number>();
  for (const w of act) actSet.set(w, (actSet.get(w) || 0) + 1);
  const missing: string[] = [];
  let hit = 0;
  for (const w of exp) {
    const n = actSet.get(w) || 0;
    if (n > 0) {
      hit++;
      actSet.set(w, n - 1);
    } else {
      missing.push(w);
    }
  }
  const extra: string[] = [];
  for (const [w, n] of actSet) {
    for (let i = 0; i < n; i++) extra.push(w);
  }
  return { score: hit / exp.length, missing, extra };
}

export function buildLineFeedback(input: {
  dialogueEventId: string;
  sequenceNumber: number;
  expectedText: string;
  transcriptText: string;
  durationMs: number | null;
  expectedDurationMs: number;
}): LineFeedback {
  const { score, missing, extra } = coverageScore(
    input.expectedText,
    input.transcriptText
  );
  const observations: string[] = [];

  if (!input.transcriptText.trim()) {
    observations.push("No speech was detected for this line.");
  } else if (score >= 0.9) {
    observations.push("Most of the script words were detected.");
  } else if (score >= 0.6) {
    observations.push(
      `About ${Math.round(score * 100)}% of the script words were detected.`
    );
  } else {
    observations.push(
      `Only about ${Math.round(score * 100)}% of the script words were detected.`
    );
  }

  if (missing.length && missing.length <= 6) {
    observations.push(`Words not detected: ${missing.join(", ")}.`);
  } else if (missing.length > 6) {
    observations.push(
      `${missing.length} script words were not detected (e.g. ${missing.slice(0, 4).join(", ")}…).`
    );
  }

  let durationDeltaMs: number | null = null;
  if (input.durationMs != null && input.expectedDurationMs > 0) {
    durationDeltaMs = input.durationMs - input.expectedDurationMs;
    const sec = (Math.abs(durationDeltaMs) / 1000).toFixed(1);
    if (Math.abs(durationDeltaMs) > 800) {
      observations.push(
        durationDeltaMs > 0
          ? `This take was about ${sec}s longer than the expected line length.`
          : `This take was about ${sec}s shorter than the expected line length.`
      );
    }
  }

  return {
    dialogueEventId: input.dialogueEventId,
    sequenceNumber: input.sequenceNumber,
    expectedText: input.expectedText,
    transcriptText: input.transcriptText,
    scriptCoverage: score,
    missingWords: missing,
    extraWords: extra,
    durationMs: input.durationMs,
    expectedDurationMs: input.expectedDurationMs,
    durationDeltaMs,
    observations,
  };
}

export function summarizeTake(lines: LineFeedback[]): string[] {
  const summary: string[] = [];
  if (!lines.length) {
    summary.push("No user lines to analyse.");
    return summary;
  }
  const avg =
    lines.reduce((s, l) => s + l.scriptCoverage, 0) / Math.max(1, lines.length);
  summary.push(
    `Average script-word coverage across lines: ${Math.round(avg * 100)}%.`
  );
  const weak = lines.filter((l) => l.scriptCoverage < 0.7);
  if (weak.length) {
    summary.push(
      `${weak.length} line(s) had lower script coverage (check mic clarity or missed cues).`
    );
  }
  const long = lines.filter(
    (l) => l.durationDeltaMs != null && l.durationDeltaMs > 1200
  );
  if (long.length) {
    summary.push(`${long.length} line(s) ran noticeably longer than expected.`);
  }
  return summary;
}

export const FEEDBACK_DISCLAIMER =
  "Guidance only — based on detected words and timing. Not a judgement of acting talent or emotion.";
