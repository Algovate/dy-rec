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
import { Logger } from './utils/logger.js';
import {
  DEFAULT_RECORDINGS_DIR,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_CONFIG_PATH,
  DEFAULT_DETECTION_MODE,
  DEFAULT_QUALITY,
  DEFAULT_FORMAT,
} from './constants.js';

const program = new Command();

program
  .name('dy-rec')
  .description('Record/download Douyin live streams with advanced features')
  .version('2.0.0')
  .option('-v, --verbose', 'Show detailed debug information');

// Helper to init logger
const initLogger = () => {
  const options = program.opts();
  Logger.setVerbose(!!options.verbose);
};

// Record Command (Default)
program
  .command('record', { isDefault: true })
  .alias('r')
  .description('Record a single live room (Default command)')
  .argument('<roomId>', 'Douyin live room ID or URL')
  // Options
  .option('-o, --output <dir>', 'Output directory', DEFAULT_RECORDINGS_DIR)
  .option('-m, --mode <mode>', 'Detection mode: api, browser, or hybrid', DEFAULT_DETECTION_MODE)
  .option('-q, --quality <quality>', 'Video quality: origin, uhd, hd, sd, ld', DEFAULT_QUALITY)
  .option('--format <format>', 'Output format: mp4, ts, fmp4', DEFAULT_FORMAT)
  .option('--video-only', 'Record video only')
  .option('--audio-only', 'Record audio only')
  .option('-d, --duration <seconds>', 'Recording duration in seconds', parseInt)
  .option('--segment', 'Enable segment recording')
  .option('--segment-duration <seconds>', 'Segment duration in seconds', parseInt)
  .option('--cookies <cookies>', 'Douyin cookies for API mode')
  .action(async (roomId: string, options: Omit<RecordOptions, 'room'>) => {
    try {
      initLogger();
      await recordSingleRoom({ ...options, room: roomId });
    } catch (error: unknown) {
      Logger.error(`\n[Error] ${getErrorMessage(error)}`);
      process.exit(1);
    }
  });

// Watch Command (Monitor Mode)
program
  .command('watch')
  .alias('w')
  .alias('monitor')
  .description('Watch rooms defined in config (auto-record when live)')
  .option('-c, --config <path>', 'Configuration file path', DEFAULT_CONFIG_PATH) // Changed -f to -c for consistency
  .option('-i, --interval <seconds>', 'Check interval in seconds', parseInt)
  .action(async (options: WatchOptions & { config?: string }) => {
    try {
      initLogger();
      // Compatibility: map config to file if needed or ensure handler uses correct property
      const handlerOptions = { ...options, file: options.config || DEFAULT_CONFIG_PATH };
      await watchRooms(handlerOptions);
    } catch (error: unknown) {
      Logger.error(`\n[Error] ${getErrorMessage(error)}`);
      process.exit(1);
    }
  });

// Batch Command (One-off Config Run)
program
  .command('batch')
  .alias('b')
  .description('One-time check and record for rooms in config')
  .option('-c, --config <path>', 'Configuration file path', DEFAULT_CONFIG_PATH)
  .action(async (options: ConfigOptions & { config?: string }) => {
    try {
      initLogger();
      const handlerOptions = { ...options, file: options.config || DEFAULT_CONFIG_PATH };
      await recordWithConfig(handlerOptions);
    } catch (error: unknown) {
      Logger.error(`\n[Error] ${getErrorMessage(error)}`);
      process.exit(1);
    }
  });

// Download Command
program
  .command('download')
  .alias('d')
  .alias('get')
  .description('Download a Douyin video (short video/VOD)')
  .argument('<url>', 'Douyin video URL (short link or full URL)')
  .option('-o, --output <file>', 'Output filename')
  .option('--outdir <dir>', 'Output directory', DEFAULT_OUTPUT_DIR)
  .option('--timeout <seconds>', 'Timeout in seconds', parseInt)
  .option('--headful', 'Show browser window (for debugging)')
  .action(async (url: string, options: Omit<DownloadOptions, 'url'>) => {
    try {
      initLogger();
      await downloadVideo({ ...options, url });
    } catch (error: unknown) {
      Logger.error(`\n[Error] ${getErrorMessage(error)}`);
      process.exit(1);
    }
  });

// Handle unhandled errors
process.on('unhandledRejection', (error: unknown) => {
  console.error(chalk.red('\n[Unhandled Error]'), getErrorMessage(error));
  process.exit(1);
});

program.parse();
