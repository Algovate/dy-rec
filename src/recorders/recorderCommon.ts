import { FfmpegCommand } from 'fluent-ffmpeg';
import * as path from 'path';
import { FFMPEG_TIMEOUT, FFMPEG_RW_TIMEOUT } from '../constants.js';
import { ProgressInfo, RecordingOptions, OutputFormat } from './flvRecorder.js';

export interface FfmpegProgress {
  timemark: string;
  currentFps?: number;
  currentKbps?: number;
}

export interface RecorderCallbacks {
  onStart?: (commandLine: string) => void;
  onProgress?: (progress: ProgressInfo) => void;
  onEnd?: () => void;
  onError?: (err: Error, stderr: string) => void;
}

/**
 * Common HTTP headers for Douyin streams
 */
export const DOUYIN_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
export const DOUYIN_REFERER = 'https://live.douyin.com/';

/**
 * Common FFmpeg input options for stream recording
 * @param cookies - Optional cookies to include in headers
 */
export function getStreamInputOptions(cookies?: string): string[] {
  const options = ['-user_agent', DOUYIN_USER_AGENT, '-referer', DOUYIN_REFERER];

  if (cookies) {
    options.push('-headers', `Cookie: ${cookies}\r\n`);
  }

  options.push(
    '-rw_timeout',
    FFMPEG_RW_TIMEOUT.toString(),
    '-timeout',
    FFMPEG_TIMEOUT.toString()
  );

  return options;
}

/**
 * Common FFmpeg input options for HLS/M3U8 streams
 * @param cookies - Optional cookies to include in headers
 */
export function getHlsInputOptions(cookies?: string): string[] {
  const options = ['-user_agent', DOUYIN_USER_AGENT, '-referer', DOUYIN_REFERER];

  if (cookies) {
    options.push('-headers', `Cookie: ${cookies}\r\n`);
  }

  options.push(
    '-protocol_whitelist',
    'file,http,https,tcp,tls,crypto',
    '-reconnect',
    '1',
    '-reconnect_at_eof',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '2',
    '-timeout',
    FFMPEG_TIMEOUT.toString(),
    '-rw_timeout',
    FFMPEG_RW_TIMEOUT.toString()
  );

  return options;
}

/**
 * Configure FFmpeg command for audio/video codec based on options
 */
export function configureCodecs(
  command: FfmpegCommand,
  options: RecordingOptions,
  isHls: boolean = false
): FfmpegCommand {
  if (options.audioOnly) {
    return command
      .noVideo()
      .audioCodec('aac')
      .audioBitrate('128k')
      .audioFrequency(44100)
      .audioChannels(2);
  } else if (options.videoOnly) {
    return command.noAudio().videoCodec('copy');
  } else {
    if (isHls) {
      return command
        .videoCodec('copy')
        .audioCodec('copy')
        .outputOptions(['-bsf:a', 'aac_adtstoasc']);
    } else {
      return command.videoCodec('copy').audioCodec('copy');
    }
  }
}

/**
 * Configure output format for FFmpeg command
 */
export function configureOutputFormat(
  command: FfmpegCommand,
  outputFilename: string,
  format: OutputFormat,
  options: RecordingOptions
): FfmpegCommand {
  const ext = path.extname(outputFilename).toLowerCase();

  if (format === 'ts' || ext === '.ts') {
    return command.format('mpegts');
  } else if (format === 'fmp4') {
    return command
      .outputOptions(['-movflags', '+frag_keyframe+empty_moov+default_base_moof'])
      .format('mp4');
  } else if (options.audioOnly) {
    if (ext === '.m4a') {
      // Use 'ipod' format for M4A audio files (proper audio-only MP4 container)
      return command.format('ipod');
    } else if (ext === '.mp3') {
      return command.audioCodec('libmp3lame').audioBitrate('192k').format('mp3');
    }
  }

  // Default MP4 format
  return command.outputOptions(['-movflags', '+faststart']).format('mp4');
}

/**
 * Setup common FFmpeg event handlers
 */
export function setupFfmpegHandlers(
  command: FfmpegCommand,
  callbacks: RecorderCallbacks,
  options: RecordingOptions
): FfmpegCommand {
  if (callbacks.onStart) {
    command.on('start', callbacks.onStart);
  }

  if (callbacks.onProgress) {
    command.on('progress', (progress: FfmpegProgress) => {
      if (callbacks.onProgress) {
        callbacks.onProgress({
          duration: progress.timemark || '00:00:00',
          time: progress.timemark,
          currentFps: progress.currentFps,
          currentKbps: progress.currentKbps,
        });
      }

      // Check duration limit
      if (options.duration && progress.timemark) {
        const elapsed = parseTimemark(progress.timemark);
        if (elapsed >= options.duration) {
          command.kill('SIGINT');
        }
      }
    });
  }

  if (callbacks.onEnd) {
    command.on('end', () => {
      if (callbacks.onEnd) {
        callbacks.onEnd();
      }
    });
  }

  if (callbacks.onError) {
    command.on('error', (err: Error, _stdout: string, stderr: string) => {
      if (callbacks.onError) {
        callbacks.onError(err, stderr);
      }
    });
  }

  return command;
}

/**
 * Parse timemark string to seconds
 */
export function parseTimemark(timemark: string): number {
  const parts = timemark.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}
