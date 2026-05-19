/**
 * src/lib/workflowNodes/index.ts
 *
 * 节点执行器统一入口 — import 此文件即注册所有节点
 * workflowExecutor.ts 中的内置节点 + 此处的 LLM/Media 节点
 */

// LLM 节点：storyboard_gen / prompt_gen / character_extract / scene_extract
import './llmNodes';

// 媒体节点：image_gen / video_gen
import './mediaNodes';

// FFmpeg 节点：video_merge
import './ffmpegNodes';

// 审批节点：human_review
import './reviewNodes';

// 内置节点已在 workflowExecutor.ts 中注册：
// script_input / batch_split / batch_merge
