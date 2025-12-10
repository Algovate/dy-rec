import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import { DEFAULT_BROWSER_USER_AGENT, DOUYIN_LIVE_BASE_URL } from '../constants.js';
import { StreamCollector } from './streamCollector.js';
import { matchesStreamPattern } from '../utils/urlFilter.js';
import { extractMetadata, PageMetadata } from '../utils/metadataExtractor.js';

export interface BrowserControllerOptions {
  headless?: boolean;
  userAgent?: string;
  onStreamDetected?: (type: string, url: string) => void;
}

/**
 * 浏览器控制模块
 * 负责启动浏览器、拦截网络请求、访问直播页面
 */
export class BrowserController {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private requestUrls: Set<string> = new Set();
  private streamCollector: StreamCollector;
  private userAgent: string;
  private headless: boolean;

  constructor(options: BrowserControllerOptions = {}) {
    this.userAgent = options.userAgent || DEFAULT_BROWSER_USER_AGENT;
    this.headless = options.headless !== undefined ? options.headless : false;
    this.streamCollector = new StreamCollector(options.onStreamDetected);
  }

  /**
   * 启动浏览器
   * 参考 xhs-mcp 项目的 M1 Mac 优化配置
   */
  async launch(): Promise<void> {
    const launchOptions: PuppeteerLaunchOptions = {
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // 避免共享内存问题
        '--disable-accelerated-2d-canvas', // 禁用 2D canvas 加速
        '--no-first-run',
        '--no-zygote', // 禁用 zygote 进程
        '--disable-gpu', // 禁用 GPU 加速
        '--disable-background-timer-throttling', // 禁用后台定时器节流
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-blink-features=AutomationControlled', // 反爬虫检测
      ],
    };

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // 设置 User Agent
    await this.page.setUserAgent(this.userAgent);

    // 设置视口大小
    await this.page.setViewport({ width: 1920, height: 1080 });

    // 拦截网络请求
    this.setupRequestInterceptor();

    // 监听 WebSocket 连接
    this.setupWebSocketListener();

    // 注入脚本监听 Fetch/XHR 请求
    await this.injectRequestMonitor();
  }

  /**
   * 设置请求拦截器
   */
  private setupRequestInterceptor(): void {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    // 启用请求拦截
    void this.page.setRequestInterception(true);

    this.page.on('request', (request) => {
      const url = request.url();
      this.requestUrls.add(url);

      // Use stream collector to handle stream detection
      const resourceType = request.resourceType();
      this.streamCollector.addFromRequest(url, resourceType);

      // 继续请求
      void request.continue();
    });

    // 监听响应，获取实际的流 URL
    this.page.on('response', (response) => {
      const url = response.url();
      const headers = response.headers();
      const contentType = headers['content-type'] || '';

      // Use stream collector to handle response stream detection
      this.streamCollector.addFromResponse(url, contentType);
    });
  }

  /**
   * 访问直播页面
   */
  async navigateToLive(roomId: string): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = `${DOUYIN_LIVE_BASE_URL}/${roomId}`;
    console.log(`[Browser] Navigating to: ${url}`);

    try {
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded', // 改为更快的加载策略
        timeout: 60000, // Increase timeout to 60s
      });
      console.log(`[Browser] Page loaded successfully`);
    } catch (error: any) {
      // Ignore navigation timeout if streams capture is working or page is partially loaded
      if (error.message.includes('timeout')) {
        console.warn(`[Browser] Navigation timed out, but proceeding...`);
      } else {
        console.error(`[Browser] Failed to navigate:`, error.message);
        throw error;
      }
    }

    // 等待页面加载和流检测（Puppeteer 使用标准 setTimeout）
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 尝试关闭可能的弹窗
    try {
      const closeButton = await this.page.$('.close, .modal-close, [aria-label="关闭"]');
      if (closeButton) {
        await closeButton.click();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch {
      // 忽略弹窗关闭错误
    }

    // 尝试从 MediaStream 和播放器对象提取流 URL
    await this.detectMediaStreamUrls();

    // 从注入的脚本中提取检测到的流 URL
    await this.extractDetectedStreamUrl();
  }

  /**
   * 检测 MediaStream 并尝试提取流 URL
   */
  private async detectMediaStreamUrls(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      const streamInfo = await this.page.evaluate(() => {
        const result: {
          hasVideo: boolean;
          hasSrcObject: boolean;
          streamUrl: string | null;
          playerMethods: string[];
          error?: string;
        } = {
          hasVideo: false,
          hasSrcObject: false,
          streamUrl: null,
          playerMethods: [],
        };

        try {
          // 检查 video 元素
          const video = document.querySelector('video');
          if (video) {
            result.hasVideo = true;
            result.hasSrcObject = !!video.srcObject;

            // 尝试从播放器对象获取流 URL
            if ((window as any).__inline_player__) {
              const player = (window as any).__inline_player__;
              result.playerMethods = Object.keys(player).filter(
                (key) => typeof player[key] === 'function'
              );

              // 尝试常见的方法和属性名
              const methodsToTry = [
                'getUrl',
                'getStreamUrl',
                'getSource',
                'getPlayUrl',
                'getStream',
                'url',
                'src',
                'streamUrl',
                'playUrl',
                'source',
              ];

              for (const method of methodsToTry) {
                try {
                  if (typeof player[method] === 'function') {
                    const value = player[method]();
                    if (value && typeof value === 'string' && value.length > 0) {
                      result.streamUrl = value;
                      break;
                    }
                  } else if (player[method] && typeof player[method] === 'string') {
                    result.streamUrl = player[method];
                    break;
                  }
                } catch {
                  // 继续尝试下一个
                }
              }

              // 尝试从播放器的内部对象获取
              if (!result.streamUrl) {
                try {
                  const playerKeys = Object.keys(player);
                  for (const key of playerKeys) {
                    const value = player[key];
                    if (value && typeof value === 'object') {
                      // 检查嵌套对象
                      if (value.url && typeof value.url === 'string') {
                        result.streamUrl = value.url;
                        break;
                      }
                      if (value.src && typeof value.src === 'string') {
                        result.streamUrl = value.src;
                        break;
                      }
                      if (value.streamUrl && typeof value.streamUrl === 'string') {
                        result.streamUrl = value.streamUrl;
                        break;
                      }
                    }
                  }
                } catch {
                  // 忽略错误
                }
              }
            }
          }
        } catch (error: any) {
          result.error = error.message;
        }

        return result;
      });

      if (streamInfo.streamUrl) {
        const url = streamInfo.streamUrl;
        this.streamCollector.addFromRequest(url, 'media');
      } else {
        console.log(
          `[Browser] MediaStream detection: video=${streamInfo.hasVideo}, srcObject=${streamInfo.hasSrcObject}, playerMethods=${streamInfo.playerMethods.length}`
        );
        if (streamInfo.error) {
          console.log(`[Browser] MediaStream detection error: ${streamInfo.error}`);
        }
      }
    } catch (error: any) {
      console.log(`[Browser] Failed to detect MediaStream URLs: ${error.message}`);
    }
  }

  /**
   * 等待流被检测到
   */
  async waitForStream(timeout: number = 60000): Promise<string[]> {
    const startTime = Date.now();
    // 等待任何类型的流被检测到
    while (!this.streamCollector.hasUrls() && Date.now() - startTime < timeout) {
      // 定期尝试从注入的脚本中提取流 URL
      await this.extractDetectedStreamUrl();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!this.streamCollector.hasUrls()) {
      // 提供更详细的错误信息
      const collection = this.streamCollector.getCollection();
      const detectedTypes = [];
      if (collection.flvUrls.length > 0) detectedTypes.push(`FLV: ${collection.flvUrls.length}`);
      if (collection.hlsUrls.length > 0) detectedTypes.push(`HLS: ${collection.hlsUrls.length}`);
      if (collection.dashUrls.length > 0) detectedTypes.push(`DASH: ${collection.dashUrls.length}`);
      const errorMsg =
        detectedTypes.length > 0
          ? `检测到流但未添加到列表: ${detectedTypes.join(', ')}`
          : '未检测到任何流地址（FLV/HLS/DASH）';
      throw new Error(`No stream detected within timeout period. ${errorMsg}`);
    }

    return this.streamCollector.getAllUrls();
  }

  /**
   * 获取检测到的 FLV URLs
   */
  getFlvUrls(): string[] {
    return this.streamCollector.getFlvUrls();
  }

  /**
   * 获取检测到的 HLS URLs
   */
  getHlsUrls(): string[] {
    return this.streamCollector.getHlsUrls();
  }

  /**
   * 获取检测到的 DASH URLs
   */
  getDashUrls(): string[] {
    return this.streamCollector.getDashUrls();
  }

  /**
   * 获取所有检测到的流 URLs
   */
  getAllStreamUrls(): string[] {
    return this.streamCollector.getAllUrls();
  }

  /**
   * 选择最佳质量的流
   * 优先 HLS，然后 FLV，最后 DASH
   * SD (标清), HD (高清), LD (流畅)
   */
  getBestQualityUrl(): string | null {
    return this.streamCollector.getBestQualityUrl();
  }

  /**
   * 保持页面打开（用于持续录制）
   */
  async keepAlive(): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    // 定期检查页面是否还活着
    setInterval(() => {
      void (async () => {
        try {
          await this.page!.evaluate(() => {
            // 保持页面活跃
            return (globalThis as any).document?.readyState || 'complete';
          });
        } catch (error: any) {
          console.error('[Browser] Page connection lost:', error.message);
        }
      })();
    }, 5000);
  }

  /**
   * 设置 WebSocket 监听器
   */
  private setupWebSocketListener(): void {
    if (!this.page) {
      return;
    }

    // 监听 WebSocket 帧消息
    this.page.on('websocket', (ws: any) => {
      try {
        const url = ws.url();
        console.log(`[Browser] WebSocket connected: ${url}`);

        ws.on('framereceived', (event: any) => {
          try {
            // 尝试从 WebSocket 消息中提取流 URL
            const data = event.payload as string | Buffer;
            const dataStr = typeof data === 'string' ? data : data.toString('utf-8');

            // 查找可能的流 URL 模式
            const urlPatterns = [
              /https?:\/\/[^\s"']+\.(flv|m3u8|mpd)/gi,
              /https?:\/\/[^\s"']*pull[^\s"']*\.flv/gi,
              /https?:\/\/[^\s"']*stream[^\s"']*\.(flv|m3u8)/gi,
            ];

            for (const pattern of urlPatterns) {
              const matches = dataStr.match(pattern);
              if (matches) {
                for (const match of matches) {
                  if (matchesStreamPattern(match)) {
                    this.streamCollector.addFromRequest(match, 'websocket');
                  }
                }
              }
            }
          } catch {
            // 忽略解析错误
          }
        });
      } catch {
        // 忽略 WebSocket 监听错误
      }
    });
  }

  /**
   * 注入脚本监听 Fetch/XHR 请求
   */
  private async injectRequestMonitor(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      await this.page.evaluateOnNewDocument(() => {
        // Inline URL pattern matching (runs in browser context)
        const isNonStreamUrl = (url: string) => {
          const patterns = ['/api/', '/webcast/', '/aweme/', '/solution/', 'config', 'setting'];
          return patterns.some((p) => url.includes(p));
        };

        const matchesStreamPattern = (url: string) => {
          if (isNonStreamUrl(url)) return false;
          return (
            url.includes('.flv') ||
            url.includes('.m3u8') ||
            url.includes('.mpd') ||
            (url.includes('pull') && url.includes('.flv')) ||
            (url.includes('stream') && (url.includes('.flv') || url.includes('.m3u8')))
          );
        };

        // 监听 Fetch 请求
        const originalFetch = window.fetch;
        window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
          let url: string | null = null;
          if (typeof input === 'string') {
            url = input;
          } else if (input instanceof Request) {
            url = input.url;
          } else if (input instanceof URL) {
            url = input.toString();
          }

          if (url && matchesStreamPattern(url)) {
            (window as any).__detectedStreamUrl = url;
            console.log('[Stream Detected] From Fetch:', url);
          }
          return originalFetch.call(this, input, init);
        };

        // 监听 XMLHttpRequest
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (
          method: string,
          url: string | URL,
          async?: boolean,
          username?: string | null,
          password?: string | null
        ) {
          const urlStr = typeof url === 'string' ? url : url.toString();
          if (urlStr && matchesStreamPattern(urlStr)) {
            (window as any).__detectedStreamUrl = urlStr;
            console.log('[Stream Detected] From XHR:', urlStr);
          }
          return originalOpen.call(this, method, url, async ?? true, username, password);
        };
      });
    } catch (error: any) {
      console.log(`[Browser] Failed to inject request monitor: ${error.message}`);
    }
  }

  /**
   * 从页面中提取检测到的流 URL（由注入的脚本设置）
   */
  private async extractDetectedStreamUrl(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      const detectedUrl = await this.page.evaluate(() => {
        return (window as any).__detectedStreamUrl || null;
      });

      if (detectedUrl) {
        this.streamCollector.addFromRequest(detectedUrl, 'xhr');
      }
    } catch {
      // 忽略错误
    }
  }

  /**
   * 从页面提取元数据（主播名、标题等）
   */
  async extractPageMetadata(): Promise<PageMetadata> {
    if (!this.page) {
      return { anchorName: '', title: '' };
    }
    return await extractMetadata(this.page);
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
