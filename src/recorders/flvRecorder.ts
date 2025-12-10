import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import { BaseRecorder, BaseRecorderOptions, RecordingStatus } from './baseRecorder.js';
import {
  getStreamInputOptions,
  configureCodecs,
  configureOutputFormat,
  setupFfmpegHandlers,
} from './recorderCommon.js';

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
      format = 'mp4', // 输出格式
    } = options;

    const outputPath = path.join(this.outputDir, outputFilename);

    return new Promise((resolve, reject) => {
      this.isRecording = true;
      this.startTime = Date.now();

      console.log(`[FLV Recorder] Starting recording from: ${flvUrl}`);
      console.log(`[FLV Recorder] Output file: ${outputPath}`);

      // 创建 ffmpeg 命令
      let command = ffmpeg(flvUrl).inputOptions(getStreamInputOptions());

      // Setup event handlers
      command = setupFfmpegHandlers(
        command,
        {
          onStart: (commandLine: string) => {
            console.log('[FLV Recorder] FFmpeg command:', commandLine);
          },
          onProgress: (progress: ProgressInfo) => {
            this.duration = progress.duration;
            if (this.onProgress) {
              this.onProgress(progress);
            }
          },
          onEnd: () => {
            this.isRecording = false;
            console.log('[FLV Recorder] Recording completed');
            resolve(outputPath);
          },
          onError: (err: Error, stderr: string) => {
            this.isRecording = false;
            console.error('[FLV Recorder] Error:', err.message);
            if (stderr) {
              console.error('[FLV Recorder] FFmpeg stderr:', stderr);
            }
            reject(err);
          },
        },
        options
      );

      // 配置编解码器
      command = configureCodecs(command, options, false);

      // 设置输出格式
      if (format === 'ts' || path.extname(outputFilename).toLowerCase() === '.ts') {
        console.log('[FLV Recorder] Using TS format (streamable, interrupt-safe)');
      } else if (format === 'fmp4') {
        console.log('[FLV Recorder] Using Fragmented MP4 format (streamable)');
      }
      command = configureOutputFormat(command, outputFilename, format, options);

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
