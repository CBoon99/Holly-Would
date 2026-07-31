import { many, one } from "../db/client";
import { getSceneRights } from "../rights/engine";

export type ClientManifest = {
  manifestVersion: 1;
  sceneId: string;
  sceneVersionId: string;
  sceneTitle: string;
  mode: "line_by_line";
  selectedCharacterId: string;
  selectedCharacterName: string;
  audioSource: string | null;
  voiceDisclaimer: string | null;
  sourceAttribution: string | null;
  rights: {
    canRecordUser: boolean;
    canDisplayScript: boolean;
    canDownload: boolean;
    canShare: boolean;
  };
  lines: Array<{
    dialogueEventId: string;
    sequenceNumber: number;
    characterId: string;
    characterName: string;
    isUser: boolean;
    text: string;
    emotionTag: string | null;
    partnerAudioUrl: string | null;
    expectedDurationMs: number;
    pauseAfterMs: number;
  }>;
  preparation: {
    situationBefore: string | null;
    relationship: string | null;
    directorNote: string | null;
    objective: string | null;
    obstacles: string | null;
    emotionalStart: string | null;
  };
};

type SceneRow = {
  id: string;
  title: string;
  situation_before: string | null;
  relationship: string | null;
  director_note: string | null;
  audio_source: string | null;
  voice_disclaimer: string | null;
  source_attribution: string | null;
};

type VersionRow = { id: string; scene_id: string };
type CharRow = {
  id: string;
  name: string;
  playable: number;
  objective: string | null;
  obstacles: string | null;
  emotional_start: string | null;
  key: string;
  style_tags_json?: string | null;
};
type DialogueRow = {
  id: string;
  character_id: string;
  sequence_number: number;
  start_ms: number;
  end_ms: number;
  display_text: string;
  emotion_tag: string | null;
  expected_pause_after_ms: number;
  asset_id: string | null;
};

export function buildClientManifest(
  sceneVersionId: string,
  selectedCharacterId: string
): ClientManifest {
  const version = one<VersionRow>(
    `SELECT id, scene_id FROM scene_versions WHERE id = ?`,
    [sceneVersionId]
  );
  if (!version) throw new Error("Scene version not found");

  const scene = one<SceneRow>(
    `SELECT id, title, situation_before, relationship, director_note,
            audio_source, voice_disclaimer, source_attribution
     FROM scenes WHERE id = ?`,
    [version.scene_id]
  );
  if (!scene) throw new Error("Scene not found");

  const rights = getSceneRights(scene.id);
  if (!rights.allowed) {
    throw new Error(`Scene not available: ${rights.reason}`);
  }

  const chars = many<CharRow>(
    `SELECT id, name, playable, objective, obstacles, emotional_start, key, style_tags_json
     FROM characters WHERE scene_id = ?`,
    [scene.id]
  );
  const charMap = new Map(chars.map((c) => [c.id, c]));
  const selected = charMap.get(selectedCharacterId);
  if (!selected || !selected.playable) {
    throw new Error("Selected character is not playable");
  }

  const dialogue = many<DialogueRow>(
    `SELECT id, character_id, sequence_number, start_ms, end_ms, display_text,
            emotion_tag, expected_pause_after_ms, asset_id
     FROM dialogue_events WHERE scene_version_id = ?
     ORDER BY sequence_number ASC`,
    [sceneVersionId]
  );

  const lines = dialogue.map((d) => {
    const ch = charMap.get(d.character_id);
    const isUser = d.character_id === selectedCharacterId;
    let partnerAudioUrl: string | null = null;
    if (!isUser && d.asset_id) {
      partnerAudioUrl = `/api/media/${d.asset_id}/play`;
    }
    return {
      dialogueEventId: d.id,
      sequenceNumber: d.sequence_number,
      characterId: d.character_id,
      characterName: ch?.name || "Unknown",
      isUser,
      text: rights.canDisplayScript ? d.display_text : "",
      emotionTag: d.emotion_tag,
      partnerAudioUrl,
      expectedDurationMs: Math.max(500, d.end_ms - d.start_ms),
      pauseAfterMs: d.expected_pause_after_ms,
    };
  });

  return {
    manifestVersion: 1,
    sceneId: scene.id,
    sceneVersionId,
    sceneTitle: scene.title,
    mode: "line_by_line",
    selectedCharacterId,
    selectedCharacterName: selected.name,
    audioSource: scene.audio_source,
    voiceDisclaimer: scene.voice_disclaimer,
    sourceAttribution: scene.source_attribution,
    rights: {
      canRecordUser: rights.canRecordUser,
      canDisplayScript: rights.canDisplayScript,
      canDownload: rights.canDownload,
      canShare: rights.canShare,
    },
    lines,
    preparation: {
      situationBefore: scene.situation_before,
      relationship: scene.relationship,
      directorNote: scene.director_note,
      objective: selected.objective,
      obstacles: selected.obstacles,
      emotionalStart: selected.emotional_start,
    },
  };
}

export type CatalogueScene = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  durationMs: number;
  genre: string | null;
  difficulty: string | null;
  tone: string | null;
  rudeness: string | null;
  funny: boolean;
  styleTags: string[];
  hollywoodVibe: string | null;
  filmTitle: string | null;
  audioSource: string | null;
  voiceDisclaimer: string | null;
  sourceAttribution: string | null;
  publicationStatus: string;
  rightsLabel: string;
  available: boolean;
  sceneVersionId: string | null;
  playableCharacters: Array<{
    id: string;
    name: string;
    key: string;
    styleTags: string[];
  }>;
};

export function listPublishedScenes(): CatalogueScene[] {
  const all = many<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    duration_ms: number;
    genre: string | null;
    difficulty: string | null;
    publication_status: string;
    tone: string | null;
    rudeness: string | null;
    funny: number | null;
    style_tags_json: string | null;
    hollywood_vibe: string | null;
    film_title: string | null;
    audio_source: string | null;
    voice_disclaimer: string | null;
    source_attribution: string | null;
  }>(
    `SELECT id, slug, title, description, duration_ms, genre, difficulty, publication_status,
            tone, rudeness, funny, style_tags_json, hollywood_vibe, film_title,
            audio_source, voice_disclaimer, source_attribution
     FROM scenes WHERE publication_status = 'published'
     ORDER BY title ASC`
  );

  return all
    .map((s) => {
      const rights = getSceneRights(s.id);
      const version = one<{ id: string }>(
        `SELECT id FROM scene_versions WHERE scene_id = ? ORDER BY version DESC LIMIT 1`,
        [s.id]
      );
      const chars = many<{
        id: string;
        name: string;
        key: string;
        playable: number;
        style_tags_json: string | null;
      }>(
        `SELECT id, name, key, playable, style_tags_json FROM characters WHERE scene_id = ?`,
        [s.id]
      );
      let styleTags: string[] = [];
      try {
        styleTags = JSON.parse(s.style_tags_json || "[]");
      } catch {
        styleTags = [];
      }
      return {
        id: s.id,
        slug: s.slug,
        title: s.title,
        description: s.description,
        durationMs: s.duration_ms,
        genre: s.genre,
        difficulty: s.difficulty,
        tone: s.tone,
        rudeness: s.rudeness,
        funny: Boolean(s.funny),
        styleTags,
        hollywoodVibe: s.hollywood_vibe,
        filmTitle: s.film_title,
        audioSource: s.audio_source,
        voiceDisclaimer: s.voice_disclaimer,
        sourceAttribution: s.source_attribution,
        publicationStatus: s.publication_status,
        rightsLabel: rights.status,
        available: rights.allowed && rights.canStream,
        sceneVersionId: version?.id || null,
        playableCharacters: chars
          .filter((c) => c.playable)
          .map((c) => {
            let cst: string[] = [];
            try {
              cst = JSON.parse(c.style_tags_json || "[]");
            } catch {
              cst = [];
            }
            return { id: c.id, name: c.name, key: c.key, styleTags: cst };
          }),
      };
    })
    .filter((s) => s.available);
}
