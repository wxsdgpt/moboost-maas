'use client';

// src/components/workflow/WorkflowEditor.tsx
// 工作流编辑器主组件 — 集成 React Flow 画布 + 节点面板 + 配置面板

import React, { useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { WorkflowNodeType, WorkflowGraph, NodeConfig, WorkflowNode as WFNode, WorkflowEdge as WFEdge } from '@/lib/workflowTypes';
import { NODE_REGISTRY, V1_NODE_TYPES } from '@/lib/workflowTypes';
import { validateGraph, estimateCredits } from '@/lib/workflowGraph';
import WorkflowNodeComponent from './nodes/WorkflowNode';
import NodePanel from './NodePanel';
import ConfigPanel from './ConfigPanel';

// 注册所有节点类型映射到同一个组件
const nodeTypes: Record<string, React.ComponentType<any>> = {};
for (const type of Object.keys(NODE_REGISTRY)) {
  nodeTypes[type] = WorkflowNodeComponent;
}

interface WorkflowEditorProps {
  initialGraph?: WorkflowGraph;
  workflowId?: string;
  workflowName?: string;
  onSave?: (graph: WorkflowGraph, name: string) => Promise<void>;
  onRun?: (graph: WorkflowGraph) => Promise<void>;
}

export default function WorkflowEditor({
  initialGraph,
  workflowId,
  workflowName: initialName,
  onSave,
  onRun,
}: WorkflowEditorProps) {
  // 使用 React Flow 原生 Node/Edge 类型，保存时转换
  const [nodes, setNodes, onNodesChange] = useNodesState(
    (initialGraph?.nodes || []) as Node[],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (initialGraph?.edges || []) as Edge[],
  );
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState(initialName || '未命名工作流');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // 连线
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({
        ...params,
        style: { stroke: '#6366f1', strokeWidth: 2 },
        animated: true,
      }, eds));
    },
    [setEdges],
  );

  // 选中节点
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  // 点击空白处取消选中
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // 拖拽放下节点
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/workflow-node-type') as WorkflowNodeType;
      if (!nodeType || !V1_NODE_TYPES.includes(nodeType)) return;
      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      const meta = NODE_REGISTRY[nodeType];
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${nodeType}_${Date.now()}`,
        type: nodeType,
        position,
        data: {
          config: {
            label: meta.label,
            maxRetries: 2,
            ...(nodeType === 'script_input' ? { scriptInput: { source: 'text' as const } } : {}),
            ...(nodeType === 'storyboard_gen' ? { storyboardGen: { maxScenes: 20, style: '', aspectRatio: '16:9' as const } } : {}),
            ...(nodeType === 'prompt_gen' ? { promptGen: { dictionary: 'jurilu' as const } } : {}),
            ...(nodeType === 'image_gen' ? { imageGen: { model: 'flux-pro', width: 1920, height: 1080, count: 1 } } : {}),
            ...(nodeType === 'video_gen' ? { videoGen: { model: 'seedance-2.0', duration: 5, useFirstFrame: true, useLastFrame: false } } : {}),
          } satisfies NodeConfig,
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes],
  );

  // 节点配置更新
  const onConfigChange = useCallback((nodeId: string, configPatch: Partial<NodeConfig>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            config: { ...(n.data as any).config, ...configPatch },
          },
        };
      }),
    );
    // 同步更新 selectedNode
    setSelectedNode((prev) => {
      if (!prev || prev.id !== nodeId) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          config: { ...(prev.data as any).config, ...configPatch },
        },
      };
    });
  }, [setNodes]);

  // 保存
  const handleSave = async () => {
    if (!onSave) return;
    setSaveStatus('saving');
    try {
      const graph = { nodes, edges } as unknown as WorkflowGraph;
      await onSave(graph, workflowName);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // 运行
  const handleRun = async () => {
    if (!onRun) return;
    const graph = { nodes, edges } as unknown as WorkflowGraph;

    // 校验
    const validation = validateGraph(graph);
    if (!validation.valid) {
      alert(validation.errors.map(e => e.message).join('\n'));
      return;
    }
    if (validation.warnings.length > 0) {
      const proceed = confirm(
        '警告:\n' +
        validation.warnings.map(w => w.message).join('\n') +
        '\n\n是否继续？'
      );
      if (!proceed) return;
    }

    // 积分预估
    const estimate = estimateCredits(graph);
    const confirmed = confirm(
      `本次工作流预估消耗 ${estimate.total} 积分\n\n` +
      '明细:\n' +
      estimate.breakdown.map(b =>
        `  ${b.label}: ${b.credits}c${b.multiplier ? ` (×${b.multiplier})` : ''}`
      ).join('\n') +
      '\n\n是否确认执行？'
    );
    if (!confirmed) return;

    await onRun(graph);
  };

  // 删除选中节点
  const handleDeleteSelected = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter(n => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges]);

  return (
    <div className="flex h-full bg-zinc-950">
      {/* 左侧节点面板 */}
      <NodePanel />

      {/* 中间画布 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部工具栏 */}
        <div className="h-12 bg-zinc-950 border-b border-zinc-800 flex items-center px-4 gap-3">
          <input
            type="text"
            value={workflowName}
            onChange={e => setWorkflowName(e.target.value)}
            className="bg-transparent text-sm font-medium text-zinc-100 border-none focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1"
          />

          <div className="flex-1" />

          {/* 保存状态 */}
          <span className="text-xs text-zinc-500">
            {saveStatus === 'saving' && '保存中...'}
            {saveStatus === 'saved' && '✓ 已保存'}
            {saveStatus === 'error' && '✗ 保存失败'}
          </span>

          {selectedNode && (
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
            >
              删除节点
            </button>
          )}

          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md transition-colors"
          >
            保存
          </button>

          <button
            onClick={handleRun}
            disabled={nodes.length === 0}
            className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-md transition-colors"
          >
            ▶ 运行
          </button>
        </div>

        {/* React Flow 画布 */}
        <div ref={reactFlowWrapper} className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            defaultEdgeOptions={{
              style: { stroke: '#4b5563', strokeWidth: 2 },
              animated: false,
            }}
            className="bg-zinc-950"
          >
            <Controls className="!bg-zinc-800 !border-zinc-700 !rounded-lg [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700" />
            <MiniMap
              nodeColor="#6366f1"
              maskColor="rgba(0, 0, 0, 0.7)"
              className="!bg-zinc-900 !border-zinc-800 !rounded-lg"
            />
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#27272a"
            />

            {/* 空画布引导 */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-zinc-500 text-sm mb-2">从左侧拖入节点开始构建工作流</p>
                  <p className="text-zinc-600 text-xs">或使用预置模板快速开始</p>
                </div>
              </div>
            )}
          </ReactFlow>
        </div>
      </div>

      {/* 右侧配置面板 */}
      <ConfigPanel
        selectedNode={selectedNode}
        onConfigChange={onConfigChange}
      />
    </div>
  );
}
