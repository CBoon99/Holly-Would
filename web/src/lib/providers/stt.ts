export type TranscriptWord = {
  text: string;
  startSec?: number;
  endSec?: number;
};

export type TranscriptResult = {
  provider: string;
  model: string;
  text: string;
  words: TranscriptWord[];
  languageCode?: string;
  durationSec?: number;
};

export interface SpeechRecognitionProvider {
  readonly name: string;
  transcribe(input: {
    bytes: Buffer;
    mimeType: string;
    filename?: string;
    languageCode?: string;
    keyterms?: string[];
  }): Promise<TranscriptResult>;
}

export class StubSttProvider implements SpeechRecognitionProvider {
  readonly name = "stub";
  async transcribe(): Promise<TranscriptResult> {
    throw new Error("No STT provider configured");
  }
}
