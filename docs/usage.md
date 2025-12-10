---
noteId: "e65cbf50d58511f0bf70918e0fb39307"
tags: []

---

# 使用指南

## 基本命令

```bash
# 录制单个直播间
node dist/cli.js record -r 379595210124

# 开发模式（无需编译）
npm run dev record -r 379595210124
```

**注意**: 使用 `npm start` 时需要用 `--` 分隔参数：`npm start -- record -r 379595210124`

## 命令选项

### `record` - 单房间录制

```bash
node dist/cli.js record -r <roomId> [options]
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-r, --room <roomId>` | 抖音直播间 ID 或 URL | - |
| `-o, --output <dir>` | 输出目录 | `./downloads` |
| `-m, --mode <mode>` | 检测模式: `api`, `browser`, `hybrid` | `hybrid` |
| `-q, --quality <quality>` | 画质: `origin`, `uhd`, `hd`, `sd`, `ld` | `origin` |
| `--format <format>` | 输出格式: `mp4`, `ts`, `fmp4` | `fmp4` |
| `--video-only` | 仅录制视频 | - |
| `--audio-only` | 仅录制音频 | - |
| `-d, --duration <seconds>` | 录制时长（秒），不指定则持续录制 | - |
| `--segment` | 启用分段录制 | - |
| `--segment-duration <sec>` | 分段时长（秒） | - |
| `--cookies <cookies>` | API 模式需要的 Cookie | - |

#### 检测模式说明

- `hybrid`: API 优先，失败时自动回退到浏览器模式（推荐）
- `api`: 仅使用 API 模式（可能需要 Cookie）
- `browser`: 仅使用浏览器模式（较慢但可靠）

#### 输出格式说明

- `fmp4`: Fragmented MP4，支持边录边播，中断安全（推荐）
- `ts`: MPEG-TS 格式，支持边录边播，中断安全
- `mp4`: 标准 MP4 格式，兼容性最好，但中断会丢失数据

### `config` - 配置文件模式

```bash
node dist/cli.js config [options]
```

**选项**:

- `-f, --file <path>`: 配置文件路径 (默认: `config/config.json`)
- `--watch`: 启用监听模式

### `watch` - 监听模式

```bash
node dist/cli.js watch [options]
```

**选项**:

- `-f, --file <path>`: 配置文件路径 (默认: `config/config.json`)
- `-i, --interval <sec>`: 检查间隔（秒）

### `download` - 短视频下载

```bash
node dist/cli.js download -u <url> [options]
```

**选项**:

- `-u, --url <url>`: 抖音视频链接（必填，支持短链和完整链接）
- `-o, --output <file>`: 输出文件名
- `--outdir <dir>`: 输出目录 (默认: `./recordings`)
- `--timeout <seconds>`: 超时时间（秒）(默认: 30)
- `--headful`: 显示浏览器窗口（用于调试）

## 输出格式选择

| 格式 | 边录边播 | 中断安全 | 兼容性 | 推荐场景 |
|------|---------|---------|--------|---------|
| fmp4 (默认) | ✅ | ✅ | ⭐⭐⭐ | 大多数场景（推荐） |
| ts | ✅ | ✅ | ⭐⭐ | 需要最大中断安全性 |
| mp4 | ❌ | ❌ | ⭐⭐⭐ | 短时间录制，追求最大兼容性 |
| 分段录制 | ✅ | ✅ | ⭐⭐⭐ | 超长时间录制（数小时） |

### 长时间录制建议

- **1-2 小时**: 使用 `--format fmp4` 或 `--format ts`
- **数小时**: 使用 `--segment --segment-duration 1800`（每 30 分钟一段）

## 常用示例

### 录制单个直播间

```bash
node dist/cli.js record -r 379595210124 -o ./videos
```

### 仅录制音频

```bash
node dist/cli.js record -r 379595210124 --audio-only
```

### 使用 TS 格式（边录边播，中断安全）

```bash
node dist/cli.js record -r 379595210124 --format ts
```

### 分段录制（每 30 分钟一段）

```bash
node dist/cli.js record -r 379595210124 --segment --segment-duration 1800
```

### 使用配置文件

```bash
node dist/cli.js config
```

### 监听模式（自动监控房间，开播时自动录制）

```bash
node dist/cli.js watch
```

### 下载短视频

```bash
# 支持短链
node dist/cli.js download -u 'https://v.douyin.com/xxxxxx/'

# 完整链接
node dist/cli.js download -u 'https://www.douyin.com/video/1234567890'

# 指定输出文件名
node dist/cli.js download -u 'https://v.douyin.com/xxxxxx/' -o my_video.mp4

# 指定输出目录
node dist/cli.js download -u 'https://v.douyin.com/xxxxxx/' --outdir downloads
```

