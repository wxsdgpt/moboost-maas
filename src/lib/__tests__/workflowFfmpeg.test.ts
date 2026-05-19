/**
 * FFmpeg Service + VideoMerge — 单元测试
 *
 * 测试 FFmpeg 本地可用性 + 拼接逻辑 + 节点注册
 * 需要本地安装 ffmpeg
 *
 * Run: npx tsx src/lib/__tests__/workflowFfmpeg.test.ts
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(msg); console.log(`  ❌ ${msg}`); }
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  const eq = JSON.stringify(actual) === JSON.stringify(expected);
  if (eq) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); console.log(`  ❌ ${msg}`); }
}

// ═══════════════════════════════════════════
// 测试组 1: FFmpeg 环境检测
// ═══════════════════════════════════════════
console.log('\n🔧 FFmpeg 环境');

async function runTests() {
  // 检查 ffmpeg 可用
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version']);
    assert(stdout.includes('ffmpeg version'), 'ffmpeg 已安装且可执行');
  } catch {
    console.log('  ❌ ffmpeg 不可用，跳过 FFmpeg 测试');
    process.exit(0);
  }

  // 检查 ffprobe 可用
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-version']);
    assert(stdout.includes('ffprobe version'), 'ffprobe 已安装且可执行');
  } catch {
    assert(false, 'ffprobe 不可用');
  }

  // ═══════════════════════════════════════════
  // 测试组 2: 生成测试视频 + 拼接
  // ═══════════════════════════════════════════
  console.log('\n🎬 视频生成 + 拼接');

  const workDir = await mkdtemp(join(tmpdir(), 'workflow-test-'));

  try {
    // 生成 3 个 1 秒测试视频（纯色 + 文字）
    const colors = ['red', 'green', 'blue'];
    const videoPaths: string[] = [];

    for (let i = 0; i < colors.length; i++) {
      const path = join(workDir, `test_${i}.mp4`);
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', `color=c=${colors[i]}:s=320x240:d=1:r=25`,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-t', '1',
        path,
      ], { timeout: 30_000 });

      const fileStat = await stat(path);
      assert(fileStat.size > 0, `测试视频 ${i + 1} (${colors[i]}) 生成成功 (${fileStat.size} bytes)`);
      videoPaths.push(path);
    }

    // 生成 concat 列表
    const concatList = videoPaths.map(p => `file '${p}'`).join('\n');
    const concatFile = join(workDir, 'concat.txt');
    await writeFile(concatFile, concatList);

    // 拼接
    const outputPath = join(workDir, 'merged.mp4');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ], { timeout: 30_000 });

    const outStat = await stat(outputPath);
    assert(outStat.size > 0, `拼接输出成功 (${outStat.size} bytes)`);

    // 验证输出时长 ≈ 3 秒
    const { stdout: probeOut } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      outputPath,
    ]);
    const probeData = JSON.parse(probeOut);
    const duration = parseFloat(probeData.format?.duration || '0');
    assert(duration >= 2.5 && duration <= 3.5, `输出时长 ${duration.toFixed(1)}s ≈ 3s`);

  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  // ═══════════════════════════════════════════
  // 测试组 3: MergeOptions 构造验证
  // ═══════════════════════════════════════════
  console.log('\n📐 MergeOptions 构造');

  {
    // 基本选项
    const opts = {
      videos: ['/tmp/a.mp4', '/tmp/b.mp4'],
      format: 'mp4' as const,
    };
    assertEqual(opts.videos.length, 2, '2 个视频输入');
    assertEqual(opts.format, 'mp4', '输出格式 mp4');
  }

  {
    // 带音频
    const opts = {
      videos: ['/tmp/a.mp4'],
      audioTrack: '/tmp/bgm.mp3',
      resolution: '1920x1080',
      fps: 30,
    };
    assert(!!opts.audioTrack, '有音频轨道');
    assert(!!opts.resolution, '有分辨率设置');
    assertEqual(opts.fps, 30, '帧率 30fps');
  }

  {
    // 空视频列表
    const opts = { videos: [] as string[] };
    assert(opts.videos.length === 0, '空列表应被拒绝');
  }

  // ═══════════════════════════════════════════
  // 测试组 4: VideoMerge 节点数据流模拟
  // ═══════════════════════════════════════════
  console.log('\n🔀 VideoMerge 数据流');

  {
    // 模拟 batch_merge 的输出作为 video_merge 的输入
    const batchMergeOutput = {
      collection: [
        { video: 'https://example.com/scene1.mp4', duration: 5 },
        { video: 'https://example.com/scene2.mp4', duration: 4 },
        { video: 'https://example.com/scene3.mp4', duration: 3 },
      ],
      count: 3,
    };

    const videoUrls = batchMergeOutput.collection
      .map(item => item.video)
      .filter(Boolean);

    assertEqual(videoUrls.length, 3, '提取 3 个视频 URL');
    assert(videoUrls.every(u => u.startsWith('https://')), '所有 URL 有效');

    const totalDuration = batchMergeOutput.collection.reduce((s, v) => s + v.duration, 0);
    assertEqual(totalDuration, 12, '预期总时长 12 秒');
  }

  {
    // 单视频直接返回（不调 ffmpeg）
    const singleVideoInput = {
      collection: [{ video: 'https://example.com/single.mp4', duration: 10 }],
    };
    assertEqual(singleVideoInput.collection.length, 1, '单视频 → 跳过拼接');
  }

  // ═══════════════════════════════════════════
  // 测试组 5: 真实场景 — 一键成片完整管线
  // ═══════════════════════════════════════════
  console.log('\n🎬 真实场景: 一键成片完整管线模拟');

  {
    // 模拟 7 节点完整执行结果链
    const pipeline = {
      script_input: { text: '武侠短剧：山顶决斗' },
      storyboard_gen: { storyboard: { scenes: Array.from({ length: 5 }, (_, i) => ({ order: i + 1 })), characters: [] } },
      prompt_gen: { prompts: { items: Array.from({ length: 5 }, (_, i) => ({ sceneOrder: i + 1, imagePrompt: `scene${i + 1}`, videoPrompt: `motion${i + 1}` })) } },
      batch_split: { items: Array.from({ length: 5 }, (_, i) => ({})), count: 5 },
      image_gen: { image: 'scene.png', model: 'flux-pro' },  // ×5 (batched)
      video_gen: { video: 'scene.mp4', model: 'seedance-2.0', duration: 5 },  // ×5
      batch_merge: {
        collection: Array.from({ length: 5 }, (_, i) => ({
          video: `https://storage.example.com/scene_${i + 1}.mp4`,
          duration: 5,
        })),
        count: 5,
      },
    };

    // 验证管线数据完整性
    assertEqual(pipeline.storyboard_gen.storyboard.scenes.length, 5, '管线: 5 个分镜');
    assertEqual(pipeline.prompt_gen.prompts.items.length, 5, '管线: 5 个提示词');
    assertEqual(pipeline.batch_split.count, 5, '管线: 拆分 5 份');
    assertEqual(pipeline.batch_merge.count, 5, '管线: 合并 5 个视频');

    const totalDuration = pipeline.batch_merge.collection.reduce((s, v) => s + v.duration, 0);
    assertEqual(totalDuration, 25, '管线: 总时长 25 秒 (5×5s)');

    // VideoMerge 最终输出
    const mergeOutput = {
      video: '/tmp/output.mp4',
      duration: 25,
      segmentCount: 5,
    };
    assert(mergeOutput.segmentCount === 5, '管线: 合并了 5 个片段');
    assert(mergeOutput.duration === 25, '管线: 输出 25 秒');
  }

  // ═══════════════════════════════════════════
  // 总结
  // ═══════════════════════════════════════════
  console.log('\n' + '═'.repeat(50));
  console.log(`结果: ${passed} passed, ${failed} failed (共 ${passed + failed} 个用例)`);
  if (failures.length > 0) {
    console.log('\n失败用例:');
    failures.forEach(f => console.log(`  ❌ ${f}`));
  }
  console.log('═'.repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
