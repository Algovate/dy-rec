/**
 * Stream URL collector for browser-based detection
 * Manages collection and organization of detected stream URLs
 */

import {
  detectStreamType,
  detectStreamTypeFromContentType,
  matchesStreamPattern,
} from '../utils/urlFilter.js';

export type StreamType = 'flv' | 'hls' | 'dash' | 'other';

export interface StreamCollection {
  flvUrls: string[];
  hlsUrls: string[];
  dashUrls: string[];
  allUrls: string[];
}

/**
 * Collects and organizes stream URLs detected from browser
 */
export class StreamCollector {
  private flvUrls: Set<string> = new Set();
  private hlsUrls: Set<string> = new Set();
  private dashUrls: Set<string> = new Set();
  private onStreamDetected?: (type: string, url: string) => void;

  constructor(onStreamDetected?: (type: string, url: string) => void) {
    this.onStreamDetected = onStreamDetected;
  }

  /**
   * Add a stream URL from request
   */
  addFromRequest(url: string, resourceType?: string): void {
    const streamType = detectStreamType(url);

    if (!streamType) {
      // Check if it matches stream patterns but exclude non-stream URLs
      if (matchesStreamPattern(url) && resourceType === 'media') {
        this.addUrl(url, 'other');
      }
      return;
    }

    this.addUrl(url, streamType);
  }

  /**
   * Add a stream URL from response
   */
  addFromResponse(url: string, contentType?: string): void {
    let streamType: StreamType | null = null;

    // Try content type first
    if (contentType) {
      streamType = detectStreamTypeFromContentType(contentType);
    }

    // Fall back to URL detection
    if (!streamType) {
      streamType = detectStreamType(url);
    }

    if (streamType) {
      this.addUrl(url, streamType);
    }
  }

  /**
   * Add URL to appropriate collection
   */
  private addUrl(url: string, type: StreamType): void {
    let added = false;

    switch (type) {
      case 'flv':
        if (!this.flvUrls.has(url)) {
          this.flvUrls.add(url);
          added = true;
        }
        break;
      case 'hls':
        if (!this.hlsUrls.has(url)) {
          this.hlsUrls.add(url);
          added = true;
        }
        break;
      case 'dash':
        if (!this.dashUrls.has(url)) {
          this.dashUrls.add(url);
          added = true;
        }
        break;
      case 'other':
        // Add to all collections for now
        if (!this.flvUrls.has(url) && !this.hlsUrls.has(url) && !this.dashUrls.has(url)) {
          this.flvUrls.add(url); // Default to FLV collection
          added = true;
        }
        break;
    }

    if (added && this.onStreamDetected) {
      console.log(`[Stream Detected] ${type.toUpperCase()}: ${url}`);
      this.onStreamDetected(type, url);
    }
  }

  /**
   * Get all collected URLs as arrays
   */
  getCollection(): StreamCollection {
    return {
      flvUrls: Array.from(this.flvUrls),
      hlsUrls: Array.from(this.hlsUrls),
      dashUrls: Array.from(this.dashUrls),
      allUrls: Array.from(new Set([...this.flvUrls, ...this.hlsUrls, ...this.dashUrls])),
    };
  }

  /**
   * Get FLV URLs
   */
  getFlvUrls(): string[] {
    return Array.from(this.flvUrls);
  }

  /**
   * Get HLS URLs
   */
  getHlsUrls(): string[] {
    return Array.from(this.hlsUrls);
  }

  /**
   * Get DASH URLs
   */
  getDashUrls(): string[] {
    return Array.from(this.dashUrls);
  }

  /**
   * Get all URLs
   */
  getAllUrls(): string[] {
    return Array.from(new Set([...this.flvUrls, ...this.hlsUrls, ...this.dashUrls]));
  }

  /**
   * Select best quality URL
   * Priority: HLS > FLV (HD > SD > LD) > DASH
   */
  getBestQualityUrl(): string | null {
    const collection = this.getCollection();

    // Prefer HLS (more stable)
    if (collection.hlsUrls.length > 0) {
      return collection.hlsUrls[0];
    }

    // Then FLV with quality preference
    if (collection.flvUrls.length > 0) {
      const hdUrl = collection.flvUrls.find((url) => url.includes('_hd.flv') || url.includes('hd'));
      const sdUrl = collection.flvUrls.find((url) => url.includes('_sd.flv') || url.includes('sd'));
      const ldUrl = collection.flvUrls.find((url) => url.includes('_ld') || url.includes('ld'));
      const or4Url = collection.flvUrls.find((url) => url.includes('_or4'));

      return hdUrl || or4Url || sdUrl || ldUrl || collection.flvUrls[0];
    }

    // Finally DASH
    if (collection.dashUrls.length > 0) {
      return collection.dashUrls[0];
    }

    return null;
  }

  /**
   * Check if any URLs collected
   */
  hasUrls(): boolean {
    return this.flvUrls.size > 0 || this.hlsUrls.size > 0 || this.dashUrls.size > 0;
  }

  /**
   * Clear all collected URLs
   */
  clear(): void {
    this.flvUrls.clear();
    this.hlsUrls.clear();
    this.dashUrls.clear();
  }
}
