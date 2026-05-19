-- 0011_workflows.sql
-- 工作流编辑器：工作流定义 + 执行实例 + 节点执行记录
-- Phase 2 设计确认 2026-05-19

-- 工作流定义
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  graph JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  template_key TEXT,
  is_template BOOLEAN DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 工作流执行实例
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','estimating','awaiting_confirm','running','completed','failed','cancelled')),
  input JSONB,
  output JSONB,
  estimated_credits INTEGER,
  credits_consumed INTEGER DEFAULT 0,
  progress REAL DEFAULT 0
    CHECK (progress >= 0 AND progress <= 1),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 节点执行记录
CREATE TABLE IF NOT EXISTS node_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','skipped')),
  input JSONB,
  output JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  model_used TEXT,
  credits_consumed INTEGER DEFAULT 0
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_workflows_created_by ON workflows(created_by);
CREATE INDEX IF NOT EXISTS idx_workflows_template ON workflows(is_template) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_by ON workflow_runs(created_by);
CREATE INDEX IF NOT EXISTS idx_node_executions_run ON node_executions(run_id);
CREATE INDEX IF NOT EXISTS idx_node_executions_run_status ON node_executions(run_id, status);

-- RLS 策略（用户只能看自己的工作流）
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_executions ENABLE ROW LEVEL SECURITY;

-- workflows: 用户只能操作自己的，模板所有人可读
CREATE POLICY workflows_select ON workflows FOR SELECT
  USING (created_by = current_setting('app.current_user', true) OR is_template = true);
CREATE POLICY workflows_insert ON workflows FOR INSERT
  WITH CHECK (created_by = current_setting('app.current_user', true));
CREATE POLICY workflows_update ON workflows FOR UPDATE
  USING (created_by = current_setting('app.current_user', true));
CREATE POLICY workflows_delete ON workflows FOR DELETE
  USING (created_by = current_setting('app.current_user', true));

-- workflow_runs: 用户只能操作自己的
CREATE POLICY workflow_runs_select ON workflow_runs FOR SELECT
  USING (created_by = current_setting('app.current_user', true));
CREATE POLICY workflow_runs_insert ON workflow_runs FOR INSERT
  WITH CHECK (created_by = current_setting('app.current_user', true));
CREATE POLICY workflow_runs_update ON workflow_runs FOR UPDATE
  USING (created_by = current_setting('app.current_user', true));

-- node_executions: 通过 run 关联，用户只能看自己 run 的节点
CREATE POLICY node_executions_select ON node_executions FOR SELECT
  USING (run_id IN (SELECT id FROM workflow_runs WHERE created_by = current_setting('app.current_user', true)));
