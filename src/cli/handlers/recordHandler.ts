import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../../utils/logger.js';
import { StreamDetector, DetectionMode } from '../../core/streamDetector.js';
import { FlvRecorder } from '../../recorders/flvRecorder.js';
import { M3u8Recorder } from '../../recorders/m3u8Recorder.js';
import { SegmentRecorder } from '../../recorders/segmentRecorder.js';
import { VideoQuality } from '../../api/douyinApi.js';
import { getTimestamp } from '../../utils.js';
import { OutputFormat } from '../../recorders/flvRecorder.js';
import { getStreamType } from '../../utils/streamUrl.js';
import { ProgressDisplay } from '../../utils/progressDisplay.js';
import {
  DEFAULT_RECORDINGS_DIR,
  DEFAULT_DETECTION_MODE,
  DEFAULT_QUALITY,
  DEFAULT_FORMAT,
  VALID_OUTPUT_FORMATS,
} from '../../constants.js';

export interface RecordOptions {
  roomIdOrUrl?: string; // Room ID (numeric) or URL (e.g., https://live.douyin.com/379595210124)
  output?: string;
  mode?: string;
  quality?: string;
  format?: string;
  videoOnly?: boolean;
  audioOnly?: boolean;
  duration?: number;
  segment?: boolean;
  segmentDuration?: number;
  cookies?: string;
}

/**
 * Single room recording handler
 */
export async function recordSingleRoom(options: RecordOptions): Promise<void> {
  const {
    roomIdOrUrl,
    output = DEFAULT_RECORDINGS_DIR,

    mode = DEFAULT_DETECTION_MODE,
    quality = DEFAULT_QUALITY,
    format = DEFAULT_FORMAT,
    videoOnly,
    audioOnly,
    duration,
    segment,
    segmentDuration,
    cookies,
  } = options;

  if (!roomIdOrUrl) {
    throw new Error('Room ID or URL is required');
  }

  // Validate format parameter
  if (!VALID_OUTPUT_FORMATS.includes(format as (typeof VALID_OUTPUT_FORMATS)[number])) {
    throw new Error(`Invalid format: ${format}. Valid formats: ${VALID_OUTPUT_FORMATS.join(', ')}`);
  }

  Logger.log(chalk.blue('\n=== Douyin Live Recorder ===\n'));
  Logger.info(`Room: ${roomIdOrUrl}`);
  Logger.verbose(`Mode: ${mode}`);
  Logger.verbose(`Quality: ${quality}`);
  Logger.verbose(`Format: ${format}`);
  Logger.verbose(`Output: ${output}\n`);

  // Detect stream (roomIdOrUrl can be numeric ID or URL)
  const detector = new StreamDetector({
    mode: mode as DetectionMode,
    quality: quality as VideoQuality,
    cookies,
  });

  Logger.info(chalk.yellow('[1/3] Detecting stream...'));
  const streamInfo = await detector.detectStream(roomIdOrUrl);
  await detector.cleanup();

  Logger.success(`[Stream] Found: ${streamInfo.recordUrl}`);
  Logger.info(`[Stream] Anchor: ${streamInfo.anchorName || 'Unknown'}`);
  Logger.info(`[Stream] Title: ${streamInfo.title || 'Unknown'}\n`);

  // Determine output format
  const outputFormat = format as OutputFormat;

  // Generate filename first (needed for progress display path)
  const timestamp = getTimestamp();
  const anchorName = (streamInfo.anchorName || 'unknown').replace(/[^\w\s-]/g, '').trim();
  // Determine file extension based on format and audio options
  let fileExt: string;
  if (outputFormat === 'ts') {
    fileExt = 'ts';
  } else if (audioOnly) {
    fileExt = 'm4a';
  } else {
    fileExt = 'mp4'; // mp4 and fmp4 both use .mp4 extension
  }
  const filename = `douyin_${streamInfo.roomId}_${anchorName}_${timestamp}.${fileExt}`;

  // Create output path for progress display
  const outputPath = path.join(output, filename);
  
  // Create progress display (only for non-segment recorders)
  let progressDisplay: ProgressDisplay | null = null;
  if (!segment) {
    progressDisplay = new ProgressDisplay({
      outputPath,
      updateInterval: 1000, // Update every second
    });
  }

  // Create progress callback
  const progressCallback = (progress: any) => {
    if (progressDisplay) {
      progressDisplay.update(progress);
    }
  };

  // Select recorder with progress callback
  let recorder: FlvRecorder | M3u8Recorder | SegmentRecorder;

  if (segment) {
    recorder = new SegmentRecorder({
      outputDir: output,
      segmentDuration: segmentDuration || 3600,
    });
  } else if (getStreamType(streamInfo.recordUrl) === 'm3u8') {
    // Use M3U8 Recorder for HLS streams
    recorder = new M3u8Recorder({
      outputDir: output,
      onProgress: progressCallback,
    });
  } else {
    // Use FLV Recorder for FLV streams (default for most Douyin streams)
    recorder = new FlvRecorder({
      outputDir: output,
      onProgress: progressCallback,
    });
  }

  await recorder.init();

  Logger.info(chalk.yellow('[2/3] Starting recording...'));
  Logger.info(`Output: ${filename}\n`);
  if (!segment) {
    Logger.gray('Press Ctrl+C to stop recording\n');
  }

  // Handle interrupt
  const handleInterrupt = async () => {
    if (progressDisplay) {
      progressDisplay.stop();
    }
    Logger.warn('\n\n[Interrupt] Stopping recording...');
    await recorder.stop();
    if (progressDisplay) {
      const stats = progressDisplay.getFinalStats();
      Logger.info(`  Duration: ${stats.duration}`);
      Logger.info(`  Size: ${stats.fileSize}\n`);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void handleInterrupt();
  });
  process.on('SIGTERM', () => {
    void handleInterrupt();
  });

  // Start recording
  try {
    if (recorder instanceof SegmentRecorder) {
      await recorder.record(streamInfo.recordUrl, filename.replace(/\.\w+$/, ''), {
        videoOnly,
        audioOnly,
        cookies,
      });
    } else {
      await (recorder as FlvRecorder | M3u8Recorder).record(streamInfo.recordUrl, filename, {
        videoOnly,
        audioOnly,
        duration,
        format: outputFormat,
        cookies,
      });
    }

    // Stop progress display and show final stats
    if (progressDisplay) {
      let finalSize: number | undefined;
      try {
        if (fs.existsSync(outputPath)) {
          finalSize = fs.statSync(outputPath).size;
        }
      } catch {
        // Ignore file size errors
      }
      progressDisplay.stop(finalSize);
      const stats = progressDisplay.getFinalStats();
      Logger.success(`\n\n✓ Recording completed!`);
      Logger.info(`  Output: ${filename}`);
      Logger.info(`  Duration: ${stats.duration}`);
      Logger.info(`  Size: ${stats.fileSize}\n`);
    } else {
      Logger.success(`\n\n✓ Recording completed!`);
      Logger.info(`  Output: ${filename}\n`);
    }
  } catch (error: any) {
    if (progressDisplay) {
      progressDisplay.stop();
    }
    throw error;
  }
}
