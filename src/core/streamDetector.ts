import { DouyinApi, DouyinApiOptions, VideoQuality } from '../api/douyinApi.js';
import { BrowserController } from './browser.js';
import chalk from 'chalk';
import { extractRoomId } from '../utils/roomId.js';
import { StreamDetectionError, StreamValidationError } from '../utils/errors.js';
import { validateStreamUrl } from '../utils/streamUrl.js';
import { Logger } from '../utils/logger.js';

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
    Logger.verbose(chalk.cyan(`[Stream Detector] 开始检测流，房间 ID: ${roomId}, 模式: ${this.mode}`));

    if (this.mode === 'browser') {
      Logger.verbose(chalk.blue('[Stream Detector] 使用浏览器模式...'));
      return await this.detectByBrowser(roomIdOrUrl);
    }

    if (this.mode === 'api') {
      try {
        Logger.verbose(chalk.blue('[Stream Detector] 使用 API 模式...'));
        const result = await this.detectByApi(roomIdOrUrl);
        Logger.verbose(chalk.green(`[Stream Detector] API 模式成功: ${result.recordUrl}`));
        return result;
      } catch (error: any) {
        Logger.error(
          chalk.red(
            `[Stream Detector] API 模式失败: ${error.message}\n提示: 建议使用 'hybrid' 模式（默认），会自动回退到浏览器模式。`
          )
        );
        throw error;
      }
    }

    // 混合模式：优先 API，失败时回退浏览器
    try {
      Logger.verbose(chalk.blue('[Stream Detector] 混合模式: 尝试 API 模式...'));
      const result = await this.detectByApi(roomIdOrUrl);
      Logger.verbose(chalk.green(`[Stream Detector] API 模式成功: ${result.recordUrl}`));
      return result;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.verbose(chalk.yellow(`[Stream Detector] API 模式失败: ${errorMessage}`));
      Logger.verbose(chalk.blue('[Stream Detector] 回退到浏览器模式...'));
      try {
        const browserResult = await this.detectByBrowser(roomIdOrUrl);
        Logger.verbose(chalk.green(`[Stream Detector] 浏览器模式成功: ${browserResult.recordUrl}`));
        return browserResult;
      } catch (browserError: any) {
        const browserErrorMessage =
          browserError instanceof Error ? browserError.message : String(browserError);
        Logger.error(chalk.red(`[Stream Detector] 浏览器模式也失败: ${browserErrorMessage}`));
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
      Logger.verbose(chalk.gray(`[API Mode] 获取房间信息: ${roomId}`));
      const streamInfo = await this.apiClient.getStreamUrl(roomIdOrUrl, this.quality);

      if (!streamInfo.isLive) {
        const message = streamInfo.message || '直播间未开播';
        Logger.error(chalk.red(`[API Mode] ${message}`));
        throw new Error(message);
      }

      if (!streamInfo.recordUrl) {
        Logger.error(chalk.red('[API Mode] 无法获取流地址'));
        throw new Error('无法获取流地址');
      }

      Logger.verbose(
        chalk.gray(
          `[API Mode] 检测成功 - 主播: ${streamInfo.anchorName || '未知'}, 标题: ${streamInfo.title || '无'}, 画质: ${streamInfo.quality || '未知'}`
        )
      );
      Logger.verbose(chalk.gray(`[API Mode] FLV URL: ${streamInfo.flvUrl || '无'}`));
      Logger.verbose(chalk.gray(`[API Mode] HLS URL: ${streamInfo.hlsUrl || '无'}`));
      Logger.verbose(chalk.gray(`[API Mode] 录制 URL: ${streamInfo.recordUrl}`));

      // Validate URL connectivity (skip for API mode URLs as they're from official API)
      // URL validation can be too strict for FLV streams that don't support HEAD requests
      try {
        await this.validateUrl(streamInfo.recordUrl);
      } catch (error) {
        // Log warning but don't fail - API URLs are trusted
        Logger.verbose(
          chalk.yellow(
            `[API Mode] URL validation warning: ${error instanceof Error ? error.message : String(error)} (continuing anyway)`
          )
        );
      }

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
      Logger.verbose(chalk.red(`[API Mode] 检测失败: ${message}`));
      if (error instanceof Error && error.stack) {
        Logger.verbose(chalk.gray(`[API Mode] 错误堆栈: ${error.stack}`));
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
      Logger.verbose(chalk.gray(`[Browser Mode] 启动浏览器检测: ${roomId}`));

      // 启动浏览器
      this.browserController = new BrowserController({
        headless: true,
        onStreamDetected: (type: string, url: string) => {
          Logger.verbose(chalk.gray(`[Browser Mode] 检测到流 (${type}): ${url.substring(0, 100)}...`));
        },
      });
      await this.browserController.launch();
      Logger.verbose(chalk.gray('[Browser Mode] 浏览器已启动'));

      // 访问直播间
      await this.browserController.navigateToLive(roomId);
      Logger.verbose(chalk.gray('[Browser Mode] 页面已加载，等待流检测...'));

      // 提取页面元数据（主播名、标题）
      const pageMetadata = await this.browserController.extractPageMetadata();

      // 等待流检测
      const streamUrls = await this.browserController.waitForStream(30000);

      if (streamUrls.length === 0) {
        // 提供详细的诊断信息
        const flvUrls = this.browserController.getFlvUrls();
        const hlsUrls = this.browserController.getHlsUrls();
        const dashUrls = this.browserController.getDashUrls();

        Logger.error(chalk.red('[Browser Mode] 未检测到流地址'));
        Logger.verbose(chalk.yellow(`[Browser Mode] 诊断信息:`));
        Logger.verbose(chalk.yellow(`  - FLV URLs: ${flvUrls.length}`));
        Logger.verbose(chalk.yellow(`  - HLS URLs: ${hlsUrls.length}`));
        Logger.verbose(chalk.yellow(`  - DASH URLs: ${dashUrls.length}`));

        if (flvUrls.length > 0) {
          Logger.verbose(chalk.yellow(`  - FLV URLs: ${flvUrls.join(', ')}`));
        }
        if (hlsUrls.length > 0) {
          Logger.verbose(chalk.yellow(`  - HLS URLs: ${hlsUrls.join(', ')}`));
        }
        if (dashUrls.length > 0) {
          Logger.verbose(chalk.yellow(`  - DASH URLs: ${dashUrls.join(', ')}`));
        }

        throw new Error('未检测到流地址（FLV/HLS/DASH）');
      }

      // 选择最佳质量的流
      const selectedUrl = this.browserController.getBestQualityUrl() || streamUrls[0];

      if (!selectedUrl) {
        throw new Error('无法选择流地址');
      }

      Logger.verbose(chalk.gray(`[Browser Mode] 选择流地址: ${selectedUrl.substring(0, 100)}...`));

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
        anchorName: pageMetadata.anchorName || '未知',
        title: pageMetadata.title || '',
        quality: 'auto',
        flvUrl,
        hlsUrl,
        recordUrl: selectedUrl,
        availableQualities: [],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error(chalk.red(`[Browser Mode] 检测失败: ${message}`));
      if (error instanceof Error && error.stack) {
        Logger.verbose(chalk.gray(`[Browser Mode] 错误堆栈: ${error.stack}`));
      }
      throw new StreamDetectionError(`浏览器检测失败: ${message}`, error);
    } finally {
      if (this.browserController) {
        Logger.verbose(chalk.gray('[Browser Mode] 关闭浏览器...'));
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
    Logger.verbose(chalk.gray(`[Stream Detector] Verifying stream URL connectivity...`));
    const { valid, status } = await validateStreamUrl(url);
    if (valid) {
      Logger.verbose(chalk.green(`[Stream Detector] Stream URL is reachable (Status: ${status})`));
      return;
    }
    Logger.warn(
      chalk.yellow(`[Stream Detector] Stream URL validation failed (Status: ${status})`)
    );
    throw new StreamValidationError(`Stream URL is unreachable`, status);
  }
}
