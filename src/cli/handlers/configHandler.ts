import chalk from 'chalk';
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
    const roomId = extractRoomId(room.url);

    await taskManager.addTask(roomId, config, {
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

  // Periodically show status
  setInterval(() => {
    const statuses = taskManager.getAllStatus();
    if (statuses.length > 0) {
      console.log(chalk.cyan(`\n[Status] Active tasks: ${statuses.length}`));
      for (const status of statuses) {
        console.log(chalk.gray(`  - ${status.roomId}: ${status.status} (${status.elapsed}s)`));
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
