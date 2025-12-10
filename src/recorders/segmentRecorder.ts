import ffmpeg from 'fluent-ffmpeg';
import { FfmpegCommand } from 'fluent-ffmpeg';
import * as path from 'path';
import { ensureDir } from '../utils.js';

export interface SegmentRecorderOptions {
  outputDir?: string;
  segmentDuration?: number;
  segmentFormat?: string;
  onProgress?: (progress: SegmentProgressInfo) => void;
}

export interface SegmentProgressInfo {
  duration?: string;
  currentFps?: number;
  currentKbps?: number;
  segmentCount: number;
}

export interface SegmentRecordingOptions {
  segmentDuration?: number;
  segmentFormat?: string;
  videoOnly?: boolean;
  audioOnly?: boolean;
}

export interface SegmentStatus {
  isRecording: boolean;
  segmentCount: number;
  startTime: number | null;
  elapsed: number;
}

/**
 * 分段录制器
 * 按时长或文件大小分割视频
 */
export class SegmentRecorder {
  private outputDir: string;
  private segmentDuration: number;
  private segmentFormat: string;
  private onProgress?: (progress: SegmentProgressInfo) => void;
  private ffmpegProcess: FfmpegCommand | null = null;
  private isRecording: boolean = false;
  private segmentCount: number = 0;
  private startTime: number | null = null;

  constructor(options: SegmentRecorderOptions = {}) {
    this.outputDir = options.outputDir || './output';
    this.segmentDuration = options.segmentDuration || 3600; // 默认 1 小时
    this.segmentFormat = options.segmentFormat || 'mp4';
    this.onProgress = options.onProgress || undefined;
  }

  /**
   * 初始化输出目录
   */
  async init(): Promise<void> {
    await ensureDir(this.outputDir);
  }

  /**
   * 开始分段录制
   * @param streamUrl - 流 URL
   * @param baseFilename - 基础文件名（不含扩展名）
   * @param options - 录制选项
   * @returns Promise<void>
   */
  async record(
    streamUrl: string,
    baseFilename: string,
    options: SegmentRecordingOptions = {}
  ): Promise<void> {
    const {
      segmentDuration = this.segmentDuration,
      segmentFormat = this.segmentFormat,
      videoOnly = false,
      audioOnly = false,
    } = options;

    // 生成分段文件名模板
    const segmentPattern = path.join(this.outputDir, `${baseFilename}_%03d.${segmentFormat}`);

    return new Promise((resolve, reject) => {
      this.isRecording = true;
      this.startTime = Date.now();
      this.segmentCount = 0;

      console.log(`[Segment Recorder] Starting segmented recording from: ${streamUrl}`);
      console.log(`[Segment Recorder] Segment duration: ${segmentDuration} seconds`);
      console.log(`[Segment Recorder] Output pattern: ${segmentPattern}`);

      // 创建 ffmpeg 命令
      let command = ffmpeg(streamUrl)
        .inputOptions(['-re', '-rw_timeout', '10000000', '-timeout', '10000000'])
        .outputOptions([
          '-f',
          'segment',
          '-segment_time',
          segmentDuration.toString(),
          '-segment_format',
          segmentFormat,
          '-reset_timestamps',
          '1',
          '-movflags',
          '+frag_keyframe+empty_moov', // 优化分段
        ])
        .on('start', (commandLine: string) => {
          console.log('[Segment Recorder] FFmpeg command:', commandLine);
        })
        .on('progress', (progress: any) => {
          if (this.onProgress) {
            this.onProgress({
              duration: progress.timemark,
              currentFps: progress.currentFps,
              currentKbps: progress.currentKbps,
              segmentCount: this.segmentCount,
            });
          }
        })
        .on('end', () => {
          this.isRecording = false;
          console.log(
            `[Segment Recorder] Recording completed, total segments: ${this.segmentCount}`
          );
          resolve();
        })
        .on('error', (err: Error, _stdout: string, stderr: string) => {
          this.isRecording = false;
          console.error('[Segment Recorder] Error:', err.message);
          if (stderr) {
            console.error('[Segment Recorder] FFmpeg stderr:', stderr);
          }
          reject(err);
        });

      // 配置输出选项
      if (audioOnly) {
        command = command.noVideo().audioCodec('aac').audioBitrate('128k');
      } else if (videoOnly) {
        command = command.noAudio().videoCodec('copy');
      } else {
        command = command.videoCodec('copy').audioCodec('aac').audioBitrate('128k');
      }

      // 监听分段创建（通过 stderr 输出检测）
      command.on('stderr', (stderrLine: string) => {
        // 检测新分段创建
        if (stderrLine.includes('Opening') || stderrLine.includes('segment')) {
          this.segmentCount++;
          console.log(`[Segment Recorder] Created segment ${this.segmentCount}`);
        }
      });

      // 开始录制
      command.output(segmentPattern).run();

      // 保存 ffmpeg 进程引用
      this.ffmpegProcess = command;
    });
  }

  /**
   * 停止录制
   */
  async stop(): Promise<void> {
    if (this.ffmpegProcess && this.isRecording) {
      console.log('[Segment Recorder] Stopping recording...');
      this.ffmpegProcess.kill('SIGINT');
      this.isRecording = false;
    }
  }

  /**
   * 获取状态
   */
  getStatus(): SegmentStatus {
    return {
      isRecording: this.isRecording,
      segmentCount: this.segmentCount,
      startTime: this.startTime,
      elapsed: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }
}
