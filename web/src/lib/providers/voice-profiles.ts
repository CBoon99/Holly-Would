import { many, one, run } from "../db/client";
import { id, nowIso } from "../ids";

export type VoiceProfile = {
  id: string;
  provider: string;
  providerVoiceId: string;
  displayName: string;
  description: string | null;
  language: string;
  accent: string | null;
  styleTagsJson: string;
  commercialUseAllowed: number;
  cloningAllowed: number;
  status: string;
};

/**
 * Resolve internal voice profile → provider voice id.
 * Never expose provider IDs as our PKs.
 */
export function getVoiceProfile(profileId: string): VoiceProfile | undefined {
  return one<VoiceProfile>(
    `SELECT id, provider, provider_voice_id as providerVoiceId, display_name as displayName,
            description, language, accent, style_tags_json as styleTagsJson,
            commercial_use_allowed as commercialUseAllowed, cloning_allowed as cloningAllowed,
            status
     FROM voice_profiles WHERE id = ?`,
    [profileId]
  );
}

export function listVoiceProfiles(provider?: string): VoiceProfile[] {
  if (provider) {
    return many<VoiceProfile>(
      `SELECT id, provider, provider_voice_id as providerVoiceId, display_name as displayName,
              description, language, accent, style_tags_json as styleTagsJson,
              commercial_use_allowed as commercialUseAllowed, cloning_allowed as cloningAllowed,
              status
       FROM voice_profiles WHERE provider = ? AND status = 'active'`,
      [provider]
    );
  }
  return many<VoiceProfile>(
    `SELECT id, provider, provider_voice_id as providerVoiceId, display_name as displayName,
            description, language, accent, style_tags_json as styleTagsJson,
            commercial_use_allowed as commercialUseAllowed, cloning_allowed as cloningAllowed,
            status
     FROM voice_profiles WHERE status = 'active'`
  );
}

export function upsertVoiceProfile(input: {
  provider: string;
  providerVoiceId: string;
  displayName: string;
  description?: string;
  language?: string;
  accent?: string;
  styleTags?: string[];
}): string {
  const existing = one<{ id: string }>(
    `SELECT id FROM voice_profiles WHERE provider = ? AND provider_voice_id = ?`,
    [input.provider, input.providerVoiceId]
  );
  if (existing) {
    run(
      `UPDATE voice_profiles SET display_name = ?, description = ?, status = 'active'
       WHERE id = ?`,
      [input.displayName, input.description || null, existing.id]
    );
    return existing.id;
  }
  const profileId = id("vp");
  run(
    `INSERT INTO voice_profiles
      (id, provider, provider_voice_id, display_name, description, language, accent,
       style_tags_json, permitted_uses_json, licence_type, commercial_use_allowed,
       cloning_allowed, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '["scene_partner"]', 'provider_library', 0, 0, 'active', ?)`,
    [
      profileId,
      input.provider,
      input.providerVoiceId,
      input.displayName,
      input.description || null,
      input.language || "en",
      input.accent || null,
      JSON.stringify(input.styleTags || []),
      nowIso(),
    ]
  );
  return profileId;
}

export function recordGeneration(input: {
  provider: string;
  model: string;
  providerRequestId: string;
  voiceProfileId: string;
  inputText: string;
  outputAssetId: string;
  characterCount: number;
  costUsdEstimate?: number;
  approvalState?: string;
}): string {
  const genId = id("gen");
  run(
    `INSERT INTO generation_records
      (id, provider, model, provider_request_id, voice_profile_id, input_text,
       text_checksum, output_asset_id, character_count, cost_usd_estimate,
       approval_state, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      genId,
      input.provider,
      input.model,
      input.providerRequestId,
      input.voiceProfileId,
      input.inputText,
      simpleChecksum(input.inputText),
      input.outputAssetId,
      input.characterCount,
      input.costUsdEstimate ?? null,
      input.approvalState || "approved_seed",
      nowIso(),
    ]
  );
  return genId;
}

function simpleChecksum(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16)}`;
}
