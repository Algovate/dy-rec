import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import { BaseRecorder, BaseRecorderOptions, RecordingStatus } from './baseRecorder.js';
import { ProgressInfo, RecordingOptions } from './flvRecorder.js';

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
      videoOnly = false,
      audioOnly = false,
      duration = null, // 录制时长（秒），null 表示持续录制直到手动停止
      format = 'mp4', // 输出格式
    } = options;

    const outputPath = path.join(this.outputDir, outputFilename);

    return new Promise((resolve, reject) => {
      this.isRecording = true;
      this.startTime = Date.now();

      console.log(`[M3U8 Recorder] Starting recording from: ${m3u8Url}`);
      console.log(`[M3U8 Recorder] Output file: ${outputPath}`);

      // 创建 ffmpeg 命令
      let command = ffmpeg(m3u8Url)
        .inputOptions([
          '-reconnect',
          '1', // 自动重连
          '-reconnect_at_eof',
          '1', // 在文件结束时重连
          '-reconnect_streamed',
          '1', // 流式重连
          '-reconnect_delay_max',
          '2', // 最大重连延迟 2 秒
          '-timeout',
          '10000000', // 10 秒超时
          '-rw_timeout',
          '10000000', // 10 秒读写超时
        ])
        .on('start', (commandLine: string) => {
          console.log('[M3U8 Recorder] FFmpeg command:', commandLine);
        })
        .on(
          'progress',
          (progress: { timemark: string; currentFps?: number; currentKbps?: number }) => {
            this.duration = progress.timemark || '00:00:00';

            if (this.onProgress) {
              this.onProgress({
                duration: this.duration,
                time: progress.timemark,
                currentFps: progress.currentFps,
                currentKbps: progress.currentKbps,
              });
            }

            // 如果设置了录制时长，检查是否达到
            if (duration && progress.timemark) {
              const elapsed = this.parseTimemark(progress.timemark);
              if (elapsed >= duration) {
                console.log(`[M3U8 Recorder] Reached target duration: ${duration}s`);
                command.kill('SIGINT'); // 优雅停止
              }
            }
          }
        )
        .on('end', () => {
          this.isRecording = false;
          console.log('[M3U8 Recorder] Recording completed');
          resolve(outputPath);
        })
        .on('error', (err: Error, _stdout: string, stderr: string) => {
          this.isRecording = false;
          console.error('[M3U8 Recorder] Error:', err.message);
          if (stderr) {
            console.error('[M3U8 Recorder] FFmpeg stderr:', stderr);
          }
          reject(err);
        });

      // 配置输出选项
      if (audioOnly) {
        // 仅录制音频
        command = command
          .noVideo()
          .audioCodec('aac')
          .audioBitrate('128k')
          .audioFrequency(44100)
          .audioChannels(2);
      } else if (videoOnly) {
        // 仅录制视频
        command = command.noAudio().videoCodec('copy'); // 直接复制视频流
      } else {
        // 录制视频和音频
        command = command
          .videoCodec('copy') // 直接复制视频流
          .audioCodec('aac') // 重新编码音频为 AAC
          .audioBitrate('128k')
          .outputOptions([
            '-bsf:a',
            'aac_adtstoasc', // HLS 音频流需要这个
          ]);
      }

      // 设置输出格式
      const ext = path.extname(outputFilename).toLowerCase();
      if (audioOnly && ext === '.m4a') {
        command = command.format('ipod');
      } else if (format === 'ts' || ext === '.ts') {
        // TS 格式：支持边录边播，中断安全
        command = command.format('mpegts');
        console.log('[M3U8 Recorder] Using TS format (streamable, interrupt-safe)');
      } else if (format === 'fmp4') {
        // Fragmented MP4：支持边录边播，兼容性好
        command = command
          .outputOptions(['-movflags', '+frag_keyframe+empty_moov+default_base_moof'])
          .format('mp4');
        console.log('[M3U8 Recorder] Using Fragmented MP4 format (streamable)');
      } else {
        // 默认 MP4 格式
        command = command
          .outputOptions([
            '-movflags',
            '+faststart', // 优化 MP4 以便快速播放
          ])
          .format('mp4');
      }

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
