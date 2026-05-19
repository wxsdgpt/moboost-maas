'use client';

// src/components/workflow/ReviewModal.tsx
// 人工审批弹窗 — 工作流暂停时展示待审批内容

import React from 'react';

interface ReviewModalProps {
  nodeId: string;
  nodeLabel: string;
  previewData: unknown;
  onApprove: () => void;
  onReject: () => void;
}

export default function ReviewModal({
  nodeId,
  nodeLabel,
  previewData,
  onApprove,
  onReject,
}: ReviewModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[560px] max-h-[80vh] overflow-hidden shadow-2xl">
        {/* 标题 */}
        <div className="px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>
            <h3 className="text-base font-medium text-zinc-100">等待审批</h3>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            节点 <span className="text-zinc-300">{nodeLabel}</span> 需要人工确认后继续
          </p>
        </div>

        {/* 预览内容 */}
        <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
          <pre className="text-xs text-zinc-400 bg-zinc-950 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
            {typeof previewData === 'string'
              ? previewData
              : JSON.stringify(previewData, null, 2)}
          </pre>
        </div>

        {/* 操作 */}
        <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
          <button
            onClick={onReject}
            className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            拒绝
          </button>
          <button
            onClick={onApprove}
            className="px-6 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
          >
            ✓ 通过
          </button>
        </div>
      </div>
    </div>
  );
}
