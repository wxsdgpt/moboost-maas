/**
 * src/lib/workflowNodes/ffmpegNodes.ts
 *
 * FFmpeg 节点执行器：VideoMerge
 */

import { registerNodeExecutor } from '../workflowExecutor';
import { mergeVideos } from './ffmpegService';

// ===== VideoMerge — 视频拼接 =====

registerNodeExecutor('video_merge', async (node, inputs, config) => {
  const collection = (inputs as any).collection as any[] | undefined;
  const items = (inputs as any).items as any[] | undefined;

  // 收集所有视频 URL
  const videoList = collection || items || [];
  const videoUrls: string[] = videoList
    .map((item: any) => item?.video || item?.url)
    .filter(Boolean);

  if (videoUrls.length === 0) {
    throw new Error('VideoMerge: 没有视频片段可拼接');
  }

  // 如果只有一个视频，直接返回
  if (videoUrls.length === 1) {
    return {
      video: videoUrls[0],
      duration: videoList[0]?.duration || 0,
      segmentCount: 1,
    };
  }

  // 调用 FFmpeg 拼接
  const result = await mergeVideos({
    videos: videoUrls,
    format: 'mp4',
    audioTrack: (inputs as any).audio || undefined,
  });

  return {
    video: result.outputPath,
    duration: result.duration,
    fileSize: result.fileSize,
    segmentCount: videoUrls.length,
  };
});
