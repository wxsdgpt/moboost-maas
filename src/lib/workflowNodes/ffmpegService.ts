/**
 * src/lib/workflowNodes/ffmpegService.ts
 *
 * FFmpeg 视频拼接服务 — 本地调用 ffmpeg CLI
 * 
 * 功能：
 * - 视频片段拼接（concat demuxer）
 * - 音频叠加（配音 + BGM）
 * - 字幕烧录（ASS/SRT）
 * - 格式转换 + 超分辨率（后续）
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';

export interface MergeOptions {
  /** 视频片段 URL 或本地路径列表（按顺序拼接） */
  videos: string[];
  /** 可选音频轨道（配音/BGM） */
  audioTrack?: string;
  /** 输出格式 */
  format?: 'mp4' | 'webm';
  /** 输出分辨率（如 1920x1080） */
  resolution?: string;
  /** 输出帧率 */
  fps?: number;
}

export interface MergeResult {
  outputPath: string;
  duration: number;
  fileSize: number;
}

/**
 * 拼接多个视频片段为一个完整视频
 */
export async function mergeVideos(options: MergeOptions): Promise<MergeResult> {
  const { videos, audioTrack, format = 'mp4', resolution, fps } = options;

  if (!videos.length) throw new Error('mergeVideos: 至少需要一个视频');

  // 创建临时工作目录
  const workDir = await mkdtemp(join(tmpdir(), 'workflow-merge-'));

  try {
    // 1. 下载远程视频到本地（如果是 URL）
    const localPaths: string[] = [];
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      if (video.startsWith('http://') || video.startsWith('https://')) {
        const localPath = join(workDir, `segment_${i}.mp4`);
        const resp = await fetch(video);
        if (!resp.ok) throw new Error(`下载视频失败: ${video} (${resp.status})`);
        const buffer = Buffer.from(await resp.arrayBuffer());
        await writeFile(localPath, buffer);
        localPaths.push(localPath);
      } else {
        localPaths.push(video);
      }
    }

    // 2. 生成 concat 列表文件
    const concatList = localPaths.map(p => `file '${p}'`).join('\n');
    const concatFile = join(workDir, 'concat.txt');
    await writeFile(concatFile, concatList);

    // 3. 构建 ffmpeg 命令
    const outputPath = join(workDir, `output.${format}`);
    const args: string[] = [
      '-y',                          // 覆盖输出
      '-f', 'concat',                // concat demuxer
      '-safe', '0',                  // 允许绝对路径
      '-i', concatFile,              // 输入列表
    ];

    // 音频轨道
    if (audioTrack) {
      args.push('-i', audioTrack);
      args.push('-map', '0:v', '-map', '1:a');  // 视频用第一个输入，音频用第二个
    }

    // 视频编码
    args.push('-c:v', 'libx264');
    args.push('-preset', 'medium');
    args.push('-crf', '23');

    // 音频编码
    args.push('-c:a', 'aac');
    args.push('-b:a', '128k');

    // 分辨率
    if (resolution) {
      const [w, h] = resolution.split('x');
      args.push('-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
    }

    // 帧率
    if (fps) {
      args.push('-r', String(fps));
    }

    // 确保兼容性
    args.push('-movflags', '+faststart');
    args.push('-pix_fmt', 'yuv420p');

    args.push(outputPath);

    // 4. 执行 ffmpeg
    const { stderr } = await execFileAsync(FFMPEG_PATH, args, {
      timeout: 300_000, // 5 分钟超时
    });

    // 5. 获取输出文件信息
    const { stdout: probeOut } = await execFileAsync(FFPROBE_PATH, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      outputPath,
    ]);

    const probeData = JSON.parse(probeOut);
    const duration = parseFloat(probeData.format?.duration || '0');
    const fileSize = parseInt(probeData.format?.size || '0');

    return { outputPath, duration, fileSize };
  } catch (err) {
    // 清理临时文件
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/**
 * 获取视频时长
 */
export async function getVideoDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync(FFPROBE_PATH, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    path,
  ]);
  const data = JSON.parse(stdout);
  return parseFloat(data.format?.duration || '0');
}

/**
 * 生成视频缩略图
 */
export async function generateThumbnail(videoPath: string, outputPath: string, timestamp: string = '00:00:01'): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    '-y',
    '-i', videoPath,
    '-ss', timestamp,
    '-vframes', '1',
    '-q:v', '2',
    outputPath,
  ]);
}
