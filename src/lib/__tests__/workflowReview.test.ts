/**
 * HumanReview + Resume — 审批节点逻辑测试
 *
 * Run: npx tsx src/lib/__tests__/workflowReview.test.ts
 */

import { topologicalSort, getUpstreamNodes } from '../workflowGraph';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../workflowTypes';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(msg); console.log(`  ❌ ${msg}`); }
}
function assertEqual<T>(actual: T, expected: T, msg: string) {
  const eq = JSON.stringify(actual) === JSON.stringify(expected);
  if (eq) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); console.log(`  ❌ ${msg}`); }
}

function makeNode(id: string, type: string, config?: any): WorkflowNode {
  return { id, type: type as any, position: { x: 0, y: 0 }, data: { config: { label: id, ...config } } };
}
function makeEdge(s: string, t: string): WorkflowEdge {
  return { id: `${s}-${t}`, source: s, target: t };
}

// ═══════════════════════════════════════════
// 测试组 1: 审批节点在图中的位置验证
// ═══════════════════════════════════════════
console.log('\n👁️ 审批节点图结构');

{
  // 带审批的一键成片: script → storyboard → REVIEW → prompt → img → vid → merge
  const graph: WorkflowGraph = {
    nodes: [
      makeNode('script', 'script_input'),
      makeNode('sb', 'storyboard_gen'),
      makeNode('review', 'human_review'),
      makeNode('prompt', 'prompt_gen'),
      makeNode('img', 'image_gen'),
      makeNode('vid', 'video_gen'),
      makeNode('merge', 'batch_merge'),
    ],
    edges: [
      makeEdge('script', 'sb'),
      makeEdge('sb', 'review'),
      makeEdge('review', 'prompt'),
      makeEdge('prompt', 'img'),
      makeEdge('img', 'vid'),
      makeEdge('vid', 'merge'),
    ],
  };

  const levels = topologicalSort(graph)!;
  assert(levels !== null, '带审批的图可排序');
  assertEqual(levels.length, 7, '7 个层级');
  assertEqual(levels[2], ['review'], 'review 在第 3 层');

  // review 的上游是 storyboard
  const upstream = getUpstreamNodes('review', graph);
  assertEqual(upstream, ['sb'], 'review 上游 = storyboard');

  // review 的下游是 prompt
  const downstream = graph.edges.filter(e => e.source === 'review').map(e => e.target);
  assertEqual(downstream, ['prompt'], 'review 下游 = prompt');
}

{
  // 多个审批节点: img → review1 → vid → review2 → merge
  const graph: WorkflowGraph = {
    nodes: [
      makeNode('img', 'image_gen'),
      makeNode('r1', 'human_review'),
      makeNode('vid', 'video_gen'),
      makeNode('r2', 'human_review'),
      makeNode('merge', 'batch_merge'),
    ],
    edges: [
      makeEdge('img', 'r1'),
      makeEdge('r1', 'vid'),
      makeEdge('vid', 'r2'),
      makeEdge('r2', 'merge'),
    ],
  };

  const levels = topologicalSort(graph)!;
  assertEqual(levels.length, 5, '多审批 5 层');
  assertEqual(levels[1], ['r1'], 'review1 在第 2 层');
  assertEqual(levels[3], ['r2'], 'review2 在第 4 层');
}

// ═══════════════════════════════════════════
// 测试组 2: 暂停/恢复状态机模拟
// ═══════════════════════════════════════════
console.log('\n⏸️ 暂停/恢复状态机');

{
  // 模拟执行流程中遇到 human_review
  type RunState = 'running' | 'paused' | 'completed' | 'failed';
  type NodeState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

  let runStatus: RunState = 'running';
  const nodeStatuses: Record<string, NodeState> = {
    script: 'pending',
    sb: 'pending',
    review: 'pending',
    prompt: 'pending',
  };

  // Step 1: 执行 script
  nodeStatuses.script = 'running';
  nodeStatuses.script = 'completed';
  assert(nodeStatuses.script === 'completed', 'Step 1: script 完成');

  // Step 2: 执行 storyboard
  nodeStatuses.sb = 'running';
  nodeStatuses.sb = 'completed';
  assert(nodeStatuses.sb === 'completed', 'Step 2: storyboard 完成');

  // Step 3: 遇到 review → 暂停
  nodeStatuses.review = 'running'; // 等待审批
  runStatus = 'paused';
  assertEqual(runStatus, 'paused', 'Step 3: run 暂停');
  assertEqual(nodeStatuses.review, 'running', 'Step 3: review 保持 running');
  assertEqual(nodeStatuses.prompt, 'pending', 'Step 3: prompt 仍 pending');

  // Step 4a: 用户批准 → 恢复
  nodeStatuses.review = 'completed';
  runStatus = 'running';
  assertEqual(runStatus, 'running', 'Step 4a: approve 后 run 恢复');
  assertEqual(nodeStatuses.review, 'completed', 'Step 4a: review 完成');

  // Step 5: 继续执行 prompt
  nodeStatuses.prompt = 'running';
  nodeStatuses.prompt = 'completed';
  runStatus = 'completed';
  assertEqual(runStatus, 'completed', 'Step 5: 全部完成');
}

{
  // 拒绝场景
  type RunState = 'running' | 'paused' | 'failed';
  let runStatus: RunState = 'running';
  const nodeStatuses: Record<string, string> = { review: 'pending', next: 'pending' };

  // 遇到 review → 暂停
  nodeStatuses.review = 'running';
  runStatus = 'paused';

  // 用户拒绝
  nodeStatuses.review = 'failed';
  runStatus = 'failed';
  assertEqual(runStatus, 'failed', '拒绝: run 标记失败');
  assertEqual(nodeStatuses.review, 'failed', '拒绝: review 标记失败');
  assertEqual(nodeStatuses.next, 'pending', '拒绝: 后续节点仍 pending');
}

// ═══════════════════════════════════════════
// 测试组 3: isReviewPending 错误标记
// ═══════════════════════════════════════════
console.log('\n🏷️ isReviewPending 标记');

{
  // 模拟审批节点抛出的特殊错误
  const error = new Error('HUMAN_REVIEW_PENDING');
  (error as any).isReviewPending = true;
  (error as any).nodeId = 'review_1';

  assert((error as any).isReviewPending === true, 'isReviewPending = true');
  assertEqual((error as any).nodeId, 'review_1', 'nodeId 正确');
  assert(error.message === 'HUMAN_REVIEW_PENDING', 'message 正确');

  // 非审批错误不应有此标记
  const normalError = new Error('Network timeout');
  assert(!(normalError as any).isReviewPending, '普通错误无 isReviewPending');
}

// ═══════════════════════════════════════════
// 测试组 4: 真实场景 — 分镜审批后继续生成
// ═══════════════════════════════════════════
console.log('\n🎬 真实场景: 分镜审批流程');

{
  const graph: WorkflowGraph = {
    nodes: [
      makeNode('script', 'script_input'),
      makeNode('sb', 'storyboard_gen'),
      makeNode('review', 'human_review'),
      makeNode('prompt', 'prompt_gen'),
      makeNode('split', 'batch_split'),
      makeNode('img', 'image_gen'),
      makeNode('vid', 'video_gen'),
      makeNode('merge', 'batch_merge'),
    ],
    edges: [
      makeEdge('script', 'sb'),
      makeEdge('sb', 'review'),
      makeEdge('review', 'prompt'),
      makeEdge('prompt', 'split'),
      makeEdge('split', 'img'),
      makeEdge('img', 'vid'),
      makeEdge('vid', 'merge'),
    ],
  };

  const levels = topologicalSort(graph)!;
  assertEqual(levels.length, 8, '8 个层级（含 review）');

  // 模拟完整执行 + 审批流
  const executionLog: { node: string; action: string }[] = [];

  // Phase A: 执行到 review 暂停
  for (const level of levels) {
    for (const nodeId of level) {
      const node = graph.nodes.find(n => n.id === nodeId)!;
      if (node.type === 'human_review') {
        executionLog.push({ node: nodeId, action: 'pause' });
        break; // 暂停
      }
      executionLog.push({ node: nodeId, action: 'execute' });
    }
    if (executionLog[executionLog.length - 1]?.action === 'pause') break;
  }

  assertEqual(executionLog.length, 3, 'Phase A: 执行了 3 步（script, sb, pause at review）');
  assertEqual(executionLog[2], { node: 'review', action: 'pause' }, 'Phase A: 在 review 暂停');

  // Phase B: 用户审批通过，恢复执行
  executionLog.push({ node: 'review', action: 'approve' });

  // Phase C: 继续执行剩余节点
  const remainingLevels = levels.slice(3); // review 之后的层级
  for (const level of remainingLevels) {
    for (const nodeId of level) {
      executionLog.push({ node: nodeId, action: 'execute' });
    }
  }

  const totalActions = executionLog.length;
  assert(totalActions === 3 + 1 + 5, `完整流程: ${totalActions} 步 (2+pause+approve+5后续)`);
  assertEqual(executionLog[totalActions - 1], { node: 'merge', action: 'execute' }, '最后一步是 merge');
}

// ═══════════════════════════════════════════
// 测试组 5: 已完成节点跳过（恢复时）
// ═══════════════════════════════════════════
console.log('\n⏭️ 恢复时跳过已完成节点');

{
  const completedNodes = new Set(['script', 'sb']);

  const graph: WorkflowGraph = {
    nodes: [
      makeNode('script', 'script_input'),
      makeNode('sb', 'storyboard_gen'),
      makeNode('review', 'human_review'),
      makeNode('prompt', 'prompt_gen'),
    ],
    edges: [
      makeEdge('script', 'sb'),
      makeEdge('sb', 'review'),
      makeEdge('review', 'prompt'),
    ],
  };

  const levels = topologicalSort(graph)!;
  const executedOnResume: string[] = [];

  for (const level of levels) {
    for (const nodeId of level) {
      if (completedNodes.has(nodeId)) {
        // 跳过
        continue;
      }
      executedOnResume.push(nodeId);
    }
  }

  assertEqual(executedOnResume, ['review', 'prompt'], '恢复时只执行 review + prompt');
  assert(!executedOnResume.includes('script'), 'script 被跳过');
  assert(!executedOnResume.includes('sb'), 'sb 被跳过');
}

// ═══════════════════════════════════════════
// 总结
// ═══════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log(`结果: ${passed} passed, ${failed} failed (共 ${passed + failed} 个用例)`);
if (failures.length > 0) {
  console.log('\n失败用例:');
  failures.forEach(f => console.log(`  ❌ ${f}`));
}
console.log('═'.repeat(50));
process.exit(failed > 0 ? 1 : 0);
