'use client';

// src/components/workflow/CreditEstimateModal.tsx
// 积分预估确认弹窗 — 运行前展示明细让用户决定

import React from 'react';
import type { CreditEstimate } from '@/lib/workflowTypes';
import { NODE_REGISTRY } from '@/lib/workflowTypes';

interface CreditEstimateModalProps {
  estimate: CreditEstimate;
  userBalance: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CreditEstimateModal({
  estimate,
  userBalance,
  onConfirm,
  onCancel,
}: CreditEstimateModalProps) {
  const insufficient = userBalance < estimate.total;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[480px] max-h-[80vh] overflow-hidden shadow-2xl">
        {/* 标题 */}
        <div className="px-6 py-4 border-b border-zinc-800">
          <h3 className="text-base font-medium text-zinc-100">积分预估</h3>
          <p className="text-xs text-zinc-500 mt-1">确认后将冻结对应积分并开始执行</p>
        </div>

        {/* 明细表 */}
        <div className="px-6 py-4 max-h-[40vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-2 font-normal">节点</th>
                <th className="text-right py-2 font-normal">倍率</th>
                <th className="text-right py-2 font-normal">积分</th>
              </tr>
            </thead>
            <tbody>
              {estimate.breakdown.map((item) => {
                const meta = NODE_REGISTRY[item.nodeType];
                return (
                  <tr key={item.nodeId} className="border-b border-zinc-800/50">
                    <td className="py-2 text-zinc-300">
                      <span className="mr-1.5">{meta?.icon || '⚙️'}</span>
                      {item.label}
                    </td>
                    <td className="py-2 text-right text-zinc-500">
                      {item.multiplier && item.multiplier > 1 ? `×${item.multiplier}` : ''}
                    </td>
                    <td className="py-2 text-right text-zinc-200 font-mono">
                      {item.credits}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 汇总 */}
        <div className="px-6 py-4 border-t border-zinc-800 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-400">预估总消耗</span>
            <span className="text-lg font-semibold text-zinc-100">{estimate.total} 积分</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-400">当前余额</span>
            <span className={`text-sm font-mono ${insufficient ? 'text-red-400' : 'text-green-400'}`}>
              {userBalance} 积分
            </span>
          </div>
          {insufficient && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-red-400">
                积分不足，还需 {estimate.total - userBalance} 积分。请先充值。
              </p>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={insufficient}
            className="px-6 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors"
          >
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
