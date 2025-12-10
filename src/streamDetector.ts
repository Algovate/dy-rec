import { DouyinApi, DouyinApiOptions, VideoQuality } from './api/douyinApi.js';
import { BrowserController } from './browser.js';
import chalk from 'chalk';

export type DetectionMode = 'api' | 'browser' | 'hybrid';

export interface StreamDetectorOptions {
  mode?: DetectionMode;
  quality?: VideoQuality;
  cookies?: string;
  proxy?: any;
}

export interface DetectedStreamInfo {
  mode: DetectionMode;
  roomId: string;
  anchorName: string;
  title: string;
  quality: string;
  flvUrl?: string;
  hlsUrl?: string | null;
  recordUrl: string;
  availableQualities?: string[];
}

/**
 * 混合模式流检测器
 * 优先使用 API 模式（快速），失败时回退到浏览器模式（可靠）
 */
export class StreamDetector {
  private mode: DetectionMode;
  private quality: VideoQuality;
  private apiClient: DouyinApi;
  private browserController: BrowserController | null = null;

  constructor(options: StreamDetectorOptions = {}) {
    this.mode = options.mode || 'hybrid'; // 'api' | 'browser' | 'hybrid'
    this.quality = options.quality || 'origin';
    const apiOptions: DouyinApiOptions = {
      cookies: options.cookies,
      proxy: options.proxy,
    };
    this.apiClient = new DouyinApi(apiOptions);
  }

  /**
   * 检测流 URL
   * @param roomIdOrUrl - 房间 ID 或 URL
   * @returns 流信息
   */
  async detectStream(roomIdOrUrl: string): Promise<DetectedStreamInfo> {
    if (this.mode === 'browser') {
      return await this.detectByBrowser(roomIdOrUrl);
    }

    if (this.mode === 'api') {
      try {
        return await this.detectByApi(roomIdOrUrl);
      } catch (error: any) {
        console.log(
          chalk.yellow(
            `\n[提示] API 模式失败。建议使用 'hybrid' 模式（默认），会自动回退到浏览器模式。\n错误: ${error.message}\n`
          )
        );
        throw error;
      }
    }

    // 混合模式：优先 API，失败时回退浏览器
    try {
      console.log(chalk.blue('[Stream Detector] 尝试 API 模式...'));
      const result = await this.detectByApi(roomIdOrUrl);
      console.log(chalk.green('[Stream Detector] API 模式成功'));
      return result;
    } catch (error: any) {
      console.log(chalk.yellow(`[Stream Detector] API 模式失败: ${error.message}`));
      console.log(chalk.blue('[Stream Detector] 回退到浏览器模式...'));
      return await this.detectByBrowser(roomIdOrUrl);
    }
  }

  /**
   * API 模式检测
   */
  private async detectByApi(roomIdOrUrl: string): Promise<DetectedStreamInfo> {
    try {
      const streamInfo = await this.apiClient.getStreamUrl(roomIdOrUrl, this.quality);

      if (!streamInfo.isLive) {
        throw new Error('直播间未开播');
      }

      return {
        mode: 'api',
        roomId: /^\d+$/.test(roomIdOrUrl) ? roomIdOrUrl : this.apiClient.extractRoomId(roomIdOrUrl),
        anchorName: streamInfo.anchorName || '未知',
        title: streamInfo.title || '',
        quality: streamInfo.quality || 'unknown',
        flvUrl: streamInfo.flvUrl,
        hlsUrl: streamInfo.hlsUrl,
        recordUrl: streamInfo.recordUrl || '',
        availableQualities: streamInfo.availableQualities,
      };
    } catch (error: any) {
      throw new Error(`API 检测失败: ${error.message}`);
    }
  }

  /**
   * 浏览器模式检测
   */
  private async detectByBrowser(roomIdOrUrl: string): Promise<DetectedStreamInfo> {
    try {
      // 提取房间 ID
      let roomId: string;
      if (/^\d+$/.test(roomIdOrUrl)) {
        roomId = roomIdOrUrl;
      } else {
        roomId = this.apiClient.extractRoomId(roomIdOrUrl);
      }

      // 启动浏览器
      this.browserController = new BrowserController({
        headless: true,
      });
      await this.browserController.launch();

      // 访问直播间
      await this.browserController.navigateToLive(roomId);

      // 等待流检测
      const flvUrls = await this.browserController.waitForStream(30000);

      if (flvUrls.length === 0) {
        throw new Error('未检测到流地址');
      }

      // 选择最佳质量的流
      const selectedUrl = this.browserController.getBestQualityUrl() || flvUrls[0];

      return {
        mode: 'browser',
        roomId,
        anchorName: '未知',
        title: '',
        quality: 'auto',
        flvUrl: selectedUrl,
        hlsUrl: null,
        recordUrl: selectedUrl,
        availableQualities: [],
      };
    } catch (error: any) {
      throw new Error(`浏览器检测失败: ${error.message}`);
    } finally {
      if (this.browserController) {
        await this.browserController.close();
      }
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.browserController) {
      await this.browserController.close();
      this.browserController = null;
    }
  }
}
