/**
 * Domain entity names for the audio-first / video-ready model.
 * Physical schema is applied in migrate.ts (SQLite V1).
 * Tables: films, editions, scenes, scene_versions, characters,
 * dialogue_events, media_assets, rights_assets, performance_sessions,
 * takes, take_segments, job_records, users.
 */
export const DOMAIN_ENTITIES = [
  "Film",
  "Edition",
  "Scene",
  "SceneVersion",
  "Character",
  "DialogueEvent",
  "TimelineEvent",
  "MediaAsset",
  "RightsAsset",
  "PerformanceSession",
  "Take",
  "TakeSegment",
  "JobRecord",
] as const;
