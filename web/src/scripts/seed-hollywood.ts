/**
 * Seed Hollywood-style ORIGINAL catalogue (10+ scenes).
 * Not licensed studio films — platform-original dialogue with classic vibes.
 * Uses offline audio by default for bulk speed; set HOLLYWOOD_SEED_LIVE_TTS=1 for ElevenLabs.
 */
import fs from "fs";
import path from "path";
import { migrate } from "../lib/db/migrate";
import { one, run, getSqlite } from "../lib/db/client";
import { ensureDataDirs, projectRoot } from "../lib/paths";
import { id, stableId, nowIso } from "../lib/ids";
import { generatePartnerLineAudio } from "../lib/media/partner-audio";
import { loadEnvFiles } from "../lib/env";
import { resetVoiceProvider } from "../lib/providers/registry";
import { resetSttProvider } from "../lib/providers/stt-registry";

type Char = {
  key: string;
  name: string;
  playable: boolean;
  style_tags?: string[];
  description: string;
  objective: string;
  obstacles: string;
  emotional_start: string;
  age_range: string;
  accent: string;
};

type SceneSeed = {
  slug: string;
  title: string;
  film_title: string;
  hollywood_vibe?: string;
  genre: string;
  difficulty: string;
  tone: string;
  rudeness: string;
  funny: boolean;
  style_tags: string[];
  duration_ms: number;
  premise: string;
  situation_before: string;
  relationship: string;
  director_note: string;
  characters: Char[];
  dialogue: Array<{
    seq: number;
    character: string;
    text: string;
    emotion: string;
    expected_pause_after_ms: number;
  }>;
};

async function seedOne(scene: SceneSeed, forceOffline: boolean) {
  const t = nowIso();
  const old = one<{ id: string }>(`SELECT id FROM scenes WHERE slug = ?`, [
    scene.slug,
  ]);
  if (old) {
    // Delete dependents first (takes → dialogue FK chain)
    getSqlite().exec(`
      DELETE FROM take_segments WHERE dialogue_event_id IN (
        SELECT de.id FROM dialogue_events de
        JOIN scene_versions sv ON de.scene_version_id = sv.id
        WHERE sv.scene_id = '${old.id}'
      );
      DELETE FROM takes WHERE performance_session_id IN (
        SELECT ps.id FROM performance_sessions ps
        JOIN scene_versions sv ON ps.scene_version_id = sv.id
        WHERE sv.scene_id = '${old.id}'
      );
      DELETE FROM performance_sessions WHERE scene_version_id IN (
        SELECT id FROM scene_versions WHERE scene_id = '${old.id}'
      );
      DELETE FROM dialogue_events WHERE scene_version_id IN
        (SELECT id FROM scene_versions WHERE scene_id = '${old.id}');
      DELETE FROM characters WHERE scene_id = '${old.id}';
      DELETE FROM scene_versions WHERE scene_id = '${old.id}';
      DELETE FROM rights_assets WHERE entity_id = '${old.id}';
      DELETE FROM scenes WHERE id = '${old.id}';
    `);
  }

  // Stable IDs: same slug → same IDs on every host
  const filmId = stableId("film", scene.slug);
  const editionId = stableId("ed", scene.slug);
  // Clear prior film/edition rows (reseed-safe)
  run(`DELETE FROM editions WHERE id = ? OR film_id = ?`, [editionId, filmId]);
  run(`DELETE FROM films WHERE id = ?`, [filmId]);
  run(
    `INSERT INTO films (id, canonical_title, release_year, rights_classification, synopsis, created_at)
     VALUES (?, ?, 2026, 'platform_original', ?, ?)`,
    [filmId, scene.film_title, scene.premise, t]
  );

  run(
    `INSERT INTO editions (id, film_id, edition_name, status, created_at)
     VALUES (?, ?, 'Platform original audio v1', 'active', ?)`,
    [editionId, filmId, t]
  );

  const sceneId = stableId("sc", scene.slug);
  run(
    `INSERT INTO scenes
      (id, edition_id, title, slug, description, duration_ms, genre, difficulty,
       content_warnings_json, publication_status, situation_before, relationship,
       director_note, created_at, updated_at, tone, rudeness, funny, style_tags_json,
       hollywood_vibe, film_title)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sceneId,
      editionId,
      scene.title,
      scene.slug,
      scene.premise,
      scene.duration_ms,
      scene.genre,
      scene.difficulty,
      scene.situation_before,
      scene.relationship,
      scene.director_note,
      t,
      t,
      scene.tone,
      scene.rudeness,
      scene.funny ? 1 : 0,
      JSON.stringify(scene.style_tags || []),
      scene.hollywood_vibe || null,
      scene.film_title,
    ]
  );

  run(
    `INSERT INTO rights_assets
      (id, entity_type, entity_id, jurisdiction, status, basis, reviewed_by, reviewed_at,
       valid_from, can_stream, can_display_script, can_transform_audio, can_record_user,
       can_download, can_share, can_monetise, territories_json)
     VALUES (?, 'scene', ?, '*', 'approved', ?, 'seed-hollywood', ?, ?, 1, 1, 1, 1, 1, 0, 0, '["*"]')`,
    [
      stableId("rights", scene.slug),
      sceneId,
      "Platform-original Hollywood-style scene; not a licensed studio film or script.",
      t,
      t,
    ]
  );

  run(
    `UPDATE scenes SET publication_status = 'published', updated_at = ? WHERE id = ?`,
    [t, sceneId]
  );

  const versionId = stableId("sv", scene.slug, "v1");
  run(
    `INSERT INTO scene_versions (id, scene_id, version, status, created_at)
     VALUES (?, ?, 1, 'published', ?)`,
    [versionId, sceneId, t]
  );

  const charIds: Record<string, string> = {};
  scene.characters.forEach((c, i) => {
    const cid = stableId("ch", scene.slug, c.key);
    charIds[c.key] = cid;
    run(
      `INSERT INTO characters
        (id, scene_id, key, name, description, playable, objective, obstacles,
         emotional_start, age_range, accent, sort_order, style_tags_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        JSON.stringify(c.style_tags || []),
      ]
    );
  });

  // Force offline TTS for bulk unless live requested
  const prevKey = process.env.ELEVENLABS_API_KEY;
  if (forceOffline) delete process.env.ELEVENLABS_API_KEY;
  resetVoiceProvider();

  // Scale: catalogue structure first; partner audio via TTS when available.
  // SKIP_PARTNER_AUDIO=1 seeds hundreds of scenes without blocking on voice APIs.
  const skipAudio =
    process.env.SKIP_PARTNER_AUDIO === "1" ||
    process.env.SKIP_PARTNER_AUDIO === "true";

  let timeline = 0;
  for (const line of scene.dialogue) {
    const characterId = charIds[line.character];
    if (!characterId) throw new Error(`${scene.slug}: unknown ${line.character}`);
    const deId = stableId("de", scene.slug, line.seq);
    let assetId: string | null = null;
    let lineMs = Math.max(
      1200,
      Math.round(line.text.split(/\s+/).length * 320)
    );

    if (!skipAudio) {
      try {
        const audio = await generatePartnerLineAudio({
          text: line.text,
          sceneId,
          sequence: line.seq,
          ownerDialogueEventId: deId,
        });
        assetId = audio.assetId;
        lineMs = audio.durationMs;
      } catch (e) {
        console.warn(
          `  audio skip ${scene.slug}#${line.seq}:`,
          e instanceof Error ? e.message.slice(0, 100) : e
        );
      }
    }

    const startMs = timeline;
    const endMs = timeline + lineMs;
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
        assetId,
      ]
    );
    timeline = endMs + line.expected_pause_after_ms;
  }

  if (prevKey) process.env.ELEVENLABS_API_KEY = prevKey;
  resetVoiceProvider();

  run(`UPDATE scenes SET duration_ms = ?, updated_at = ? WHERE id = ?`, [
    timeline,
    nowIso(),
    sceneId,
  ]);

  console.log(
    `✓ ${scene.title} [${scene.difficulty}/${scene.tone}/${scene.rudeness}] playable: ${scene.characters
      .filter((c) => c.playable)
      .map((c) => c.name)
      .join(", ")}`
  );
}

export async function seedHollywoodCatalogue(opts?: {
  forceOffline?: boolean;
}): Promise<number> {
  loadEnvFiles();
  resetVoiceProvider();
  resetSttProvider();
  ensureDataDirs();
  migrate();

  const userId = process.env.DEV_USER_ID || "dev-user-1";
  if (!one(`SELECT id FROM users WHERE id = ?`, [userId])) {
    run(`INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)`, [
      userId,
      process.env.DEV_USER_NAME || "Carl",
      nowIso(),
    ]);
  }

  /** Load handcrafted + factory batches (path to thousands of originals). */
  const seedRoots = [
    path.join(projectRoot(), "content/seed"),
    path.join(process.cwd(), "content/seed"),
    path.join(process.cwd(), "../../content/seed"),
  ].filter((p) => fs.existsSync(p));
  const seedRoot = seedRoots[0];
  if (!seedRoot) throw new Error("content/seed not found");

  const scenes: SceneSeed[] = [];
  const seenSlug = new Set<string>();

  const pushScenes = (list: SceneSeed[], label: string) => {
    let n = 0;
    for (const s of list) {
      if (!s?.slug || seenSlug.has(s.slug)) continue;
      seenSlug.add(s.slug);
      scenes.push(s);
      n++;
    }
    console.log(`  +${n} from ${label}`);
  };

  // 1) Handcrafted hollywood catalogue
  const hand = path.join(seedRoot, "hollywood-catalogue.json");
  if (fs.existsSync(hand)) {
    const catalogue = JSON.parse(fs.readFileSync(hand, "utf8")) as {
      scenes: SceneSeed[];
    };
    pushScenes(catalogue.scenes || [], "hollywood-catalogue.json");
  }

  // 2) Last Call
  const lastCallPath = path.join(seedRoot, "scene-the-last-call.json");
  if (fs.existsSync(lastCallPath)) {
    const lc = JSON.parse(fs.readFileSync(lastCallPath, "utf8"));
    pushScenes(
      [
        {
          ...lc,
          hollywood_vibe: "Intimate modern drama · phone call · raw honesty",
          tone: lc.tone || "dramatic",
          rudeness: lc.rudeness || "clean",
          funny: false,
          style_tags: lc.style_tags || ["modern", "friends", "goodbye"],
          film_title: lc.film_title,
          characters: lc.characters.map((c: Char) => ({
            ...c,
            style_tags: c.style_tags || [],
          })),
        },
      ],
      "scene-the-last-call.json"
    );
  }

  // 3) Factory batches (batch-001, batch-002, … toward thousands)
  const batchDir = path.join(seedRoot, "batches");
  if (fs.existsSync(batchDir)) {
    const files = fs
      .readdirSync(batchDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const f of files) {
      const batch = JSON.parse(
        fs.readFileSync(path.join(batchDir, f), "utf8")
      ) as { scenes?: SceneSeed[] };
      pushScenes(batch.scenes || [], `batches/${f}`);
    }
  }

  if (!scenes.length) throw new Error("No scenes found under content/seed");

  // Scale control: SEED_LIMIT=50 for fast deploys; omit for full catalogue
  const limit = process.env.SEED_LIMIT
    ? Math.max(1, parseInt(process.env.SEED_LIMIT, 10) || 0)
    : 0;
  const toSeed = limit > 0 ? scenes.slice(0, limit) : scenes;

  const forceOffline =
    opts?.forceOffline ?? process.env.HOLLYWOOD_SEED_LIVE_TTS !== "1";
  console.log(
    `Seeding ${toSeed.length}/${scenes.length} ORIGINAL scenes (${
      forceOffline ? "offline/espeak/openai chain" : "live TTS preferred"
    })…`
  );

  for (const scene of toSeed) {
    await seedOne(scene, forceOffline);
  }

  const count = one<{ n: number }>(
    `SELECT COUNT(*) as n FROM scenes WHERE publication_status = 'published'`
  );
  console.log(`\nDone. Published scenes: ${count?.n ?? "?"}`);
  return count?.n ?? 0;
}

async function main() {
  await seedHollywoodCatalogue();
}

// Auto-run when executed as CLI: `tsx src/scripts/seed-hollywood.ts`
const isCli =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;
if (isCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
