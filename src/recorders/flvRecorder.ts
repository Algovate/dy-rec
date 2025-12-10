import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import { BaseRecorder, BaseRecorderOptions, RecordingStatus } from './baseRecorder.js';

export interface FlvRecorderOptions extends BaseRecorderOptions {
  onProgress?: (progress: ProgressInfo) => void;
}

export interface ProgressInfo {
  duration: string;
  time?: string;
  currentFps?: number;
  currentKbps?: number;
}

export type OutputFormat = 'mp4' | 'ts' | 'fmp4';

export interface RecordingOptions {
  videoOnly?: boolean;
  audioOnly?: boolean;
  duration?: number | null; // 录制时长（秒），null 表示持续录制直到手动停止
  format?: OutputFormat; // 输出格式：mp4（默认）、ts（边录边播）、fmp4（fragmented mp4）
}

export { RecordingStatus };

/**
 * FLV 录制模块
 * 使用 ffmpeg 直接录制 FLV 流
 */
export class FlvRecorder extends BaseRecorder {
  private onProgress?: (progress: ProgressInfo) => void;
  private duration: string = '00:00:00';

  constructor(options: FlvRecorderOptions = {}) {
    super(options);
    this.onProgress = options.onProgress || undefined;
  }

  /**
   * 录制 FLV 流
   * @param flvUrl - FLV 流的 URL
   * @param outputFilename - 输出文件名
   * @param options - 录制选项
   * @returns 输出文件路径
   */
  async record(
    flvUrl: string,
    outputFilename: string,
    options: RecordingOptions = {}
  ): Promise<string> {
    const {
      videoOnly = false,
      audioOnly = false,
      duration = null, // 录制时长（秒），null 表示持续录制直到手动停止
      format = 'mp4', // 输出格式
    } = options;

    const outputPath = path.join(this.outputDir, outputFilename);

    return new Promise((resolve, reject) => {
      this.isRecording = true;
      this.startTime = Date.now();

      console.log(`[FLV Recorder] Starting recording from: ${flvUrl}`);
      console.log(`[FLV Recorder] Output file: ${outputPath}`);

      // 创建 ffmpeg 命令
      let command = ffmpeg(flvUrl)
        .inputOptions([
          '-re', // 以原始帧率读取输入
          '-rw_timeout',
          '10000000', // 10 秒读写超时
          '-timeout',
          '10000000', // 10 秒超时
        ])
        .on('start', (commandLine: string) => {
          console.log('[FLV Recorder] FFmpeg command:', commandLine);
        })
        .on(
          'progress',
          (progress: { timemark: string; currentFps?: number; currentKbps?: number }) => {
            this.duration = progress.timemark || '00:00:00';

            if (this.onProgress) {
              this.onProgress({
                duration: this.duration,
                time: progress.timemark,
                currentFps: progress.currentFps,
                currentKbps: progress.currentKbps,
              });
            }

            // 如果设置了录制时长，检查是否达到
            if (duration && progress.timemark) {
              const elapsed = this.parseTimemark(progress.timemark);
              if (elapsed >= duration) {
                console.log(`[FLV Recorder] Reached target duration: ${duration}s`);
                command.kill('SIGINT'); // 优雅停止
              }
            }
          }
        )
        .on('end', () => {
          this.isRecording = false;
          console.log('[FLV Recorder] Recording completed');
          resolve(outputPath);
        })
        .on('error', (err: Error, _stdout: string, stderr: string) => {
          this.isRecording = false;
          console.error('[FLV Recorder] Error:', err.message);
          if (stderr) {
            console.error('[FLV Recorder] FFmpeg stderr:', stderr);
          }
          reject(err);
        });

      // 配置输出选项
      if (audioOnly) {
        // 仅录制音频
        command = command.noVideo().audioCodec('copy'); // 尝试直接复制音频流
      } else if (videoOnly) {
        // 仅录制视频
        command = command.noAudio().videoCodec('copy'); // 直接复制视频流，不重新编码
      } else {
        // 录制视频和音频
        command = command
          .videoCodec('copy') // 直接复制视频流
          .audioCodec('copy'); // 直接复制音频流
      }

      // 设置输出格式
      const ext = path.extname(outputFilename).toLowerCase();

      if (format === 'ts' || ext === '.ts') {
        // TS 格式：支持边录边播，中断安全
        command = command.format('mpegts');
        console.log('[FLV Recorder] Using TS format (streamable, interrupt-safe)');
      } else if (format === 'fmp4') {
        // Fragmented MP4：支持边录边播，兼容性好
        command = command
          .outputOptions(['-movflags', '+frag_keyframe+empty_moov+default_base_moof'])
          .format('mp4');
        console.log('[FLV Recorder] Using Fragmented MP4 format (streamable)');
      } else if (audioOnly && ext === '.m4a') {
        command = command.format('ipod');
      } else if (audioOnly && ext === '.mp3') {
        command = command.audioCodec('libmp3lame').audioBitrate('192k').format('mp3');
      } else {
        // 默认 MP4 格式
        command = command
          .outputOptions([
            '-movflags',
            '+faststart', // 优化 MP4 以便快速播放
          ])
          .format('mp4');
      }

      // 开始录制
      command.output(outputPath).run();

      // 保存 ffmpeg 进程引用
      this.ffmpegProcess = command;
    });
  }

  /**
   * 获取当前录制状态
   */
  override getStatus(): RecordingStatus {
    return {
      ...super.getStatus(),
      duration: this.duration,
    };
  }
}
