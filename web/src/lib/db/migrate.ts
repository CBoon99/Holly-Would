import { getSqlite } from "./client";

/** Idempotent schema bootstrap for V1 (SQLite). */
export function migrate(): void {
  const db = getSqlite();
  db.exec(`
    CREATE TABLE IF NOT EXISTS films (
      id TEXT PRIMARY KEY,
      canonical_title TEXT NOT NULL,
      release_year INTEGER,
      rights_classification TEXT NOT NULL,
      synopsis TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS editions (
      id TEXT PRIMARY KEY,
      film_id TEXT NOT NULL REFERENCES films(id),
      edition_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      licence_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      edition_id TEXT NOT NULL REFERENCES editions(id),
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      duration_ms INTEGER NOT NULL,
      genre TEXT,
      difficulty TEXT,
      content_warnings_json TEXT NOT NULL DEFAULT '[]',
      publication_status TEXT NOT NULL DEFAULT 'draft',
      situation_before TEXT,
      relationship TEXT,
      director_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scene_versions (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES scenes(id),
      version INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES scenes(id),
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      playable INTEGER NOT NULL DEFAULT 0,
      objective TEXT,
      obstacles TEXT,
      emotional_start TEXT,
      age_range TEXT,
      accent TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      voice_profile_id TEXT
    );

    CREATE TABLE IF NOT EXISTS dialogue_events (
      id TEXT PRIMARY KEY,
      scene_version_id TEXT NOT NULL REFERENCES scene_versions(id),
      character_id TEXT NOT NULL REFERENCES characters(id),
      sequence_number INTEGER NOT NULL,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      canonical_text TEXT NOT NULL,
      display_text TEXT NOT NULL,
      emotion_tag TEXT,
      expected_pause_after_ms INTEGER NOT NULL DEFAULT 400,
      asset_id TEXT
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'local',
      bucket TEXT NOT NULL DEFAULT 'private',
      object_key TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER,
      checksum_sha256 TEXT,
      duration_ms INTEGER,
      sample_rate INTEGER,
      channels INTEGER,
      codec TEXT,
      status TEXT NOT NULL DEFAULT 'ready',
      source_asset_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rights_assets (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      jurisdiction TEXT NOT NULL DEFAULT '*',
      status TEXT NOT NULL,
      basis TEXT,
      legal_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      valid_from TEXT,
      valid_until TEXT,
      can_stream INTEGER NOT NULL DEFAULT 0,
      can_display_script INTEGER NOT NULL DEFAULT 0,
      can_transform_audio INTEGER NOT NULL DEFAULT 0,
      can_record_user INTEGER NOT NULL DEFAULT 0,
      can_download INTEGER NOT NULL DEFAULT 0,
      can_share INTEGER NOT NULL DEFAULT 0,
      can_monetise INTEGER NOT NULL DEFAULT 0,
      territories_json TEXT NOT NULL DEFAULT '["*"]'
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS performance_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scene_version_id TEXT NOT NULL REFERENCES scene_versions(id),
      selected_character_id TEXT NOT NULL REFERENCES characters(id),
      mode TEXT NOT NULL DEFAULT 'line_by_line',
      status TEXT NOT NULL DEFAULT 'created',
      client_manifest_json TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS takes (
      id TEXT PRIMARY KEY,
      performance_session_id TEXT NOT NULL REFERENCES performance_sessions(id),
      take_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'recording',
      mix_asset_id TEXT,
      score_summary_json TEXT,
      processing_error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS take_segments (
      id TEXT PRIMARY KEY,
      take_id TEXT NOT NULL REFERENCES takes(id),
      dialogue_event_id TEXT NOT NULL REFERENCES dialogue_events(id),
      recording_asset_id TEXT,
      sequence_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      duration_ms INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_records (
      id TEXT PRIMARY KEY,
      job_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      attempt INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT NOT NULL UNIQUE,
      payload_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voice_profiles (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_voice_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      language TEXT NOT NULL DEFAULT 'en',
      accent TEXT,
      style_tags_json TEXT NOT NULL DEFAULT '[]',
      permitted_uses_json TEXT NOT NULL DEFAULT '[]',
      licence_type TEXT,
      consent_record_id TEXT,
      owner_id TEXT,
      commercial_use_allowed INTEGER NOT NULL DEFAULT 0,
      cloning_allowed INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      UNIQUE(provider, provider_voice_id)
    );

    CREATE TABLE IF NOT EXISTS generation_records (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      provider_request_id TEXT NOT NULL,
      voice_profile_id TEXT NOT NULL,
      input_text TEXT NOT NULL,
      text_checksum TEXT NOT NULL,
      output_asset_id TEXT,
      character_count INTEGER NOT NULL DEFAULT 0,
      cost_usd_estimate REAL,
      approval_state TEXT NOT NULL DEFAULT 'pending',
      generated_at TEXT NOT NULL
    );
  `);

  // Additive Hollywood catalogue columns (safe to re-run)
  const alters = [
    `ALTER TABLE scenes ADD COLUMN tone TEXT`,
    `ALTER TABLE scenes ADD COLUMN rudeness TEXT`,
    `ALTER TABLE scenes ADD COLUMN funny INTEGER DEFAULT 0`,
    `ALTER TABLE scenes ADD COLUMN style_tags_json TEXT DEFAULT '[]'`,
    `ALTER TABLE scenes ADD COLUMN hollywood_vibe TEXT`,
    `ALTER TABLE scenes ADD COLUMN film_title TEXT`,
    `ALTER TABLE scenes ADD COLUMN audio_source TEXT`,
    `ALTER TABLE scenes ADD COLUMN voice_disclaimer TEXT`,
    `ALTER TABLE scenes ADD COLUMN source_attribution TEXT`,
    `ALTER TABLE characters ADD COLUMN style_tags_json TEXT DEFAULT '[]'`,
  ];
  for (const sql of alters) {
    try {
      db.exec(sql);
    } catch {
      // column already exists
    }
  }
}
