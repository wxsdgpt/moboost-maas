/**
 * Workflow Graph — 纯函数单元测试
 *
 * 覆盖: topologicalSort / detectCycles / validateGraph / estimateCredits
 *
 * Run: npx tsx src/lib/__tests__/workflowGraph.test.ts
 */

import {
  topologicalSort,
  detectCycles,
  validateGraph,
  estimateCredits,
  getUpstreamNodes,
  getDownstreamNodes,
} from '../workflowGraph';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../workflowTypes';

// ──── Test helpers ────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  const eq = JSON.stringify(actual) === JSON.stringify(expected);
  if (eq) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.log(`  ❌ ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeNode(id: string, type: string, config?: any): WorkflowNode {
  return {
    id,
    type: type as any,
    position: { x: 0, y: 0 },
    data: { config: { label: id, ...config } },
  };
}

function makeEdge(source: string, target: string): WorkflowEdge {
  return { id: `${source}-${target}`, source, target };
}

// ──── Graph builders for test scenarios ────

// 简单线性: A → B → C
function linearGraph(): WorkflowGraph {
  return {
    nodes: [makeNode('A', 'script_input'), makeNode('B', 'storyboard_gen'), makeNode('C', 'prompt_gen')],
    edges: [makeEdge('A', 'B'), makeEdge('B', 'C')],
  };
}

// 并行分支: A → B, A → C, B → D, C → D
function diamondGraph(): WorkflowGraph {
  return {
    nodes: [
      makeNode('A', 'script_input'),
      makeNode('B', 'image_gen'),
      makeNode('C', 'image_gen'),
      makeNode('D', 'batch_merge'),
    ],
    edges: [makeEdge('A', 'B'), makeEdge('A', 'C'), makeEdge('B', 'D'), makeEdge('C', 'D')],
  };
}

// 有环: A → B → C → A
function cyclicGraph(): WorkflowGraph {
  return {
    nodes: [makeNode('A', 'script_input'), makeNode('B', 'storyboard_gen'), makeNode('C', 'prompt_gen')],
    edges: [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('C', 'A')],
  };
}

// 空图
function emptyGraph(): WorkflowGraph {
  return { nodes: [], edges: [] };
}

// 单节点
function singleNode(): WorkflowGraph {
  return { nodes: [makeNode('A', 'script_input')], edges: [] };
}

// 有孤立节点: A → B, C 孤立
function orphanGraph(): WorkflowGraph {
  return {
    nodes: [makeNode('A', 'script_input'), makeNode('B', 'storyboard_gen'), makeNode('C', 'image_gen')],
    edges: [makeEdge('A', 'B')],
  };
}

// 真实场景：一键成片模板
function oneClickVideoGraph(): WorkflowGraph {
  return {
    nodes: [
      makeNode('script', 'script_input', { scriptInput: { source: 'text' } }),
      makeNode('storyboard', 'storyboard_gen', { storyboardGen: { maxScenes: 20, style: '2D动漫', aspectRatio: '16:9' } }),
      makeNode('prompts', 'prompt_gen', { promptGen: { dictionary: 'jurilu' } }),
      makeNode('split', 'batch_split'),
      makeNode('img', 'image_gen', { imageGen: { model: 'flux-pro', width: 1920, height: 1080, count: 1 } }),
      makeNode('vid', 'video_gen', { videoGen: { model: 'seedance-2.0', duration: 5, useFirstFrame: true, useLastFrame: false } }),
      makeNode('merge', 'batch_merge'),
    ],
    edges: [
      makeEdge('script', 'storyboard'),
      makeEdge('storyboard', 'prompts'),
      makeEdge('prompts', 'split'),
      makeEdge('split', 'img'),
      makeEdge('img', 'vid'),
      makeEdge('vid', 'merge'),
    ],
  };
}

// 复杂真实场景：带分支的广告批量生成
function batchAdsGraph(): WorkflowGraph {
  return {
    nodes: [
      makeNode('brief', 'script_input'),
      makeNode('prompts', 'prompt_gen'),
      makeNode('split', 'batch_split'),
      makeNode('img1', 'image_gen', { imageGen: { model: 'flux-pro', width: 1080, height: 1080, count: 3 } }),
      makeNode('img2', 'image_gen', { imageGen: { model: 'dall-e-3', width: 1080, height: 1080, count: 2 } }),
      makeNode('merge', 'batch_merge'),
    ],
    edges: [
      makeEdge('brief', 'prompts'),
      makeEdge('prompts', 'split'),
      makeEdge('split', 'img1'),
      makeEdge('split', 'img2'),
      makeEdge('img1', 'merge'),
      makeEdge('img2', 'merge'),
    ],
  };
}

// ═══════════════════════════════════════════
// 测试组 1: topologicalSort
// ═══════════════════════════════════════════
console.log('\n📐 topologicalSort');

{
  const levels = topologicalSort(linearGraph());
  assert(levels !== null, 'linear graph has valid sort');
  assertEqual(levels!.length, 3, 'linear graph has 3 levels');
  assertEqual(levels![0], ['A'], 'level 0 = [A]');
  assertEqual(levels![1], ['B'], 'level 1 = [B]');
  assertEqual(levels![2], ['C'], 'level 2 = [C]');
}

{
  const levels = topologicalSort(diamondGraph());
  assert(levels !== null, 'diamond graph has valid sort');
  assertEqual(levels!.length, 3, 'diamond graph has 3 levels');
  assertEqual(levels![0], ['A'], 'diamond level 0 = [A]');
  // B and C can be in any order
  assert(levels![1].length === 2, 'diamond level 1 has 2 nodes (parallel)');
  assert(levels![1].includes('B') && levels![1].includes('C'), 'diamond level 1 = [B,C]');
  assertEqual(levels![2], ['D'], 'diamond level 2 = [D]');
}

{
  const levels = topologicalSort(cyclicGraph());
  assertEqual(levels, null, 'cyclic graph returns null');
}

{
  const levels = topologicalSort(emptyGraph());
  assert(levels !== null, 'empty graph has valid sort');
  assertEqual(levels!.length, 0, 'empty graph has 0 levels');
}

{
  const levels = topologicalSort(singleNode());
  assert(levels !== null, 'single node has valid sort');
  assertEqual(levels!.length, 1, 'single node has 1 level');
  assertEqual(levels![0], ['A'], 'single node level 0 = [A]');
}

{
  // 真实场景：一键成片模板
  const levels = topologicalSort(oneClickVideoGraph());
  assert(levels !== null, 'one-click-video template has valid sort');
  assertEqual(levels!.length, 7, 'one-click-video has 7 levels (fully serial)');
  assertEqual(levels![0], ['script'], 'starts with script_input');
  assertEqual(levels![6], ['merge'], 'ends with batch_merge');
}

{
  // 真实场景：广告批量（含并行）
  const levels = topologicalSort(batchAdsGraph());
  assert(levels !== null, 'batch-ads graph has valid sort');
  // brief → prompts → split → (img1 || img2) → merge = 5 levels
  assertEqual(levels!.length, 5, 'batch-ads has 5 levels');
  assert(levels![3].length === 2, 'batch-ads level 3 has 2 parallel image nodes');
  assert(levels![3].includes('img1') && levels![3].includes('img2'), 'img1 and img2 parallel');
}

// ═══════════════════════════════════════════
// 测试组 2: detectCycles
// ═══════════════════════════════════════════
console.log('\n🔄 detectCycles');

{
  const cycles = detectCycles(linearGraph());
  assertEqual(cycles.length, 0, 'linear graph has no cycles');
}

{
  const cycles = detectCycles(cyclicGraph());
  assert(cycles.length > 0, 'cyclic graph has cycles');
  // 环应该包含 A, B, C
  const allNodes = new Set(cycles.flat());
  assert(allNodes.has('A') && allNodes.has('B') && allNodes.has('C'), 'cycle contains A,B,C');
}

{
  const cycles = detectCycles(diamondGraph());
  assertEqual(cycles.length, 0, 'diamond graph has no cycles (not a cycle, just convergence)');
}

{
  // 自环: A → A
  const selfLoop: WorkflowGraph = {
    nodes: [makeNode('A', 'script_input')],
    edges: [makeEdge('A', 'A')],
  };
  const cycles = detectCycles(selfLoop);
  assert(cycles.length > 0, 'self-loop detected');
}

// ═══════════════════════════════════════════
// 测试组 3: validateGraph
// ═══════════════════════════════════════════
console.log('\n✅ validateGraph');

{
  const result = validateGraph(linearGraph());
  assert(result.valid, 'linear graph is valid');
  assertEqual(result.errors.length, 0, 'no errors');
  assertEqual(result.warnings.length, 0, 'no warnings');
}

{
  const result = validateGraph(emptyGraph());
  assert(!result.valid, 'empty graph is invalid');
  assertEqual(result.errors[0].type, 'no_nodes', 'error type = no_nodes');
}

{
  const result = validateGraph(cyclicGraph());
  assert(!result.valid, 'cyclic graph is invalid');
  assertEqual(result.errors[0].type, 'cycle', 'error type = cycle');
}

{
  const result = validateGraph(orphanGraph());
  assert(result.valid, 'orphan graph is valid (orphans are warnings not errors)');
  assert(result.warnings.length > 0, 'orphan graph has warnings');
  assertEqual(result.warnings[0].type, 'orphan_node', 'warning type = orphan_node');
  assert(result.warnings[0].nodeIds!.includes('C'), 'orphan node C identified');
}

{
  // 真实场景验证
  const result = validateGraph(oneClickVideoGraph());
  assert(result.valid, 'one-click-video template is valid');
  assertEqual(result.errors.length, 0, 'no errors in template');
  assertEqual(result.warnings.length, 0, 'no warnings in template');
}

{
  const result = validateGraph(batchAdsGraph());
  assert(result.valid, 'batch-ads graph is valid');
  assertEqual(result.errors.length, 0, 'no errors in batch-ads');
}

// ═══════════════════════════════════════════
// 测试组 4: estimateCredits
// ═══════════════════════════════════════════
console.log('\n💰 estimateCredits');

{
  // 线性图: script_input(0) + storyboard_gen(5) + prompt_gen(3) = 8
  const est = estimateCredits(linearGraph());
  assertEqual(est.total, 8, 'linear graph costs 8 credits');
  assertEqual(est.breakdown.length, 2, '2 non-zero cost nodes');
}

{
  // 一键成片（10个分镜）:
  // script_input(0) + storyboard_gen(5) + prompt_gen(3) + batch_split(0)
  // + image_gen(10×10=100) + video_gen(30×10=300) + batch_merge(0) = 408
  const est = estimateCredits(oneClickVideoGraph(), 10);
  assertEqual(est.total, 408, 'one-click-video 10 scenes = 408 credits');

  // 分项检查
  const storyboard = est.breakdown.find(b => b.nodeType === 'storyboard_gen');
  assertEqual(storyboard?.credits, 5, 'storyboard_gen = 5');

  const img = est.breakdown.find(b => b.nodeType === 'image_gen');
  assertEqual(img?.credits, 100, 'image_gen = 10 × 10 scenes = 100');
  assertEqual(img?.multiplier, 10, 'image_gen multiplier = 10');

  const vid = est.breakdown.find(b => b.nodeType === 'video_gen');
  assertEqual(vid?.credits, 300, 'video_gen = 30 × 10 scenes = 300');
}

{
  // 一键成片（5个分镜）:
  // 5 + 3 + (10×5) + (30×5) = 208
  const est = estimateCredits(oneClickVideoGraph(), 5);
  assertEqual(est.total, 208, 'one-click-video 5 scenes = 208 credits');
}

{
  // 一键成片（1个分镜）:
  // 5 + 3 + 10 + 30 = 48
  const est = estimateCredits(oneClickVideoGraph(), 1);
  assertEqual(est.total, 48, 'one-click-video 1 scene = 48 credits');
}

{
  // 广告批量（10个组合）:
  // prompt_gen(3) + batch_split(0)
  // + img1(10×3×10=300) + img2(10×2×10=200) + batch_merge(0) = 503
  const est = estimateCredits(batchAdsGraph(), 10);
  // img1 has count=3, img2 has count=2
  // batch downstream: img1 and img2
  // img1: base 10 × count 3 × multiplier 10 = 300
  // img2: base 10 × count 2 × multiplier 10 = 200
  // prompt_gen: 3 (NOT in batch downstream since it's before split)
  // total = 3 + 300 + 200 = 503
  assertEqual(est.total, 503, 'batch-ads 10 combos = 503 credits');
}

{
  // 空图
  const est = estimateCredits(emptyGraph());
  assertEqual(est.total, 0, 'empty graph costs 0');
  assertEqual(est.breakdown.length, 0, 'no breakdown items');
}

// ═══════════════════════════════════════════
// 测试组 5: getUpstreamNodes / getDownstreamNodes
// ═══════════════════════════════════════════
console.log('\n🔗 getUpstreamNodes / getDownstreamNodes');

{
  const graph = diamondGraph();
  const upstream = getUpstreamNodes('D', graph);
  assert(upstream.length === 2, 'D has 2 upstream nodes');
  assert(upstream.includes('B') && upstream.includes('C'), 'D upstream = [B,C]');

  const downstream = getDownstreamNodes('A', graph);
  assert(downstream.length === 2, 'A has 2 downstream nodes');
  assert(downstream.includes('B') && downstream.includes('C'), 'A downstream = [B,C]');
}

{
  const graph = linearGraph();
  const upstream = getUpstreamNodes('A', graph);
  assertEqual(upstream.length, 0, 'A (root) has no upstream');

  const downstream = getDownstreamNodes('C', graph);
  assertEqual(downstream.length, 0, 'C (terminal) has no downstream');
}

// ═══════════════════════════════════════════
// 测试组 6: 真实场景 — 模拟用户操作产生的异常图
// ═══════════════════════════════════════════
console.log('\n🎯 真实场景模拟');

{
  // 场景: 用户拖了节点但忘记连线
  const graph: WorkflowGraph = {
    nodes: [
      makeNode('script', 'script_input'),
      makeNode('storyboard', 'storyboard_gen'),
      makeNode('img', 'image_gen'),
    ],
    edges: [makeEdge('script', 'storyboard')],
    // img 孤立
  };
  const validation = validateGraph(graph);
  assert(validation.valid, 'partially connected graph is valid (orphans = warning)');
  assert(validation.warnings.some(w => w.type === 'orphan_node'), 'has orphan warning');
  assert(validation.warnings[0].nodeIds!.includes('img'), 'img identified as orphan');

  // 排序仍然正常
  const levels = topologicalSort(graph);
  assert(levels !== null, 'partial graph sorts OK');
  // script 和 img 都无前置依赖，在同一层； storyboard 在第二层
  assertEqual(levels!.length, 2, 'orphan img parallels with script (both have 0 in-degree)');
}

{
  // 场景: 用户不小心把输出连回了输入（创建环路）
  const graph: WorkflowGraph = {
    nodes: [
      makeNode('script', 'script_input'),
      makeNode('storyboard', 'storyboard_gen'),
      makeNode('prompts', 'prompt_gen'),
    ],
    edges: [
      makeEdge('script', 'storyboard'),
      makeEdge('storyboard', 'prompts'),
      makeEdge('prompts', 'storyboard'),  // 反向连线！
    ],
  };
  const validation = validateGraph(graph);
  assert(!validation.valid, 'graph with back-edge is invalid');
  assert(validation.errors[0].type === 'cycle', 'cycle error detected');
  const sort = topologicalSort(graph);
  assertEqual(sort, null, 'cyclic graph sort returns null');
}

{
  // 场景: 一键成片跑完后预估 20 个分镜 — 验证积分合理性
  const est = estimateCredits(oneClickVideoGraph(), 20);
  // 5 + 3 + (10×20) + (30×20) = 808
  assertEqual(est.total, 808, 'one-click-video 20 scenes = 808 credits');
  // 验证 breakdown 有正确的 multiplier
  const vidItem = est.breakdown.find(b => b.nodeId === 'vid');
  assertEqual(vidItem?.multiplier, 20, 'video_gen multiplier = 20 for 20 scenes');
  assertEqual(vidItem?.credits, 600, 'video_gen = 30 × 20 = 600');
}

{
  // 场景: 用户把两个 batch_split 串联（应该正常工作，嵌套并行）
  const graph: WorkflowGraph = {
    nodes: [
      makeNode('input', 'script_input'),
      makeNode('split1', 'batch_split'),
      makeNode('gen1', 'image_gen'),
      makeNode('split2', 'batch_split'),
      makeNode('gen2', 'video_gen'),
      makeNode('merge2', 'batch_merge'),
      makeNode('merge1', 'batch_merge'),
    ],
    edges: [
      makeEdge('input', 'split1'),
      makeEdge('split1', 'gen1'),
      makeEdge('gen1', 'split2'),
      makeEdge('split2', 'gen2'),
      makeEdge('gen2', 'merge2'),
      makeEdge('merge2', 'merge1'),
    ],
  };
  const validation = validateGraph(graph);
  assert(validation.valid, 'nested batch splits are valid');
  const sort = topologicalSort(graph);
  assert(sort !== null, 'nested splits sort correctly');
  assertEqual(sort!.length, 7, 'nested splits = 7 levels (fully serial)');
}

{
  // 场景: 完全不连线的多个孤立节点
  const graph: WorkflowGraph = {
    nodes: [
      makeNode('a', 'script_input'),
      makeNode('b', 'image_gen'),
      makeNode('c', 'video_gen'),
    ],
    edges: [],
  };
  const validation = validateGraph(graph);
  assert(validation.valid, 'all orphan nodes = valid (just warnings)');
  // 所有节点应该在同一层（无依赖，可并行）
  const sort = topologicalSort(graph);
  assertEqual(sort!.length, 1, 'all orphans in one parallel level');
  assertEqual(sort![0].length, 3, '3 nodes in parallel');
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
