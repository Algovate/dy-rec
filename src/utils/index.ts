/**
 * Utility functions
 * Re-exports from specialized utility modules
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Cleanup temporary files
 */
export async function cleanupTempFiles(dirPath: string): Promise<void> {
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.m3u8'))) {
        await fs.unlink(filePath);
      }
    }
  } catch (error: unknown) {
    console.warn('Warning: Failed to cleanup temp files:', (error as Error).message);
  }
}

/**
 * Generate safe filename
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

/**
 * Get timestamp string
 */
export function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

// Re-export from specialized modules
export * from './roomId.js';
export * from './errors.js';
export * from './streamUrl.js';
