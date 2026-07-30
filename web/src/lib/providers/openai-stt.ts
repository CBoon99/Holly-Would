import type { SpeechRecognitionProvider, TranscriptResult } from "./stt";

/** OpenAI Whisper STT adapter */
export class OpenAISttProvider implements SpeechRecognitionProvider {
  readonly name = "openai";

  constructor(private apiKey: string) {
    if (!apiKey?.trim()) throw new Error("OpenAI STT requires apiKey");
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
      type: input.mimeType || "audio/webm",
    });
    form.append("file", blob, input.filename || "audio.webm");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    if (input.languageCode) {
      form.append("language", input.languageCode.slice(0, 2));
    }

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI STT failed (${res.status}): ${body.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      text?: string;
      duration?: number;
      language?: string;
      words?: Array<{ word: string; start: number; end: number }>;
      segments?: Array<{ text: string; start: number; end: number }>;
    };

    const words =
      data.words?.map((w) => ({
        text: w.word,
        startSec: w.start,
        endSec: w.end,
      })) || [];

    return {
      provider: this.name,
      model: "whisper-1",
      text: data.text || "",
      languageCode: data.language,
      durationSec: data.duration,
      words,
    };
  }
}
