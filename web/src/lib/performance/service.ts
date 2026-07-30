import { many, one, run } from "../db/client";
import { id, nowIso } from "../ids";
import { buildClientManifest } from "../scene/manifest";
import { assertCanPerform } from "../rights/engine";
import { storage } from "../storage/local";
import { mixTimeline, probeDurationMs } from "../media/ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";

type TakeRow = {
  id: string;
  performance_session_id: string;
  take_number: number;
  status: string;
  mix_asset_id: string | null;
};

type SegmentRow = {
  id: string;
  take_id: string;
  dialogue_event_id: string;
  recording_asset_id: string | null;
  sequence_number: number;
  status: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  scene_version_id: string;
  selected_character_id: string;
  status: string;
  client_manifest_json: string | null;
};

export function createPerformanceSession(input: {
  userId: string;
  sceneVersionId: string;
  selectedCharacterId: string;
}) {
  const manifest = buildClientManifest(
    input.sceneVersionId,
    input.selectedCharacterId
  );
  assertCanPerform(manifest.sceneId);

  const sessionId = id("ps");
  const createdAt = nowIso();
  run(
    `INSERT INTO performance_sessions
      (id, user_id, scene_version_id, selected_character_id, mode, status, client_manifest_json, started_at, created_at)
     VALUES (?, ?, ?, ?, 'line_by_line', 'ready', ?, ?, ?)`,
    [
      sessionId,
      input.userId,
      input.sceneVersionId,
      input.selectedCharacterId,
      JSON.stringify(manifest),
      createdAt,
      createdAt,
    ]
  );

  const takeId = id("take");
  run(
    `INSERT INTO takes (id, performance_session_id, take_number, status, created_at)
     VALUES (?, ?, 1, 'recording', ?)`,
    [takeId, sessionId, createdAt]
  );

  for (const line of manifest.lines.filter((l) => l.isUser)) {
    run(
      `INSERT INTO take_segments
        (id, take_id, dialogue_event_id, sequence_number, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id("seg"), takeId, line.dialogueEventId, line.sequenceNumber, createdAt]
    );
  }

  return { sessionId, takeId, manifest };
}

export function getSession(sessionId: string) {
  const session = one<SessionRow>(
    `SELECT id, user_id, scene_version_id, selected_character_id, status, client_manifest_json
     FROM performance_sessions WHERE id = ?`,
    [sessionId]
  );
  if (!session) return null;
  const takeList = many<TakeRow>(
    `SELECT id, performance_session_id, take_number, status, mix_asset_id
     FROM takes WHERE performance_session_id = ? ORDER BY take_number DESC`,
    [sessionId]
  );
  const current = takeList[0];
  const segments = current
    ? many<SegmentRow>(
        `SELECT id, take_id, dialogue_event_id, recording_asset_id, sequence_number, status
         FROM take_segments WHERE take_id = ?`,
        [current.id]
      )
    : [];
  return {
    session: {
      id: session.id,
      userId: session.user_id,
      sceneVersionId: session.scene_version_id,
      selectedCharacterId: session.selected_character_id,
      status: session.status,
    },
    manifest: session.client_manifest_json
      ? JSON.parse(session.client_manifest_json)
      : null,
    takes: takeList.map((t) => ({
      id: t.id,
      takeNumber: t.take_number,
      status: t.status,
      mixAssetId: t.mix_asset_id,
    })),
    currentTake: current
      ? {
          id: current.id,
          takeNumber: current.take_number,
          status: current.status,
          mixAssetId: current.mix_asset_id,
        }
      : null,
    segments: segments.map((s) => ({
      id: s.id,
      dialogueEventId: s.dialogue_event_id,
      recordingAssetId: s.recording_asset_id,
      sequenceNumber: s.sequence_number,
      status: s.status,
    })),
  };
}

export async function uploadSegment(input: {
  takeId: string;
  dialogueEventId: string;
  bytes: Buffer;
  mimeType: string;
}) {
  const take = one<TakeRow>(
    `SELECT id, performance_session_id, take_number, status, mix_asset_id FROM takes WHERE id = ?`,
    [input.takeId]
  );
  if (!take) throw new Error("Take not found");
  if (take.status !== "recording" && take.status !== "processing") {
    throw new Error(`Take not accepting uploads: ${take.status}`);
  }

  const segments = many<SegmentRow>(
    `SELECT id, take_id, dialogue_event_id, recording_asset_id, sequence_number, status
     FROM take_segments WHERE take_id = ?`,
    [input.takeId]
  );
  const segment = segments.find((s) => s.dialogue_event_id === input.dialogueEventId);
  if (!segment) throw new Error("Segment not found for this dialogue line");

  const assetId = id("asset");
  const ext = input.mimeType.includes("webm")
    ? "webm"
    : input.mimeType.includes("mp4")
      ? "m4a"
      : "webm";
  const objectKey = storage.masterKey([
    "takes",
    input.takeId,
    "segments",
    `${segment.sequence_number}_${assetId}.${ext}`,
  ]);

  const tmp = path.join(os.tmpdir(), `${assetId}.${ext}`);
  fs.writeFileSync(tmp, input.bytes);
  let durationMs = 0;
  try {
    durationMs = probeDurationMs(tmp);
  } catch {
    durationMs = 0;
  }

  const stored = await storage.putBytes(objectKey, input.bytes);
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }

  run(
    `INSERT INTO media_assets
      (id, owner_type, owner_id, asset_type, storage_provider, bucket, object_key,
       mime_type, size_bytes, checksum_sha256, duration_ms, status, created_at)
     VALUES (?, 'take_segment', ?, 'user_performance', 'local', 'private', ?, ?, ?, ?, ?, 'ready', ?)`,
    [
      assetId,
      segment.id,
      stored.objectKey,
      input.mimeType,
      stored.sizeBytes,
      stored.checksumSha256,
      durationMs,
      nowIso(),
    ]
  );

  run(
    `UPDATE take_segments SET recording_asset_id = ?, status = 'uploaded', duration_ms = ? WHERE id = ?`,
    [assetId, durationMs, segment.id]
  );

  return { segmentId: segment.id, assetId, durationMs };
}

export async function completeTakeAndMix(takeId: string) {
  const take = one<TakeRow>(
    `SELECT id, performance_session_id, take_number, status, mix_asset_id FROM takes WHERE id = ?`,
    [takeId]
  );
  if (!take) throw new Error("Take not found");

  const segments = many<SegmentRow>(
    `SELECT id, take_id, dialogue_event_id, recording_asset_id, sequence_number, status
     FROM take_segments WHERE take_id = ? ORDER BY sequence_number ASC`,
    [takeId]
  );

  const missing = segments.filter((s) => !s.recording_asset_id);
  if (missing.length) {
    throw new Error(
      `Missing recordings for ${missing.length} line(s). Record all user lines first.`
    );
  }

  const session = one<SessionRow>(
    `SELECT id, user_id, scene_version_id, selected_character_id, status, client_manifest_json
     FROM performance_sessions WHERE id = ?`,
    [take.performance_session_id]
  );
  if (!session) throw new Error("Session not found");

  const manifest = session.client_manifest_json
    ? JSON.parse(session.client_manifest_json)
    : null;
  if (!manifest) throw new Error("Missing manifest");

  const jobId = id("job");
  const idem = `mix:${takeId}`;
  const existing = one<{ id: string; status: string; attempt: number }>(
    `SELECT id, status, attempt FROM job_records WHERE idempotency_key = ?`,
    [idem]
  );
  if (existing && existing.status === "completed") {
    return {
      jobId: existing.id,
      takeId,
      status: "completed",
      mixAssetId: take.mix_asset_id,
    };
  }

  const t = nowIso();
  if (!existing) {
    run(
      `INSERT INTO job_records
        (id, job_type, entity_id, status, attempt, idempotency_key, payload_json, created_at, updated_at)
       VALUES (?, 'audio.mix', ?, 'running', 1, ?, ?, ?, ?)`,
      [jobId, takeId, idem, JSON.stringify({ takeId }), t, t]
    );
  } else {
    run(
      `UPDATE job_records SET status = 'running', attempt = ?, updated_at = ? WHERE id = ?`,
      [existing.attempt + 1, t, existing.id]
    );
  }

  run(`UPDATE takes SET status = 'processing' WHERE id = ?`, [takeId]);

  try {
    const mixAssetId = await runMix(takeId, manifest, segments);

    // Automated feedback (STT when available; timing always)
    let feedback = null;
    try {
      const { generateTakeFeedback } = await import("../feedback/generate");
      feedback = await generateTakeFeedback(takeId);
    } catch (fe) {
      console.warn(
        "Feedback generation failed",
        fe instanceof Error ? fe.message : fe
      );
    }

    run(
      `UPDATE takes SET status = 'completed', mix_asset_id = ?, completed_at = ?, processing_error = NULL WHERE id = ?`,
      [mixAssetId, nowIso(), takeId]
    );
    run(
      `UPDATE performance_sessions SET status = 'review_ready', completed_at = ? WHERE id = ?`,
      [nowIso(), session.id]
    );
    run(
      `UPDATE job_records SET status = 'completed', updated_at = ? WHERE idempotency_key = ?`,
      [nowIso(), idem]
    );
    return {
      jobId: existing?.id || jobId,
      takeId,
      status: "completed",
      mixAssetId,
      feedback,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    run(
      `UPDATE takes SET status = 'failed', processing_error = ? WHERE id = ?`,
      [msg, takeId]
    );
    run(
      `UPDATE job_records SET status = 'failed', error = ?, updated_at = ? WHERE idempotency_key = ?`,
      [msg, nowIso(), idem]
    );
    throw e;
  }
}

async function runMix(
  takeId: string,
  manifest: {
    lines: Array<{
      dialogueEventId: string;
      isUser: boolean;
      expectedDurationMs: number;
      pauseAfterMs: number;
    }>;
  },
  segments: SegmentRow[]
): Promise<string> {
  const tracks: { path: string; startMs: number; gainDb?: number }[] = [];
  let cursor = 0;

  for (const line of manifest.lines) {
    if (line.isUser) {
      const seg = segments.find((s) => s.dialogue_event_id === line.dialogueEventId);
      if (!seg?.recording_asset_id) continue;
      const asset = one<{ object_key: string; duration_ms: number | null }>(
        `SELECT object_key, duration_ms FROM media_assets WHERE id = ?`,
        [seg.recording_asset_id]
      );
      if (!asset) continue;
      tracks.push({
        path: storage.resolve(asset.object_key),
        startMs: cursor,
        gainDb: 0,
      });
      cursor += asset.duration_ms || line.expectedDurationMs;
    } else {
      const de = one<{ asset_id: string | null }>(
        `SELECT asset_id FROM dialogue_events WHERE id = ?`,
        [line.dialogueEventId]
      );
      if (de?.asset_id) {
        const asset = one<{ object_key: string; duration_ms: number | null }>(
          `SELECT object_key, duration_ms FROM media_assets WHERE id = ?`,
          [de.asset_id]
        );
        if (asset) {
          tracks.push({
            path: storage.resolve(asset.object_key),
            startMs: cursor,
            gainDb: -1,
          });
          cursor += asset.duration_ms || line.expectedDurationMs;
        }
      } else {
        cursor += line.expectedDurationMs;
      }
    }
    cursor += line.pauseAfterMs || 300;
  }

  const outAssetId = id("mix");
  const outKey = storage.derivativeKey(["mixes", takeId, `${outAssetId}.m4a`]);
  const tmpOut = path.join(os.tmpdir(), `${outAssetId}.m4a`);

  await mixTimeline(tracks, tmpOut, cursor + 500);
  const stored = await storage.putFile(outKey, tmpOut);
  try {
    fs.unlinkSync(tmpOut);
  } catch {
    /* ignore */
  }

  const durationMs = probeDurationMs(storage.resolve(stored.objectKey));
  run(
    `INSERT INTO media_assets
      (id, owner_type, owner_id, asset_type, storage_provider, bucket, object_key,
       mime_type, size_bytes, checksum_sha256, duration_ms, status, metadata_json, created_at)
     VALUES (?, 'take', ?, 'final_mix', 'local', 'private', ?, 'audio/mp4', ?, ?, ?, 'ready', ?, ?)`,
    [
      outAssetId,
      takeId,
      stored.objectKey,
      stored.sizeBytes,
      stored.checksumSha256,
      durationMs,
      JSON.stringify({
        scene_take_id: takeId,
        track_count: tracks.length,
        render_engine: "ffmpeg",
        total_timeline_ms: cursor,
      }),
      nowIso(),
    ]
  );

  return outAssetId;
}

export function newTake(sessionId: string) {
  const session = one<SessionRow>(
    `SELECT id, user_id, scene_version_id, selected_character_id, status, client_manifest_json
     FROM performance_sessions WHERE id = ?`,
    [sessionId]
  );
  if (!session) throw new Error("Session not found");

  const prev = many<{ take_number: number }>(
    `SELECT take_number FROM takes WHERE performance_session_id = ?`,
    [sessionId]
  );
  const takeNumber = prev.length + 1;
  const takeId = id("take");
  const createdAt = nowIso();
  run(
    `INSERT INTO takes (id, performance_session_id, take_number, status, created_at)
     VALUES (?, ?, ?, 'recording', ?)`,
    [takeId, sessionId, takeNumber, createdAt]
  );

  const manifest = session.client_manifest_json
    ? JSON.parse(session.client_manifest_json)
    : { lines: [] as Array<{ isUser: boolean; dialogueEventId: string; sequenceNumber: number }> };

  for (const line of manifest.lines.filter((l: { isUser: boolean }) => l.isUser)) {
    run(
      `INSERT INTO take_segments
        (id, take_id, dialogue_event_id, sequence_number, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id("seg"), takeId, line.dialogueEventId, line.sequenceNumber, createdAt]
    );
  }

  run(`UPDATE performance_sessions SET status = 'ready' WHERE id = ?`, [sessionId]);

  return { takeId, takeNumber };
}

export function deleteTake(takeId: string, userId: string) {
  const take = one<TakeRow>(
    `SELECT id, performance_session_id, take_number, status, mix_asset_id FROM takes WHERE id = ?`,
    [takeId]
  );
  if (!take) throw new Error("Take not found");
  const session = one<{ user_id: string }>(
    `SELECT user_id FROM performance_sessions WHERE id = ?`,
    [take.performance_session_id]
  );
  if (!session || session.user_id !== userId) {
    throw new Error("Not authorised");
  }
  run(
    `UPDATE takes SET status = 'deleted', completed_at = ? WHERE id = ?`,
    [nowIso(), takeId]
  );
  return { ok: true };
}

export function listUserTakes(userId: string) {
  const sessions = many<{ id: string; scene_version_id: string }>(
    `SELECT id, scene_version_id FROM performance_sessions WHERE user_id = ?`,
    [userId]
  );
  const result: Array<{
    takeId: string;
    sessionId: string;
    takeNumber: number;
    status: string;
    mixAssetId: string | null;
    createdAt: string;
    sceneVersionId: string;
  }> = [];

  for (const s of sessions) {
    const takeList = many<{
      id: string;
      take_number: number;
      status: string;
      mix_asset_id: string | null;
      created_at: string;
    }>(
      `SELECT id, take_number, status, mix_asset_id, created_at FROM takes
       WHERE performance_session_id = ? AND status != 'deleted'`,
      [s.id]
    );
    for (const t of takeList) {
      result.push({
        takeId: t.id,
        sessionId: s.id,
        takeNumber: t.take_number,
        status: t.status,
        mixAssetId: t.mix_asset_id,
        createdAt: t.created_at,
        sceneVersionId: s.scene_version_id,
      });
    }
  }
  return result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
