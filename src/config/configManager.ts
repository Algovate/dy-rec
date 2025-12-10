import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_DETECTION_MODE,
  DEFAULT_QUALITY,
  DEFAULT_RECORDINGS_DIR,
  DEFAULT_FORMAT,
  DEFAULT_SEGMENT_DURATION,
  DEFAULT_WATCH_INTERVAL,
  DEFAULT_RECONNECT_MAX_RETRIES,
  DEFAULT_RECONNECT_RETRY_DELAY,
  VALID_DETECTION_MODES,
  VALID_QUALITIES,
} from '../constants.js';

import { ConfigurationError } from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type DetectionMode = 'api' | 'browser' | 'hybrid';
export type VideoQuality = 'origin' | 'uhd' | 'hd' | 'sd' | 'ld';

export interface AppConfig {
  mode: DetectionMode;
  output: {
    dir: string;
    format: string;
    segmentDuration: number;
    segmentEnabled: boolean;
  };
  recording: {
    quality: VideoQuality;
    reconnect: boolean;
    maxRetries: number;
    retryDelay: number;
  };
  watch: {
    enabled: boolean;
    interval: number;
    autoStart: boolean;
  };
  rooms: RoomConfig[];
  api: {
    cookies: string;
    proxy: any;
  };
  browser: {
    headless: boolean;
  };
}

export interface RoomConfig {
  url: string;
  quality?: VideoQuality;
  enabled?: boolean;
}

/**
 * 配置管理器
 * 负责读取、验证和管理配置文件
 */
export class ConfigManager {
  private configPath: string;
  private config: AppConfig | null = null;
  private watchers: NodeJS.Timeout[] = [];
  private lastMtime?: number;

  constructor(configPath?: string | null) {
    // 默认配置文件路径
    if (!configPath) {
      const projectRoot = path.resolve(__dirname, '../..');
      configPath = path.join(projectRoot, DEFAULT_CONFIG_PATH);
    }
    this.configPath = configPath;
  }

  /**
   * 加载配置文件
   */
  async loadConfig(): Promise<AppConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content) as AppConfig;
      this.validateConfig(this.config);
      return this.config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 配置文件不存在，创建默认配置
        await this.createDefaultConfig();
        return await this.loadConfig();
      }
      throw new ConfigurationError(`加载配置文件失败: ${error.message}`, error);
    }
  }

  /**
   * 创建默认配置文件
   */
  private async createDefaultConfig(): Promise<void> {
    const defaultConfig: AppConfig = {
      mode: DEFAULT_DETECTION_MODE,
      output: {
        dir: DEFAULT_RECORDINGS_DIR,

        format: DEFAULT_FORMAT,
        segmentDuration: DEFAULT_SEGMENT_DURATION,
        segmentEnabled: false,
      },
      recording: {
        quality: DEFAULT_QUALITY,
        reconnect: true,
        maxRetries: DEFAULT_RECONNECT_MAX_RETRIES,
        retryDelay: DEFAULT_RECONNECT_RETRY_DELAY,
      },
      watch: {
        enabled: false,
        interval: DEFAULT_WATCH_INTERVAL,
        autoStart: true,
      },
      rooms: [],
      api: {
        cookies: '',
        proxy: null,
      },
      browser: {
        headless: true,
      },
    };

    // 确保配置目录存在
    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });

    // 写入默认配置
    await fs.writeFile(this.configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  }

  /**
   * 验证配置格式
   */
  private validateConfig(config: any): asserts config is AppConfig {
    const required = ['mode', 'output', 'recording', 'rooms'];
    for (const key of required) {
      if (!(key in config)) {
        throw new Error(`配置文件缺少必需字段: ${key}`);
      }
    }

    // 验证 mode
    if (!VALID_DETECTION_MODES.includes(config.mode as (typeof VALID_DETECTION_MODES)[number])) {
      throw new ConfigurationError(
        `无效的 mode: ${config.mode}，必须是 ${VALID_DETECTION_MODES.join('、')}`
      );
    }

    // 验证 quality
    if (config.recording.quality) {
      if (!VALID_QUALITIES.includes(config.recording.quality as (typeof VALID_QUALITIES)[number])) {
        throw new ConfigurationError(
          `无效的 quality: ${config.recording.quality}，必须是 ${VALID_QUALITIES.join('、')}`
        );
      }
    }
  }

  /**
   * 保存配置
   */
  async saveConfig(config?: AppConfig): Promise<void> {
    const configToSave = config || this.config;
    if (!configToSave) {
      throw new Error('没有可保存的配置');
    }

    this.validateConfig(configToSave);
    await fs.writeFile(this.configPath, JSON.stringify(configToSave, null, 2), 'utf-8');
    this.config = configToSave;
  }

  /**
   * 获取配置
   */
  getConfig(): AppConfig {
    if (!this.config) {
      throw new Error('配置未加载，请先调用 loadConfig()');
    }
    return this.config;
  }

  /**
   * 获取房间列表
   */
  getRooms(): RoomConfig[] {
    const config = this.getConfig();
    return config.rooms.filter((room) => room.enabled !== false);
  }

  /**
   * 添加房间
   */
  async addRoom(roomConfig: RoomConfig): Promise<void> {
    const config = this.getConfig();
    config.rooms.push({
      url: roomConfig.url,
      quality: roomConfig.quality || config.recording.quality,
      enabled: roomConfig.enabled !== false,
    });
    await this.saveConfig();
  }

  /**
   * 移除房间
   */
  async removeRoom(url: string): Promise<void> {
    const config = this.getConfig();
    config.rooms = config.rooms.filter((room) => room.url !== url);
    await this.saveConfig();
  }

  /**
   * 启用/禁用房间
   */
  async toggleRoom(url: string, enabled: boolean): Promise<void> {
    const config = this.getConfig();
    const room = config.rooms.find((r) => r.url === url);
    if (room) {
      room.enabled = enabled;
      await this.saveConfig();
    }
  }

  /**
   * 监听配置文件变化（热重载）
   */
  watchConfig(callback: (config: AppConfig) => void): () => void {
    // 注意：Node.js 的 fs.watch 在不同平台行为可能不同
    // 这里使用简单的轮询方式
    const interval = setInterval(() => {
      void (async () => {
        try {
          const stats = await fs.stat(this.configPath);
          const mtime = stats.mtimeMs;

          if (!this.lastMtime) {
            this.lastMtime = mtime;
            return;
          }

          if (mtime > this.lastMtime) {
            this.lastMtime = mtime;
            const newConfig = await this.loadConfig();
            callback(newConfig);
          }
        } catch {
          // 忽略错误，继续监听
        }
      })();
    }, 2000); // 每 2 秒检查一次

    this.watchers.push(interval);
    return () => {
      clearInterval(interval);
      this.watchers = this.watchers.filter((w) => w !== interval);
    };
  }

  /**
   * 停止所有监听器
   */
  stopWatching(): void {
    this.watchers.forEach(clearInterval);
    this.watchers = [];
  }
}
