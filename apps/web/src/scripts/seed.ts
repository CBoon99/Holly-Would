import fs from "fs";
import path from "path";
import { migrate } from "../lib/db/migrate";
import { one, run, getSqlite } from "../lib/db/client";
import { ensureDataDirs, projectRoot } from "../lib/paths";
import { id, nowIso } from "../lib/ids";
import { generatePartnerLineAudio } from "../lib/media/partner-audio";
import { isLiveVoiceConfigured, resetVoiceProvider } from "../lib/providers/registry";
import { loadEnvFiles } from "../lib/env";
import { resetSttProvider } from "../lib/providers/stt-registry";

function loadEnvLocal() {
  const loaded = loadEnvFiles();
  for (const p of loaded) console.log("Loaded env from", p);
  resetVoiceProvider();
  resetSttProvider();
}

type SeedDialogue = {
  seq: number;
  character: string;
  text: string;
  emotion: string;
  expected_pause_after_ms: number;
};

type SeedFile = {
  slug: string;
  title: string;
  film_title: string;
  genre: string;
  difficulty: string;
  duration_ms: number;
  premise: string;
  content_warnings: string[];
  rights: {
    classification: string;
    status: string;
    basis: string;
    can_stream: boolean;
    can_display_script: boolean;
    can_transform_audio: boolean;
    can_record_user: boolean;
    can_download: boolean;
    can_share: boolean;
    can_monetise: boolean;
    territories: string[];
  };
  situation_before: string;
  characters: Array<{
    key: string;
    name: string;
    playable: boolean;
    description: string;
    objective: string;
    obstacles: string;
    emotional_start: string;
    age_range: string;
    accent: string;
  }>;
  relationship: string;
  director_note: string;
  dialogue: SeedDialogue[];
};

async function main() {
  loadEnvLocal();
  ensureDataDirs();
  migrate();
  const t = nowIso();
  console.log(
    "Voice provider:",
    isLiveVoiceConfigured() ? "elevenlabs (live)" : "seed offline fallback"
  );

  const userId = process.env.DEV_USER_ID || "dev-user-1";
  const existingUser = one(`SELECT id FROM users WHERE id = ?`, [userId]);
  if (!existingUser) {
    run(`INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)`, [
      userId,
      process.env.DEV_USER_NAME || "Carl",
      t,
    ]);
  }

  const seedPath = path.join(
    projectRoot(),
    "content/seed/scene-the-last-call.json"
  );
  const seed: SeedFile = JSON.parse(fs.readFileSync(seedPath, "utf8"));

  const old = one<{ id: string }>(`SELECT id FROM scenes WHERE slug = ?`, [
    seed.slug,
  ]);
  if (old) {
    console.log("Re-seeding: removing previous scene", seed.slug);
    getSqlite().exec(`
      DELETE FROM take_segments;
      DELETE FROM takes;
      DELETE FROM performance_sessions;
      DELETE FROM job_records;
      DELETE FROM dialogue_events;
      DELETE FROM media_assets;
      DELETE FROM characters WHERE scene_id = '${old.id}';
      DELETE FROM scene_versions WHERE scene_id = '${old.id}';
      DELETE FROM rights_assets WHERE entity_id = '${old.id}';
      DELETE FROM scenes WHERE id = '${old.id}';
    `);
  }

  const filmId = id("film");
  run(
    `INSERT INTO films (id, canonical_title, release_year, rights_classification, synopsis, created_at)
     VALUES (?, ?, 2026, ?, ?, ?)`,
    [filmId, seed.film_title, seed.rights.classification, seed.premise, t]
  );

  const editionId = id("ed");
  run(
    `INSERT INTO editions (id, film_id, edition_name, status, created_at)
     VALUES (?, ?, 'Platform original audio package v1', 'active', ?)`,
    [editionId, filmId, t]
  );

  const sceneId = id("sc");
  run(
    `INSERT INTO scenes
      (id, edition_id, title, slug, description, duration_ms, genre, difficulty,
       content_warnings_json, publication_status, situation_before, relationship,
       director_note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
    [
      sceneId,
      editionId,
      seed.title,
      seed.slug,
      seed.premise,
      seed.duration_ms,
      seed.genre,
      seed.difficulty,
      JSON.stringify(seed.content_warnings),
      seed.situation_before,
      seed.relationship,
      seed.director_note,
      t,
      t,
    ]
  );

  run(
    `INSERT INTO rights_assets
      (id, entity_type, entity_id, jurisdiction, status, basis, reviewed_by, reviewed_at,
       valid_from, can_stream, can_display_script, can_transform_audio, can_record_user,
       can_download, can_share, can_monetise, territories_json)
     VALUES (?, 'scene', ?, '*', ?, ?, 'seed-script', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id("rights"),
      sceneId,
      seed.rights.status,
      seed.rights.basis,
      t,
      t,
      seed.rights.can_stream ? 1 : 0,
      seed.rights.can_display_script ? 1 : 0,
      seed.rights.can_transform_audio ? 1 : 0,
      seed.rights.can_record_user ? 1 : 0,
      seed.rights.can_download ? 1 : 0,
      seed.rights.can_share ? 1 : 0,
      seed.rights.can_monetise ? 1 : 0,
      JSON.stringify(seed.rights.territories),
    ]
  );

  run(
    `UPDATE scenes SET publication_status = 'published', updated_at = ? WHERE id = ?`,
    [t, sceneId]
  );

  const versionId = id("sv");
  run(
    `INSERT INTO scene_versions (id, scene_id, version, status, created_at)
     VALUES (?, ?, 1, 'published', ?)`,
    [versionId, sceneId, t]
  );

  const charIds: Record<string, string> = {};
  seed.characters.forEach((c, i) => {
    const cid = id("ch");
    charIds[c.key] = cid;
    run(
      `INSERT INTO characters
        (id, scene_id, key, name, description, playable, objective, obstacles,
         emotional_start, age_range, accent, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cid,
        sceneId,
        c.key,
        c.name,
        c.description,
        c.playable ? 1 : 0,
        c.objective,
        c.obstacles,
        c.emotional_start,
        c.age_range,
        c.accent,
        i,
      ]
    );
  });

  // Generate TTS for EVERY line so either character can be the partner
  let timeline = 0;
  for (const line of seed.dialogue) {
    const characterId = charIds[line.character];
    if (!characterId) throw new Error(`Unknown character key ${line.character}`);

    const deId = id("de");
    // Use pinned default voice for all lines (free-tier safe).
    // Optional: ELEVENLABS_VOICE_ID_MAYA / _JORDAN if your plan allows library voices.
    const prevVoice = process.env.ELEVENLABS_VOICE_ID;
    const prevName = process.env.ELEVENLABS_VOICE_NAME;
    if (line.character === "maya" && process.env.ELEVENLABS_VOICE_ID_MAYA) {
      process.env.ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID_MAYA;
      process.env.ELEVENLABS_VOICE_NAME =
        process.env.ELEVENLABS_VOICE_NAME_MAYA || "Maya";
    } else if (
      line.character === "jordan" &&
      process.env.ELEVENLABS_VOICE_ID_JORDAN
    ) {
      process.env.ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID_JORDAN;
      process.env.ELEVENLABS_VOICE_NAME =
        process.env.ELEVENLABS_VOICE_NAME_JORDAN || "Jordan";
    }

    const audio = await generatePartnerLineAudio({
      text: line.text,
      sceneId,
      sequence: line.seq,
      ownerDialogueEventId: deId,
    });

    if (prevVoice !== undefined) process.env.ELEVENLABS_VOICE_ID = prevVoice;
    if (prevName !== undefined) process.env.ELEVENLABS_VOICE_NAME = prevName;

    const startMs = timeline;
    const endMs = timeline + audio.durationMs;

    run(
      `INSERT INTO dialogue_events
        (id, scene_version_id, character_id, sequence_number, start_ms, end_ms,
         canonical_text, display_text, emotion_tag, expected_pause_after_ms, asset_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deId,
        versionId,
        characterId,
        line.seq,
        startMs,
        endMs,
        line.text,
        line.text,
        line.emotion,
        line.expected_pause_after_ms,
        audio.assetId,
      ]
    );
    console.log(
      `  line ${line.seq} (${line.character}): ${audio.provider} ${audio.durationMs}ms`
    );
    timeline = endMs + line.expected_pause_after_ms;
  }

  run(`UPDATE scenes SET duration_ms = ?, updated_at = ? WHERE id = ?`, [
    timeline,
    nowIso(),
    sceneId,
  ]);

  console.log("Seeded scene:", seed.title);
  console.log("  sceneId:", sceneId);
  console.log("  sceneVersionId:", versionId);
  console.log("  playable: Maya + Jordan (both)");
  console.log("  all lines have partner audio when not selected");
  console.log("  rights: approved (platform_original)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
