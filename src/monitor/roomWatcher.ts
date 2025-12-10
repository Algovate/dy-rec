import { DouyinApi, DouyinApiOptions, RoomInfo } from '../api/douyinApi.js';
import chalk from 'chalk';
import { ROOM_STATUS_LIVE, DEFAULT_WATCH_INTERVAL } from '../constants.js';

export interface RoomWatcherOptions {
  cookies?: string;
  proxy?: any;
  interval?: number;
  autoStart?: boolean;
  onLiveStart?: (roomId: string, roomInfo: RoomInfo) => Promise<void> | void;
  onLiveEnd?: (roomId: string, recordingInfo: RecordingInfo) => Promise<void> | void;
}

export interface RecordingInfo {
  startTime: number;
  anchorName: string;
  title: string;
  duration?: number;
}

export interface WatcherStatus {
  isWatching: boolean;
  interval: number;
  recordingRooms: Array<{
    roomId: string;
    startTime: number;
    anchorName: string;
    title: string;
    duration: number;
  }>;
}

/**
 * 直播间监控器
 * 定时检查直播状态，自动开始/停止录制
 */
export class RoomWatcher {
  private apiClient: DouyinApi;
  private interval: number;
  private autoStart: boolean;
  private onLiveStart?: (roomId: string, roomInfo: RoomInfo) => Promise<void> | void;
  private onLiveEnd?: (roomId: string, recordingInfo: RecordingInfo) => Promise<void> | void;
  private isWatching: boolean = false;
  private watchInterval: NodeJS.Timeout | null = null;
  private recordingRooms: Map<string, RecordingInfo> = new Map();

  constructor(options: RoomWatcherOptions = {}) {
    const apiOptions: DouyinApiOptions = {
      cookies: options.cookies,
      proxy: options.proxy,
    };
    this.apiClient = new DouyinApi(apiOptions);
    this.interval = options.interval || DEFAULT_WATCH_INTERVAL * 1000; // Convert seconds to milliseconds
    this.autoStart = options.autoStart !== false;
    this.onLiveStart = options.onLiveStart;
    this.onLiveEnd = options.onLiveEnd;
  }

  /**
   * 开始监控
   * @param roomIds - 房间 ID 或房间 ID 数组
   */
  async watch(roomIds: string | string[]): Promise<void> {
    if (this.isWatching) {
      console.log(chalk.yellow('[Room Watcher] 已经在监控中'));
      return;
    }

    const rooms = Array.isArray(roomIds) ? roomIds : [roomIds];
    this.isWatching = true;

    console.log(
      chalk.blue(
        `[Room Watcher] 开始监控 ${rooms.length} 个直播间，检查间隔: ${this.interval / 1000} 秒`
      )
    );

    // 立即检查一次
    await this.checkRooms(rooms);

    // 定时检查
    this.watchInterval = setInterval(() => {
      if (!this.isWatching) {
        if (this.watchInterval) {
          clearInterval(this.watchInterval);
        }
        return;
      }
      void this.checkRooms(rooms);
    }, this.interval);
  }

  /**
   * 检查房间状态
   */
  private async checkRooms(roomIds: string[]): Promise<void> {
    for (const roomId of roomIds) {
      try {
        await this.checkRoom(roomId);
      } catch (error: any) {
        console.error(chalk.red(`[Room Watcher] 检查房间 ${roomId} 失败: ${error.message}`));
      }
    }
  }

  /**
   * 检查单个房间
   */
  private async checkRoom(roomId: string): Promise<void> {
    try {
      const roomInfo = await this.apiClient.getRoomInfo(roomId);
      const isLive = roomInfo.status === ROOM_STATUS_LIVE;
      const isRecording = this.recordingRooms.has(roomId);

      if (isLive && !isRecording && this.autoStart) {
        // 开播了，开始录制
        console.log(chalk.green(`[Room Watcher] 房间 ${roomId} 开播了`));
        const recordingInfo: RecordingInfo = {
          startTime: Date.now(),
          anchorName: roomInfo.anchorName,
          title: roomInfo.title,
        };
        this.recordingRooms.set(roomId, recordingInfo);

        if (this.onLiveStart) {
          await this.onLiveStart(roomId, roomInfo);
        }
      } else if (!isLive && isRecording) {
        // 下播了，停止录制
        console.log(chalk.yellow(`[Room Watcher] 房间 ${roomId} 下播了`));
        const recordingInfo = this.recordingRooms.get(roomId);
        if (recordingInfo) {
          this.recordingRooms.delete(roomId);

          if (this.onLiveEnd) {
            await this.onLiveEnd(roomId, recordingInfo);
          }
        }
      }
    } catch (error: any) {
      // 如果检查失败，可能是网络问题或房间不存在
      // 不抛出错误，继续监控其他房间
      console.error(chalk.red(`[Room Watcher] 检查房间 ${roomId} 时出错: ${error.message}`));
    }
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (!this.isWatching) {
      return;
    }

    this.isWatching = false;
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    console.log(chalk.blue('[Room Watcher] 停止监控'));
  }

  /**
   * 获取监控状态
   */
  getStatus(): WatcherStatus {
    return {
      isWatching: this.isWatching,
      interval: this.interval,
      recordingRooms: Array.from(this.recordingRooms.entries()).map(([roomId, info]) => ({
        roomId,
        ...info,
        duration: Math.floor((Date.now() - info.startTime) / 1000),
      })),
    };
  }

  /**
   * 检查房间是否在录制
   */
  isRecording(roomId: string): boolean {
    return this.recordingRooms.has(roomId);
  }
}
