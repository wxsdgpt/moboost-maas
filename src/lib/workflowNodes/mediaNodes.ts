/**
 * src/lib/workflowNodes/mediaNodes.ts
 *
 * 媒体生成节点执行器：ImageGen / VideoGen
 * 
 * 复用已有的调用方式：
 * - 图片：chat/completions + gemini-3-pro-image-preview（返回 base64）
 * - 视频：/api/v1/videos → submit/poll/download（异步三步）
 */

import { registerNodeExecutor } from '../workflowExecutor';

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 300_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ===== ImageGen — 图片生成 =====
// 复用 /api/generate 的方式：chat/completions + gemini image model

registerNodeExecutor('image_gen', async (node, inputs, config) => {
  const prompt = (inputs as any).imagePrompt
    || (inputs as any).prompt
    || (inputs as any).description
    || '';

  if (!prompt) throw new Error('ImageGen: 没有提示词输入');

  const imgConfig = config.imageGen;
  // 使用已验证可用的模型
  const model = process.env.IMAGE_MODEL || 'google/gemini-3-pro-image-preview';

  const response = await fetchWithTimeout(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moboost.ai',
      'X-Title': 'Moboost AI Workflow',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: `Generate an image: ${prompt}` },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ImageGen API error ${response.status}: ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  const msg = data.choices?.[0]?.message;
  let imageData: string | null = null;

  // 提取图片 — 复用 /api/generate 的解析逻辑
  // 1. message.images[] (Gemini format)
  if (msg?.images && Array.isArray(msg.images)) {
    for (const img of msg.images) {
      if (img.type === 'image_url' && img.image_url?.url) {
        imageData = img.image_url.url;
        break;
      }
    }
  }

  // 2. content string with base64
  if (!imageData && msg?.content) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    const base64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (base64Match) imageData = base64Match[0];
  }

  // 3. content array with image_url parts
  if (!imageData && Array.isArray(msg?.content)) {
    for (const part of msg.content) {
      if (part.type === 'image_url' && part.image_url?.url) {
        imageData = part.image_url.url;
        break;
      }
      if (part.inline_data || part.inlineData) {
        const inlineData = part.inline_data || part.inlineData;
        imageData = `data:${inlineData.mime_type || inlineData.mimeType || 'image/png'};base64,${inlineData.data}`;
        break;
      }
    }
  }

  if (!imageData) throw new Error('ImageGen: 模型未返回图片');

  return {
    image: imageData,
    model,
    prompt,
  };
});

// ===== VideoGen — 视频生成 =====
// 复用 /api/generate-video 的方式：/api/v1/videos 异步三步

registerNodeExecutor('video_gen', async (node, inputs, config) => {
  const prompt = (inputs as any).videoPrompt
    || (inputs as any).prompt
    || (inputs as any).description
    || '';
  const imageData = (inputs as any).image || '';

  if (!prompt && !imageData) throw new Error('VideoGen: 需要提示词或首帧图');

  const vidConfig = config.videoGen;
  const model = process.env.VIDEO_MODEL || 'google/veo-3.1';

  // Step 1: Submit job
  const requestBody: Record<string, unknown> = {
    model,
    prompt: prompt || '根据图片生成视频',
    generate_audio: true,
  };

  // 首帧图支持
  if (imageData && vidConfig?.useFirstFrame) {
    requestBody.frame_images = [{
      type: 'image_url',
      image_url: { url: imageData },
      frame_type: 'first_frame',
    }];
  }

  const submitRes = await fetchWithTimeout('https://openrouter.ai/api/v1/videos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moboost.ai',
      'X-Title': 'Moboost AI Workflow',
    },
    body: JSON.stringify(requestBody),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`VideoGen submit error ${submitRes.status}: ${errText.substring(0, 200)}`);
  }

  const submitData = await submitRes.json();
  const jobId = submitData.id || submitData.job_id;
  if (!jobId) throw new Error('VideoGen: 未返回 job_id');

  // Step 2: Poll until complete
  // 复用已有代码的策略：每 5 秒 poll 一次，最多 60 次 = 5 分钟
  // （已有代码是 30次/150秒，但实测 VEO 需 1.5-3 分钟，所以加大）
  const maxAttempts = 60;
  const pollInterval = 5_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    let pollRes: Response;
    try {
      pollRes = await fetchWithTimeout(`https://openrouter.ai/api/v1/videos/${jobId}`, {
        headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}` },
      }, 15_000);
    } catch {
      continue; // 网络错误，继续重试
    }

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    const status = pollData.status;

    if (status === 'completed' || status === 'complete') {
      // Step 3: Download
      const dlRes = await fetchWithTimeout(`https://openrouter.ai/api/v1/videos/${jobId}/content?index=0`, {
        headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}` },
      });

      if (!dlRes.ok) throw new Error(`VideoGen download error: ${dlRes.status}`);

      const contentType = dlRes.headers.get('content-type') || '';
      if (contentType.includes('video') || contentType.includes('octet-stream')) {
        const buffer = await dlRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = contentType.includes('mp4') ? 'video/mp4' : 'video/webm';
        return {
          video: `data:${mimeType};base64,${base64}`,
          model,
          duration: vidConfig?.duration || 5,
          prompt,
          jobId,
        };
      }

      // JSON with URL
      const dlData = await dlRes.json();
      return {
        video: dlData.url || dlData.video_url,
        model,
        duration: vidConfig?.duration || 5,
        prompt,
        jobId,
      };
    }

    if (status === 'failed' || status === 'error') {
      // 内容过滤失败 — 返回明确错误信息便于上层重试/降级
      const errorMsg = pollData.error || 'unknown error';
      throw new Error(`VideoGen job failed (${errorMsg}). jobId=${jobId}`);
    }
  }

  throw new Error(`VideoGen timeout: job ${jobId} did not complete in ${maxAttempts * pollInterval / 1000}s`);
});
