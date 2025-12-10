import { FfmpegCommand } from 'fluent-ffmpeg';

import { ensureDir } from '../utils.js';

export interface BaseRecorderOptions {
  outputDir?: string;
}

export interface RecordingStatus {
  isRecording: boolean;
  duration?: string;
  startTime: number | null;
  elapsed: number;
}

export abstract class BaseRecorder {
  protected outputDir: string;
  protected ffmpegProcess: FfmpegCommand | null = null;
  protected isRecording: boolean = false;
  protected startTime: number | null = null;

  constructor(options: BaseRecorderOptions = {}) {
    this.outputDir = options.outputDir || './output';
  }

  /**
   * Initialize output directory
   */
  async init(): Promise<void> {
    await ensureDir(this.outputDir);
  }

  /**
   * Stop recording
   */
  async stop(): Promise<void> {
    if (this.ffmpegProcess && this.isRecording) {
      console.log(`[${this.constructor.name}] Stopping recording...`);
      this.ffmpegProcess.kill('SIGINT');
      this.isRecording = false;
    }
  }

  /**
   * Get current recording status
   */
  getStatus(): RecordingStatus {
    return {
      isRecording: this.isRecording,
      startTime: this.startTime,
      elapsed: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }
}
