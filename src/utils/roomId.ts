/**
 * Room ID extraction utilities
 */

/**
 * Extract room ID from URL or return the ID if it's already a numeric ID
 */
export function extractRoomId(roomIdOrUrl: string): string {
  // If it's already a numeric ID, return it
  if (/^\d+$/.test(roomIdOrUrl)) {
    return roomIdOrUrl;
  }

  // Try to extract from live.douyin.com URL
  const liveMatch = roomIdOrUrl.match(/live\.douyin\.com\/(\d+)/);
  if (liveMatch) {
    return liveMatch[1];
  }

  // Try to extract from path segments
  try {
    const url = new URL(roomIdOrUrl);
    const pathParts = url.pathname.split('/').filter((p) => p);
    const lastPart = pathParts[pathParts.length - 1];
    if (/^\d+$/.test(lastPart)) {
      return lastPart;
    }
  } catch {
    // Not a valid URL, continue
  }

  throw new Error(`无法从 URL 中提取房间 ID: ${roomIdOrUrl}`);
}

/**
 * Validate if a string is a valid room ID
 */
export function isValidRoomId(roomId: string): boolean {
  return /^\d+$/.test(roomId);
}
