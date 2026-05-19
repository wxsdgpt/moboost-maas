// src/lib/workflowTemplates/index.ts
// 预置工作流模板注册表

import type { WorkflowGraph } from '../workflowTypes';
import { ONE_CLICK_VIDEO_TEMPLATE } from './oneClickVideo';

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  icon: string;
  graph: WorkflowGraph;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: 'one-click-video',
    name: '一键成片',
    description: '从剧本到成片的完整流程：AI 分镜 → 批量生图 → 图生视频 → 合并输出',
    icon: '🎬',
    graph: ONE_CLICK_VIDEO_TEMPLATE,
  },
  // V2 模板待添加:
  // { key: 'batch-ads', name: '广告图批量', ... },
  // { key: 'video-dub', name: '视频翻配', ... },
];

export function getTemplateByKey(key: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.key === key);
}
