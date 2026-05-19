'use client';

// src/components/workflow/ConfigPanel.tsx
// 右侧配置面板 — 选中节点时显示其配置

import React from 'react';
import type { Node } from '@xyflow/react';
import type { WorkflowNodeType, NodeConfig } from '@/lib/workflowTypes';
import { NODE_REGISTRY } from '@/lib/workflowTypes';

interface ConfigPanelProps {
  selectedNode: Node | null;
  onConfigChange: (nodeId: string, config: Partial<NodeConfig>) => void;
}

export default function ConfigPanel({ selectedNode, onConfigChange }: ConfigPanelProps) {
  if (!selectedNode) {
    return (
      <div className="w-72 bg-zinc-950 border-l border-zinc-800 p-4 flex items-center justify-center">
        <p className="text-sm text-zinc-600 text-center">
          选中一个节点查看配置
        </p>
      </div>
    );
  }

  const nodeType = selectedNode.type as WorkflowNodeType;
  const meta = NODE_REGISTRY[nodeType];
  const config = (selectedNode.data as any)?.config as NodeConfig;

  if (!meta || !config) return null;

  const updateConfig = (patch: Partial<NodeConfig>) => {
    onConfigChange(selectedNode.id, patch);
  };

  return (
    <div className="w-72 bg-zinc-950 border-l border-zinc-800 p-4 overflow-y-auto">
      {/* 节点标题 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{meta.icon}</span>
        <div>
          <div className="text-sm font-medium text-zinc-100">{meta.label}</div>
          <div className="text-xs text-zinc-500">{meta.description}</div>
        </div>
      </div>

      {/* 通用配置 */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">显示名称</label>
          <input
            type="text"
            value={config.label || ''}
            onChange={e => updateConfig({ label: e.target.value })}
            className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">最大重试次数</label>
          <input
            type="number"
            value={config.maxRetries ?? 2}
            onChange={e => updateConfig({ maxRetries: parseInt(e.target.value) || 0 })}
            min={0}
            max={5}
            className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* 剧本输入配置 */}
        {nodeType === 'script_input' && config.scriptInput && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1">输入方式</label>
            <select
              value={config.scriptInput.source}
              onChange={e => updateConfig({ scriptInput: { ...config.scriptInput!, source: e.target.value as 'text' | 'file' } })}
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="text">直接输入文本</option>
              <option value="file">上传文件</option>
            </select>
          </div>
        )}

        {/* 分镜生成配置 */}
        {nodeType === 'storyboard_gen' && config.storyboardGen && (
          <>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">最大分镜数</label>
              <input
                type="number"
                value={config.storyboardGen.maxScenes}
                onChange={e => updateConfig({ storyboardGen: { ...config.storyboardGen!, maxScenes: parseInt(e.target.value) || 10 } })}
                min={1}
                max={100}
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">画面比例</label>
              <select
                value={config.storyboardGen.aspectRatio}
                onChange={e => updateConfig({ storyboardGen: { ...config.storyboardGen!, aspectRatio: e.target.value as '16:9' | '9:16' | '1:1' } })}
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="16:9">16:9 横屏</option>
                <option value="9:16">9:16 竖屏</option>
                <option value="1:1">1:1 正方</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">画风</label>
              <input
                type="text"
                value={config.storyboardGen.style || ''}
                onChange={e => updateConfig({ storyboardGen: { ...config.storyboardGen!, style: e.target.value } })}
                placeholder="如：2D动漫、写实真人、赛博朋克..."
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </>
        )}

        {/* 图片生成配置 */}
        {nodeType === 'image_gen' && config.imageGen && (
          <>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">模型</label>
              <select
                value={config.imageGen.model}
                onChange={e => updateConfig({ imageGen: { ...config.imageGen!, model: e.target.value } })}
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="flux-pro">Flux Pro</option>
                <option value="dall-e-3">DALL-E 3</option>
                <option value="jimeng">即梦</option>
                <option value="tongyi">通义万相</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">每镜头生成数量</label>
              <input
                type="number"
                value={config.imageGen.count}
                onChange={e => updateConfig({ imageGen: { ...config.imageGen!, count: parseInt(e.target.value) || 1 } })}
                min={1}
                max={4}
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </>
        )}

        {/* 视频生成配置 */}
        {nodeType === 'video_gen' && config.videoGen && (
          <>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">模型</label>
              <select
                value={config.videoGen.model}
                onChange={e => updateConfig({ videoGen: { ...config.videoGen!, model: e.target.value } })}
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="seedance-2.0">Seedance 2.0</option>
                <option value="veo-3.1">VEO 3.1</option>
                <option value="kling-v3">可灵 v3</option>
                <option value="jimeng-3.0-pro">即梦 3.0 Pro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">时长（秒）</label>
              <input
                type="number"
                value={config.videoGen.duration}
                onChange={e => updateConfig({ videoGen: { ...config.videoGen!, duration: parseInt(e.target.value) || 5 } })}
                min={3}
                max={30}
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useFirstFrame"
                checked={config.videoGen.useFirstFrame}
                onChange={e => updateConfig({ videoGen: { ...config.videoGen!, useFirstFrame: e.target.checked } })}
                className="rounded border-zinc-600"
              />
              <label htmlFor="useFirstFrame" className="text-xs text-zinc-400">使用首帧图控制</label>
            </div>
          </>
        )}
      </div>

      {/* 积分消耗提示 */}
      <div className="mt-4 pt-4 border-t border-zinc-800">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">单次消耗</span>
          <span className="text-zinc-300">{meta.creditCost} 积分</span>
        </div>
      </div>
    </div>
  );
}
