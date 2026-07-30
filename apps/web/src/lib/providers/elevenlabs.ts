import { randomUUID } from "crypto";
import type {
  ProviderVoice,
  SynthesizeRequest,
  SynthesizeResult,
  VoiceSynthesisProvider,
} from "./voice";

const DEFAULT_MODEL = "eleven_multilingual_v2";
const API_BASE = "https://api.elevenlabs.io/v1";

/**
 * ElevenLabs adapter — only place that knows ElevenLabs HTTP shapes.
 * Internal code must use VoiceSynthesisProvider, never this client directly outside adapters/.
 */
export class ElevenLabsVoiceProvider implements VoiceSynthesisProvider {
  readonly name = "elevenlabs";

  constructor(
    private apiKey: string,
    private modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL
  ) {
    if (!apiKey?.trim()) {
      throw new Error("ElevenLabsVoiceProvider requires apiKey");
    }
  }

  async listVoices(): Promise<ProviderVoice[]> {
    const res = await fetch(`${API_BASE}/voices`, {
      headers: { "xi-api-key": this.apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ElevenLabs listVoices failed (${res.status}): ${body.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }>;
    };
    return (data.voices || []).map((v) => ({
      providerVoiceId: v.voice_id,
      name: v.name,
      labels: v.labels,
    }));
  }

  async synthesize(
    request: SynthesizeRequest & { providerVoiceId: string }
  ): Promise<SynthesizeResult> {
    const providerRequestId = randomUUID();
    const url = `${API_BASE}/text-to-speech/${encodeURIComponent(request.providerVoiceId)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: request.text,
        model_id: this.modelId,
        voice_settings: {
          stability: request.stability ?? 0.45,
          similarity_boost: request.similarityBoost ?? 0.75,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `ElevenLabs synthesize failed (${res.status}): ${body.slice(0, 500)}`
      );
    }

    const ab = await res.arrayBuffer();
    const assetBytes = Buffer.from(ab);
    const characterCount = request.text.length;
    // Rough public list price proxy (~$0.30 / 1k chars for some tiers) — for budgeting only
    const costUsdEstimate = (characterCount / 1000) * 0.3;

    return {
      provider: this.name,
      model: this.modelId,
      providerRequestId,
      providerVoiceId: request.providerVoiceId,
      assetBytes,
      mimeType: "audio/mpeg",
      characterCount,
      costUsdEstimate,
    };
  }
}
