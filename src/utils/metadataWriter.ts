import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from './logger.js';

export interface RecordingMetadata {
  type: 'recording';
  roomId: string;
  anchorName: string;
  title: string;
  streamInfo: {
    mode: string;
    quality: string;
    recordUrl: string;
    flvUrl?: string;
    hlsUrl?: string | null;
    availableQualities?: string[];
  };
  recording: {
    startTime: string;
    endTime?: string;
    duration?: number;
    format: string;
    audioOnly: boolean;
    videoOnly: boolean;
    segmentEnabled: boolean;
  };
  file: {
    filename: string;
    path: string;
    size?: number;
  };
  version: string;
}

export interface DownloadMetadata {
  type: 'download';
  videoId: string;
  anchorName: string;
  title: string;
  description?: string;
  publishTime?: string;
  publishTimestamp?: number;
  publishTimeISO?: string;
  sourceUrl: string;
  finalUrl: string;
  videoUrl: string;
  stats?: {
    likes?: string;
    comments?: string;
    shares?: string;
    views?: string;
  };
  download: {
    startTime: string;
    endTime: string;
    duration: number;
  };
  file: {
    filename: string;
    path: string;
    size: number;
  };
  version: string;
}

/**
 * Get metadata file path for a video file
 */
export function getMetadataPath(videoPath: string): string {
  return `${videoPath}.json`;
}

/**
 * Write recording metadata to file
 */
export async function writeRecordingMetadata(
  videoPath: string,
  metadata: Omit<RecordingMetadata, 'file' | 'type' | 'version'> & { file: Partial<RecordingMetadata['file']> }
): Promise<void> {
  try {
    const filename = path.basename(videoPath);
    
    // Get file size if file exists
    let fileSize: number | undefined;
    try {
      const stats = await fs.stat(videoPath);
      fileSize = stats.size;
    } catch {
      // File doesn't exist yet or can't be accessed, ignore
    }

    const fullMetadata: RecordingMetadata = {
      type: 'recording',
      ...metadata,
      file: {
        filename,
        path: videoPath,
        size: fileSize ?? metadata.file.size,
      },
      version: '0.1.0',
    };

    const metadataPath = getMetadataPath(videoPath);
    await fs.writeFile(metadataPath, JSON.stringify(fullMetadata, null, 2), 'utf-8');
    Logger.verbose(`[Metadata] Written recording metadata to ${metadataPath}`);
  } catch (error: any) {
    Logger.error(`[Metadata] Failed to write recording metadata: ${error.message}`);
    // Don't throw - metadata is optional
  }
}

/**
 * Write download metadata to file
 */
export async function writeDownloadMetadata(
  videoPath: string,
  metadata: Omit<DownloadMetadata, 'file' | 'type' | 'version'> & { file: Partial<DownloadMetadata['file']> }
): Promise<void> {
  try {
    const filename = path.basename(videoPath);
    
    // Get file size if file exists
    let fileSize: number | undefined;
    try {
      const stats = await fs.stat(videoPath);
      fileSize = stats.size;
    } catch {
      // File doesn't exist yet or can't be accessed, use provided size
      fileSize = metadata.file.size;
    }

    if (fileSize === undefined) {
      Logger.verbose(`[Metadata] Warning: Could not determine file size for ${videoPath}`);
    }

    const fullMetadata: DownloadMetadata = {
      type: 'download',
      ...metadata,
      file: {
        filename,
        path: videoPath,
        size: fileSize ?? 0,
      },
      version: '0.1.0',
    };

    const metadataPath = getMetadataPath(videoPath);
    await fs.writeFile(metadataPath, JSON.stringify(fullMetadata, null, 2), 'utf-8');
    Logger.verbose(`[Metadata] Written download metadata to ${metadataPath}`);
  } catch (error: any) {
    Logger.error(`[Metadata] Failed to write download metadata: ${error.message}`);
    // Don't throw - metadata is optional
  }
}

