import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '../utils/index.js';
import { DEFAULT_BROWSER_USER_AGENT, DEFAULT_DOWNLOAD_TIMEOUT } from '../constants.js';
import { Logger } from '../utils/logger.js';

// 匹配抖音视频 CDN 地址
const MEDIA_HOST_PATTERN = /^https?:\/\/v\d+-web\.douyinvod\.com\/[^\s'"]+/;

export interface VideoDownloaderOptions {
  headless?: boolean;
  timeout?: number;
  userAgent?: string;
}

export interface VideoMetadata {
  anchorName: string;
  title: string;
  description?: string;
  publishTime?: string;
  publishTimestamp?: number;
  publishTimeISO?: string;
  stats?: {
    likes?: string;
    comments?: string;
    shares?: string;
    views?: string;
  };
}

export interface DownloadResult {
  success: boolean;
  videoId: string;
  outputPath: string;
  fileSize?: number;
  sourceUrl: string;
  finalUrl: string;
  videoUrl: string;
  metadata?: VideoMetadata;
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
    this.timeout = options.timeout || DEFAULT_DOWNLOAD_TIMEOUT;
    this.userAgent = options.userAgent || DEFAULT_BROWSER_USER_AGENT;
  }

  /**
   * 下载视频
   * @param url 抖音视频链接（短链或完整链接）
   * @param outputPath 输出文件路径
   */
  async download(url: string, outputPath: string): Promise<DownloadResult> {
    let videoId = 'unknown';
    const sourceUrl = url;
    let finalUrl = '';
    let videoUrl = '';
    let metadata: VideoMetadata | undefined;

    try {
      // 确保输出目录存在
      const outputDir = path.dirname(outputPath);
      await ensureDir(outputDir);

      Logger.verbose('[VideoDownloader] 正在捕获视频 URL...');

      // 捕获视频 URL 和元数据
      const captureResult = await this.captureVideoUrl(url);
      videoId = captureResult.videoId;
      finalUrl = captureResult.finalUrl;
      videoUrl = captureResult.videoUrl;
      metadata = captureResult.metadata;

      Logger.verbose(`[VideoDownloader] 视频 ID: ${videoId}`);
      Logger.verbose(`[VideoDownloader] 页面 URL: ${finalUrl}`);
      if (metadata) {
        Logger.verbose(`[VideoDownloader] 作者: ${metadata.anchorName}`);
        Logger.verbose(`[VideoDownloader] 标题: ${metadata.title}`);
      }
      Logger.verbose(`[VideoDownloader] 视频 URL: ${videoUrl.substring(0, 100)}...`);

      // 下载视频文件
      Logger.verbose('[VideoDownloader] 正在下载视频...');
      const fileSize = await this.downloadFile(videoUrl, outputPath);

      Logger.verbose(`[VideoDownloader] 下载完成: ${outputPath}`);
      Logger.verbose(`[VideoDownloader] 文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

      return {
        success: true,
        videoId,
        outputPath,
        fileSize,
        sourceUrl,
        finalUrl,
        videoUrl,
        metadata,
      };
    } catch (error: any) {
      Logger.error(`[VideoDownloader] 下载失败: ${error.message}`);
      return {
        success: false,
        videoId,
        outputPath,
        sourceUrl,
        finalUrl: finalUrl || url,
        videoUrl,
        metadata,
        error: error.message,
      };
    } finally {
      await this.close();
    }
  }

  /**
   * 使用浏览器捕获视频真实 URL 和元数据
   */
  private async captureVideoUrl(
    pageUrl: string
  ): Promise<{ videoUrl: string; videoId: string; finalUrl: string; metadata?: VideoMetadata }> {
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

    // 等待页面完全加载以提取元数据
    await new Promise((resolve) => setTimeout(resolve, 2000));

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

    // 提取页面元数据
    const metadata = await this.extractVideoMetadata();

    return { videoUrl: capturedUrl, videoId, finalUrl, metadata };
  }

  /**
   * 从页面提取视频元数据
   */
  private async extractVideoMetadata(): Promise<VideoMetadata | undefined> {
    if (!this.page) {
      return undefined;
    }

    try {
      const metadata = await this.page.evaluate(() => {
        const result: {
          anchorName: string;
          title: string;
          description?: string;
          publishTime?: string;
          publishTimestamp?: number;
          publishTimeISO?: string;
          stats?: {
            likes?: string;
            comments?: string;
            shares?: string;
            views?: string;
          };
        } = {
          anchorName: '',
          title: '',
        };

        // 提取视频标题 - 优先从h1获取，清理格式
        const h1 = document.querySelector('h1');
        if (h1) {
          result.title = h1.textContent?.trim() || '';
          // 清理标题：移除"第X集 |"前缀，只保留标题主体
          result.title = result.title.replace(/^第\d+集\s*\|\s*/, '');
          // 移除末尾的描述性文字
          if (result.title.includes('金融投资本质上')) {
            result.title = result.title.split('金融投资本质上')[0].trim();
          }
          // 限制长度
          if (result.title.length > 200) {
            result.title = result.title.substring(0, 200);
          }
        }

        // 如果没有找到或太长，尝试meta标签
        if (!result.title || result.title.length === 0) {
          const metaTitle = document.querySelector('meta[property="og:title"]');
          if (metaTitle) {
            result.title = metaTitle.getAttribute('content') || '';
          }
        }

        // 提取作者名称 - 从用户链接中提取
        const userLinks = Array.from(document.querySelectorAll('a[href*="/user/"]'));
        for (const link of userLinks) {
          const href = link.getAttribute('href');
          const text = link.textContent?.trim();
          // 确保是有效的用户链接
          if (
            href &&
            text &&
            href.includes('/user/') &&
            !href.includes('self') &&
            !href.includes('search') &&
            text.length > 0 &&
            text.length < 50
          ) {
            // 检查是否在视频详情区域
            const videoDetailSection = link.closest(
              '[class*="video-detail"], [class*="author"], [class*="user"]'
            );
            if (videoDetailSection || link.textContent === text) {
              result.anchorName = text;
              break;
            }
          }
        }

        // 如果还没找到，尝试从页面数据结构中提取
        if (!result.anchorName) {
          try {
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const script of scripts) {
              if (script.textContent && script.textContent.includes('nickname')) {
                const match = script.textContent.match(/"nickname":"([^"]+)"/);
                if (match && match[1]) {
                  result.anchorName = match[1];
                  break;
                }
              }
            }
          } catch {
            // Ignore
          }
        }

        // 提取发布时间
        const timeElements = Array.from(document.querySelectorAll('*'));
        for (const element of timeElements) {
          const text = element.textContent || '';
          if (text.includes('发布时间：')) {
            const timeMatch = text.match(/发布时间：\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
            if (timeMatch && timeMatch[1]) {
              result.publishTime = timeMatch[1];
              // 尝试转换为时间戳
              try {
                const date = new Date(timeMatch[1].replace(' ', 'T'));
                if (!isNaN(date.getTime())) {
                  result.publishTimestamp = date.getTime();
                  result.publishTimeISO = date.toISOString();
                }
              } catch {
                // Ignore
              }
            }
          }
        }

        // 提取统计信息（点赞、评论、分享、观看数）
        // 这些信息通常在特定的元素中，需要根据实际DOM结构调整
        // 可以尝试查找包含数字和"万"、"K"等单位的文本
        // TODO: 实现统计信息提取逻辑

        return result;
      });

      // 如果提取到了基本信息，返回元数据
      if (metadata.title || metadata.anchorName) {
        return metadata;
      }

      return undefined;
    } catch (error: any) {
      Logger.verbose(`[VideoDownloader] 提取元数据失败: ${error.message}`);
      return undefined;
    }
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

      writer.on('error', (err: any) => {
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
