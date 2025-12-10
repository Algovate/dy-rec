import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';

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
  private flvUrls: string[] = [];
  private onStreamDetected?: (type: string, url: string) => void;
  private userAgent: string;
  private headless: boolean;

  constructor(options: BrowserControllerOptions = {}) {
    this.onStreamDetected = options.onStreamDetected;
    this.userAgent =
      options.userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.headless = options.headless !== undefined ? options.headless : false;
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

      // 检测 FLV 文件 (抖音使用 FLV 而不是 m3u8)
      if (url.includes('.flv')) {
        if (!this.flvUrls.includes(url)) {
          this.flvUrls.push(url);
          console.log(`[Stream Detected] FLV: ${url}`);
          if (this.onStreamDetected) {
            this.onStreamDetected('flv', url);
          }
        }
      }

      // 继续请求
      void request.continue();
    });

    // 监听响应，获取实际的流 URL
    this.page.on('response', (response) => {
      const url = response.url();
      const headers = response.headers();
      const contentType = headers['content-type'] || '';

      // 检测 FLV 响应
      if (contentType.includes('video/x-flv') || url.includes('.flv')) {
        if (!this.flvUrls.includes(url)) {
          this.flvUrls.push(url);
          console.log(`[Stream Detected] FLV Response: ${url}`);
          if (this.onStreamDetected) {
            this.onStreamDetected('flv', url);
          }
        }
      }
    });
  }

  /**
   * 访问直播页面
   */
  async navigateToLive(roomId: string): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = `https://live.douyin.com/${roomId}`;
    console.log(`[Browser] Navigating to: ${url}`);

    try {
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded', // 改为更快的加载策略
        timeout: 30000,
      });

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

      console.log(`[Browser] Page loaded successfully`);
    } catch (error: any) {
      console.error(`[Browser] Failed to navigate:`, error.message);
      throw error;
    }
  }

  /**
   * 等待流被检测到
   */
  async waitForStream(timeout: number = 60000): Promise<string[]> {
    const startTime = Date.now();
    while (this.flvUrls.length === 0 && Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (this.flvUrls.length === 0) {
      throw new Error('No stream detected within timeout period');
    }

    return this.flvUrls;
  }

  /**
   * 获取检测到的 FLV URLs
   */
  getFlvUrls(): string[] {
    return [...this.flvUrls];
  }

  /**
   * 选择最佳质量的流
   * SD (标清), HD (高清), LD (流畅)
   */
  getBestQualityUrl(): string | null {
    if (this.flvUrls.length === 0) return null;

    // 优先选择 HD，然后 SD，最后 LD
    const hdUrl = this.flvUrls.find((url) => url.includes('_hd.flv'));
    const sdUrl = this.flvUrls.find((url) => url.includes('_sd.flv'));
    const ldUrl = this.flvUrls.find((url) => url.includes('_ld'));

    return hdUrl || sdUrl || ldUrl || this.flvUrls[0];
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
