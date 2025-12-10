#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { ConfigManager } from './config/configManager.js';
import { StreamDetector, DetectionMode } from './core/streamDetector.js';
import { TaskManager } from './core/taskManager.js';
import { RoomWatcher } from './monitor/roomWatcher.js';
import { FlvRecorder } from './recorders/flvRecorder.js';
import { M3u8Recorder } from './recorders/m3u8Recorder.js';
import { SegmentRecorder } from './recorders/segmentRecorder.js';
import { VideoQuality } from './api/douyinApi.js';
import { getTimestamp } from './utils.js';
import { VideoDownloader } from './download/videoDownloader.js';

const program = new Command();

program
  .name('douyin-recorder')
  .description('Record/download Douyin live streams with advanced features')
  .version('2.0.0');

interface RecordOptions {
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

export type OutputFormat = 'mp4' | 'ts' | 'fmp4';

interface ConfigOptions {
  file?: string;
  watch?: boolean;
}

interface WatchOptions {
  file?: string;
  interval?: number;
}

interface DownloadOptions {
  url: string;
  output?: string;
  outdir?: string;
  timeout?: number;
  headless?: boolean;
}

// 单房间录制命令（向后兼容）
program
  .command('record')
  .alias('r')
  .description('Record a single live room')
  .option('-r, --room <roomId>', 'Douyin live room ID or URL')
  .option('-o, --output <dir>', 'Output directory', './downloads')
  .option('-m, --mode <mode>', 'Detection mode: api, browser, or hybrid', 'hybrid')
  .option('-q, --quality <quality>', 'Video quality: origin, uhd, hd, sd, ld', 'origin')
  .option('--format <format>', 'Output format: mp4, ts, fmp4 (default: fmp4)', 'fmp4')
  .option('--video-only', 'Record video only')
  .option('--audio-only', 'Record audio only')
  .option('-d, --duration <seconds>', 'Recording duration in seconds', parseInt)
  .option('--segment', 'Enable segment recording')
  .option('--segment-duration <seconds>', 'Segment duration in seconds', parseInt)
  .option('--cookies <cookies>', 'Douyin cookies for API mode')
  .action(async (options: RecordOptions) => {
    try {
      await recordSingleRoom(options);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('\n[Error]'), message);
      process.exit(1);
    }
  });

// 配置文件模式
program
  .command('config')
  .alias('c')
  .description('Record using configuration file')
  .option('-f, --file <path>', 'Configuration file path', 'config/config.json')
  .option('--watch', 'Enable watch mode (auto-detect live status)')
  .action(async (options: ConfigOptions) => {
    try {
      await recordWithConfig(options);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('\n[Error]'), message);
      process.exit(1);
    }
  });

// 监听模式
program
  .command('watch')
  .alias('w')
  .description('Watch rooms and auto-record when live')
  .option('-f, --file <path>', 'Configuration file path', 'config/config.json')
  .option('-i, --interval <seconds>', 'Check interval in seconds', parseInt)
  .action(async (options: WatchOptions) => {
    try {
      await watchRooms(options);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('\n[Error]'), message);
      process.exit(1);
    }
  });

// 短视频下载命令
program
  .command('download')
  .alias('d')
  .description('Download a Douyin video (short video, not live)')
  .requiredOption('-u, --url <url>', 'Douyin video URL (short link or full URL)')
  .option('-o, --output <file>', 'Output filename')
  .option('--outdir <dir>', 'Output directory', './recordings')
  .option('--timeout <seconds>', 'Timeout in seconds', parseInt)
  .option('--headful', 'Show browser window (for debugging)')
  .action(async (options: DownloadOptions) => {
    try {
      await downloadVideo(options);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('\n[Error]'), message);
      process.exit(1);
    }
  });

/**
 * 单房间录制
 */
async function recordSingleRoom(options: RecordOptions): Promise<void> {
  const {
    room,
    output,
    mode,
    quality,
    format = 'mp4',
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

  // 验证格式参数
  const validFormats = ['mp4', 'ts', 'fmp4'];
  if (!validFormats.includes(format)) {
    throw new Error(`Invalid format: ${format}. Valid formats: ${validFormats.join(', ')}`);
  }

  console.log(chalk.blue('\n=== Douyin Live Recorder ===\n'));
  console.log(chalk.cyan(`Room: ${room}`));
  console.log(chalk.cyan(`Mode: ${mode}`));
  console.log(chalk.cyan(`Quality: ${quality}`));
  console.log(chalk.cyan(`Format: ${format}`));
  console.log(chalk.cyan(`Output: ${output}\n`));

  // 检测流
  const detector = new StreamDetector({
    mode: mode as DetectionMode,
    quality: quality as VideoQuality,
    cookies,
  });

  console.log(chalk.yellow('[1/3] Detecting stream...'));
  const streamInfo = await detector.detectStream(room);
  await detector.cleanup();

  console.log(chalk.green(`[Stream] Found: ${streamInfo.recordUrl}`));
  console.log(chalk.green(`[Stream] Anchor: ${streamInfo.anchorName || 'Unknown'}`));
  console.log(chalk.green(`[Stream] Title: ${streamInfo.title || 'Unknown'}\n`));

  // 选择录制器
  let recorder: FlvRecorder | M3u8Recorder | SegmentRecorder;
  const outputFormat = format as OutputFormat;

  if (segment) {
    recorder = new SegmentRecorder({
      outputDir: output || './downloads',
      segmentDuration: segmentDuration || 3600,
    });
  } else if (streamInfo.hlsUrl) {
    recorder = new M3u8Recorder({ outputDir: output || './downloads' });
  } else {
    recorder = new FlvRecorder({ outputDir: output || './downloads' });
  }

  await recorder.init();

  // 生成文件名
  const timestamp = getTimestamp();
  const anchorName = (streamInfo.anchorName || 'unknown').replace(/[^\w\s-]/g, '').trim();
  // 根据格式和音频选项确定文件扩展名
  let fileExt: string;
  if (outputFormat === 'ts') {
    fileExt = 'ts';
  } else if (audioOnly) {
    fileExt = 'm4a';
  } else {
    fileExt = 'mp4'; // mp4 和 fmp4 都使用 .mp4 扩展名
  }
  const filename = `douyin_${streamInfo.roomId}_${anchorName}_${timestamp}.${fileExt}`;

  console.log(chalk.yellow('[2/3] Starting recording...'));
  console.log(chalk.cyan(`Output: ${filename}\n`));
  console.log(chalk.gray('Press Ctrl+C to stop recording\n'));

  // 处理中断
  const handleInterrupt = async () => {
    console.log(chalk.yellow('\n\n[Interrupt] Stopping recording...'));
    await recorder.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void handleInterrupt();
  });
  process.on('SIGTERM', () => {
    void handleInterrupt();
  });

  // 开始录制
  if (recorder instanceof SegmentRecorder) {
    await recorder.record(streamInfo.recordUrl, filename.replace(/\.\w+$/, ''), {
      videoOnly,
      audioOnly,
    });
  } else {
    await (recorder as FlvRecorder | M3u8Recorder).record(streamInfo.recordUrl, filename, {
      videoOnly,
      audioOnly,
      duration,
      format: outputFormat,
    });
  }

  console.log(chalk.green(`\n\n✓ Recording completed!`));
  console.log(chalk.green(`  Output: ${filename}\n`));
}

/**
 * 使用配置文件录制
 */
async function recordWithConfig(options: ConfigOptions): Promise<void> {
  const { file, watch } = options;

  console.log(chalk.blue('\n=== Douyin Live Recorder (Config Mode) ===\n'));

  // 加载配置
  const configManager = new ConfigManager(file);
  const config = await configManager.loadConfig();
  const rooms = configManager.getRooms();

  if (rooms.length === 0) {
    throw new Error('No enabled rooms found in configuration');
  }

  console.log(chalk.cyan(`Loaded ${rooms.length} room(s) from config\n`));

  // 如果启用监听模式
  if (watch || config.watch?.enabled) {
    await watchRooms({ file, interval: config.watch?.interval });
    return;
  }

  // 创建任务管理器
  const taskManager = new TaskManager({
    maxConcurrent: 5,
  });

  // 添加所有房间的录制任务
  for (const room of rooms) {
    const roomId = /^\d+$/.test(room.url)
      ? room.url
      : room.url.match(/live\.douyin\.com\/(\d+)/)?.[1] || room.url;

    if (!roomId) {
      console.error(chalk.red(`Invalid room URL: ${room.url}`));
      continue;
    }

    await taskManager.addTask(roomId, config, {
      duration: null,
      audioOnly: false,
    });
  }

  // 处理中断
  const handleInterrupt = async () => {
    console.log(chalk.yellow('\n\n[Interrupt] Stopping all recordings...'));
    await taskManager.stopAll();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void handleInterrupt();
  });
  process.on('SIGTERM', () => {
    void handleInterrupt();
  });

  // 定期显示状态
  setInterval(() => {
    const statuses = taskManager.getAllStatus();
    if (statuses.length > 0) {
      console.log(chalk.cyan(`\n[Status] Active tasks: ${statuses.length}`));
      for (const status of statuses) {
        console.log(chalk.gray(`  - ${status.roomId}: ${status.status} (${status.elapsed}s)`));
      }
    }
  }, 10000);

  // 等待所有任务完成（实际上会一直运行直到中断）
  await new Promise(() => {});
}

/**
 * 监听模式
 */
async function watchRooms(options: WatchOptions): Promise<void> {
  const { file, interval } = options;

  console.log(chalk.blue('\n=== Douyin Live Recorder (Watch Mode) ===\n'));

  // 加载配置
  const configManager = new ConfigManager(file);
  const config = await configManager.loadConfig();
  const rooms = configManager.getRooms();

  if (rooms.length === 0) {
    throw new Error('No enabled rooms found in configuration');
  }

  console.log(chalk.cyan(`Watching ${rooms.length} room(s)\n`));

  // 创建任务管理器
  const taskManager = new TaskManager({
    maxConcurrent: 5,
  });

  // 提取房间 ID
  const roomIds = rooms
    .map((room) => {
      const roomId = /^\d+$/.test(room.url)
        ? room.url
        : room.url.match(/live\.douyin\.com\/(\d+)/)?.[1];
      return roomId;
    })
    .filter((id): id is string => Boolean(id));

  // 创建监听器
  const watcher = new RoomWatcher({
    interval: (interval || config.watch?.interval || 60) * 1000,
    autoStart: config.watch?.autoStart !== false,
    cookies: config.api?.cookies,
    proxy: config.api?.proxy,
    onLiveStart: async (roomId, roomInfo) => {
      console.log(chalk.green(`\n[Live Start] Room ${roomId}: ${roomInfo.anchorName}`));
      console.log(chalk.green(`  Title: ${roomInfo.title}`));

      // 开始录制
      const room = rooms.find((r) => r.url.includes(roomId));
      if (room && !taskManager.hasTask(roomId)) {
        await taskManager.addTask(roomId, config, {
          duration: null,
          audioOnly: false,
        });
      }
    },
    onLiveEnd: async (roomId, recordingInfo) => {
      console.log(chalk.yellow(`\n[Live End] Room ${roomId}`));
      console.log(
        chalk.yellow(`  Recorded for ${Math.floor((recordingInfo.duration || 0) / 60)} minutes`)
      );

      // 停止录制
      if (taskManager.hasTask(roomId)) {
        await taskManager.stopTask(roomId);
      }
    },
  });

  // 开始监听
  await watcher.watch(roomIds);

  // 处理中断
  const handleInterrupt = async () => {
    console.log(chalk.yellow('\n\n[Interrupt] Stopping...'));
    watcher.stop();
    await taskManager.stopAll();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void handleInterrupt();
  });
  process.on('SIGTERM', () => {
    void handleInterrupt();
  });

  // 等待（实际上会一直运行直到中断）
  await new Promise(() => {});
}

/**
 * 下载短视频
 */
async function downloadVideo(options: DownloadOptions): Promise<void> {
  const { url, output, outdir, timeout, headless } = options;

  console.log(chalk.blue('\n=== Douyin Video Downloader ===\n'));
  console.log(chalk.cyan(`URL: ${url}`));
  console.log(chalk.cyan(`Output directory: ${outdir}\n`));

  const downloader = new VideoDownloader({
    headless: headless !== false, // 默认无头模式，--headful 时显示浏览器
    timeout: timeout ? timeout * 1000 : 30000,
  });

  // 确定输出路径
  let outputPath: string;
  if (output) {
    // 如果指定了完整输出文件名
    outputPath = output.includes(path.sep) ? output : path.join(outdir || './recordings', output);
  } else {
    // 临时路径，下载后会根据视频 ID 重命名
    const timestamp = getTimestamp();
    outputPath = path.join(outdir || './recordings', `douyin_video_${timestamp}.mp4`);
  }

  const result = await downloader.download(url, outputPath);

  if (result.success) {
    // 如果没有指定输出文件名，根据视频 ID 重命名
    if (!output && result.videoId !== 'unknown') {
      const newPath = path.join(path.dirname(outputPath), `${result.videoId}.mp4`);
      try {
        const fs = await import('node:fs/promises');
        await fs.rename(outputPath, newPath);
        console.log(chalk.green(`\n✓ 下载完成: ${newPath}`));
      } catch {
        console.log(chalk.green(`\n✓ 下载完成: ${outputPath}`));
      }
    } else {
      console.log(chalk.green(`\n✓ 下载完成: ${outputPath}`));
    }
  } else {
    console.error(chalk.red(`\n✗ 下载失败: ${result.error}`));
    process.exit(1);
  }
}

// 处理未捕获的错误
process.on('unhandledRejection', (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red('\n[Unhandled Error]'), message);
  process.exit(1);
});

// 运行 CLI
program.parse();
