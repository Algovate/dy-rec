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

  /**
   * Parse timemark string to seconds
   */
  protected parseTimemark(timemark: string): number {
    const parts = timemark.split(':');
    if (parts.length === 3) {
      const hours = parseFloat(parts[0]);
      const minutes = parseFloat(parts[1]);
      const seconds = parseFloat(parts[2]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  }
}
