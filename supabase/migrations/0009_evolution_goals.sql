-- ================================================================
-- 0009: Evolution Goals & Verifications
-- ================================================================
-- New tables:
--   evolution_goals          — WHY/HOW/WHAT 进化目标
--   evolution_verifications  — Mutation验证（前后对比，自动回滚）
--
-- Also updates capability_candidates.vfm_score default comment
-- to reflect new 6-dimension VFM (expectationMatch/clientGrowth/
-- speed/simplicity/quality/coverage).

-- ─── 1. Evolution Goals ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evolution_goals (
  id            text PRIMARY KEY,
  layer         text NOT NULL CHECK (layer IN ('why', 'how', 'what')),
  name          text NOT NULL,
  description   text NOT NULL,

  -- Measurement
  metric        text NOT NULL UNIQUE,           -- metric key (e.g. 'intent_accuracy')
  current_value numeric,                        -- latest measured value (null = never measured)
  target_value  numeric NOT NULL,               -- target we're evolving towards
  unit          text NOT NULL DEFAULT 'rate',   -- 'rate', 'seconds', 'rounds', 'slope'
  direction     text NOT NULL DEFAULT 'higher_better' CHECK (direction IN ('higher_better', 'lower_better')),

  -- Weighting
  weight        integer NOT NULL DEFAULT 5 CHECK (weight >= 0 AND weight <= 10),
  active        boolean NOT NULL DEFAULT true,

  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evo_goals_layer  ON evolution_goals(layer);
CREATE INDEX idx_evo_goals_active ON evolution_goals(active) WHERE active = true;
CREATE INDEX idx_evo_goals_metric ON evolution_goals(metric);

-- ─── 2. Evolution Verifications ─────────────────────────────────

CREATE TABLE IF NOT EXISTS evolution_verifications (
  id                      text PRIMARY KEY,
  mutation_id             text NOT NULL REFERENCES evolution_mutations(id) ON DELETE CASCADE,

  -- Baseline snapshot (captured before mutation is applied)
  baseline_metrics        jsonb NOT NULL DEFAULT '{}',
  -- { "intent_accuracy": 0.85, "expectation_match": 0.78, ... }

  -- Post-mutation snapshot (captured in next PCEC cycle)
  post_metrics            jsonb,

  -- Verdict
  verdict                 text NOT NULL DEFAULT 'pending' CHECK (verdict IN ('pending', 'improved', 'neutral', 'degraded')),
  verdict_reason          text NOT NULL DEFAULT 'Awaiting post-mutation measurement',

  -- Auto-rollback (if WHY-layer goal degraded)
  auto_rollback_triggered boolean NOT NULL DEFAULT false,

  verified_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evo_ver_mutation ON evolution_verifications(mutation_id);
CREATE INDEX idx_evo_ver_verdict  ON evolution_verifications(verdict);
CREATE INDEX idx_evo_ver_pending  ON evolution_verifications(verdict) WHERE verdict = 'pending';

-- ─── 3. Seed Default Goals ─────────────────────────────────────

INSERT INTO evolution_goals (id, layer, name, description, metric, target_value, unit, direction, weight, active) VALUES
  -- WHY
  ('goal_why_0', 'why', '意图理解准确度',
   '用户brief被正确理解的比例。以首次生成不需要重新解释brief来衡量。',
   'intent_accuracy', 0.9, 'rate', 'higher_better', 10, true),

  ('goal_why_1', 'why', '期望匹配度',
   '生成结果与客户预期的匹配度。以accept+轻微modify（非重写）来衡量。',
   'expectation_match', 0.85, 'rate', 'higher_better', 10, true),

  ('goal_why_2', 'why', '客户成长性',
   '同一客户随使用次数增长，accept rate是否上升。衡量系统是否在学习客户偏好。',
   'client_growth_slope', 0.05, 'slope', 'higher_better', 8, true),

  -- HOW
  ('goal_how_0', 'how', '生成速度',
   '从提交brief到产出结果的平均耗时。',
   'avg_generation_seconds', 30, 'seconds', 'lower_better', 7, true),

  ('goal_how_1', 'how', '交互轮次',
   '用户从开始到满意所需的平均交互轮次（clarify+modify）。',
   'avg_interaction_rounds', 1.5, 'rounds', 'lower_better', 8, true),

  ('goal_how_2', 'how', '修改幅度',
   '用户修改输出时的平均改动量。越小说明越接近预期。',
   'avg_modification_extent', 0.15, 'rate', 'lower_better', 7, true),

  -- WHAT
  ('goal_what_0', 'what', '业务成功率',
   '所有Agent的加权平均accept rate。',
   'overall_accept_rate', 0.8, 'rate', 'higher_better', 9, true),

  ('goal_what_1', 'what', '信息准确性',
   '合规检查通过率 + 市场数据引用准确率。',
   'info_accuracy', 0.95, 'rate', 'higher_better', 9, true),

  ('goal_what_2', 'what', '能力覆盖面',
   '支持的市场数×语言数×素材类型数 / 目标覆盖总数。',
   'capability_coverage', 0.7, 'rate', 'higher_better', 5, true)

ON CONFLICT (id) DO NOTHING;
