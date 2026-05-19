'use client';

// src/app/workflow/page.tsx
// 工作流列表页 — 我的工作流 + 模板库

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WORKFLOW_TEMPLATES } from '@/lib/workflowTemplates';

export default function WorkflowListPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'my' | 'templates'>('templates');

  const handleCreateBlank = () => {
    router.push('/workflow/new');
  };

  const handleUseTemplate = (templateKey: string) => {
    router.push(`/workflow/new?template=${templateKey}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold">工作流</h1>
            <p className="text-sm text-zinc-500 mt-1">
              通过可视化节点编排 AI 素材生产流程
            </p>
          </div>
          <button
            onClick={handleCreateBlank}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
          >
            + 新建空白工作流
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 mb-6 border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === 'templates'
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            模板库
          </button>
          <button
            onClick={() => setActiveTab('my')}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === 'my'
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            我的工作流
          </button>
        </div>

        {/* 模板库 */}
        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {WORKFLOW_TEMPLATES.map(template => (
              <div
                key={template.key}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-600 transition-colors cursor-pointer group"
                onClick={() => handleUseTemplate(template.key)}
              >
                <div className="text-3xl mb-3">{template.icon}</div>
                <h3 className="text-base font-medium text-zinc-100 mb-1">
                  {template.name}
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {template.description}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs text-zinc-600">
                    {template.graph.nodes.length} 个节点
                  </span>
                  <span className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    使用此模板 →
                  </span>
                </div>
              </div>
            ))}

            {/* 更多模板占位 */}
            <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl p-5 flex items-center justify-center">
              <p className="text-sm text-zinc-600 text-center">
                更多模板即将推出<br />
                广告批量 · 视频翻配 · 数字人
              </p>
            </div>
          </div>
        )}

        {/* 我的工作流（暂空） */}
        {activeTab === 'my' && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-zinc-500 text-sm mb-4">还没有创建工作流</p>
            <button
              onClick={handleCreateBlank}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg transition-colors"
            >
              新建工作流
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
