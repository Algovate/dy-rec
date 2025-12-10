import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import { BaseRecorder, BaseRecorderOptions, RecordingStatus } from './baseRecorder.js';
import { ProgressInfo, RecordingOptions } from './flvRecorder.js';
import {
  getHlsInputOptions,
  configureCodecs,
  configureOutputFormat,
  setupFfmpegHandlers,
} from './recorderCommon.js';

export interface M3u8RecorderOptions extends BaseRecorderOptions {
  onProgress?: (progress: ProgressInfo) => void;
}

/**
 * M3U8/HLS 录制模块
 * 使用 ffmpeg 录制 HLS 流
 */
export class M3u8Recorder extends BaseRecorder {
  private onProgress?: (progress: ProgressInfo) => void;
  private duration: string = '00:00:00';

  constructor(options: M3u8RecorderOptions = {}) {
    super(options);
    this.onProgress = options.onProgress || undefined;
  }

  /**
   * 录制 M3U8 流
   * @param m3u8Url - M3U8 流的 URL
   * @param outputFilename - 输出文件名
   * @param options - 录制选项
   * @returns 输出文件路径
   */
  async record(
    m3u8Url: string,
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

      console.log(`[M3U8 Recorder] Starting recording from: ${m3u8Url}`);
      console.log(`[M3U8 Recorder] Output file: ${outputPath}`);

      // 创建 ffmpeg 命令
      let command = ffmpeg(m3u8Url).inputOptions(getHlsInputOptions());

      // Setup event handlers
      command = setupFfmpegHandlers(
        command,
        {
          onStart: (commandLine: string) => {
            console.log('[M3U8 Recorder] FFmpeg command:', commandLine);
          },
          onProgress: (progress: ProgressInfo) => {
            this.duration = progress.duration;
            if (this.onProgress) {
              this.onProgress(progress);
            }
          },
          onEnd: () => {
            this.isRecording = false;
            console.log('[M3U8 Recorder] Recording completed');
            resolve(outputPath);
          },
          onError: (err: Error, stderr: string) => {
            this.isRecording = false;
            console.error('[M3U8 Recorder] Error:', err.message);
            if (stderr) {
              console.error('[M3U8 Recorder] FFmpeg stderr:', stderr);
            }
            reject(err);
          },
        },
        options
      );

      // 配置编解码器（HLS 需要特殊处理）
      command = configureCodecs(command, options, true);

      // 设置输出格式
      if (format === 'ts' || path.extname(outputFilename).toLowerCase() === '.ts') {
        console.log('[M3U8 Recorder] Using TS format (streamable, interrupt-safe)');
      } else if (format === 'fmp4') {
        console.log('[M3U8 Recorder] Using Fragmented MP4 format (streamable)');
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
