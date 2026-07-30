/**
 * Provider-independent voice interfaces (brief §8).
 * Never use ElevenLabs IDs as internal primary keys.
 */

export type SynthesizeRequest = {
  text: string;
  /** Internal voice_profile id (not provider voice id) */
  voiceProfileId: string;
  language?: string;
  style?: string;
  stability?: number;
  similarityBoost?: number;
};

export type SynthesizeResult = {
  provider: string;
  model: string;
  providerRequestId: string;
  providerVoiceId: string;
  assetBytes: Buffer;
  mimeType: string;
  durationMs?: number;
  /** Estimated character cost proxy (characters in input) */
  characterCount: number;
  costUsdEstimate?: number;
};

export type ProviderVoice = {
  providerVoiceId: string;
  name: string;
  labels?: Record<string, string>;
};

export interface VoiceSynthesisProvider {
  readonly name: string;
  synthesize(request: SynthesizeRequest & { providerVoiceId: string }): Promise<SynthesizeResult>;
  listVoices(): Promise<ProviderVoice[]>;
}

/** Offline fallback — never calls third-party AI. */
export class StubVoiceProvider implements VoiceSynthesisProvider {
  readonly name = "stub";

  async synthesize(
    _request: SynthesizeRequest & { providerVoiceId: string }
  ): Promise<SynthesizeResult> {
    throw new Error(
      "StubVoiceProvider: set ELEVENLABS_API_KEY to enable live TTS, or use seed fallback audio."
    );
  }

  async listVoices(): Promise<ProviderVoice[]> {
    return [{ providerVoiceId: "seed-jordan", name: "Seed Partner (Jordan)" }];
  }
}

export function isLiveVoiceConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}
