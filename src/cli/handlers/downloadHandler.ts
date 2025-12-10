import chalk from 'chalk';
import path from 'node:path';
import { VideoDownloader } from '../../download/videoDownloader.js';
import { getTimestamp } from '../../utils.js';
import { DEFAULT_RECORDINGS_DIR, DEFAULT_DOWNLOAD_TIMEOUT } from '../../constants.js';

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

  console.log(chalk.blue('\n=== Douyin Video Downloader ===\n'));
  console.log(chalk.cyan(`URL: ${url}`));
  console.log(chalk.cyan(`Output directory: ${outdir}\n`));

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

  const result = await downloader.download(url, outputPath);

  if (result.success) {
    // If output filename not specified, rename based on video ID
    if (!output && result.videoId !== 'unknown') {
      const newPath = path.join(path.dirname(outputPath), `${result.videoId}.mp4`);
      try {
        const fs = await import('node:fs/promises');
        await fs.rename(outputPath, newPath);
        console.log(chalk.green(`\n✓ 下载完成: ${newPath}`));
      } catch {
        console.log(chalk.green(`\n✓ 下载完成: ${outputPath}`));
      }
    } else {
      console.log(chalk.green(`\n✓ 下载完成: ${outputPath}`));
    }
  } else {
    console.error(chalk.red(`\n✗ 下载失败: ${result.error}`));
    process.exit(1);
  }
}
