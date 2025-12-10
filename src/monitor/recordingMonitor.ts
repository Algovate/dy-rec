import chalk from 'chalk';
import { RecordingStatus } from '../recorders/flvRecorder.js';

export interface RecordingMonitorOptions {
  maxRetries?: number;
  retryDelay?: number;
  onReconnect?: (retryCount: number) => Promise<void> | void;
  onError?: (error: Error) => void;
}

export interface Recorder {
  getStatus(): RecordingStatus;
  record(streamUrl: string, outputPath: string, options: any): Promise<string | void>;
  stop(): Promise<void>;
}

export interface RecordingParams {
  streamUrl: string;
  outputPath: string;
  options: any;
}

/**
 * 录制监控器
 * 监控录制过程，检测错误并自动重连
 */
export class RecordingMonitor {
  private maxRetries: number;
  private retryDelay: number;
  private onReconnect?: (retryCount: number) => Promise<void> | void;
  private onError?: (error: Error) => void;
  private retryCount: number = 0;
  private isMonitoring: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(options: RecordingMonitorOptions = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000; // 毫秒
    this.onReconnect = options.onReconnect;
    this.onError = options.onError;
  }

  /**
   * 监控录制过程
   * @param recorder - 录制器实例（FlvRecorder 或 M3u8Recorder）
   * @param startRecording - 重新开始录制的函数
   * @param recordingParams - 录制参数
   */
  async monitor(
    recorder: Recorder,
    startRecording: (params: RecordingParams) => Promise<void>,
    recordingParams: RecordingParams
  ): Promise<void> {
    this.isMonitoring = true;
    this.retryCount = 0;

    // 监听录制器的错误事件
    // 注意：这里我们需要在录制器内部添加错误监听
    // 暂时通过轮询检查状态
    this.monitorInterval = setInterval(() => {
      if (!this.isMonitoring) {
        if (this.monitorInterval) {
          clearInterval(this.monitorInterval);
        }
        return;
      }

      const status = recorder.getStatus();
      if (!status.isRecording && this.retryCount < this.maxRetries) {
        // 录制意外停止，尝试重连
        void this.handleReconnect(recorder, startRecording, recordingParams);
      }
    }, 5000); // 每 5 秒检查一次
  }

  /**
   * 处理重连
   */
  private async handleReconnect(
    _recorder: Recorder,
    startRecording: (params: RecordingParams) => Promise<void>,
    recordingParams: RecordingParams
  ): Promise<void> {
    this.retryCount++;

    console.log(
      chalk.yellow(
        `[Recording Monitor] 检测到录制中断，尝试重连 (${this.retryCount}/${this.maxRetries})...`
      )
    );

    // 等待一段时间后重试
    await this.sleep(this.retryDelay * this.retryCount); // 指数退避

    try {
      if (this.onReconnect) {
        await this.onReconnect(this.retryCount);
      }

      // 重新开始录制
      await startRecording(recordingParams);

      console.log(chalk.green('[Recording Monitor] 重连成功'));
      this.retryCount = 0; // 重置重试计数
    } catch (error: any) {
      console.error(chalk.red(`[Recording Monitor] 重连失败: ${error.message}`));

      if (this.retryCount >= this.maxRetries) {
        console.error(chalk.red(`[Recording Monitor] 达到最大重试次数，停止重连`));
        this.stop();

        if (this.onError) {
          this.onError(new Error('达到最大重试次数'));
        }
      }
    }
  }

  /**
   * 停止监控
   */
  stop(): void {
    this.isMonitoring = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * 重置重试计数
   */
  reset(): void {
    this.retryCount = 0;
  }

  /**
   * 工具函数：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 增强的录制器包装器
 * 为录制器添加自动重连功能
 */
export class AutoReconnectRecorder {
  private recorder: Recorder;
  private monitor: RecordingMonitor;
  private streamUrl: string;
  private outputPath: string;
  private options: any;
  private isRecording: boolean = false;

  constructor(
    recorder: Recorder,
    monitor: RecordingMonitor,
    streamUrl: string,
    outputPath: string,
    options: any = {}
  ) {
    this.recorder = recorder;
    this.monitor = monitor;
    this.streamUrl = streamUrl;
    this.outputPath = outputPath;
    this.options = options;
  }

  /**
   * 开始录制（带自动重连）
   */
  async start(): Promise<void> {
    this.isRecording = true;

    // 启动监控
    void this.monitor.monitor(this.recorder, () => this.restart(), {
      streamUrl: this.streamUrl,
      outputPath: this.outputPath,
      options: this.options,
    });

    // 开始录制
    await this.recorder.record(this.streamUrl, this.outputPath, this.options);
  }

  /**
   * 重新开始录制
   */
  async restart(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    console.log(chalk.blue('[Auto Reconnect] 重新开始录制...'));

    // 停止当前录制
    try {
      await this.recorder.stop();
    } catch {
      // 忽略停止错误
    }

    // 等待一小段时间
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 重新开始录制
    await this.recorder.record(this.streamUrl, this.outputPath, this.options);
  }

  /**
   * 停止录制
   */
  async stop(): Promise<void> {
    this.isRecording = false;
    this.monitor.stop();
    await this.recorder.stop();
  }

  /**
   * 获取状态
   */
  getStatus(): RecordingStatus {
    return this.recorder.getStatus();
  }
}
