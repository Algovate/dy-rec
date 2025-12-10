import pLimit from 'p-limit';
import chalk from 'chalk';
import { StreamDetector, DetectedStreamInfo } from './streamDetector.js';
import { FlvRecorder } from './flvRecorder.js';
import { M3u8Recorder } from './recorders/m3u8Recorder.js';
import { SegmentRecorder } from './recorders/segmentRecorder.js';
import { RecordingMonitor, AutoReconnectRecorder } from './monitor/recordingMonitor.js';
import { AppConfig } from './config/configManager.js';

type TaskStatus = 'pending' | 'running' | 'stopped' | 'error';

interface TaskOptions {
  duration?: number | null;
  audioOnly?: boolean;
  videoOnly?: boolean;
}

interface TaskStatusInfo {
  roomId: string;
  status: TaskStatus;
  startTime: number | null;
  elapsed: number;
  streamInfo: DetectedStreamInfo | null;
  error?: string;
  recorderStatus?: any;
}

/**
 * 录制任务
 */
class RecordingTask {
  private roomId: string;
  private config: AppConfig;
  private options: TaskOptions;
  private status: TaskStatus = 'pending';
  private recorder: FlvRecorder | M3u8Recorder | SegmentRecorder | AutoReconnectRecorder | null =
    null;
  private monitor: RecordingMonitor | null = null;
  private streamInfo: DetectedStreamInfo | null = null;
  private startTime: number | null = null;
  private error: Error | null = null;

  constructor(roomId: string, config: AppConfig, options: TaskOptions = {}) {
    this.roomId = roomId;
    this.config = config;
    this.options = options;
  }

  async start(): Promise<void> {
    try {
      this.status = 'running';
      this.startTime = Date.now();

      // 检测流
      const detector = new StreamDetector({
        mode: this.config.mode || 'hybrid',
        quality: this.config.recording?.quality || 'origin',
        cookies: this.config.api?.cookies,
        proxy: this.config.api?.proxy,
      });

      this.streamInfo = await detector.detectStream(this.roomId);
      await detector.cleanup();

      // 选择录制器（需要 streamInfo）
      const recorder = this.createRecorder();

      // 创建监控器（仅对 FlvRecorder 和 M3u8Recorder 支持）
      if (this.config.recording?.reconnect && !(recorder instanceof SegmentRecorder)) {
        this.monitor = new RecordingMonitor({
          maxRetries: this.config.recording.maxRetries || 3,
          retryDelay: this.config.recording.retryDelay || 5000,
        });

        this.recorder = new AutoReconnectRecorder(
          recorder as FlvRecorder | M3u8Recorder,
          this.monitor,
          this.streamInfo.recordUrl,
          this.getOutputFilename(),
          this.getRecordingOptions()
        );
      } else {
        this.recorder = recorder;
      }

      // 开始录制
      if (this.recorder instanceof AutoReconnectRecorder) {
        await this.recorder.start();
      } else {
        await (this.recorder as FlvRecorder | M3u8Recorder | SegmentRecorder).init();
        if (this.recorder instanceof SegmentRecorder) {
          await this.recorder.record(
            this.streamInfo.recordUrl,
            this.getOutputFilename().replace(/\.\w+$/, ''),
            this.getRecordingOptions()
          );
        } else {
          await (this.recorder as FlvRecorder | M3u8Recorder).record(
            this.streamInfo.recordUrl,
            this.getOutputFilename(),
            this.getRecordingOptions()
          );
        }
      }

      this.status = 'stopped';
    } catch (error: any) {
      this.status = 'error';
      this.error = error;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.recorder) {
      await this.recorder.stop();
    }
    if (this.monitor) {
      this.monitor.stop();
    }
    this.status = 'stopped';
  }

  private createRecorder(): FlvRecorder | M3u8Recorder | SegmentRecorder {
    const outputDir = this.config.output?.dir || './downloads';
    const format = this.config.output?.format || 'mp4';
    const segmentEnabled = this.config.output?.segmentEnabled || false;

    if (segmentEnabled) {
      return new SegmentRecorder({
        outputDir,
        segmentDuration: this.config.output.segmentDuration || 3600,
        segmentFormat: format,
      });
    }

    // 根据流类型选择录制器
    // 注意：此时 streamInfo 已经设置
    if (this.streamInfo?.hlsUrl) {
      return new M3u8Recorder({ outputDir });
    } else {
      return new FlvRecorder({ outputDir });
    }
  }

  private getOutputFilename(): string {
    const rawFormat = this.config.output?.format || 'mp4';
    // fmp4 使用 mp4 扩展名
    const ext = rawFormat === 'fmp4' ? 'mp4' : rawFormat;
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '-');
    const anchorName = this.streamInfo?.anchorName || 'unknown';
    const safeAnchorName = anchorName.replace(/[^\w\s-]/g, '').trim();
    return `douyin_${this.roomId}_${safeAnchorName}_${timestamp}.${ext}`;
  }

  private getRecordingOptions(): any {
    return {
      duration: this.options.duration || null,
      audioOnly: this.options.audioOnly || false,
      videoOnly: this.options.videoOnly || false,
      format: this.config.output?.format || 'mp4',
    };
  }

  getStatus(): TaskStatusInfo {
    return {
      roomId: this.roomId,
      status: this.status,
      startTime: this.startTime,
      elapsed: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      streamInfo: this.streamInfo,
      error: this.error?.message,
      recorderStatus:
        this.recorder instanceof AutoReconnectRecorder
          ? this.recorder.getStatus()
          : (this.recorder as FlvRecorder | M3u8Recorder | SegmentRecorder)?.getStatus(),
    };
  }
}

/**
 * 任务管理器
 * 管理多个录制任务的并发执行
 */
export class TaskManager {
  private maxConcurrent: number;
  private limit: ReturnType<typeof pLimit>;
  private tasks: Map<string, RecordingTask> = new Map();

  constructor(options: { maxConcurrent?: number } = {}) {
    this.maxConcurrent = options.maxConcurrent || 5;
    this.limit = pLimit(this.maxConcurrent);
  }

  /**
   * 添加录制任务
   * @param roomId - 房间 ID
   * @param config - 配置
   * @param options - 选项
   * @returns Promise<void>
   */
  async addTask(
    roomId: string,
    config: AppConfig,
    options: TaskOptions = {}
  ): Promise<RecordingTask> {
    if (this.tasks.has(roomId)) {
      throw new Error(`房间 ${roomId} 已经在录制中`);
    }

    const task = new RecordingTask(roomId, config, options);
    this.tasks.set(roomId, task);

    console.log(chalk.blue(`[Task Manager] 添加录制任务: ${roomId}`));

    // 使用并发限制执行任务
    void this.limit(async () => {
      try {
        await task.start();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`[Task Manager] 任务 ${roomId} 失败: ${message}`));
      } finally {
        // 任务完成后从任务列表中移除
        this.tasks.delete(roomId);
      }
    });

    return task;
  }

  /**
   * 停止任务
   */
  async stopTask(roomId: string): Promise<void> {
    const task = this.tasks.get(roomId);
    if (task) {
      await task.stop();
      this.tasks.delete(roomId);
      console.log(chalk.yellow(`[Task Manager] 停止任务: ${roomId}`));
    }
  }

  /**
   * 停止所有任务
   */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.tasks.keys()).map((roomId) => this.stopTask(roomId));
    await Promise.all(promises);
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(roomId: string): TaskStatusInfo | null {
    const task = this.tasks.get(roomId);
    return task ? task.getStatus() : null;
  }

  /**
   * 获取所有任务状态
   */
  getAllStatus(): TaskStatusInfo[] {
    return Array.from(this.tasks.entries()).map(([_roomId, task]) => ({
      ...task.getStatus(),
    }));
  }

  /**
   * 检查任务是否存在
   */
  hasTask(roomId: string): boolean {
    return this.tasks.has(roomId);
  }

  /**
   * 获取任务数量
   */
  getTaskCount(): number {
    return this.tasks.size;
  }
}
