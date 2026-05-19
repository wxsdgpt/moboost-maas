/**
 * src/lib/workflowNodes/reviewNodes.ts
 *
 * 审批节点执行器：HumanReview
 * 暂停工作流执行，等待人工审核通过/拒绝/修改
 */

import { registerNodeExecutor } from '../workflowExecutor';
import { supabaseService } from '../db';

// ===== HumanReview — 人工审批节点 =====
// 
// 执行到此节点时：
// 1. 将 node_execution 状态设为 'running'（但实际是等待人工）
// 2. 将 workflow_run 状态设为 'paused'
// 3. 通过 SSE 推送 'awaiting_review' 事件
// 4. 等待用户通过 API 调用 approve/reject
//
// 恢复执行：POST /api/workflows/runs/[runId]/review
//   body: { nodeId, action: 'approve' | 'reject', modifiedOutput?: any }

registerNodeExecutor('human_review', async (node, inputs, config) => {
  // 特殊处理：这个节点不直接完成
  // 而是抛出一个特殊错误让执行器暂停
  // 执行器识别这个错误后将 run 设为 paused 而非 failed
  
  const error = new Error('HUMAN_REVIEW_PENDING');
  (error as any).isReviewPending = true;
  (error as any).nodeId = node.id;
  (error as any).inputs = inputs;
  throw error;
});
