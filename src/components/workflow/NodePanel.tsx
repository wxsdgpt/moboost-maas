'use client';

// src/components/workflow/NodePanel.tsx
// 左侧节点面板 — 拖拽节点到画布

import React from 'react';
import { NODE_REGISTRY, V1_NODE_TYPES } from '@/lib/workflowTypes';
import type { WorkflowNodeType } from '@/lib/workflowTypes';

export default function NodePanel() {
  const onDragStart = (event: React.DragEvent, nodeType: WorkflowNodeType) => {
    event.dataTransfer.setData('application/workflow-node-type', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 bg-zinc-950 border-r border-zinc-800 p-4 flex flex-col gap-1 overflow-y-auto">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
        节点
      </h3>
      {V1_NODE_TYPES.map((type) => {
        const meta = NODE_REGISTRY[type];
        return (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className="
              flex items-center gap-2 px-3 py-2 rounded-lg
              bg-zinc-900 border border-zinc-800
              hover:border-zinc-600 hover:bg-zinc-800
              cursor-grab active:cursor-grabbing
              transition-colors duration-150
            "
          >
            <span className="text-base">{meta.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 truncate">{meta.label}</div>
            </div>
            <span className="text-xs text-zinc-600">
              {meta.creditCost > 0 ? `${meta.creditCost}c` : ''}
            </span>
          </div>
        );
      })}

      <div className="mt-4 pt-4 border-t border-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          即将推出
        </h3>
        {Object.values(NODE_REGISTRY)
          .filter(m => !m.v1)
          .map(meta => (
            <div
              key={meta.type}
              className="flex items-center gap-2 px-3 py-2 rounded-lg opacity-40 cursor-not-allowed"
            >
              <span className="text-base">{meta.icon}</span>
              <span className="text-sm text-zinc-400">{meta.label}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
