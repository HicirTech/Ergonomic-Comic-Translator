/**
 * Schema migrations, applied in order; PRAGMA user_version records how many ran. Never edit a shipped
 * migration: append a new one. Invariants live in the schema so no code path can bypass them:
 * - text_rev is append-only;
 * - a machine revision never replaces a user revision (I5), and heads change with version + 1 only;
 * - job completion is derived by the job_state view, never written (I2).
 */
export const migrations: readonly string[] = [
  `
  CREATE TABLE volume (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_lang TEXT CHECK (source_lang IN ('ja', 'ko', 'zh-Hans', 'zh-Hant', 'en')),
    lang_confidence REAL,
    layout_profile TEXT CHECK (layout_profile IN ('manga_rtl', 'webtoon', 'manhua', 'western', 'cg')),
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE page (
    id TEXT PRIMARY KEY,
    volume_id TEXT NOT NULL REFERENCES volume(id),
    ordinal INTEGER NOT NULL,
    image_sha256 TEXT NOT NULL,
    display_name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('main', 'textless_variant', 'blank')),
    variant_of TEXT REFERENCES page(id),
    UNIQUE (volume_id, ordinal)
  );

  CREATE TABLE region (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES page(id),
    layout_rev INTEGER NOT NULL DEFAULT 1,
    det_class TEXT CHECK (det_class IN ('bubble', 'text_bubble', 'text_free')),
    det_score REAL,
    bbox_json TEXT NOT NULL,
    bubble_bbox_json TEXT,
    frame_json TEXT,
    writing_mode TEXT CHECK (writing_mode IN ('h', 'v')),
    rot_k INTEGER CHECK (rot_k IN (0, 90, 180, 270)),
    curved INTEGER NOT NULL DEFAULT 0,
    orient_src TEXT CHECK (orient_src IN ('db', 'proj', 'ocr', 'prior', 'user')),
    orient_conf REAL,
    rectify TEXT CHECK (rectify IN ('none', 'affine', 'persp', 'fallback')),
    layout TEXT CHECK (layout IN ('bubble', 'bottom_box', 'caption', 'text_free')),
    kind TEXT CHECK (kind IN ('dialogue', 'thought', 'narration', 'free_text', 'sfx', 'name_tag')),
    policy TEXT CHECK (policy IN ('translate', 'keep', 'keep_gloss')),
    reading_order INTEGER,
    orphan INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX region_page ON region(page_id);

  CREATE TABLE textline (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL REFERENCES region(id),
    ordinal INTEGER NOT NULL,
    quad_json TEXT NOT NULL,
    angle REAL NOT NULL,
    length REAL NOT NULL,
    thickness REAL NOT NULL,
    curved INTEGER NOT NULL DEFAULT 0,
    is_ruby INTEGER NOT NULL DEFAULT 0,
    UNIQUE (region_id, ordinal)
  );

  CREATE TABLE utterance (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL REFERENCES region(id),
    ordinal INTEGER NOT NULL,
    line_ids_json TEXT NOT NULL,
    split_reason TEXT,
    speaker_hint TEXT,
    UNIQUE (region_id, ordinal)
  );

  CREATE TABLE ocr_candidate (
    id TEXT PRIMARY KEY,
    utterance_id TEXT NOT NULL REFERENCES utterance(id),
    engine TEXT NOT NULL,
    model_sha TEXT NOT NULL,
    rotation INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    conf_mean REAL NOT NULL,
    conf_min REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE text_rev (
    id TEXT PRIMARY KEY,
    utterance_id TEXT NOT NULL REFERENCES utterance(id),
    field TEXT NOT NULL CHECK (field IN ('source', 'target', 'gloss')),
    value TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN (
      'ocr', 'ocr_second', 'mt_l1', 'mt_l1r', 'mt_l2', 'mt_l3', 'mt_l4',
      'shorten', 'term_apply', 'user', 'user_choice'
    )),
    created_by TEXT NOT NULL CHECK (created_by IN ('machine', 'user')),
    model_sha TEXT,
    provider TEXT,
    backend TEXT,
    tier TEXT,
    input_key TEXT,
    seed INTEGER,
    checks_json TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX text_rev_utterance ON text_rev(utterance_id);
  CREATE TRIGGER text_rev_no_update BEFORE UPDATE ON text_rev
  BEGIN SELECT RAISE(ABORT, 'text_rev is append-only'); END;
  CREATE TRIGGER text_rev_no_delete BEFORE DELETE ON text_rev
  BEGIN SELECT RAISE(ABORT, 'text_rev is append-only'); END;

  CREATE TABLE utterance_head (
    utterance_id TEXT PRIMARY KEY REFERENCES utterance(id),
    source_rev TEXT REFERENCES text_rev(id),
    target_rev TEXT REFERENCES text_rev(id),
    gloss_rev TEXT REFERENCES text_rev(id),
    version INTEGER NOT NULL DEFAULT 0
  );
  CREATE TRIGGER utterance_head_version BEFORE UPDATE ON utterance_head
  WHEN NEW.version IS NOT OLD.version + 1
  BEGIN SELECT RAISE(ABORT, 'utterance_head.version must increase by exactly 1'); END;
  CREATE TRIGGER utterance_head_keep_user_source BEFORE UPDATE OF source_rev ON utterance_head
  WHEN (SELECT created_by FROM text_rev WHERE id = OLD.source_rev) = 'user'
    AND (SELECT created_by FROM text_rev WHERE id = NEW.source_rev) = 'machine'
  BEGIN SELECT RAISE(ABORT, 'a machine revision cannot replace a user revision'); END;
  CREATE TRIGGER utterance_head_keep_user_target BEFORE UPDATE OF target_rev ON utterance_head
  WHEN (SELECT created_by FROM text_rev WHERE id = OLD.target_rev) = 'user'
    AND (SELECT created_by FROM text_rev WHERE id = NEW.target_rev) = 'machine'
  BEGIN SELECT RAISE(ABORT, 'a machine revision cannot replace a user revision'); END;
  CREATE TRIGGER utterance_head_keep_user_gloss BEFORE UPDATE OF gloss_rev ON utterance_head
  WHEN (SELECT created_by FROM text_rev WHERE id = OLD.gloss_rev) = 'user'
    AND (SELECT created_by FROM text_rev WHERE id = NEW.gloss_rev) = 'machine'
  BEGIN SELECT RAISE(ABORT, 'a machine revision cannot replace a user revision'); END;

  CREATE TABLE flag (
    id TEXT PRIMARY KEY,
    volume_id TEXT NOT NULL REFERENCES volume(id),
    page_id TEXT REFERENCES page(id),
    region_id TEXT REFERENCES region(id),
    utterance_id TEXT REFERENCES utterance(id),
    code TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'error')),
    class TEXT NOT NULL CHECK (class IN ('decisive', 'advisory')),
    evidence_json TEXT,
    candidates_json TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'auto_resolved', 'user_resolved', 'dismissed')),
    created_at TEXT NOT NULL
  );
  CREATE INDEX flag_volume_open ON flag(volume_id) WHERE status = 'open';

  CREATE TABLE job (
    id TEXT PRIMARY KEY,
    volume_id TEXT NOT NULL REFERENCES volume(id),
    kind TEXT NOT NULL CHECK (kind IN ('translate_volume', 'pages', 'region', 'export', 'bench')),
    params_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    cancel_requested_at TEXT
  );
  CREATE TRIGGER job_params_immutable BEFORE UPDATE OF params_json, volume_id, kind ON job
  BEGIN SELECT RAISE(ABORT, 'job parameters are immutable'); END;

  CREATE TABLE task (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES job(id),
    page_id TEXT REFERENCES page(id),
    stage TEXT NOT NULL,
    lane TEXT NOT NULL CHECK (lane IN ('gpu', 'cpu', 'llm')),
    input_key TEXT,
    output_key TEXT,
    state TEXT NOT NULL DEFAULT 'queued'
      CHECK (state IN ('queued', 'running', 'done', 'failed', 'needs_review', 'cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    preempts INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_msg_zh TEXT,
    started_at TEXT,
    finished_at TEXT,
    UNIQUE (job_id, page_id, stage)
  );
  -- UNIQUE treats NULL page ids as distinct, so volume-level stages need their own index.
  CREATE UNIQUE INDEX task_volume_stage ON task(job_id, stage) WHERE page_id IS NULL;
  CREATE INDEX task_claim ON task(lane, state, priority);

  CREATE VIEW job_state AS
  SELECT
    job.id AS job_id,
    job.volume_id AS volume_id,
    COUNT(task.id) AS tasks,
    COALESCE(SUM(task.state = 'done'), 0) AS done,
    COALESCE(SUM(task.state = 'failed'), 0) AS failed,
    CASE
      WHEN COALESCE(SUM(task.state IN ('queued', 'running')), 0) > 0 AND job.cancel_requested_at IS NOT NULL THEN 'cancelling'
      WHEN COALESCE(SUM(task.state = 'running'), 0) > 0 THEN 'running'
      WHEN COUNT(task.id) = 0 OR COALESCE(SUM(task.state = 'queued'), 0) > 0 THEN 'queued'
      WHEN SUM(task.state = 'failed') > 0 THEN 'partial_failed'
      WHEN SUM(task.state = 'cancelled') > 0 THEN 'cancelled'
      WHEN SUM(task.state = 'needs_review') > 0
        OR EXISTS (SELECT 1 FROM flag WHERE flag.volume_id = job.volume_id
                   AND flag.status = 'open' AND flag.severity IN ('warn', 'error')) THEN 'needs_review'
      ELSE 'succeeded'
    END AS state
  FROM job LEFT JOIN task ON task.job_id = job.id
  GROUP BY job.id;

  CREATE TABLE footprint (
    model_sha TEXT NOT NULL,
    backend TEXT NOT NULL,
    adapter TEXT NOT NULL,
    ctx INTEGER NOT NULL DEFAULT 0,
    parallel INTEGER NOT NULL DEFAULT 1,
    mmproj INTEGER NOT NULL DEFAULT 0,
    dev_peak_mb INTEGER NOT NULL,
    host_spill_mb INTEGER NOT NULL DEFAULT 0,
    ram_peak_mb INTEGER NOT NULL,
    commit_peak_mb INTEGER NOT NULL,
    load_ms INTEGER,
    tok_s_p50 REAL,
    prefill_tok_s REAL,
    ext_load_json TEXT,
    measured_at TEXT NOT NULL,
    PRIMARY KEY (model_sha, backend, adapter, ctx, parallel, mmproj)
  );

  CREATE TABLE ep_selfcheck (
    model_sha TEXT NOT NULL,
    ep TEXT NOT NULL,
    adapter_luid TEXT NOT NULL,
    driver_version TEXT NOT NULL,
    ort_version TEXT NOT NULL,
    ok INTEGER NOT NULL,
    max_diff REAL,
    compile_ms INTEGER,
    dev_delta_mb INTEGER,
    detail TEXT,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (model_sha, ep, adapter_luid, driver_version, ort_version)
  );

  CREATE TABLE telemetry (
    id INTEGER PRIMARY KEY,
    job_id TEXT,
    page_id TEXT,
    stage TEXT NOT NULL,
    lane TEXT NOT NULL,
    device TEXT,
    ep TEXT,
    ms REAL NOT NULL,
    queue_ms REAL,
    dev_free_mb INTEGER,
    ext_dev_mb INTEGER,
    ext_util REAL,
    ram_avail_mb INTEGER,
    commit_avail_mb INTEGER,
    tier TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE resource_event (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    adapter_luid TEXT,
    action TEXT NOT NULL CHECK (action IN ('admit', 'deny', 'yield', 'yellow', 'red', 'green', 'retier', 'unload', 'resume', 'tdr')),
    reason TEXT,
    dev_total_mb INTEGER,
    dev_used_mb INTEGER,
    dev_own_mb INTEGER,
    shared_own_mb INTEGER,
    ram_avail_mb INTEGER,
    commit_avail_mb INTEGER,
    ext_util REAL,
    snapshot_json TEXT
  );
  CREATE INDEX resource_event_ts ON resource_event(ts);

  CREATE TABLE model_install (
    model_id TEXT PRIMARY KEY,
    revision TEXT NOT NULL,
    files_json TEXT NOT NULL,
    license TEXT NOT NULL,
    verified_at TEXT NOT NULL
  );
  `,
  `
  -- The page image lives in the content store as <sha256><extension>; only the file name is kept so the
  -- data directory can move. Reading direction: NULL until chosen by the user or derived from the language.
  ALTER TABLE page ADD COLUMN image_file TEXT;
  ALTER TABLE volume ADD COLUMN reading_direction TEXT CHECK (reading_direction IN ('rtl', 'ltr'));
  CREATE INDEX flag_page ON flag(page_id);
  CREATE INDEX task_job ON task(job_id);
  `,
];
