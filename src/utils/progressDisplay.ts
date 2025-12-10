import * as fs from 'fs';
import chalk from 'chalk';
import { ProgressInfo } from '../recorders/baseRecorder.js';

/**
 * Progress display options
 */
export interface ProgressDisplayOptions {
  outputPath: string;
  updateInterval?: number; // Milliseconds between updates (default: 1000)
}

/**
 * Extended progress information with file size
 */
export interface ExtendedProgressInfo extends ProgressInfo {
  fileSize?: number; // File size in bytes
  elapsedSeconds?: number; // Elapsed time in seconds since start
}

/**
 * Progress display utility for recording operations
 * Shows real-time feedback during long recordings
 * Uses text-only mode for live streaming (no progress bar/percentage)
 */
export class ProgressDisplay {
  private outputPath: string;
  private updateInterval: number;
  private startTime: number;
  private lastUpdateTime: number = 0;
  private lastProgressInfo: ExtendedProgressInfo | null = null;
  private fileSizeCheckInterval: NodeJS.Timeout | null = null;

  constructor(options: ProgressDisplayOptions) {
    this.outputPath = options.outputPath;
    this.updateInterval = options.updateInterval || 1000; // Default 1 second
    this.startTime = Date.now();

    // Start file size monitoring
    this.startFileSizeMonitoring();
  }

  /**
   * Update progress information
   */
  update(progress: ProgressInfo): void {
    const now = Date.now();
    
    // Throttle updates to avoid terminal spam
    if (now - this.lastUpdateTime < this.updateInterval) {
      return;
    }

    this.lastUpdateTime = now;
    const elapsedSeconds = Math.floor((now - this.startTime) / 1000);

    // Get current file size
    const fileSize = this.getFileSize();

    const extendedProgress: ExtendedProgressInfo = {
      ...progress,
      fileSize,
      elapsedSeconds,
    };

    this.lastProgressInfo = extendedProgress;
    this.render(extendedProgress);
  }

  /**
   * Render progress display (text-only mode)
   */
  private render(progress: ExtendedProgressInfo): void {
    const elapsed = this.formatSeconds(progress.elapsedSeconds || 0);
    const size = this.formatFileSize(progress.fileSize || 0);
    const fps = progress.currentFps ? progress.currentFps.toFixed(1) : '--';
    const bitrate = progress.currentKbps
      ? `${Math.round(progress.currentKbps)} kb/s`
      : '--';

    // Text-only mode: show real-time information
    const line =
      chalk.cyan('Recording...') +
      ` Duration: ${chalk.yellow(elapsed)}` +
      ` | Size: ${chalk.magenta(size)}` +
      ` | FPS: ${chalk.cyan(fps)}` +
      ` | Bitrate: ${chalk.gray(bitrate)}`;

    // Use \r to overwrite previous line
    process.stdout.write(`\r${line}`);
  }

  /**
   * Get current file size from filesystem
   */
  private getFileSize(): number {
    try {
      if (fs.existsSync(this.outputPath)) {
        const stats = fs.statSync(this.outputPath);
        return stats.size;
      }
    } catch {
      // File doesn't exist or can't be accessed
    }
    return 0;
  }

  /**
   * Start file size monitoring (periodic checks)
   */
  private startFileSizeMonitoring(): void {
    // Update file size every 2 seconds
    this.fileSizeCheckInterval = setInterval(() => {
      if (this.lastProgressInfo) {
        const fileSize = this.getFileSize();
        if (fileSize !== this.lastProgressInfo.fileSize) {
          const updatedProgress: ExtendedProgressInfo = {
            ...this.lastProgressInfo,
            fileSize,
            elapsedSeconds: Math.floor((Date.now() - this.startTime) / 1000),
          };
          this.lastProgressInfo = updatedProgress;
          this.render(updatedProgress);
        }
      }
    }, 2000);
  }

  /**
   * Format seconds to HH:MM:SS
   */
  private formatSeconds(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format file size to human-readable format
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  }

  /**
   * Stop and clean up progress display
   */
  stop(finalSize?: number): void {
    if (this.fileSizeCheckInterval) {
      clearInterval(this.fileSizeCheckInterval);
      this.fileSizeCheckInterval = null;
    }

    // Update final progress if size provided
    if (this.lastProgressInfo && finalSize !== undefined) {
      const finalProgress: ExtendedProgressInfo = {
        ...this.lastProgressInfo,
        fileSize: finalSize,
        elapsedSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      };
      this.render(finalProgress);
    }

    // Clear the line for text-only mode
    process.stdout.write('\r' + ' '.repeat(120) + '\r');
  }

  /**
   * Get final statistics
   */
  getFinalStats(): {
    duration: string;
    fileSize: string;
    elapsedSeconds: number;
  } {
    const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const fileSize = this.getFileSize();

    return {
      duration: this.formatSeconds(elapsedSeconds),
      fileSize: this.formatFileSize(fileSize),
      elapsedSeconds,
    };
  }
}

