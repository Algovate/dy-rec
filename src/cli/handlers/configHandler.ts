import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager } from '../../config/configManager.js';
import { TaskManager } from '../../core/taskManager.js';
import { RoomWatcher } from '../../monitor/roomWatcher.js';
import { extractRoomId } from '../../utils/roomId.js';
import { DEFAULT_CONFIG_PATH, DEFAULT_MAX_CONCURRENT_TASKS } from '../../constants.js';

export interface ConfigOptions {
  file?: string;
  watch?: boolean;
}

export interface WatchOptions {
  file?: string;
  interval?: number;
}

/**
 * Record using configuration file
 */
export async function recordWithConfig(options: ConfigOptions): Promise<void> {
  const { file = DEFAULT_CONFIG_PATH, watch } = options;

  console.log(chalk.blue('\n=== Douyin Live Recorder (Config Mode) ===\n'));

  // Load config
  const configManager = new ConfigManager(file);
  const config = await configManager.loadConfig();
  const rooms = configManager.getRooms();

  if (rooms.length === 0) {
    throw new Error('No enabled rooms found in configuration');
  }

  console.log(chalk.cyan(`Loaded ${rooms.length} room(s) from config\n`));

  // If watch mode is enabled
  if (watch || config.watch?.enabled) {
    await watchRooms({ file, interval: config.watch?.interval });
    return;
  }

  // Create task manager
  const taskManager = new TaskManager({
    maxConcurrent: DEFAULT_MAX_CONCURRENT_TASKS,
  });

  // Add recording tasks for all rooms
  for (const room of rooms) {
    await taskManager.addTask(room.url, config, {
      duration: null,
      audioOnly: false,
    });
  }

  // Handle interrupt
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

  // Helper function to format seconds to HH:MM:SS
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  // Helper function to get file size from output directory
  const getFileSize = (outputDir: string, roomId: string): number => {
    try {
      // Try to find the most recent file for this room
      if (fs.existsSync(outputDir)) {
        const files = fs.readdirSync(outputDir);
        const roomFiles = files.filter((f) => f.startsWith(`douyin_${roomId}_`));
        if (roomFiles.length > 0) {
          // Sort by modification time (newest first)
          const sortedFiles = roomFiles.sort((a, b) => {
            const statA = fs.statSync(path.join(outputDir, a));
            const statB = fs.statSync(path.join(outputDir, b));
            return statB.mtimeMs - statA.mtimeMs;
          });
          const latestFile = sortedFiles[0];
          const filePath = path.join(outputDir, latestFile);
          const stats = fs.statSync(filePath);
          return stats.size;
        }
      }
    } catch {
      // Ignore errors
    }
    return 0;
  };

  // Periodically show status
  setInterval(() => {
    const statuses = taskManager.getAllStatus();
    if (statuses.length > 0) {
      console.log(chalk.cyan(`\n[Status] Active tasks: ${statuses.length}`));
      for (const status of statuses) {
        const outputDir = config.output?.dir || './output/recordings';
        const fileSize = getFileSize(outputDir, status.roomId);
        const duration = formatDuration(status.elapsed);
        const sizeStr = fileSize > 0 ? formatFileSize(fileSize) : '--';
        
        // Build status line
        let statusLine = `  - ${chalk.yellow(status.roomId)}: ${chalk.green(status.status)}`;
        
        // Add anchor name if available
        if (status.streamInfo?.anchorName) {
          statusLine += ` | ${chalk.cyan(status.streamInfo.anchorName)}`;
        }
        
        // Add duration and size
        statusLine += ` | ${chalk.blue(`Duration: ${duration}`)} | ${chalk.magenta(`Size: ${sizeStr}`)}`;
        
        // Add recorder duration if available
        if (status.recorderStatus?.duration && status.recorderStatus.duration !== '00:00:00') {
          statusLine += ` | ${chalk.gray(`FFmpeg: ${status.recorderStatus.duration}`)}`;
        }
        
        console.log(statusLine);
        
        // Show error if any
        if (status.error) {
          console.log(chalk.red(`    Error: ${status.error}`));
        }
      }
    }
  }, 10000);

  // Wait for all tasks to complete (actually runs until interrupted)
  await new Promise(() => {});
}

/**
 * Watch mode handler
 */
export async function watchRooms(options: WatchOptions): Promise<void> {
  const { file = DEFAULT_CONFIG_PATH, interval } = options;

  console.log(chalk.blue('\n=== Douyin Live Recorder (Watch Mode) ===\n'));

  // Load config
  const configManager = new ConfigManager(file);
  const config = await configManager.loadConfig();
  const rooms = configManager.getRooms();

  if (rooms.length === 0) {
    throw new Error('No enabled rooms found in configuration');
  }

  console.log(chalk.cyan(`Watching ${rooms.length} room(s)\n`));

  // Create task manager
  const taskManager = new TaskManager({
    maxConcurrent: DEFAULT_MAX_CONCURRENT_TASKS,
  });

  // Extract room IDs
  const roomIds = rooms
    .map((room) => {
      try {
        return extractRoomId(room.url);
      } catch {
        return null;
      }
    })
    .filter((id): id is string => Boolean(id));

  // Create watcher
  const watcher = new RoomWatcher({
    interval: (interval || config.watch?.interval || 60) * 1000,
    autoStart: config.watch?.autoStart !== false,
    cookies: config.api?.cookies,
    proxy: config.api?.proxy,
    onLiveStart: async (roomId, roomInfo) => {
      console.log(chalk.green(`\n[Live Start] Room ${roomId}: ${roomInfo.anchorName}`));
      console.log(chalk.green(`  Title: ${roomInfo.title}`));

      // Start recording
      const room = rooms.find((r) => extractRoomId(r.url) === roomId);
      if (room && !taskManager.hasTask(roomId)) {
        await taskManager.addTask(room.url, config, {
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

      // Stop recording
      if (taskManager.hasTask(roomId)) {
        await taskManager.stopTask(roomId);
      }
    },
  });

  // Start watching
  await watcher.watch(roomIds);

  // Handle interrupt
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

  // Wait (actually runs until interrupted)
  await new Promise(() => {});
}
