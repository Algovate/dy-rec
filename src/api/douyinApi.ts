import axios, { AxiosProxyConfig } from 'axios';
import { abSign } from './abSign.js';
import {
  DEFAULT_USER_AGENT,
  DEFAULT_COOKIE,
  DOUYIN_LIVE_BASE_URL,
  ROOM_STATUS_LIVE,
} from '../constants.js';
import { extractRoomId } from '../utils/roomId.js';

export interface DouyinApiOptions {
  cookies?: string;
  proxy?: AxiosProxyConfig | null;
  userAgent?: string;
}

export interface RoomInfo {
  roomId: string;
  status: number; // 2 = 直播中, 4 = 未开播
  anchorName: string;
  title: string;
  streamUrl?: StreamUrlData;
  roomData: any;
}

export interface StreamUrlData {
  flv_pull_url?: Record<string, string>;
  hls_pull_url_map?: Record<string, string>;
}

export interface StreamInfo {
  isLive: boolean;
  message?: string;
  anchorName?: string;
  title?: string;
  quality?: string;
  flvUrl?: string;
  hlsUrl?: string;
  recordUrl?: string;
  availableQualities?: string[];
}

export type VideoQuality = 'origin' | 'uhd' | 'hd' | 'sd' | 'ld';

/**
 * 抖音 API 客户端
 * 参考 DouyinLiveRecorder 的实现
 */
export class DouyinApi {
  private cookies: string;
  private proxy: AxiosProxyConfig | null;
  private userAgent: string;

  constructor(options: DouyinApiOptions = {}) {
    this.cookies = options.cookies || '';
    this.proxy = options.proxy || null;
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
  }

  /**
   * 从 URL 中提取房间 ID
   * @deprecated Use extractRoomId from utils/roomId instead
   */
  extractRoomId(url: string): string {
    return extractRoomId(url);
  }

  /**
   * 获取请求头
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': this.userAgent,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: `${DOUYIN_LIVE_BASE_URL}/`,
      Origin: DOUYIN_LIVE_BASE_URL,
    };

    // 设置默认 Cookie（如果没有提供）
    headers['Cookie'] = this.cookies || DEFAULT_COOKIE;

    return headers;
  }

  /**
   * 获取直播间信息
   * @param roomId - 房间 ID
   * @returns 直播间数据
   */
  async getRoomInfo(roomId: string): Promise<RoomInfo> {
    const params = {
      aid: '6383',
      app_name: 'douyin_web',
      live_id: '1',
      device_platform: 'web',
      language: 'zh-CN',
      browser_language: 'zh-CN',
      browser_platform: 'Win32',
      browser_name: 'Chrome',
      browser_version: '121.0.0.0',
      web_rid: roomId,
      msToken: '',
    };

    // 构建 API URL
    const queryString = new URLSearchParams(params).toString();
    let apiUrl = `${DOUYIN_LIVE_BASE_URL}/webcast/room/web/enter/?${queryString}`;

    // 添加 a_bogus 签名参数（不进行 URL 编码，与 Python 实现一致）
    const aBogus = abSign(queryString, this.userAgent);
    apiUrl += `&a_bogus=${aBogus}`;

    try {
      const response = await axios.get(apiUrl, {
        headers: this.getHeaders(),
        proxy: this.proxy || undefined,
        timeout: 10000,
        validateStatus: (status) => status < 500, // 接受 4xx 状态码
      });

      if (response.status !== 200) {
        throw new Error(`API 请求失败: HTTP ${response.status}`);
      }

      const data = response.data as any;

      // 调试信息：输出响应结构
      if (!data || !data.data) {
        console.error('[DouyinApi] API 响应格式异常:', JSON.stringify(data).substring(0, 500));
        throw new Error('API 响应格式错误，可能需要 Cookie 或 API 已更新');
      }

      if (!data.data.data || data.data.data.length === 0) {
        // 检查是否有错误信息
        const errorMsg = data.data?.error_msg || data.error_msg || '未知错误';
        throw new Error(`直播间数据为空: ${errorMsg}（可能需要配置 Cookie）`);
      }

      const roomData = data.data.data[0];
      const userData = data.data.user;

      return {
        roomId,
        status: roomData.status, // ROOM_STATUS_LIVE = 直播中, ROOM_STATUS_OFFLINE = 未开播
        anchorName: userData?.nickname || '未知主播',
        title: roomData.title || '',
        streamUrl: roomData.stream_url,
        roomData,
      };
    } catch (error: any) {
      if (error.response) {
        // API 返回了错误响应
        if (error.response.status === 403 || error.response.status === 401) {
          throw new Error('API 请求被拒绝，可能需要 Cookie 或触发风控');
        }
        throw new Error(`API 错误: HTTP ${error.response.status} - ${error.response.statusText}`);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('API 请求超时');
      }
      throw new Error(`获取直播间信息失败: ${error.message}`);
    }
  }

  /**
   * 获取流 URL
   * @param roomInfo - 直播间信息
   * @param quality - 画质: 'origin' | 'uhd' | 'hd' | 'sd' | 'ld'
   * @returns 流 URL 信息
   */
  async getStreamUrls(roomInfo: RoomInfo, quality: VideoQuality = 'origin'): Promise<StreamInfo> {
    if (roomInfo.status !== ROOM_STATUS_LIVE) {
      return {
        isLive: false,
        message: '直播间未开播',
      };
    }

    if (!roomInfo.streamUrl) {
      throw new Error('无法获取流地址，可能是不支持的直播类型');
    }

    const streamUrl = roomInfo.streamUrl;
    const flvUrls = streamUrl.flv_pull_url || {};
    const hlsUrls = streamUrl.hls_pull_url_map || {};

    // 画质映射
    const qualityMap: Record<VideoQuality, string> = {
      origin: 'ORIGIN',
      uhd: 'uhd',
      hd: 'hd',
      sd: 'sd',
      ld: 'ld',
    };

    const qualityKey = qualityMap[quality] || 'ORIGIN';

    // 优先使用指定画质，如果没有则降级
    let flvUrl = flvUrls[qualityKey] || flvUrls.ORIGIN || Object.values(flvUrls)[0];
    let hlsUrl = hlsUrls[qualityKey] || hlsUrls.ORIGIN || Object.values(hlsUrls)[0];

    // 如果还是没有，尝试其他画质
    if (!flvUrl) {
      const availableQualities = Object.keys(flvUrls);
      if (availableQualities.length > 0) {
        flvUrl = flvUrls[availableQualities[0]];
        hlsUrl = hlsUrls[availableQualities[0]] || hlsUrl;
      }
    }

    if (!flvUrl && !hlsUrl) {
      throw new Error('无法获取有效的流地址');
    }

    return {
      isLive: true,
      anchorName: roomInfo.anchorName,
      title: roomInfo.title,
      quality: qualityKey,
      flvUrl,
      hlsUrl,
      recordUrl: hlsUrl || flvUrl, // 优先使用 HLS
      availableQualities: Object.keys(flvUrls),
    };
  }

  /**
   * 一键获取流 URL（组合方法）
   * @param url - 直播间 URL 或房间 ID
   * @param quality - 画质
   * @returns 流 URL 信息
   */
  async getStreamUrl(url: string, quality: VideoQuality = 'origin'): Promise<StreamInfo> {
    const roomId = extractRoomId(url);
    const roomInfo = await this.getRoomInfo(roomId);
    return await this.getStreamUrls(roomInfo, quality);
  }
}
