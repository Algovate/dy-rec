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

export interface ProgressInfo {
  duration: string;
  time?: string;
  currentFps?: number;
  currentKbps?: number;
  fileSize?: number; // Optional file size in bytes (updated by display utility)
  elapsedSeconds?: number; // Optional elapsed time in seconds (updated by display utility)
}

export type OutputFormat = 'mp4' | 'ts' | 'fmp4';

export interface RecordingOptions {
  videoOnly?: boolean;
  audioOnly?: boolean;
  duration?: number | null;
  format?: OutputFormat;
  cookies?: string;
}

/**
 * Base recorder class
 * Provides common functionality for all recorder types
 */
export abstract class BaseRecorder {
  protected outputDir: string;
  protected ffmpegProcess: FfmpegCommand | null = null;
  protected isRecording: boolean = false;
  protected startTime: number | null = null;
  protected duration: string = '00:00:00';

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
      duration: this.duration,
      startTime: this.startTime,
      elapsed: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }
}
