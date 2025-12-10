declare module 'fluent-ffmpeg' {
  import { EventEmitter } from 'events';

  export interface FfmpegCommand extends EventEmitter {
    input(input: string | number): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    inputOptions(options: string[]): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    audioBitrate(bitrate: string): FfmpegCommand;
    audioFrequency(freq: number): FfmpegCommand;
    audioChannels(channels: number): FfmpegCommand;
    noVideo(): FfmpegCommand;
    noAudio(): FfmpegCommand;
    format(format: string): FfmpegCommand;
    output(output: string): FfmpegCommand;
    run(): FfmpegCommand;
    kill(signal?: string): void;
    on(event: 'start', listener: (commandLine: string) => void): FfmpegCommand;
    on(event: 'progress', listener: (progress: any) => void): FfmpegCommand;
    on(event: 'end', listener: () => void): FfmpegCommand;
    on(
      event: 'error',
      listener: (err: Error, stdout: string, stderr: string) => void
    ): FfmpegCommand;
    on(event: 'stderr', listener: (stderrLine: string) => void): FfmpegCommand;
  }

  function ffmpeg(input?: string | number): FfmpegCommand;
  export default ffmpeg;
}
