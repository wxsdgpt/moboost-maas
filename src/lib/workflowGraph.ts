// src/lib/workflowGraph.ts
// 工作流图 — 纯函数工具集（零依赖）
// 拓扑排序、环路检测、积分预估、图校验

import type {
  WorkflowGraph, WorkflowNode, WorkflowEdge,
  WorkflowNodeType, CreditEstimate, CreditBreakdownItem,
  NODE_REGISTRY,
} from './workflowTypes';

// ===== 拓扑排序 =====
// 返回按层级分组的节点 ID 数组（同层可并行）
// 如果图有环，返回 null
export function topologicalSort(graph: WorkflowGraph): string[][] | null {
  const { nodes, edges } = graph;
  const nodeIds = new Set(nodes.map(n => n.id));
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};

  // 初始化
  for (const node of nodes) {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  }

  // 构建图
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adjacency[edge.source].push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
  }

  // BFS Kahn's algorithm，按层级分组
  const levels: string[][] = [];
  let queue = Object.keys(inDegree).filter(id => inDegree[id] === 0);
  let processed = 0;

  while (queue.length > 0) {
    levels.push([...queue]);
    processed += queue.length;
    const nextQueue: string[] = [];

    for (const nodeId of queue) {
      for (const neighbor of adjacency[nodeId]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          nextQueue.push(neighbor);
        }
      }
    }
    queue = nextQueue;
  }

  // 如果处理的节点数 < 总节点数，说明有环
  if (processed < nodes.length) {
    return null;
  }

  return levels;
}

// ===== 环路检测 =====
export function detectCycles(graph: WorkflowGraph): string[][] {
  const { nodes, edges } = graph;
  const adjacency: Record<string, string[]> = {};
  for (const node of nodes) adjacency[node.id] = [];
  for (const edge of edges) {
    if (adjacency[edge.source]) adjacency[edge.source].push(edge.target);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(nodeId: string, path: string[]): void {
    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    for (const neighbor of (adjacency[nodeId] || [])) {
      if (inStack.has(neighbor)) {
        // 找到环：从 neighbor 在 path 中的位置到末尾
        const cycleStart = path.indexOf(neighbor);
        cycles.push([...path.slice(cycleStart), neighbor]);
      } else if (!visited.has(neighbor)) {
        dfs(neighbor, path);
      }
    }

    path.pop();
    inStack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  return cycles;
}

// ===== 图校验 =====
export interface GraphValidation {
  valid: boolean;
  errors: GraphError[];
  warnings: GraphWarning[];
}

export interface GraphError {
  type: 'cycle' | 'no_nodes' | 'disconnected_required' | 'invalid_connection';
  message: string;
  nodeIds?: string[];
}

export interface GraphWarning {
  type: 'orphan_node' | 'no_output';
  message: string;
  nodeIds?: string[];
}

export function validateGraph(graph: WorkflowGraph): GraphValidation {
  const errors: GraphError[] = [];
  const warnings: GraphWarning[] = [];

  // 1. 至少有一个节点
  if (graph.nodes.length === 0) {
    errors.push({ type: 'no_nodes', message: '工作流至少需要一个节点' });
    return { valid: false, errors, warnings };
  }

  // 2. 环路检测
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    errors.push({
      type: 'cycle',
      message: `工作流不能有循环（发现 ${cycles.length} 个环）`,
      nodeIds: Array.from(new Set(cycles.flat())),
    });
  }

  // 3. 孤立节点（有连线的节点集合 vs 全部节点）
  const connectedNodes = new Set<string>();
  for (const edge of graph.edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }
  const orphans = graph.nodes.filter(n => !connectedNodes.has(n.id));
  if (orphans.length > 0 && graph.nodes.length > 1) {
    warnings.push({
      type: 'orphan_node',
      message: `${orphans.length} 个节点未连接，运行时将被跳过`,
      nodeIds: orphans.map(n => n.id),
    });
  }

  // 4. 没有出度的节点（终端节点）应该存在
  const hasOutEdge = new Set(graph.edges.map(e => e.source));
  const terminalNodes = graph.nodes.filter(n => !hasOutEdge.has(n.id));
  if (terminalNodes.length === 0 && graph.nodes.length > 1) {
    warnings.push({
      type: 'no_output',
      message: '没有终端输出节点',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ===== 积分预估 =====
const CREDIT_COSTS: Record<WorkflowNodeType, number> = {
  script_input: 0,
  storyboard_gen: 5,
  prompt_gen: 3,
  image_gen: 10,
  video_gen: 30,
  batch_split: 0,
  batch_merge: 0,
  character_extract: 3,
  scene_extract: 3,
  tts_gen: 8,
  video_merge: 5,
  human_review: 0,
};

export function estimateCredits(
  graph: WorkflowGraph,
  estimatedSceneCount: number = 10,
): CreditEstimate {
  const breakdown: CreditBreakdownItem[] = [];

  // 找出 batch_split 下游的节点（会被乘以分镜数量）
  const batchDownstream = new Set<string>();
  const batchSplitNodes = graph.nodes.filter(n => n.type === 'batch_split');

  if (batchSplitNodes.length > 0) {
    // BFS 从 batch_split 找到 batch_merge 之间的所有节点
    const adjacency: Record<string, string[]> = {};
    for (const node of graph.nodes) adjacency[node.id] = [];
    for (const edge of graph.edges) {
      if (adjacency[edge.source]) adjacency[edge.source].push(edge.target);
    }

    for (const splitNode of batchSplitNodes) {
      const queue = [...(adjacency[splitNode.id] || [])];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        const node = graph.nodes.find(n => n.id === current);
        if (node && node.type !== 'batch_merge') {
          batchDownstream.add(current);
          queue.push(...(adjacency[current] || []));
        }
      }
    }
  }

  for (const node of graph.nodes) {
    const baseCost = CREDIT_COSTS[node.type] || 0;
    if (baseCost === 0) continue;

    const rawMultiplier = batchDownstream.has(node.id) ? estimatedSceneCount : 1;
    const multiplier = Math.max(0, rawMultiplier); // clamp 负数到 0
    const count = node.type === 'image_gen'
      ? (node.data?.config?.imageGen?.count || 1) * multiplier
      : multiplier;

    breakdown.push({
      nodeId: node.id,
      nodeType: node.type,
      label: node.data?.config?.label || node.type,
      credits: baseCost * count,
      multiplier: count > 1 ? count : undefined,
    });
  }

  return {
    total: breakdown.reduce((sum, item) => sum + item.credits, 0),
    breakdown,
  };
}

// ===== 辅助：获取上游节点 =====
export function getUpstreamNodes(nodeId: string, graph: WorkflowGraph): string[] {
  return graph.edges
    .filter(e => e.target === nodeId)
    .map(e => e.source);
}

// ===== 辅助：获取下游节点 =====
export function getDownstreamNodes(nodeId: string, graph: WorkflowGraph): string[] {
  return graph.edges
    .filter(e => e.source === nodeId)
    .map(e => e.target);
}
