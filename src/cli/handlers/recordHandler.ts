import chalk from 'chalk';
import { Logger } from '../../utils/logger.js';
import { StreamDetector, DetectionMode } from '../../core/streamDetector.js';
import { FlvRecorder } from '../../recorders/flvRecorder.js';
import { M3u8Recorder } from '../../recorders/m3u8Recorder.js';
import { SegmentRecorder } from '../../recorders/segmentRecorder.js';
import { VideoQuality } from '../../api/douyinApi.js';
import { getTimestamp } from '../../utils.js';
import { OutputFormat } from '../../recorders/flvRecorder.js';
import { getStreamType } from '../../utils/streamUrl.js';
import {
  DEFAULT_RECORDINGS_DIR,
  DEFAULT_DETECTION_MODE,
  DEFAULT_QUALITY,
  DEFAULT_FORMAT,
  VALID_OUTPUT_FORMATS,
} from '../../constants.js';

export interface RecordOptions {
  room?: string;
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
    room,
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

  if (!room) {
    throw new Error('Room ID or URL is required');
  }

  // Validate format parameter
  if (!VALID_OUTPUT_FORMATS.includes(format as (typeof VALID_OUTPUT_FORMATS)[number])) {
    throw new Error(`Invalid format: ${format}. Valid formats: ${VALID_OUTPUT_FORMATS.join(', ')}`);
  }

  Logger.log(chalk.blue('\n=== Douyin Live Recorder ===\n'));
  Logger.info(`Room: ${room}`);
  Logger.verbose(`Mode: ${mode}`);
  Logger.verbose(`Quality: ${quality}`);
  Logger.verbose(`Format: ${format}`);
  Logger.verbose(`Output: ${output}\n`);

  // Detect stream
  const detector = new StreamDetector({
    mode: mode as DetectionMode,
    quality: quality as VideoQuality,
    cookies,
  });

  Logger.info(chalk.yellow('[1/3] Detecting stream...'));
  const streamInfo = await detector.detectStream(room);
  await detector.cleanup();

  Logger.success(`[Stream] Found: ${streamInfo.recordUrl}`);
  Logger.info(`[Stream] Anchor: ${streamInfo.anchorName || 'Unknown'}`);
  Logger.info(`[Stream] Title: ${streamInfo.title || 'Unknown'}\n`);

  // Select recorder
  let recorder: FlvRecorder | M3u8Recorder | SegmentRecorder;
  const outputFormat = format as OutputFormat;

  if (segment) {
    recorder = new SegmentRecorder({
      outputDir: output,
      segmentDuration: segmentDuration || 3600,
    });
  } else if (getStreamType(streamInfo.recordUrl) === 'm3u8') {
    // Use M3U8 Recorder for HLS streams
    recorder = new M3u8Recorder({ outputDir: output });
  } else {
    // Use FLV Recorder for FLV streams (default for most Douyin streams)
    recorder = new FlvRecorder({ outputDir: output });
  }

  await recorder.init();

  // Generate filename
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

  Logger.info(chalk.yellow('[2/3] Starting recording...'));
  Logger.info(`Output: ${filename}\n`);
  Logger.gray('Press Ctrl+C to stop recording\n');

  // Handle interrupt
  const handleInterrupt = async () => {
    Logger.warn('\n\n[Interrupt] Stopping recording...');
    await recorder.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void handleInterrupt();
  });
  process.on('SIGTERM', () => {
    void handleInterrupt();
  });

  // Start recording
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

  Logger.success(`\n\n✓ Recording completed!`);
  Logger.info(`  Output: ${filename}\n`);
}
