import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '../utils.js';

// 匹配抖音视频 CDN 地址
const MEDIA_HOST_PATTERN = /^https?:\/\/v\d+-web\.douyinvod\.com\/[^\s'"]+/;

export interface VideoDownloaderOptions {
  headless?: boolean;
  timeout?: number;
  userAgent?: string;
}

export interface DownloadResult {
  success: boolean;
  videoId: string;
  outputPath: string;
  fileSize?: number;
  error?: string;
}

/**
 * 抖音短视频下载器
 * 使用 Puppeteer 浏览器捕获视频真实 URL，然后下载
 */
export class VideoDownloader {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private headless: boolean;
  private timeout: number;
  private userAgent: string;

  constructor(options: VideoDownloaderOptions = {}) {
    this.headless = options.headless !== undefined ? options.headless : true;
    this.timeout = options.timeout || 30000;
    this.userAgent =
      options.userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  }

  /**
   * 下载视频
   * @param url 抖音视频链接（短链或完整链接）
   * @param outputPath 输出文件路径
   */
  async download(url: string, outputPath: string): Promise<DownloadResult> {
    let videoId = 'unknown';

    try {
      // 确保输出目录存在
      const outputDir = path.dirname(outputPath);
      await ensureDir(outputDir);

      console.log('[VideoDownloader] 正在捕获视频 URL...');

      // 捕获视频 URL
      const { videoUrl, videoId: id, finalUrl } = await this.captureVideoUrl(url);
      videoId = id;

      console.log(`[VideoDownloader] 视频 ID: ${videoId}`);
      console.log(`[VideoDownloader] 页面 URL: ${finalUrl}`);
      console.log(`[VideoDownloader] 视频 URL: ${videoUrl.substring(0, 100)}...`);

      // 下载视频文件
      console.log('[VideoDownloader] 正在下载视频...');
      const fileSize = await this.downloadFile(videoUrl, outputPath);

      console.log(`[VideoDownloader] 下载完成: ${outputPath}`);
      console.log(`[VideoDownloader] 文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

      return {
        success: true,
        videoId,
        outputPath,
        fileSize,
      };
    } catch (error: any) {
      console.error(`[VideoDownloader] 下载失败: ${error.message}`);
      return {
        success: false,
        videoId,
        outputPath,
        error: error.message,
      };
    } finally {
      await this.close();
    }
  }

  /**
   * 使用浏览器捕获视频真实 URL
   */
  private async captureVideoUrl(
    pageUrl: string
  ): Promise<{ videoUrl: string; videoId: string; finalUrl: string }> {
    await this.launchBrowser();

    if (!this.page) {
      throw new Error('浏览器页面未初始化');
    }

    let capturedUrl: string | null = null;

    // 监听网络请求，捕获视频 URL
    this.page.on('request', (request) => {
      const url = request.url();
      if (capturedUrl === null && MEDIA_HOST_PATTERN.test(url)) {
        capturedUrl = url;
      }
    });

    // 导航到页面
    try {
      await this.page.goto(pageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeout,
      });
    } catch (error: any) {
      if (!error.message.includes('net::ERR_ABORTED')) {
        throw error;
      }
      // 某些情况下会触发 ERR_ABORTED，但视频 URL 可能已经捕获
    }

    // 等待网络稳定
    try {
      await this.page.waitForNetworkIdle({ timeout: this.timeout });
    } catch {
      // 超时不影响，继续处理
    }

    // 获取最终 URL（短链会重定向）
    const finalUrl = this.page.url();

    // 如果还没捕获到，等待一下
    if (!capturedUrl) {
      const startTime = Date.now();
      while (!capturedUrl && Date.now() - startTime < this.timeout) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!capturedUrl) {
      throw new Error(`未能捕获视频 URL，请检查链接是否有效: ${finalUrl}`);
    }

    // 从 URL 中提取视频 ID
    const videoId = this.extractVideoId(capturedUrl, finalUrl);

    return { videoUrl: capturedUrl, videoId, finalUrl };
  }

  /**
   * 从 URL 中提取视频 ID
   */
  private extractVideoId(mediaUrl: string, pageUrl: string): string {
    // 尝试从媒体 URL 中提取
    const vidMatch = mediaUrl.match(/__vid=(\d+)/);
    if (vidMatch) {
      return vidMatch[1];
    }

    // 尝试从页面 URL 中提取
    const pageMatch = pageUrl.match(/\/video\/(\d+)/);
    if (pageMatch) {
      return pageMatch[1];
    }

    return 'douyin_video';
  }

  /**
   * 下载文件
   */
  private async downloadFile(url: string, outputPath: string): Promise<number> {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 60000,
      headers: {
        'User-Agent': this.userAgent,
        Referer: 'https://www.douyin.com/',
        Accept: '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
    });

    const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
    let downloadedBytes = 0;
    let lastLogTime = Date.now();

    const writer = fs.createWriteStream(outputPath);

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;

        // 每秒最多打印一次进度
        const now = Date.now();
        if (now - lastLogTime >= 1000) {
          const percent = totalBytes > 0 ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : '?';
          const downloaded = (downloadedBytes / 1024 / 1024).toFixed(2);
          const total = totalBytes > 0 ? (totalBytes / 1024 / 1024).toFixed(2) : '?';
          process.stdout.write(`\r[下载进度] ${downloaded} MB / ${total} MB (${percent}%)`);
          lastLogTime = now;
        }
      });

      response.data.on('end', () => {
        process.stdout.write('\n');
      });

      response.data.pipe(writer);

      writer.on('finish', () => {
        resolve(downloadedBytes);
      });

      writer.on('error', (err) => {
        fs.unlink(outputPath, () => {}); // 删除不完整的文件
        reject(new Error(`文件写入失败: ${err.message}`));
      });

      response.data.on('error', (err: Error) => {
        fs.unlink(outputPath, () => {});
        reject(new Error(`下载流错误: ${err.message}`));
      });
    });
  }

  /**
   * 启动浏览器
   */
  private async launchBrowser(): Promise<void> {
    const launchOptions: PuppeteerLaunchOptions = {
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-blink-features=AutomationControlled',
      ],
    };

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // 设置 User Agent
    await this.page.setUserAgent(this.userAgent);

    // 设置视口大小
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
