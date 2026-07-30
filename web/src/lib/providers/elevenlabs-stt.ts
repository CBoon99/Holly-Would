import type { SpeechRecognitionProvider, TranscriptResult } from "./stt";

/**
 * ElevenLabs Scribe STT adapter.
 * POST /v1/speech-to-text  model_id=scribe_v2
 */
export class ElevenLabsSttProvider implements SpeechRecognitionProvider {
  readonly name = "elevenlabs";

  constructor(
    private apiKey: string,
    private modelId = process.env.ELEVENLABS_STT_MODEL || "scribe_v2"
  ) {
    if (!apiKey?.trim()) throw new Error("ElevenLabs STT requires apiKey");
  }

  async transcribe(input: {
    bytes: Buffer;
    mimeType: string;
    filename?: string;
    languageCode?: string;
    keyterms?: string[];
  }): Promise<TranscriptResult> {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(input.bytes)], {
      type: input.mimeType || "audio/wav",
    });
    form.append("file", blob, input.filename || "audio.wav");
    form.append("model_id", this.modelId);
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "false");
    if (input.languageCode) form.append("language_code", input.languageCode);
    if (input.keyterms?.length) {
      for (const k of input.keyterms.slice(0, 100)) {
        form.append("keyterms", k);
      }
    }

    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": this.apiKey },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `ElevenLabs STT failed (${res.status}): ${body.slice(0, 400)}`
      );
    }

    const data = (await res.json()) as {
      text?: string;
      language_code?: string;
      audio_duration_secs?: number;
      words?: Array<{
        text: string;
        start?: number | null;
        end?: number | null;
        type?: string;
      }>;
      transcripts?: Array<{ text?: string; words?: unknown[] }>;
    };

    // Single-channel shape
    if (data.text !== undefined) {
      return {
        provider: this.name,
        model: this.modelId,
        text: data.text,
        languageCode: data.language_code,
        durationSec: data.audio_duration_secs,
        words: (data.words || [])
          .filter((w) => w.type === "word" || !w.type)
          .map((w) => ({
            text: w.text,
            startSec: w.start ?? undefined,
            endSec: w.end ?? undefined,
          })),
      };
    }

    // Multichannel fallback
    const first = data.transcripts?.[0];
    return {
      provider: this.name,
      model: this.modelId,
      text: first?.text || "",
      words: [],
    };
  }
}
