import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import {
  BaseRecorder,
  BaseRecorderOptions,
  RecordingStatus,
  ProgressInfo,
  OutputFormat,
  RecordingOptions,
} from './baseRecorder.js';
import {
  getStreamInputOptions,
  configureCodecs,
  configureOutputFormat,
  setupFfmpegHandlers,
} from './recorderCommon.js';

export interface FlvRecorderOptions extends BaseRecorderOptions {
  onProgress?: (progress: ProgressInfo) => void;
}

export { ProgressInfo, RecordingOptions, OutputFormat, RecordingStatus };

/**
 * FLV 录制模块
 * 使用 ffmpeg 直接录制 FLV 流
 */
export class FlvRecorder extends BaseRecorder {
  private onProgress?: (progress: ProgressInfo) => void;

  constructor(options: FlvRecorderOptions = {}) {
    super(options);
    this.onProgress = options.onProgress;
  }

  /**
   * 录制 FLV 流
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

      Logger.verbose(`[FLV Recorder] Starting recording from: ${streamUrl}`);
      Logger.verbose(`[FLV Recorder] Output file: ${outputPath}`);

      let command = ffmpeg(streamUrl).inputOptions(getStreamInputOptions(options.cookies));

      command = setupFfmpegHandlers(
        command,
        {
          onStart: (commandLine: string) => {
            Logger.verbose('[FLV Recorder] FFmpeg command:', commandLine);
          },
          onProgress: (progress: ProgressInfo) => {
            this.duration = progress.duration;
            if (this.onProgress) {
              this.onProgress(progress);
            }
          },
          onEnd: () => {
            this.isRecording = false;
            Logger.verbose('[FLV Recorder] Recording completed');
            resolve(outputPath);
          },
          onError: (err: Error, stderr: string) => {
            this.isRecording = false;
            Logger.error('[FLV Recorder] Error:', err.message);
            if (stderr) {
              Logger.verbose('[FLV Recorder] FFmpeg stderr:', stderr);
            }
            reject(err);
          },
        },
        options
      );

      command = configureCodecs(command, options, false);

      if (format === 'ts' || path.extname(outputFilename).toLowerCase() === '.ts') {
        Logger.verbose('[FLV Recorder] Using TS format (streamable, interrupt-safe)');
      } else if (format === 'fmp4') {
        Logger.verbose('[FLV Recorder] Using Fragmented MP4 format (streamable)');
      }

      command = configureOutputFormat(command, outputFilename, format, options);
      command.output(outputPath).run();
      this.ffmpegProcess = command;
    });
  }
}
