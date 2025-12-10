/**
 * Stream URL Utilities
 * Centralized handling of stream URL manipulation and validation
 */

import axios from 'axios';

export type StreamType = 'flv' | 'm3u8' | 'other';

/**

 * Convert HTTP URL to HTTPS
 * Douyin CDN blocks plain HTTP connections on port 80
 */
export function toHttps(url: string): string {
    return url.replace(/^http:\/\//i, 'https://');
}

/**
 * Detect stream type from URL
 */
export function getStreamType(url: string): StreamType {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('.flv')) {
        return 'flv';
    }
    if (urlLower.includes('.m3u8')) {
        return 'm3u8';
    }
    return 'other';
}

/**
 * Check if URL is a valid stream URL format
 */
export function isStreamUrl(url: string): boolean {
    const type = getStreamType(url);
    return type === 'flv' || type === 'm3u8';
}

/**
 * Validate stream URL connectivity
 * Uses HEAD request; treats 200 and 405 as valid (CDN doesn't support HEAD but resource exists)
 */
export async function validateStreamUrl(url: string): Promise<{ valid: boolean; status: number }> {
    try {
        const response = await axios.head(url, {
            timeout: 5000,
            validateStatus: () => true,
        });
        const status = response.status;
        // 200 = accessible, 405 = resource exists but HEAD not allowed
        const valid = status === 200 || status === 405;
        return { valid, status };
    } catch (error: any) {
        return { valid: false, status: 0 };
    }
}
