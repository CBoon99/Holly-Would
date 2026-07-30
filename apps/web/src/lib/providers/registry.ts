import {
  StubVoiceProvider,
  type VoiceSynthesisProvider,
  isLiveVoiceConfigured,
} from "./voice";
import { ElevenLabsVoiceProvider } from "./elevenlabs";

let _provider: VoiceSynthesisProvider | null = null;

/**
 * Resolve voice provider from env. Always returns an adapter — never raw SDK.
 */
export function getVoiceProvider(): VoiceSynthesisProvider {
  if (_provider) return _provider;

  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (key) {
    _provider = new ElevenLabsVoiceProvider(key);
  } else {
    _provider = new StubVoiceProvider();
  }
  return _provider;
}

/** Test/seed helper to force re-resolve after env change. */
export function resetVoiceProvider(): void {
  _provider = null;
}

export { isLiveVoiceConfigured };
