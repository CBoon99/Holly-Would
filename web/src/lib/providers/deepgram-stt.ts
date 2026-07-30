import type { SpeechRecognitionProvider, TranscriptResult } from "./stt";

/** Deepgram nova STT adapter */
export class DeepgramSttProvider implements SpeechRecognitionProvider {
  readonly name = "deepgram";

  constructor(private apiKey: string) {
    if (!apiKey?.trim()) throw new Error("Deepgram requires apiKey");
  }

  async transcribe(input: {
    bytes: Buffer;
    mimeType: string;
    filename?: string;
    languageCode?: string;
    keyterms?: string[];
  }): Promise<TranscriptResult> {
    const params = new URLSearchParams({
      model: "nova-2",
      smart_format: "true",
      punctuate: "true",
      language: input.languageCode || "en",
    });
    if (input.keyterms?.length) {
      params.set("keywords", input.keyterms.slice(0, 50).join(","));
    }

    const res = await fetch(
      `https://api.deepgram.com/v1/listen?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${this.apiKey}`,
          "Content-Type": input.mimeType || "audio/wav",
        },
        body: new Uint8Array(input.bytes),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Deepgram STT failed (${res.status}): ${body.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            words?: Array<{ word: string; start: number; end: number }>;
          }>;
        }>;
      };
      metadata?: { duration?: number };
    };

    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    return {
      provider: this.name,
      model: "nova-2",
      text: alt?.transcript || "",
      durationSec: data.metadata?.duration,
      words: (alt?.words || []).map((w) => ({
        text: w.word,
        startSec: w.start,
        endSec: w.end,
      })),
    };
  }
}
