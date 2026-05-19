'use client';

// src/components/workflow/RunProgressBar.tsx
// 工作流运行进度条 — 底部固定显示

import React from 'react';

interface RunProgressBarProps {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  creditsConsumed: number;
  estimatedCredits: number;
  onCancel?: () => void;
}

export default function RunProgressBar({
  status,
  progress,
  creditsConsumed,
  estimatedCredits,
  onCancel,
}: RunProgressBarProps) {
  if (status === 'idle') return null;

  const statusConfig = {
    running: { label: '运行中', color: 'bg-blue-500', textColor: 'text-blue-400', pulse: true },
    paused: { label: '等待审批', color: 'bg-amber-500', textColor: 'text-amber-400', pulse: true },
    completed: { label: '已完成', color: 'bg-green-500', textColor: 'text-green-400', pulse: false },
    failed: { label: '失败', color: 'bg-red-500', textColor: 'text-red-400', pulse: false },
    cancelled: { label: '已取消', color: 'bg-zinc-500', textColor: 'text-zinc-400', pulse: false },
    idle: { label: '', color: '', textColor: '', pulse: false },
  };

  const cfg = statusConfig[status];
  const pct = Math.round(progress * 100);

  return (
    <div className="fixed bottom-0 left-56 right-72 h-12 bg-zinc-900 border-t border-zinc-800 flex items-center px-4 gap-4 z-50">
      {/* 状态标签 */}
      <div className="flex items-center gap-2">
        {cfg.pulse && (
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full ${cfg.color} opacity-75 animate-ping`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.color}`} />
          </span>
        )}
        <span className={`text-xs font-medium ${cfg.textColor}`}>{cfg.label}</span>
      </div>

      {/* 进度条 */}
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${cfg.color} transition-all duration-500 ease-out ${cfg.pulse ? 'animate-pulse' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* 百分比 */}
      <span className="text-xs text-zinc-400 w-10 text-right">{pct}%</span>

      {/* 积分消耗 */}
      <span className="text-xs text-zinc-500">
        {creditsConsumed} / {estimatedCredits} 积分
      </span>

      {/* 取消按钮 */}
      {(status === 'running' || status === 'paused') && onCancel && (
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
        >
          取消
        </button>
      )}
    </div>
  );
}
