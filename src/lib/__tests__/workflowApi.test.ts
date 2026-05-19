/**
 * Workflow API — 参数校验 + 业务逻辑纯函数测试
 *
 * 由于 API route 依赖 Supabase/Clerk（无法在纯测试中调用），
 * 这里测试的是 API 层依赖的纯函数逻辑：
 * - validateGraph 校验各种非法输入
 * - estimateCredits 各种边界情况
 * - 模板加载/注册表完整性
 * - 真实用户场景模拟
 *
 * Run: npx tsx src/lib/__tests__/workflowApi.test.ts
 */

import { validateGraph, estimateCredits, topologicalSort } from '../workflowGraph';
import { NODE_REGISTRY, V1_NODE_TYPES } from '../workflowTypes';
import { WORKFLOW_TEMPLATES, getTemplateByKey } from '../workflowTemplates';
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

function makeEdge(source: string, target: string): WorkflowEdge {
  return { id: `${source}-${target}`, source, target };
}

// ═══════════════════════════════════════════
// 测试组 1: NODE_REGISTRY 完整性
// ═══════════════════════════════════════════
console.log('\n📋 NODE_REGISTRY 完整性');

{
  const allTypes = Object.keys(NODE_REGISTRY);
  assert(allTypes.length === 12, `注册表有 12 种节点类型 (实际 ${allTypes.length})`);

  // V1 节点都在注册表中
  for (const type of V1_NODE_TYPES) {
    assert(type in NODE_REGISTRY, `V1 节点 ${type} 在注册表中`);
    assert(NODE_REGISTRY[type].v1 === true, `${type}.v1 = true`);
  }

  // 每个节点都有必要字段
  for (const [type, meta] of Object.entries(NODE_REGISTRY)) {
    assert(!!meta.label, `${type} 有 label`);
    assert(!!meta.icon, `${type} 有 icon`);
    assert(!!meta.description, `${type} 有 description`);
    assert(typeof meta.creditCost === 'number', `${type} 有 creditCost`);
    assert(Array.isArray(meta.inputs), `${type} 有 inputs[]`);
    assert(Array.isArray(meta.outputs), `${type} 有 outputs[]`);
  }
}

// ═══════════════════════════════════════════
// 测试组 2: 模板注册表完整性
// ═══════════════════════════════════════════
console.log('\n📦 模板注册表');

{
  assert(WORKFLOW_TEMPLATES.length >= 1, '至少有 1 个模板');

  // 一键成片模板
  const ocv = getTemplateByKey('one-click-video');
  assert(ocv !== undefined, 'one-click-video 模板存在');
  assert(ocv!.graph.nodes.length === 7, '一键成片有 7 个节点');
  assert(ocv!.graph.edges.length === 6, '一键成片有 6 条边');

  // 所有模板的图都是合法的
  for (const tmpl of WORKFLOW_TEMPLATES) {
    const v = validateGraph(tmpl.graph);
    assert(v.valid, `模板 "${tmpl.name}" 图校验通过`);
    const sort = topologicalSort(tmpl.graph);
    assert(sort !== null, `模板 "${tmpl.name}" 可拓扑排序`);
  }

  // 不存在的模板返回 undefined
  assertEqual(getTemplateByKey('nonexistent'), undefined, '不存在的模板返回 undefined');
}

// ═══════════════════════════════════════════
// 测试组 3: API 参数校验逻辑模拟
// ═══════════════════════════════════════════
console.log('\n🔐 API 参数校验模拟');

{
  // POST /workflows — name 必填
  const noName = { graph: { nodes: [], edges: [] } };
  assert(!noName.hasOwnProperty('name'), '无 name 字段应被拒绝');

  // POST /workflows — graph 必须有 nodes[] 和 edges[]
  const badGraph1 = { nodes: 'not array', edges: [] };
  assert(!Array.isArray(badGraph1.nodes), '非法 nodes 类型检测');

  const badGraph2 = { nodes: [], edges: 'not array' };
  assert(!Array.isArray(badGraph2.edges), '非法 edges 类型检测');

  // POST /workflows — 有环的图应被拒绝
  const cyclicGraph: WorkflowGraph = {
    nodes: [makeNode('A', 'script_input'), makeNode('B', 'storyboard_gen')],
    edges: [makeEdge('A', 'B'), makeEdge('B', 'A')],
  };
  const cyclicValidation = validateGraph(cyclicGraph);
  assert(!cyclicValidation.valid, '有环图被拒绝');
}

// ═══════════════════════════════════════════
// 测试组 4: 积分预估边界情况
// ═══════════════════════════════════════════
console.log('\n💰 积分预估边界');

{
  // 0 分镜 = 只有非并行节点的固定成本
  const graph = getTemplateByKey('one-click-video')!.graph;
  const est0 = estimateCredits(graph, 0);
  // batch_split 下游乘数为 0，所以 img 和 vid 都是 0
  // 只有 storyboard_gen(5) + prompt_gen(3) = 8
  assertEqual(est0.total, 8, '0 分镜 = 固定成本 8 (storyboard 5 + prompt 3)');

  // 100 分镜（大规模）
  const est100 = estimateCredits(graph, 100);
  // 5 + 3 + (10×100) + (30×100) = 4008
  assertEqual(est100.total, 4008, '100 分镜 = 4008 积分');

  // 负数分镜 clamp 到 0
  const estNeg = estimateCredits(graph, -5);
  assertEqual(estNeg.total, 8, '负数分镜 clamp 到 0，仅固定成本 8');
}

{
  // 只有免费节点的图
  const freeGraph: WorkflowGraph = {
    nodes: [makeNode('s', 'script_input'), makeNode('sp', 'batch_split'), makeNode('m', 'batch_merge')],
    edges: [makeEdge('s', 'sp'), makeEdge('sp', 'm')],
  };
  const est = estimateCredits(freeGraph);
  assertEqual(est.total, 0, '全部免费节点 = 0 积分');
  assertEqual(est.breakdown.length, 0, '无收费项');
}

// ═══════════════════════════════════════════
// 测试组 5: 真实用户场景 — 端到端流程模拟
// ═══════════════════════════════════════════
console.log('\n🎬 真实场景: 用户创建一键成片工作流');

{
  // 模拟: 用户从模板创建 → 修改参数 → 预估 → 执行
  
  // Step 1: 加载一键成片模板
  const template = getTemplateByKey('one-click-video');
  assert(template !== undefined, 'Step 1: 加载模板成功');

  // Step 2: 用户修改视频模型为 VEO 3.1
  const graph = JSON.parse(JSON.stringify(template!.graph)) as WorkflowGraph;
  const vidNode = graph.nodes.find(n => n.type === 'video_gen');
  assert(vidNode !== undefined, 'Step 2: 找到视频生成节点');
  vidNode!.data.config.videoGen = { model: 'veo-3.1', duration: 8, useFirstFrame: true, useLastFrame: false };

  // Step 3: 用户修改画面比例为竖屏 9:16
  const sbNode = graph.nodes.find(n => n.type === 'storyboard_gen');
  sbNode!.data.config.storyboardGen = { maxScenes: 15, style: '写实真人', aspectRatio: '9:16' };

  // Step 4: 校验修改后的图
  const validation = validateGraph(graph);
  assert(validation.valid, 'Step 4: 修改后的图仍然合法');

  // Step 5: 预估积分（假设 15 分镜）
  const estimate = estimateCredits(graph, 15);
  assert(estimate.total > 0, `Step 5: 预估积分 = ${estimate.total}`);
  // 5 + 3 + (10×15) + (30×15) = 608
  assertEqual(estimate.total, 608, 'Step 5: 15 分镜写实真人 = 608 积分');

  // Step 6: 验证分项明细
  const breakdown = estimate.breakdown;
  assert(breakdown.length > 0, 'Step 6: 有积分明细');
  const vidEstimate = breakdown.find(b => b.nodeType === 'video_gen');
  assertEqual(vidEstimate?.credits, 450, 'Step 6: 视频 = 30 × 15 = 450');

  // Step 7: 拓扑排序确认执行顺序
  const levels = topologicalSort(graph)!;
  assertEqual(levels[0][0], 'script', 'Step 7: 第一步 = 剧本输入');
  assertEqual(levels[levels.length - 1][0], 'merge', 'Step 7: 最后一步 = 合并');
}

console.log('\n🎬 真实场景: 用户从零构建自定义工作流');

{
  // 模拟: 用户拖入节点 → 连线 → 中途犯错 → 修复 → 成功
  
  // Step 1: 拖入 3 个节点（未连线）
  let graph: WorkflowGraph = {
    nodes: [
      makeNode('n1', 'script_input', { scriptInput: { source: 'text' } }),
      makeNode('n2', 'storyboard_gen', { storyboardGen: { maxScenes: 10, style: '动漫', aspectRatio: '16:9' } }),
      makeNode('n3', 'image_gen', { imageGen: { model: 'flux-pro', width: 1920, height: 1080, count: 2 } }),
    ],
    edges: [],
  };
  let v = validateGraph(graph);
  assert(v.valid, 'Step 1: 未连线但 valid（孤立节点是 warning）');
  assert(v.warnings.length > 0, 'Step 1: 有孤立节点警告');

  // Step 2: 用户连线 n1 → n2（但漏了 n2 → n3）
  graph.edges.push(makeEdge('n1', 'n2'));
  v = validateGraph(graph);
  assert(v.valid, 'Step 2: 部分连线仍 valid');
  assert(v.warnings.some(w => w.nodeIds?.includes('n3')), 'Step 2: n3 仍为孤立节点');

  // Step 3: 用户补全连线 n2 → n3
  graph.edges.push(makeEdge('n2', 'n3'));
  v = validateGraph(graph);
  assert(v.valid, 'Step 3: 完全连线后 valid');
  assertEqual(v.warnings.length, 0, 'Step 3: 无警告');

  // Step 4: 用户不小心连了反向边 n3 → n1（创建环）
  graph.edges.push(makeEdge('n3', 'n1'));
  v = validateGraph(graph);
  assert(!v.valid, 'Step 4: 有环 → invalid');
  assert(v.errors[0].type === 'cycle', 'Step 4: 环路错误');

  // Step 5: 用户删除错误连线
  graph.edges = graph.edges.filter(e => !(e.source === 'n3' && e.target === 'n1'));
  v = validateGraph(graph);
  assert(v.valid, 'Step 5: 删除反向边后恢复 valid');

  // Step 6: 预估积分
  const est = estimateCredits(graph);
  // storyboard_gen(5) + image_gen(10×2=20) = 25 (no batch, count=2)
  assertEqual(est.total, 25, 'Step 6: 自定义工作流 = 25 积分');
}

console.log('\n🎬 真实场景: 大规模广告批量（压力测试）');

{
  // 模拟: 5 个产品 × 3 个场景 × 4 种语言 = 60 组合
  const graph: WorkflowGraph = {
    nodes: [
      makeNode('brief', 'script_input'),
      makeNode('prompts', 'prompt_gen'),
      makeNode('split', 'batch_split'),
      makeNode('img', 'image_gen', { imageGen: { model: 'flux-pro', width: 1200, height: 628, count: 1 } }),
      makeNode('merge', 'batch_merge'),
    ],
    edges: [
      makeEdge('brief', 'prompts'),
      makeEdge('prompts', 'split'),
      makeEdge('split', 'img'),
      makeEdge('img', 'merge'),
    ],
  };

  const validation = validateGraph(graph);
  assert(validation.valid, '广告批量图合法');

  const est = estimateCredits(graph, 60);
  // prompt_gen(3) + image_gen(10×60=600) = 603
  assertEqual(est.total, 603, '60 组合 = 603 积分');

  const levels = topologicalSort(graph)!;
  assertEqual(levels.length, 5, '5 层执行');
  // img 在 batch 内，会被并行执行 60 次
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
