import chalk from 'chalk';
import path from 'node:path';
import { VideoDownloader } from '../../download/videoDownloader.js';
import { getTimestamp } from '../../utils/index.js';
import { DEFAULT_RECORDINGS_DIR, DEFAULT_DOWNLOAD_TIMEOUT } from '../../constants.js';
import { Logger } from '../../utils/logger.js';
import { writeDownloadMetadata } from '../../utils/metadataWriter.js';

export interface DownloadOptions {
  url: string;
  output?: string;
  outdir?: string;
  timeout?: number;
  headless?: boolean;
}

/**
 * Download video handler
 */
export async function downloadVideo(options: DownloadOptions): Promise<void> {
  const { url, output, outdir = DEFAULT_RECORDINGS_DIR, timeout, headless } = options;

  Logger.log(chalk.blue('\n=== Douyin Video Downloader ===\n'));
  Logger.verbose(`URL: ${url}`);
  Logger.verbose(`Output directory: ${outdir}\n`);

  const downloader = new VideoDownloader({
    headless: headless !== false, // Default headless mode, show browser when --headful
    timeout: timeout ? timeout * 1000 : DEFAULT_DOWNLOAD_TIMEOUT,
  });

  // Determine output path
  let outputPath: string;
  if (output) {
    // If full output filename is specified
    outputPath = output.includes(path.sep) ? output : path.join(outdir, output);
  } else {
    // Temporary path, will be renamed after download based on video ID
    const timestamp = getTimestamp();
    outputPath = path.join(outdir, `douyin_video_${timestamp}.mp4`);
  }

  const downloadStartTime = new Date().toISOString();
  const result = await downloader.download(url, outputPath);
  const downloadEndTime = new Date().toISOString();
  const downloadDuration = Math.floor(
    (new Date(downloadEndTime).getTime() - new Date(downloadStartTime).getTime()) / 1000
  );

  if (result.success) {
    let finalPath = outputPath;

    // If output filename not specified, rename based on video ID
    if (!output && result.videoId !== 'unknown') {
      const newPath = path.join(path.dirname(outputPath), `${result.videoId}.mp4`);
      try {
        const fs = await import('node:fs/promises');
        await fs.rename(outputPath, newPath);
        finalPath = newPath;
        Logger.success(`\n✓ 下载完成: ${finalPath}`);
      } catch {
        Logger.success(`\n✓ 下载完成: ${outputPath}`);
      }
    } else {
      Logger.success(`\n✓ 下载完成: ${outputPath}`);
    }

    // Write metadata file
    try {
      await writeDownloadMetadata(finalPath, {
        videoId: result.videoId,
        anchorName: result.metadata?.anchorName || 'unknown',
        title: result.metadata?.title || 'unknown',
        description: result.metadata?.description,
        publishTime: result.metadata?.publishTime,
        publishTimestamp: result.metadata?.publishTimestamp,
        publishTimeISO: result.metadata?.publishTimeISO,
        sourceUrl: result.sourceUrl,
        finalUrl: result.finalUrl,
        videoUrl: result.videoUrl,
        stats: result.metadata?.stats,
        download: {
          startTime: downloadStartTime,
          endTime: downloadEndTime,
          duration: downloadDuration,
        },
        file: {
          size: result.fileSize || 0,
        },
      });
    } catch (error: any) {
      Logger.verbose(`[Download Handler] Failed to write metadata: ${error.message}`);
      // Don't fail the download if metadata writing fails
    }
  } else {
    Logger.error(`\n✗ 下载失败: ${result.error}`);
    process.exit(1);
  }
}
