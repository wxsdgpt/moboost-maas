/**
 * 完整端到端管线测试 — 从剧本到成片
 * 
 * Step 1: 剧本 → Claude 生成分镜 ✅
 * Step 2: 分镜 → Claude 生成提示词
 * Step 3: 提示词 → OpenRouter 图片生成
 * Step 4: 图片 → OpenRouter 视频生成
 * Step 5: 视频片段 → FFmpeg 拼接
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

try {
  const envPath = resolve(__dirname, '../../../.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
} catch {}

const KEY = process.env.OPENROUTER_API_KEY!;
const BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 300_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// 输出目录
const OUTPUT_DIR = resolve(__dirname, '../../../output-test');
mkdirSync(OUTPUT_DIR, { recursive: true });

async function callLLM(systemPrompt: string, userPrompt: string): Promise<any> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moboost.ai',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let text = data.choices?.[0]?.message?.content || '';
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(text);
}

async function run() {
  console.log('🎬 一键成片 — 完整端到端管线\n');
  console.log(`输出目录: ${OUTPUT_DIR}\n`);

  // ═══ Step 1: 分镜生成 ═══
  console.log('━━━ Step 1: 分镜生成 (Claude) ━━━');
  const t1 = Date.now();
  
  const storyboard = await callLLM(
    `你是专业分镜脚本师。直接输出纯 JSON，第一个字符必须是 {。不要 markdown 包裹。
JSON 结构：{"title":"","characters":[{"id":"c1","name":"","description":""}],"scenes":[{"order":1,"description":"画面描述","dialogue":null,"camera":{"shot":"","angle":"","movement":"","composition":""},"characterIds":["c1"],"emotion":"","duration":5}]}
description 用直白中文描述画面。最多 4 个分镜。`,
    '20秒武侠短视频：白衣剑客在竹林中与黑衣杀手决斗，白衣剑客用飞花逐月获胜。2D动漫风格。'
  );

  console.log(`  ✅ ${storyboard.scenes.length} 个分镜, ${storyboard.characters.length} 个角色 (${Date.now() - t1}ms)`);
  for (const s of storyboard.scenes) {
    console.log(`    分镜 ${s.order}: ${s.description.substring(0, 40)}... [${s.camera.shot}]`);
  }
  writeFileSync(join(OUTPUT_DIR, '01-storyboard.json'), JSON.stringify(storyboard, null, 2));

  // ═══ Step 2: 提示词生成 ═══
  console.log('\n━━━ Step 2: 提示词生成 (Claude) ━━━');
  const t2 = Date.now();

  const scenesText = storyboard.scenes.map((s: any) =>
    `分镜${s.order}: ${s.description} | ${s.camera.shot}/${s.camera.angle}/${s.camera.movement} | ${s.emotion} | ${s.duration}s`
  ).join('\n');

  const prompts = await callLLM(
    `你是 AI 视频提示词工程师。为每个分镜写提示词。直接输出纯 JSON。
角色：${storyboard.characters.map((c: any) => c.name + '(' + c.description + ')').join('; ')}
JSON 结构：{"items":[{"sceneOrder":1,"imagePrompt":"图片提示词（景别+画面+角色+氛围+2D动漫风格）","videoPrompt":"视频提示词（运镜+动作+画面变化）"}]}`,
    scenesText
  );

  console.log(`  ✅ ${prompts.items.length} 个提示词 (${Date.now() - t2}ms)`);
  for (const p of prompts.items) {
    console.log(`    分镜 ${p.sceneOrder}: img="${p.imagePrompt.substring(0, 50)}..."`);
  }
  writeFileSync(join(OUTPUT_DIR, '02-prompts.json'), JSON.stringify(prompts, null, 2));

  // ═══ Step 3: 图片生成 ═══
  // 复用已有方式：chat/completions + gemini-3-pro-image-preview
  console.log('\n━━━ Step 3: 图片生成 (Gemini Image) ━━━');
  
  const imageModel = process.env.IMAGE_MODEL || 'google/gemini-3-pro-image-preview';
  console.log(`  模型: ${imageModel}`);

  for (let i = 0; i < storyboard.scenes.length; i++) {
    const p = prompts.items[i];
    const imgPath = join(OUTPUT_DIR, `scene_${i + 1}.png`);
    console.log(`  生成分镜 ${i + 1}...`);
    
    try {
      const res = await fetchWithTimeout(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://moboost.ai',
        },
        body: JSON.stringify({
          model: imageModel,
          messages: [{ role: 'user', content: `Generate an image: ${p.imagePrompt}` }],
        }),
      }, 120_000);

      if (!res.ok) {
        console.log(`    ⚠️ HTTP ${res.status}, 用占位图`);
        const colors = ['#1a1a2e', '#16213e', '#0f3460', '#533483'];
        await execFileAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${colors[i % 4]}:s=1024x576:d=1`, '-frames:v', '1', imgPath]);
        continue;
      }

      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      let imageData: string | null = null;

      // 复用 /api/generate 的解析逻辑
      if (msg?.images && Array.isArray(msg.images)) {
        for (const img of msg.images) {
          if (img.type === 'image_url' && img.image_url?.url) { imageData = img.image_url.url; break; }
        }
      }
      if (!imageData && typeof msg?.content === 'string') {
        const m = msg.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        if (m) imageData = m[0];
      }
      if (!imageData && Array.isArray(msg?.content)) {
        for (const part of msg.content) {
          if (part.type === 'image_url' && part.image_url?.url) { imageData = part.image_url.url; break; }
          if (part.inline_data || part.inlineData) {
            const d = part.inline_data || part.inlineData;
            imageData = `data:${d.mime_type || 'image/png'};base64,${d.data}`;
            break;
          }
        }
      }

      if (imageData && imageData.startsWith('data:image')) {
        const base64 = imageData.split(',')[1];
        writeFileSync(imgPath, Buffer.from(base64, 'base64'));
        console.log(`    ✅ scene_${i + 1}.png (AI 生成, ${Math.round(Buffer.from(base64, 'base64').length / 1024)}KB)`);
      } else {
        console.log(`    ⚠️ 未返回图片, 用占位图`);
        const colors = ['#1a1a2e', '#16213e', '#0f3460', '#533483'];
        await execFileAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${colors[i % 4]}:s=1024x576:d=1`, '-frames:v', '1', imgPath]);
      }
    } catch (err) {
      console.log(`    ⚠️ 失败: ${err}, 用占位图`);
      const colors = ['#1a1a2e', '#16213e', '#0f3460', '#533483'];
      await execFileAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${colors[i % 4]}:s=1024x576:d=1`, '-frames:v', '1', imgPath]);
    }
  }

  // ═══ Step 4: 视频生成 ═══
  // 复用已有方式：/api/v1/videos submit/poll/download
  console.log('\n━━━ Step 4: 视频生成 (VEO 3.1) ━━━');

  const videoModel = process.env.VIDEO_MODEL || 'google/veo-3.1';
  console.log(`  模型: ${videoModel}`);

  const videoPaths: string[] = [];

  for (let i = 0; i < storyboard.scenes.length; i++) {
    const scene = storyboard.scenes[i];
    const p = prompts.items[i];
    const imgPath = join(OUTPUT_DIR, `scene_${i + 1}.png`);
    const vidPath = join(OUTPUT_DIR, `scene_${i + 1}.mp4`);
    const duration = scene.duration || 5;

    console.log(`  生成分镜 ${i + 1} 视频...`);

    let videoGenerated = false;

    try {
      // 读取图片作为首帧
      let firstFrameData: string | null = null;
      try {
        const imgBuf = readFileSync(imgPath);
        if (imgBuf.length > 5000) { // 只有真实 AI 生成的图才够大
          firstFrameData = `data:image/png;base64,${imgBuf.toString('base64')}`;
        }
      } catch {}

      // Submit
      const submitBody: Record<string, unknown> = {
        model: videoModel,
        prompt: p.videoPrompt || p.imagePrompt,
        generate_audio: true,
      };
      if (firstFrameData) {
        submitBody.frame_images = [{
          type: 'image_url',
          image_url: { url: firstFrameData },
          frame_type: 'first_frame',
        }];
      }

      const submitRes = await fetchWithTimeout('https://openrouter.ai/api/v1/videos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://moboost.ai',
        },
        body: JSON.stringify(submitBody),
      }, 30_000);

      if (!submitRes.ok) {
        const errText = await submitRes.text();
        console.log(`    ⚠️ Submit 失败 ${submitRes.status}: ${errText.substring(0, 100)}`);
        throw new Error('submit failed');
      }

      const submitData = await submitRes.json();
      const jobId = submitData.id || submitData.job_id;
      console.log(`    🎬 Job submitted: ${jobId}`);

      // Poll (max 5 min, 复用已有代码的 5s 间隔，60 次 = 300s)
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(r => setTimeout(r, 5000));
        const pollRes = await fetch(`https://openrouter.ai/api/v1/videos/${jobId}`, {
          headers: { 'Authorization': `Bearer ${KEY}` },
        });
        if (!pollRes.ok) continue;
        const pollData = await pollRes.json();
        const status = pollData.status;
        if (status === 'completed' || status === 'complete') {
          // Download
          const dlRes = await fetch(`https://openrouter.ai/api/v1/videos/${jobId}/content?index=0`, {
            headers: { 'Authorization': `Bearer ${KEY}` },
          });
          if (dlRes.ok) {
            const ct = dlRes.headers.get('content-type') || '';
            if (ct.includes('video') || ct.includes('octet-stream')) {
              const buf = Buffer.from(await dlRes.arrayBuffer());
              writeFileSync(vidPath, buf);
              videoPaths.push(vidPath);
              console.log(`    ✅ scene_${i + 1}.mp4 (AI 生成, ${Math.round(buf.length / 1024)}KB)`);
              videoGenerated = true;
            }
          }
          break;
        }
        if (status === 'failed' || status === 'error') {
          console.log(`    ⚠️ Job failed: ${JSON.stringify(pollData).substring(0, 100)}`);
          break;
        }
        process.stdout.write('.');
      }
    } catch (err) {
      console.log(`    ⚠️ 视频生成失败: ${err}`);
    }

    // Fallback: FFmpeg Ken Burns
    if (!videoGenerated) {
      try { readFileSync(imgPath); } catch {
        const colors = ['#1a1a2e', '#16213e', '#0f3460', '#533483'];
        await execFileAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${colors[i % 4]}:s=1024x576:d=1`, '-frames:v', '1', imgPath]);
      }
      await execFileAsync('ffmpeg', [
        '-y', '-loop', '1', '-i', imgPath,
        '-c:v', 'libx264', '-t', String(duration), '-pix_fmt', 'yuv420p',
        '-vf', `scale=1024:576,zoompan=z='min(zoom+0.001,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 25}:s=1024x576:fps=25`,
        '-r', '25', vidPath,
      ], { timeout: 30_000 });
      videoPaths.push(vidPath);
      console.log(`    📦 scene_${i + 1}.mp4 (FFmpeg 降级, ${duration}s)`);
    }
  }

  // ═══ Step 5: FFmpeg 拼接 ═══
  console.log('\n━━━ Step 5: FFmpeg 拼接成片 ━━━');
  const t5 = Date.now();

  const concatFile = join(OUTPUT_DIR, 'concat.txt');
  writeFileSync(concatFile, videoPaths.map(p => `file '${p}'`).join('\n'));

  const outputPath = join(OUTPUT_DIR, 'final_output.mp4');
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'concat', '-safe', '0',
    '-i', concatFile,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath,
  ], { timeout: 60_000 });

  // 获取输出信息
  const { stdout: probeOut } = await execFileAsync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_format', outputPath,
  ]);
  const probeData = JSON.parse(probeOut);
  const duration = parseFloat(probeData.format?.duration || '0');
  const fileSize = parseInt(probeData.format?.size || '0');

  console.log(`  ✅ 成片输出: ${outputPath}`);
  console.log(`  📊 时长: ${duration.toFixed(1)}s | 大小: ${(fileSize / 1024).toFixed(0)} KB`);
  console.log(`  ⏱️ 拼接耗时: ${Date.now() - t5}ms`);

  // ═══ 总结 ═══
  console.log('\n' + '═'.repeat(50));
  console.log('🎉 一键成片完成！');
  console.log(`  标题: ${storyboard.title}`);
  console.log(`  分镜: ${storyboard.scenes.length} 个`);
  console.log(`  时长: ${duration.toFixed(1)} 秒`);
  console.log(`  输出: ${outputPath}`);
  console.log('═'.repeat(50));
}

run().catch(err => {
  console.error('❌ 管线失败:', err);
  process.exit(1);
});
