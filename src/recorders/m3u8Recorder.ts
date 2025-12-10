import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import {
  BaseRecorder,
  BaseRecorderOptions,
  RecordingStatus,
  ProgressInfo,
  RecordingOptions,
} from './baseRecorder.js';
import {
  getHlsInputOptions,
  configureCodecs,
  configureOutputFormat,
  setupFfmpegHandlers,
} from './recorderCommon.js';

export interface M3u8RecorderOptions extends BaseRecorderOptions {
  onProgress?: (progress: ProgressInfo) => void;
}

export { ProgressInfo, RecordingOptions, RecordingStatus };

/**
 * M3U8/HLS 录制模块
 * 使用 ffmpeg 录制 HLS 流
 */
export class M3u8Recorder extends BaseRecorder {
  private onProgress?: (progress: ProgressInfo) => void;

  constructor(options: M3u8RecorderOptions = {}) {
    super(options);
    this.onProgress = options.onProgress;
  }

  /**
   * 录制 M3U8 流
   */
  async record(
    streamUrl: string,
    outputFilename: string,
    options: RecordingOptions = {}
  ): Promise<string> {
    const { format = 'mp4' } = options;
    const outputPath = path.join(this.outputDir, outputFilename);

    return new Promise((resolve, reject) => {
      this.isRecording = true;
      this.startTime = Date.now();

      Logger.verbose(`[M3U8 Recorder] Starting recording from: ${streamUrl}`);
      Logger.verbose(`[M3U8 Recorder] Output file: ${outputPath}`);

      let command = ffmpeg(streamUrl).inputOptions(getHlsInputOptions(options.cookies));

      command = setupFfmpegHandlers(
        command,
        {
          onStart: (commandLine: string) => {
            Logger.verbose('[M3U8 Recorder] FFmpeg command:', commandLine);
          },
          onProgress: (progress: ProgressInfo) => {
            this.duration = progress.duration;
            if (this.onProgress) {
              this.onProgress(progress);
            }
          },
          onEnd: () => {
            this.isRecording = false;
            Logger.verbose('[M3U8 Recorder] Recording completed');
            resolve(outputPath);
          },
          onError: (err: Error, stderr: string) => {
            this.isRecording = false;
            Logger.error('[M3U8 Recorder] Error:', err.message);
            if (stderr) {
              Logger.verbose('[M3U8 Recorder] FFmpeg stderr:', stderr);
            }
            reject(err);
          },
        },
        options
      );

      command = configureCodecs(command, options, true);

      if (format === 'ts' || path.extname(outputFilename).toLowerCase() === '.ts') {
        Logger.verbose('[M3U8 Recorder] Using TS format (streamable, interrupt-safe)');
      } else if (format === 'fmp4') {
        Logger.verbose('[M3U8 Recorder] Using Fragmented MP4 format (streamable)');
      }

      command = configureOutputFormat(command, outputFilename, format, options);
      command.output(outputPath).run();
      this.ffmpegProcess = command;
    });
  }
}
