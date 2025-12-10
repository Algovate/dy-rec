# Douyin Live Recorder

抖音直播录制工具，支持 API 和浏览器两种模式，自动重连，多房间监控等功能。

## 特性

- **混合检测模式**: API 优先，失败时自动回退到浏览器模式
- **多格式支持**: 支持 FLV 和 M3U8 (HLS) 流录制
- **多种输出格式**: MP4、TS、Fragmented MP4，支持边录边播和中断安全
- **短视频下载**: 支持下载抖音短视频（支持短链和完整链接）
- **自动重连**: 录制中断时自动检测并重连
- **房间监控**: 自动监控多个直播间，开播时自动开始录制
- **分段录制**: 支持按时长分段录制，避免单个文件过大
- **多房间并发**: 支持同时录制多个直播间

## 要求

- Node.js 18+
- FFmpeg（需安装并配置到 PATH）
- npm 或 yarn

## 安装

```bash
git clone git@github.com:Algovate/dy-rec.git
cd dy-rec
npm install
npm run build
```

## 快速开始

```bash
# 录制单个直播间 (默认命令)
node dist/cli.js 379595210124
# 或者显式使用 record 命令
node dist/cli.js record 379595210124

# 开发模式（无需编译）
npm run dev 379595210124
```

**注意**: 使用 `npm start` 时需要用 `--` 分隔参数：`npm start -- 379595210124`

## 主要功能

### 直播录制

```bash
# 基本录制 (只需房间ID/URL)
node dist/cli.js 379595210124

# 指定输出目录
node dist/cli.js record 379595210124 -o ./videos

# 指定画质
node dist/cli.js record 379595210124 -q hd

# 使用 TS 格式（边录边播，中断安全）
node dist/cli.js record 379595210124 --format ts
```

### 分段录制

```bash
# 每 30 分钟自动分段（适合长时间录制）
node dist/cli.js record 379595210124 --segment --segment-duration 1800
```

### 短视频下载

```bash
# 下载短视频（支持短链）
node dist/cli.js download 'https://v.douyin.com/xxxxxx/'

# 指定输出文件名
node dist/cli.js download 'https://v.douyin.com/xxxxxx/' -o my_video.mp4
```

### 配置文件批量处理

```bash
# 批量检测并录制 (一次性执行)
node dist/cli.js batch

# 指定配置文件
node dist/cli.js batch -c /path/to/config.json
```

### 监听模式

```bash
# 自动监控配置中的房间，开播时自动录制
node dist/cli.js watch

# 指定检查间隔（秒）和配置文件
node dist/cli.js watch -i 30 -c config.json
```

## 文档

- [使用指南](docs/usage.md) - 详细的命令选项和使用示例
- [配置说明](docs/configuration.md) - 配置文件详解
- [开发指南](docs/development.md) - 项目结构和开发说明
- [故障排除](docs/troubleshooting.md) - 常见问题和解决方案

## 许可证

MIT
