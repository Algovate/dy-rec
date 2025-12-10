#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { recordSingleRoom, RecordOptions } from './cli/handlers/recordHandler.js';
import {
  recordWithConfig,
  watchRooms,
  ConfigOptions,
  WatchOptions,
} from './cli/handlers/configHandler.js';
import { downloadVideo, DownloadOptions } from './cli/handlers/downloadHandler.js';
import { getErrorMessage } from './utils/errors.js';

const program = new Command();

program
  .name('dy-rec')
  .description('Record/download Douyin live streams with advanced features')
  .version('2.0.0');

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
      console.error(chalk.red('\n[Error]'), getErrorMessage(error));
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
      console.error(chalk.red('\n[Error]'), getErrorMessage(error));
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
      console.error(chalk.red('\n[Error]'), getErrorMessage(error));
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
      console.error(chalk.red('\n[Error]'), getErrorMessage(error));
      process.exit(1);
    }
  });

// Handle unhandled errors
process.on('unhandledRejection', (error: unknown) => {
  console.error(chalk.red('\n[Unhandled Error]'), getErrorMessage(error));
  process.exit(1);
});

// 运行 CLI
program.parse();
