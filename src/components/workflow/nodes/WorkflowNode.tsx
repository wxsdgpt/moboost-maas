'use client';

// src/components/workflow/nodes/WorkflowNode.tsx
// 通用工作流节点组件 — 所有节点类型共用此壳
// 通过 NODE_REGISTRY 动态渲染图标、颜色、端口

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodeConfig, WorkflowNodeType } from '@/lib/workflowTypes';
import { NODE_REGISTRY } from '@/lib/workflowTypes';

interface WorkflowNodeData {
  config: NodeConfig;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

function WorkflowNodeComponent({ data, type, selected }: NodeProps & { type: WorkflowNodeType }) {
  const nodeData = data as unknown as WorkflowNodeData;
  const meta = NODE_REGISTRY[type];
  if (!meta) return null;

  const status = nodeData.status || 'pending';
  const statusColors: Record<string, string> = {
    pending: 'border-zinc-600',
    running: 'border-blue-500 shadow-blue-500/30 shadow-lg',
    completed: 'border-green-500',
    failed: 'border-red-500',
    skipped: 'border-zinc-700 opacity-50',
  };

  return (
    <div
      className={`
        relative bg-zinc-900 rounded-xl px-4 py-3 min-w-[180px]
        border-2 ${statusColors[status]}
        ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-zinc-950' : ''}
        transition-all duration-200
      `}
    >
      {/* 输入端口 */}
      {meta.inputs.length > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-zinc-400 !border-2 !border-zinc-700"
        />
      )}

      {/* 节点内容 */}
      <div className="flex items-center gap-2">
        <span className="text-xl">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-zinc-100 truncate">
            {nodeData.config?.label || meta.label}
          </div>
          <div className="text-xs text-zinc-500 truncate">
            {meta.description}
          </div>
        </div>
      </div>

      {/* 运行状态指示 */}
      {status === 'running' && (
        <div className="absolute -top-1 -right-1 w-3 h-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
        </div>
      )}
      {status === 'completed' && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs">✓</span>
        </div>
      )}
      {status === 'failed' && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs">✗</span>
        </div>
      )}

      {/* 输出端口 */}
      {meta.outputs.length > 0 && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-zinc-400 !border-2 !border-zinc-700"
        />
      )}
    </div>
  );
}

export default memo(WorkflowNodeComponent);
