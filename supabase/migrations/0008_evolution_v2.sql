-- ================================================================
-- 0008: Evolution V2 — 7-Layer Capability Evolution System
-- ================================================================
-- New tables:
--   capability_candidates — 能力候选（从用户行为中发现的潜在新能力）
--   evolution_mutations   — 自主修改记录（可回滚，需确认）
--   evolution_changelog   — 人类可读的进化日志

-- ─── 1. Capability Candidates ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS capability_candidates (
  id            text PRIMARY KEY,
  source        text NOT NULL CHECK (source IN ('user_pattern', 'cross_agent', 'anomaly', 'pcec', 'manual')),
  title         text NOT NULL,
  description   text NOT NULL,

  -- Capability Shape (Layer 2: 抽象)
  capability_shape jsonb NOT NULL DEFAULT '{}',
  -- { input, output, invariants, variables, failurePoints }

  -- Value Function Score (Layer 7)
  vfm_score     jsonb NOT NULL DEFAULT '{}',
  -- { frequency: 0-10, failureReduction: 0-10, userBurden: 0-10, selfCost: 0-10, totalWeighted: number }
  total_score   numeric NOT NULL DEFAULT 0,

  -- Lifecycle
  status        text NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered', 'abstracted', 'scored', 'approved', 'building', 'deployed', 'rejected', 'pruned')),
  linked_decision_id text REFERENCES evolution_decisions(id),
  linked_mutation_id text,

  -- Evidence
  evidence      jsonb NOT NULL DEFAULT '[]',
  -- [{ type, description, logIds[], timestamp }]

  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cap_cand_status ON capability_candidates(status);
CREATE INDEX idx_cap_cand_score  ON capability_candidates(total_score DESC);
CREATE INDEX idx_cap_cand_source ON capability_candidates(source);

-- ─── 2. Evolution Mutations ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS evolution_mutations (
  id              text PRIMARY KEY,
  mutation_type   text NOT NULL CHECK (mutation_type IN (
    'agent_create', 'agent_enhance', 'agent_merge', 'agent_deprecate', 'agent_tune',
    'schema_migrate', 'pipeline_update', 'prompt_update', 'config_change'
  )),

  -- What was changed
  target          text NOT NULL,           -- agent_id, table name, pipeline name, etc.
  description     text NOT NULL,           -- human-readable summary
  changes         jsonb NOT NULL,          -- { before: {...}, after: {...} }

  -- Rollback support (原则1)
  rollback_data   jsonb NOT NULL,          -- full snapshot to restore previous state
  rollback_sql    text,                    -- SQL to undo schema changes (if applicable)
  is_rolled_back  boolean NOT NULL DEFAULT false,

  -- Approval workflow (原则3)
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rolled_back', 'expired')),
  confirmed_at    timestamptz,
  confirmed_by    text,

  -- Lineage
  triggered_by    text NOT NULL CHECK (triggered_by IN ('pcec', 'evolution_decision', 'adl_correction', 'manual')),
  decision_id     text REFERENCES evolution_decisions(id),
  candidate_id    text REFERENCES capability_candidates(id),

  -- ADL validation (Layer 6)
  adl_passed      boolean NOT NULL DEFAULT false,
  adl_report      jsonb,                   -- { stabilityCheck, explainabilityCheck, reusabilityCheck, verdict }

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mut_status     ON evolution_mutations(status);
CREATE INDEX idx_mut_target     ON evolution_mutations(target);
CREATE INDEX idx_mut_created    ON evolution_mutations(created_at DESC);
CREATE INDEX idx_mut_pending    ON evolution_mutations(status) WHERE status = 'pending';

-- ─── 3. Evolution Changelog ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS evolution_changelog (
  id          text PRIMARY KEY,
  level       text NOT NULL CHECK (level IN ('info', 'warn', 'error', 'evolution', 'rollback')),
  category    text NOT NULL,               -- 'pcec', 'adl', 'vfm', 'candidate', 'mutation', 'executor'
  message     text NOT NULL,
  details     jsonb,
  mutation_id text REFERENCES evolution_mutations(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_changelog_cat     ON evolution_changelog(category);
CREATE INDEX idx_changelog_level   ON evolution_changelog(level);
CREATE INDEX idx_changelog_created ON evolution_changelog(created_at DESC);

-- ─── Add foreign key backfill ────────────────────────────────────

ALTER TABLE capability_candidates
  ADD CONSTRAINT fk_cap_mutation FOREIGN KEY (linked_mutation_id)
  REFERENCES evolution_mutations(id) ON DELETE SET NULL;
