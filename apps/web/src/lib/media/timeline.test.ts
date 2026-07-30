import { describe, it, expect } from "vitest";

/** Timeline cursor math used by mix — pure unit test */
function buildCursor(
  lines: Array<{ durationMs: number; pauseAfterMs: number }>
): number {
  let cursor = 0;
  for (const l of lines) {
    cursor += l.durationMs + l.pauseAfterMs;
  }
  return cursor;
}

describe("timeline math", () => {
  it("sums durations and pauses", () => {
    expect(
      buildCursor([
        { durationMs: 1000, pauseAfterMs: 400 },
        { durationMs: 2000, pauseAfterMs: 300 },
      ])
    ).toBe(3700);
  });
});
