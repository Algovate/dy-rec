import { DouyinApi, DouyinApiOptions, VideoQuality } from '../api/douyinApi.js';
import { BrowserController } from './browser.js';
import chalk from 'chalk';
import { extractRoomId } from '../utils/roomId.js';
import { StreamDetectionError, StreamValidationError } from '../utils/errors.js';
import { validateStreamUrl } from '../utils/streamUrl.js';

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
    const roomId = extractRoomId(roomIdOrUrl);
    console.log(chalk.cyan(`[Stream Detector] 开始检测流，房间 ID: ${roomId}, 模式: ${this.mode}`));

    if (this.mode === 'browser') {
      console.log(chalk.blue('[Stream Detector] 使用浏览器模式...'));
      return await this.detectByBrowser(roomIdOrUrl);
    }

    if (this.mode === 'api') {
      try {
        console.log(chalk.blue('[Stream Detector] 使用 API 模式...'));
        const result = await this.detectByApi(roomIdOrUrl);
        console.log(chalk.green(`[Stream Detector] API 模式成功: ${result.recordUrl}`));
        return result;
      } catch (error: any) {
        console.error(
          chalk.red(
            `[Stream Detector] API 模式失败: ${error.message}\n提示: 建议使用 'hybrid' 模式（默认），会自动回退到浏览器模式。`
          )
        );
        throw error;
      }
    }

    // 混合模式：优先 API，失败时回退浏览器
    try {
      console.log(chalk.blue('[Stream Detector] 混合模式: 尝试 API 模式...'));
      const result = await this.detectByApi(roomIdOrUrl);
      console.log(chalk.green(`[Stream Detector] API 模式成功: ${result.recordUrl}`));
      return result;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`[Stream Detector] API 模式失败: ${errorMessage}`));
      console.log(chalk.blue('[Stream Detector] 回退到浏览器模式...'));
      try {
        const browserResult = await this.detectByBrowser(roomIdOrUrl);
        console.log(chalk.green(`[Stream Detector] 浏览器模式成功: ${browserResult.recordUrl}`));
        return browserResult;
      } catch (browserError: any) {
        const browserErrorMessage =
          browserError instanceof Error ? browserError.message : String(browserError);
        console.error(chalk.red(`[Stream Detector] 浏览器模式也失败: ${browserErrorMessage}`));
        throw new StreamDetectionError(
          `所有检测模式都失败。API 模式: ${errorMessage}; 浏览器模式: ${browserErrorMessage}`,
          browserError
        );
      }
    }
  }

  /**
   * API 模式检测
   */
  private async detectByApi(roomIdOrUrl: string): Promise<DetectedStreamInfo> {
    const roomId = extractRoomId(roomIdOrUrl);
    try {
      console.log(chalk.gray(`[API Mode] 获取房间信息: ${roomId}`));
      const streamInfo = await this.apiClient.getStreamUrl(roomIdOrUrl, this.quality);

      if (!streamInfo.isLive) {
        const message = streamInfo.message || '直播间未开播';
        console.error(chalk.red(`[API Mode] ${message}`));
        throw new Error(message);
      }

      if (!streamInfo.recordUrl) {
        console.error(chalk.red('[API Mode] 无法获取流地址'));
        throw new Error('无法获取流地址');
      }

      console.log(
        chalk.gray(
          `[API Mode] 检测成功 - 主播: ${streamInfo.anchorName || '未知'}, 标题: ${streamInfo.title || '无'}, 画质: ${streamInfo.quality || '未知'}`
        )
      );
      console.log(chalk.gray(`[API Mode] FLV URL: ${streamInfo.flvUrl || '无'}`));
      console.log(chalk.gray(`[API Mode] HLS URL: ${streamInfo.hlsUrl || '无'}`));
      console.log(chalk.gray(`[API Mode] 录制 URL: ${streamInfo.recordUrl}`));

      // Validate URL connectivity
      await this.validateUrl(streamInfo.recordUrl);

      return {
        mode: 'api',
        roomId,
        anchorName: streamInfo.anchorName || '未知',
        title: streamInfo.title || '',
        quality: streamInfo.quality || 'unknown',
        flvUrl: streamInfo.flvUrl,
        hlsUrl: streamInfo.hlsUrl,
        recordUrl: streamInfo.recordUrl,
        availableQualities: streamInfo.availableQualities,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`[API Mode] 检测失败: ${message}`));
      if (error instanceof Error && error.stack) {
        console.error(chalk.gray(`[API Mode] 错误堆栈: ${error.stack}`));
      }
      throw new StreamDetectionError(`API 检测失败: ${message}`, error);
    }
  }

  /**
   * 浏览器模式检测
   */
  private async detectByBrowser(roomIdOrUrl: string): Promise<DetectedStreamInfo> {
    const roomId = extractRoomId(roomIdOrUrl);
    try {
      console.log(chalk.gray(`[Browser Mode] 启动浏览器检测: ${roomId}`));

      // 启动浏览器
      this.browserController = new BrowserController({
        headless: true,
        onStreamDetected: (type: string, url: string) => {
          console.log(chalk.gray(`[Browser Mode] 检测到流 (${type}): ${url.substring(0, 100)}...`));
        },
      });
      await this.browserController.launch();
      console.log(chalk.gray('[Browser Mode] 浏览器已启动'));

      // 访问直播间
      await this.browserController.navigateToLive(roomId);
      console.log(chalk.gray('[Browser Mode] 页面已加载，等待流检测...'));

      // 等待流检测
      const streamUrls = await this.browserController.waitForStream(30000);

      if (streamUrls.length === 0) {
        // 提供详细的诊断信息
        const flvUrls = this.browserController.getFlvUrls();
        const hlsUrls = this.browserController.getHlsUrls();
        const dashUrls = this.browserController.getDashUrls();

        console.error(chalk.red('[Browser Mode] 未检测到流地址'));
        console.log(chalk.yellow(`[Browser Mode] 诊断信息:`));
        console.log(chalk.yellow(`  - FLV URLs: ${flvUrls.length}`));
        console.log(chalk.yellow(`  - HLS URLs: ${hlsUrls.length}`));
        console.log(chalk.yellow(`  - DASH URLs: ${dashUrls.length}`));

        if (flvUrls.length > 0) {
          console.log(chalk.yellow(`  - FLV URLs: ${flvUrls.join(', ')}`));
        }
        if (hlsUrls.length > 0) {
          console.log(chalk.yellow(`  - HLS URLs: ${hlsUrls.join(', ')}`));
        }
        if (dashUrls.length > 0) {
          console.log(chalk.yellow(`  - DASH URLs: ${dashUrls.join(', ')}`));
        }

        throw new Error('未检测到流地址（FLV/HLS/DASH）');
      }

      // 选择最佳质量的流
      const selectedUrl = this.browserController.getBestQualityUrl() || streamUrls[0];

      if (!selectedUrl) {
        throw new Error('无法选择流地址');
      }

      console.log(chalk.gray(`[Browser Mode] 选择流地址: ${selectedUrl.substring(0, 100)}...`));

      // 确定流类型
      let flvUrl: string | undefined;
      let hlsUrl: string | null = null;
      if (selectedUrl.includes('.m3u8')) {
        hlsUrl = selectedUrl;
      } else if (selectedUrl.includes('.flv')) {
        flvUrl = selectedUrl;
      }

      return {
        mode: 'browser',
        roomId,
        anchorName: '未知',
        title: '',
        quality: 'auto',
        flvUrl,
        hlsUrl,
        recordUrl: selectedUrl,
        availableQualities: [],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`[Browser Mode] 检测失败: ${message}`));
      if (error instanceof Error && error.stack) {
        console.error(chalk.gray(`[Browser Mode] 错误堆栈: ${error.stack}`));
      }
      throw new StreamDetectionError(`浏览器检测失败: ${message}`, error);
    } finally {
      if (this.browserController) {
        console.log(chalk.gray('[Browser Mode] 关闭浏览器...'));
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

  /**
   * Validate URL connectivity
   */
  private async validateUrl(url: string): Promise<void> {
    console.log(chalk.gray(`[Stream Detector] Verifying stream URL connectivity...`));
    const { valid, status } = await validateStreamUrl(url);
    if (valid) {
      console.log(chalk.green(`[Stream Detector] Stream URL is reachable (Status: ${status})`));
      return;
    }
    console.warn(
      chalk.yellow(`[Stream Detector] Stream URL validation failed (Status: ${status})`)
    );
    throw new StreamValidationError(`Stream URL is unreachable`, status);
  }
}
