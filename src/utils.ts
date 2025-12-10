import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 确保目录存在
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * 清理临时文件
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
  } catch (error: any) {
    // 忽略清理错误
    console.warn('Warning: Failed to cleanup temp files:', error.message);
  }
}

/**
 * 生成安全的文件名
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

/**
 * 获取时间戳字符串
 */
export function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}
