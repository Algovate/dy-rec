/**
 * URL filtering utilities for stream detection
 * Centralizes logic for identifying and filtering stream URLs
 */

export type StreamType = 'flv' | 'hls' | 'dash' | 'other';

/**
 * Non-stream URL patterns to exclude
 */
const NON_STREAM_PATTERNS = [
  '/api/',
  '/webcast/',
  '/aweme/',
  '/solution/',
  'config',
  'setting',
  'user/',
  'gift/',
  'ranklist/',
  'lottery/',
  'im/',
  'privilege/',
  'emoji',
  'short_touch',
  'interaction/',
  'luckybox/',
  'banner',
  'ab/params',
  'get/user/settings',
] as const;

/**
 * Check if URL matches non-stream patterns
 */
export function isNonStreamUrl(url: string): boolean {
  return NON_STREAM_PATTERNS.some((pattern) => url.includes(pattern));
}

/**
 * Detect stream type from URL
 */
export function detectStreamType(url: string): StreamType | null {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('.flv')) {
    return 'flv';
  }
  if (urlLower.includes('.m3u8')) {
    return 'hls';
  }
  if (urlLower.includes('.mpd')) {
    return 'dash';
  }

  // Check for stream-like patterns but exclude non-stream URLs
  if ((url.includes('pull') || url.includes('stream')) && !isNonStreamUrl(url)) {
    // Must have file extension or be a media resource
    if (urlLower.includes('.flv') || urlLower.includes('.m3u8') || urlLower.includes('.mpd')) {
      return urlLower.includes('.flv') ? 'flv' : urlLower.includes('.m3u8') ? 'hls' : 'dash';
    }
  }

  return null;
}

/**
 * Check if URL is a valid stream URL
 */
export function isStreamUrl(url: string): boolean {
  return detectStreamType(url) !== null;
}

/**
 * Check if URL matches stream-like patterns (for request interception)
 * More permissive than isStreamUrl - used for initial filtering
 */
export function matchesStreamPattern(url: string): boolean {
  if (isNonStreamUrl(url)) {
    return false;
  }

  return (
    url.includes('.flv') ||
    url.includes('.m3u8') ||
    url.includes('.mpd') ||
    (url.includes('pull') && url.includes('.flv')) ||
    (url.includes('stream') && (url.includes('.flv') || url.includes('.m3u8')))
  );
}

/**
 * Detect stream type from content type header
 */
export function detectStreamTypeFromContentType(contentType: string): StreamType | null {
  const ct = contentType.toLowerCase();

  if (ct.includes('video/x-flv') || ct.includes('application/x-flv')) {
    return 'flv';
  }
  if (ct.includes('application/vnd.apple.mpegurl') || ct.includes('application/x-mpegurl')) {
    return 'hls';
  }
  if (ct.includes('application/dash+xml')) {
    return 'dash';
  }

  return null;
}
