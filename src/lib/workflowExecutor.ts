/**
 * src/lib/workflowExecutor.ts
 * 
 * DAG 执行器 — TypeScript 实现
 * 
 * 职责：
 * 1. 解析工作流图，拓扑排序确定执行顺序
 * 2. 按层级并行执行节点
 * 3. 节点间数据传递（上游 output → 下游 input）
 * 4. 失败自动重试（maxRetries）
 * 5. 更新 Supabase 中的 workflow_runs / node_executions 状态
 * 
 * 当前实现：Next.js 端异步执行（API Route 触发后 fire-and-forget）
 * 未来升级：迁移到 FastAPI + Procrastinate 做持久化任务队列
 */

import { supabaseService } from './db';
import { topologicalSort, getUpstreamNodes } from './workflowGraph';
import type {
  WorkflowGraph, WorkflowNode, WorkflowNodeType,
  NodeConfig, NodeStatus,
} from './workflowTypes';

// ===== 节点执行器注册表 =====

export type NodeExecutorFn = (
  node: WorkflowNode,
  inputs: Record<string, unknown>,
  config: NodeConfig,
) => Promise<unknown>;

const executors: Partial<Record<WorkflowNodeType, NodeExecutorFn>> = {};

/** 注册节点执行器 */
export function registerNodeExecutor(type: WorkflowNodeType, fn: NodeExecutorFn) {
  executors[type] = fn;
}

/** 获取节点执行器 */
function getExecutor(type: WorkflowNodeType): NodeExecutorFn {
  const fn = executors[type];
  if (!fn) {
    return async () => {
      throw new Error(`No executor registered for node type: ${type}`);
    };
  }
  return fn;
}

// ===== 内置执行器：script_input =====
registerNodeExecutor('script_input', async (node, inputs, config) => {
  // 剧本输入节点：直接返回配置中的文本内容
  // 实际运行时，文本来自 run 的 input 参数
  return {
    text: config.scriptInput?.content || inputs['text'] || '',
  };
});

// ===== 内置执行器：batch_split =====
registerNodeExecutor('batch_split', async (node, inputs) => {
  // 将上游的 storyboard/prompts 按 scenes 拆分
  const storyboard = inputs['storyboard'] as any;
  const prompts = inputs['prompts'] as any;

  if (storyboard?.scenes) {
    return {
      items: storyboard.scenes,
      count: storyboard.scenes.length,
    };
  }
  if (prompts?.items) {
    return {
      items: prompts.items,
      count: prompts.items.length,
    };
  }
  // 直接透传
  return { items: [inputs], count: 1 };
});

// ===== 内置执行器：batch_merge =====
registerNodeExecutor('batch_merge', async (node, inputs) => {
  // 汇聚所有上游的结果
  const items = inputs['items'] || inputs['collection'] || [];
  return {
    collection: Array.isArray(items) ? items : [items],
    count: Array.isArray(items) ? items.length : 1,
  };
});

// ===== DAG 执行引擎 =====

export interface ExecutionContext {
  runId: string;
  workflowId: string;
  graph: WorkflowGraph;
  runInput: Record<string, unknown>;
  /** 每个节点的输出缓存 */
  nodeOutputs: Map<string, unknown>;
  /** 是否已取消 */
  cancelled: boolean;
}

/**
 * 执行完整工作流
 * 
 * 被 /api/workflows/[id]/run 触发后异步调用
 */
export async function executeWorkflow(
  runId: string,
  workflowId: string,
  graph: WorkflowGraph,
  runInput: Record<string, unknown> = {},
): Promise<void> {
  const db = supabaseService();
  const ctx: ExecutionContext = {
    runId,
    workflowId,
    graph,
    runInput,
    nodeOutputs: new Map(),
    cancelled: false,
  };

  try {
    // 1. 拓扑排序
    const levels = topologicalSort(graph);
    if (!levels) {
      await updateRunStatus(db, runId, 'failed', 'Workflow graph has cycles');
      return;
    }

    const totalNodes = graph.nodes.length;
    let completedNodes = 0;

    // 2. 按层级执行
    for (const level of levels) {
      // 检查是否被取消
      const { data: currentRun } = await db
        .from('workflow_runs')
        .select('status')
        .eq('id', runId)
        .single();

      if (currentRun?.status === 'cancelled') {
        ctx.cancelled = true;
        return;
      }

      // 同层节点并行执行
      const results = await Promise.allSettled(
        level.map(nodeId => executeNode(ctx, nodeId, db)),
      );

      // 处理结果
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const nodeId = level[i];

        if (result.status === 'rejected') {
          const reason = result.reason;

          // HumanReview 节点特殊处理：暂停而非失败
          if (reason?.isReviewPending) {
            await db
              .from('workflow_runs')
              .update({ status: 'paused', progress: completedNodes / totalNodes })
              .eq('id', runId);
            await updateNodeStatus(db, runId, nodeId, 'running'); // 保持 running 状态等待审批
            // 保存当前执行上下文，以便恢复
            await db
              .from('workflow_runs')
              .update({ input: { ...ctx.runInput, __pausedAtLevel: levels.indexOf(level), __nodeOutputs: Object.fromEntries(ctx.nodeOutputs) } })
              .eq('id', runId);
            return; // 暂停执行，等待 resume
          }

          const node = graph.nodes.find(n => n.id === nodeId);
          const maxRetries = node?.data?.config?.maxRetries ?? 2;
          
          // 获取当前重试次数
          const { data: nodeExec } = await db
            .from('node_executions')
            .select('retry_count')
            .eq('run_id', runId)
            .eq('node_id', nodeId)
            .single();

          const retryCount = nodeExec?.retry_count || 0;

          if (retryCount < maxRetries) {
            // 重试
            await db
              .from('node_executions')
              .update({ retry_count: retryCount + 1, status: 'pending' })
              .eq('run_id', runId)
              .eq('node_id', nodeId);

            // 重新执行
            try {
              await executeNode(ctx, nodeId, db);
              completedNodes++;
            } catch (retryErr) {
              // 重试也失败，标记整个 run 失败
              await updateNodeStatus(db, runId, nodeId, 'failed', undefined, String(retryErr));
              await updateRunStatus(db, runId, 'failed', `Node ${nodeId} failed after ${retryCount + 1} retries: ${retryErr}`);
              return;
            }
          } else {
            // 超过重试次数
            await updateRunStatus(db, runId, 'failed', `Node ${nodeId} failed: ${result.reason}`);
            return;
          }
        } else {
          completedNodes++;
        }
      }

      // 更新进度
      const progress = totalNodes > 0 ? completedNodes / totalNodes : 1;
      await db
        .from('workflow_runs')
        .update({ progress: Math.min(progress, 1) })
        .eq('id', runId);
    }

    // 3. 收集最终输出（最后一层节点的输出）
    const lastLevel = levels[levels.length - 1];
    const finalOutput: Record<string, unknown> = {};
    for (const nodeId of lastLevel) {
      finalOutput[nodeId] = ctx.nodeOutputs.get(nodeId);
    }

    // 4. 标记完成
    await db
      .from('workflow_runs')
      .update({
        status: 'completed',
        progress: 1,
        output: finalOutput,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

  } catch (err) {
    await updateRunStatus(db, runId, 'failed', String(err));
  }
}

/**
 * 恢复被 HumanReview 暂停的工作流
 * 
 * 被 /api/workflows/runs/[runId]/review 调用
 */
export async function resumeWorkflow(
  runId: string,
  reviewNodeId: string,
  action: 'approve' | 'reject',
  modifiedOutput?: unknown,
): Promise<void> {
  const db = supabaseService();

  if (action === 'reject') {
    await updateNodeStatus(db, runId, reviewNodeId, 'failed', undefined, 'Rejected by reviewer');
    await updateRunStatus(db, runId, 'failed', `Review rejected at node ${reviewNodeId}`);
    return;
  }

  // approve: 标记审批节点完成，然后恢复执行
  const output = modifiedOutput || { approved: true };
  await updateNodeStatus(db, runId, reviewNodeId, 'completed', output);

  // 获取 run 信息
  const { data: run } = await db
    .from('workflow_runs')
    .select('workflow_id, input')
    .eq('id', runId)
    .single();

  if (!run) throw new Error('Run not found');

  // 获取工作流图
  const { data: workflow } = await db
    .from('workflows')
    .select('graph')
    .eq('id', run.workflow_id)
    .single();

  if (!workflow) throw new Error('Workflow not found');

  // 更新状态为 running 并重新执行
  await db
    .from('workflow_runs')
    .update({ status: 'running' })
    .eq('id', runId);

  // 重新触发执行（从头开始，已完成的节点会被跳过）
  executeWorkflow(runId, run.workflow_id, workflow.graph, run.input || {}).catch(err => {
    console.error('[workflow-resume] error:', err);
  });
}

/**
 * 执行单个节点
 */
async function executeNode(
  ctx: ExecutionContext,
  nodeId: string,
  db: ReturnType<typeof supabaseService>,
): Promise<void> {
  const node = ctx.graph.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  // 检查节点是否已完成（恢复执行时跳过）
  const { data: existingExec } = await db
    .from('node_executions')
    .select('status, output')
    .eq('run_id', ctx.runId)
    .eq('node_id', nodeId)
    .single();

  if (existingExec?.status === 'completed') {
    // 已完成，恢复输出到缓存并跳过
    if (existingExec.output) {
      ctx.nodeOutputs.set(nodeId, existingExec.output);
    }
    return;
  }

  // 标记开始
  await updateNodeStatus(db, ctx.runId, nodeId, 'running');

  try {
    // 收集上游输出作为本节点输入
    const upstreamIds = getUpstreamNodes(nodeId, ctx.graph);
    const inputs: Record<string, unknown> = { ...ctx.runInput };
    for (const upId of upstreamIds) {
      const upOutput = ctx.nodeOutputs.get(upId);
      if (upOutput && typeof upOutput === 'object') {
        Object.assign(inputs, upOutput);
      }
    }

    // 执行
    const executor = getExecutor(node.type);
    const output = await executor(node, inputs, node.data.config);

    // 缓存输出
    ctx.nodeOutputs.set(nodeId, output);

    // 标记完成
    await updateNodeStatus(db, ctx.runId, nodeId, 'completed', output);
  } catch (err) {
    await updateNodeStatus(db, ctx.runId, nodeId, 'failed', undefined, String(err));
    throw err;
  }
}

// ===== DB 辅助函数 =====

async function updateRunStatus(
  db: ReturnType<typeof supabaseService>,
  runId: string,
  status: string,
  error?: string,
) {
  await db
    .from('workflow_runs')
    .update({
      status,
      error: error || null,
      ...(status === 'completed' || status === 'failed' || status === 'cancelled'
        ? { completed_at: new Date().toISOString() }
        : {}),
    })
    .eq('id', runId);
}

async function updateNodeStatus(
  db: ReturnType<typeof supabaseService>,
  runId: string,
  nodeId: string,
  status: NodeStatus,
  output?: unknown,
  error?: string,
) {
  await db
    .from('node_executions')
    .update({
      status,
      ...(output !== undefined ? { output } : {}),
      ...(error ? { error } : {}),
      ...(status === 'running' ? { started_at: new Date().toISOString() } : {}),
      ...(status === 'completed' || status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('run_id', runId)
    .eq('node_id', nodeId);
}
