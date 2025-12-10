/**
 * Application constants
 */

export const DEFAULT_OUTPUT_DIR = './output/downloads';
export const DEFAULT_RECORDINGS_DIR = './output/recordings';
export const DEFAULT_CONFIG_PATH = 'config/config.json';

export const DEFAULT_DETECTION_MODE = 'hybrid';
export const DEFAULT_QUALITY = 'origin';
export const DEFAULT_FORMAT = 'fmp4';
export const DEFAULT_SEGMENT_DURATION = 3600; // 1 hour in seconds

export const DEFAULT_WATCH_INTERVAL = 60; // seconds
export const DEFAULT_MAX_CONCURRENT_TASKS = 5;
export const DEFAULT_TIMEOUT = 30000; // milliseconds
export const DEFAULT_DOWNLOAD_TIMEOUT = 30000; // milliseconds

export const DEFAULT_RECONNECT_MAX_RETRIES = 3;
export const DEFAULT_RECONNECT_RETRY_DELAY = 5000; // milliseconds
export const DEFAULT_MONITOR_CHECK_INTERVAL = 5000; // milliseconds

export const FFMPEG_TIMEOUT = 10000000; // 10 seconds in microseconds
export const FFMPEG_RW_TIMEOUT = 10000000; // 10 seconds in microseconds

export const ROOM_STATUS_LIVE = 2;
export const ROOM_STATUS_OFFLINE = 4;

export const VALID_DETECTION_MODES = ['api', 'browser', 'hybrid'] as const;
export const VALID_QUALITIES = ['origin', 'uhd', 'hd', 'sd', 'ld'] as const;
export const VALID_OUTPUT_FORMATS = ['mp4', 'ts', 'fmp4'] as const;

export const DOUYIN_LIVE_BASE_URL = 'https://live.douyin.com';
export const DOUYIN_VIDEO_BASE_URL = 'https://www.douyin.com';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

export const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const DEFAULT_COOKIE =
  'ttwid=1%7C2iDIYVmjzMcpZ20fcaFde0VghXAA3NaNXE_SLR68IyE%7C1761045455%7Cab35197d5cfb21df6cbb2fa7ef1c9262206b062c315b9d04da746d0b37dfbc7d';
