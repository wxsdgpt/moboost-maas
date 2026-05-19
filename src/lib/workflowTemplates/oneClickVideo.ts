// src/lib/workflowTemplates/oneClickVideo.ts
// 预置模板：一键成片
// 剧本 → 分镜 → 提示词 → 批量拆分 → 图片生成 → 视频生成 → 批量合并

import type { WorkflowGraph } from '../workflowTypes';

export const ONE_CLICK_VIDEO_TEMPLATE: WorkflowGraph = {
  nodes: [
    {
      id: 'script',
      type: 'script_input',
      position: { x: 100, y: 300 },
      data: {
        config: {
          label: '剧本输入',
          scriptInput: { source: 'text' },
        },
      },
    },
    {
      id: 'storyboard',
      type: 'storyboard_gen',
      position: { x: 400, y: 300 },
      data: {
        config: {
          label: '分镜生成',
          storyboardGen: {
            maxScenes: 20,
            style: '',
            aspectRatio: '16:9',
          },
        },
      },
    },
    {
      id: 'prompts',
      type: 'prompt_gen',
      position: { x: 700, y: 300 },
      data: {
        config: {
          label: '提示词生成',
          promptGen: { dictionary: 'jurilu' },
        },
      },
    },
    {
      id: 'split',
      type: 'batch_split',
      position: { x: 1000, y: 300 },
      data: {
        config: { label: '按分镜拆分' },
      },
    },
    {
      id: 'img',
      type: 'image_gen',
      position: { x: 1300, y: 200 },
      data: {
        config: {
          label: '生成分镜图',
          imageGen: {
            model: 'flux-pro',
            width: 1920,
            height: 1080,
            count: 1,
          },
        },
      },
    },
    {
      id: 'vid',
      type: 'video_gen',
      position: { x: 1600, y: 200 },
      data: {
        config: {
          label: '图生视频',
          videoGen: {
            model: 'seedance-2.0',
            duration: 5,
            useFirstFrame: true,
            useLastFrame: false,
          },
        },
      },
    },
    {
      id: 'merge',
      type: 'batch_merge',
      position: { x: 1900, y: 300 },
      data: {
        config: { label: '合并视频' },
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'script', target: 'storyboard' },
    { id: 'e2', source: 'storyboard', target: 'prompts' },
    { id: 'e3', source: 'prompts', target: 'split' },
    { id: 'e4', source: 'split', target: 'img' },
    { id: 'e5', source: 'img', target: 'vid' },
    { id: 'e6', source: 'vid', target: 'merge' },
  ],
};
