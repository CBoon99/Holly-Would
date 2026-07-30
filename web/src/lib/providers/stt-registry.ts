import type { SpeechRecognitionProvider } from "./stt";
import { StubSttProvider } from "./stt";
import { ElevenLabsSttProvider } from "./elevenlabs-stt";
import { DeepgramSttProvider } from "./deepgram-stt";
import { OpenAISttProvider } from "./openai-stt";

/**
 * Prefer chain: DEEPGRAM → OPENAI → ELEVENLABS STT → stub.
 * Deepgram first for reliable script feedback on restricted EL keys.
 */
export function getSttProvider(): SpeechRecognitionProvider {
  const prefer = (process.env.STT_PROVIDER || "auto").toLowerCase();

  if (prefer === "deepgram" && process.env.DEEPGRAM_API_KEY?.trim()) {
    return new DeepgramSttProvider(process.env.DEEPGRAM_API_KEY);
  }
  if (prefer === "openai" && process.env.OPENAI_API_KEY?.trim()) {
    return new OpenAISttProvider(process.env.OPENAI_API_KEY);
  }
  if (prefer === "elevenlabs" && process.env.ELEVENLABS_API_KEY?.trim()) {
    return new ElevenLabsSttProvider(process.env.ELEVENLABS_API_KEY);
  }

  // auto
  if (process.env.DEEPGRAM_API_KEY?.trim()) {
    return new DeepgramSttProvider(process.env.DEEPGRAM_API_KEY);
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    return new OpenAISttProvider(process.env.OPENAI_API_KEY);
  }
  if (process.env.ELEVENLABS_API_KEY?.trim()) {
    return new ElevenLabsSttProvider(process.env.ELEVENLABS_API_KEY);
  }
  return new StubSttProvider();
}

export function resetSttProvider(): void {
  // providers are constructed per call in getSttProvider — no cache needed
}

export function isSttConfigured(): boolean {
  return Boolean(
    process.env.DEEPGRAM_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.ELEVENLABS_API_KEY?.trim()
  );
}

export function sttProviderName(): string {
  try {
    return getSttProvider().name;
  } catch {
    return "none";
  }
}
