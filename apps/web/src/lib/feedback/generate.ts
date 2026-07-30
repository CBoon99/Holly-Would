import { many, one, run } from "../db/client";
import { storage } from "../storage/local";
import { getSttProvider, isSttConfigured } from "../providers/stt-registry";
import {
  buildLineFeedback,
  summarizeTake,
  FEEDBACK_DISCLAIMER,
  type TakeFeedback,
  type LineFeedback,
} from "./engine";
import { nowIso } from "../ids";
import fs from "fs";

/**
 * Build automated feedback for a completed take.
 * Uses STT when configured; otherwise duration-only guidance.
 */
export async function generateTakeFeedback(takeId: string): Promise<TakeFeedback> {
  const take = one<{
    id: string;
    performance_session_id: string;
    status: string;
  }>(`SELECT id, performance_session_id, status FROM takes WHERE id = ?`, [takeId]);
  if (!take) throw new Error("Take not found");

  const session = one<{ client_manifest_json: string | null }>(
    `SELECT client_manifest_json FROM performance_sessions WHERE id = ?`,
    [take.performance_session_id]
  );
  const manifest = session?.client_manifest_json
    ? JSON.parse(session.client_manifest_json)
    : null;

  const segments = many<{
    dialogue_event_id: string;
    recording_asset_id: string | null;
    sequence_number: number;
    duration_ms: number | null;
  }>(
    `SELECT dialogue_event_id, recording_asset_id, sequence_number, duration_ms
     FROM take_segments WHERE take_id = ? ORDER BY sequence_number ASC`,
    [takeId]
  );

  const sttOn = isSttConfigured();
  let providerName: string | null = null;
  const lines: LineFeedback[] = [];

  for (const seg of segments) {
    const lineMeta = manifest?.lines?.find(
      (l: { dialogueEventId: string }) => l.dialogueEventId === seg.dialogue_event_id
    );
    const expectedText: string = lineMeta?.text || "";
    const expectedDurationMs: number = lineMeta?.expectedDurationMs || 2000;
    let transcriptText = "";

    if (sttOn && seg.recording_asset_id) {
      const asset = one<{ object_key: string; mime_type: string }>(
        `SELECT object_key, mime_type FROM media_assets WHERE id = ?`,
        [seg.recording_asset_id]
      );
      if (asset && fs.existsSync(storage.resolve(asset.object_key))) {
        try {
          const bytes = storage.read(asset.object_key);
          const stt = getSttProvider();
          const keyterms = expectedText
            .split(/\s+/)
            .filter((w: string) => w.length > 2)
            .slice(0, 40);
          const result = await stt.transcribe({
            bytes,
            mimeType: asset.mime_type,
            filename: "segment.wav",
            languageCode: "en",
            keyterms,
          });
          transcriptText = result.text;
          providerName = result.provider;
        } catch (e) {
          // STT permission may be missing on restricted keys — continue duration-only
          transcriptText = "";
          if (!providerName) providerName = "stt_failed";
          console.warn(
            "STT failed for segment",
            seg.sequence_number,
            e instanceof Error ? e.message : e
          );
        }
      }
    }

    // Duration-only if no transcript
    if (!transcriptText && !sttOn) {
      // empty transcript triggers duration observations only
    }

    lines.push(
      buildLineFeedback({
        dialogueEventId: seg.dialogue_event_id,
        sequenceNumber: seg.sequence_number,
        expectedText,
        transcriptText,
        durationMs: seg.duration_ms,
        expectedDurationMs,
      })
    );
  }

  // If STT completely unavailable, add duration-focused notes
  if (!sttOn || providerName === "stt_failed") {
    for (const l of lines) {
      if (!l.transcriptText) {
        l.observations.push(
          "Transcript unavailable — showing timing guidance only. Enable STT permissions on your API key for script accuracy."
        );
      }
    }
  }

  const feedback: TakeFeedback = {
    takeId,
    provider: providerName,
    sttUsed: Boolean(providerName && providerName !== "stt_failed"),
    generatedAt: nowIso(),
    lines,
    summary: summarizeTake(lines),
    disclaimer: FEEDBACK_DISCLAIMER,
  };

  run(`UPDATE takes SET score_summary_json = ? WHERE id = ?`, [
    JSON.stringify(feedback),
    takeId,
  ]);

  return feedback;
}
