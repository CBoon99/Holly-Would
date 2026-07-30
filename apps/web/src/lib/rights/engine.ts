import { one } from "../db/client";

export type RightsDecision = {
  allowed: boolean;
  reason: string;
  status: string;
  canStream: boolean;
  canDisplayScript: boolean;
  canTransformAudio: boolean;
  canRecordUser: boolean;
  canDownload: boolean;
  canShare: boolean;
  canMonetise: boolean;
};

type RightsRow = {
  status: string;
  basis: string | null;
  can_stream: number;
  can_display_script: number;
  can_transform_audio: number;
  can_record_user: number;
  can_download: number;
  can_share: number;
  can_monetise: number;
};

/**
 * Deterministic rights engine. Frontend must not invent permissions.
 */
export function getSceneRights(sceneId: string): RightsDecision {
  const row = one<RightsRow>(
    `SELECT status, basis, can_stream, can_display_script, can_transform_audio,
            can_record_user, can_download, can_share, can_monetise
     FROM rights_assets
     WHERE entity_type = ? AND entity_id = ?`,
    ["scene", sceneId]
  );

  if (!row) {
    return {
      allowed: false,
      reason: "No rights decision recorded",
      status: "missing",
      canStream: false,
      canDisplayScript: false,
      canTransformAudio: false,
      canRecordUser: false,
      canDownload: false,
      canShare: false,
      canMonetise: false,
    };
  }

  const approved = row.status === "approved" || row.status === "approved_audio_only";
  if (!approved) {
    return {
      allowed: false,
      reason: `Rights status is ${row.status}`,
      status: row.status,
      canStream: false,
      canDisplayScript: false,
      canTransformAudio: false,
      canRecordUser: false,
      canDownload: false,
      canShare: false,
      canMonetise: false,
    };
  }

  return {
    allowed: !!row.can_stream,
    reason: row.basis || "approved",
    status: row.status,
    canStream: !!row.can_stream,
    canDisplayScript: !!row.can_display_script,
    canTransformAudio: !!row.can_transform_audio,
    canRecordUser: !!row.can_record_user,
    canDownload: !!row.can_download,
    canShare: !!row.can_share,
    canMonetise: !!row.can_monetise,
  };
}

export function assertCanPerform(sceneId: string): RightsDecision {
  const d = getSceneRights(sceneId);
  if (!d.allowed || !d.canRecordUser || !d.canDisplayScript) {
    throw new Error(`Performance not permitted: ${d.reason}`);
  }
  return d;
}
