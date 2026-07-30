import { describe, it, expect } from "vitest";
import { ElevenLabsVoiceProvider } from "./elevenlabs";

describe("ElevenLabsVoiceProvider", () => {
  it("rejects empty api key", () => {
    expect(() => new ElevenLabsVoiceProvider("")).toThrow(/apiKey/);
  });

  it("constructs with key", () => {
    const p = new ElevenLabsVoiceProvider("test-key");
    expect(p.name).toBe("elevenlabs");
  });
});
