import { describe, it, expect, beforeAll } from "vitest";
import { migrate } from "../db/migrate";
import { ensureDataDirs } from "../paths";
import { resetDbConnection, run } from "../db/client";
import { getSceneRights } from "./engine";
import { nowIso } from "../ids";
import path from "path";
import os from "os";

describe("rights engine", () => {
  beforeAll(() => {
    process.env.DATA_DIR = path.join(os.tmpdir(), `acting-test-${Date.now()}`);
    resetDbConnection();
    ensureDataDirs();
    migrate();
    const t = nowIso();
    run(
      `INSERT INTO rights_assets
        (id, entity_type, entity_id, jurisdiction, status, basis,
         can_stream, can_display_script, can_transform_audio, can_record_user,
         can_download, can_share, can_monetise, territories_json, reviewed_at)
       VALUES ('r1', 'scene', 'scene-ok', '*', 'approved', 'test',
               1, 1, 1, 1, 1, 0, 0, '["*"]', ?)`,
      [t]
    );
    run(
      `INSERT INTO rights_assets
        (id, entity_type, entity_id, jurisdiction, status, basis,
         can_stream, can_display_script, can_transform_audio, can_record_user,
         can_download, can_share, can_monetise, territories_json)
       VALUES ('r2', 'scene', 'scene-blocked', '*', 'rejected', 'no',
               0, 0, 0, 0, 0, 0, 0, '["*"]')`
    );
  });

  it("allows approved scenes", () => {
    const d = getSceneRights("scene-ok");
    expect(d.allowed).toBe(true);
    expect(d.canRecordUser).toBe(true);
  });

  it("blocks missing rights", () => {
    const d = getSceneRights("missing");
    expect(d.allowed).toBe(false);
    expect(d.status).toBe("missing");
  });

  it("blocks non-approved status", () => {
    const d = getSceneRights("scene-blocked");
    expect(d.allowed).toBe(false);
  });
});
