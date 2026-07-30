import { describe, it, expect } from "vitest";
import { coverageScore, buildLineFeedback, normalizeWords } from "./engine";

describe("feedback engine", () => {
  it("normalizes words", () => {
    expect(normalizeWords("Hello, Maya!")).toEqual(["hello", "maya"]);
  });

  it("scores full match", () => {
    const r = coverageScore("Of course I picked up", "Of course I picked up");
    expect(r.score).toBe(1);
    expect(r.missing).toEqual([]);
  });

  it("detects missing words", () => {
    const r = coverageScore("You leave in six hours", "You leave hours");
    expect(r.score).toBeLessThan(1);
    expect(r.missing).toContain("in");
    expect(r.missing).toContain("six");
  });

  it("builds non-judgmental observations", () => {
    const f = buildLineFeedback({
      dialogueEventId: "d1",
      sequenceNumber: 2,
      expectedText: "hello world",
      transcriptText: "hello",
      durationMs: 3000,
      expectedDurationMs: 1500,
    });
    expect(f.observations.some((o) => /detected/i.test(o))).toBe(true);
    expect(f.observations.join(" ")).not.toMatch(/bad actor|poor actor|no emotion/i);
  });
});
