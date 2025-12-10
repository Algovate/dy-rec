---
noteId: "e8577de0d58511f0bf70918e0fb39307"
tags: []

---

# 配置说明

## 配置文件位置

默认配置文件路径：`config/config.json`

## 配置文件示例

```json
{
  "mode": "hybrid",
  "output": {
    "dir": "./downloads",
    "format": "fmp4",
    "segmentDuration": 3600,
    "segmentEnabled": false
  },
  "recording": {
    "quality": "origin",
    "reconnect": true,
    "maxRetries": 3,
    "retryDelay": 5000
  },
  "watch": {
    "enabled": false,
    "interval": 60,
    "autoStart": true
  },
  "rooms": [
    {
      "url": "https://live.douyin.com/379595210124",
      "quality": "origin",
      "enabled": true
    }
  ],
  "api": {
    "cookies": "",
    "proxy": null
  },
  "browser": {
    "headless": true
  }
}
```

## 配置项说明

### `mode`

检测模式，可选值：
- `hybrid`: API 优先，失败时自动回退到浏览器模式（推荐）
- `api`: 仅使用 API 模式
- `browser`: 仅使用浏览器模式

### `output`

输出配置：

- `dir`: 输出目录路径
- `format`: 输出格式，可选值：`mp4`, `ts`, `fmp4`
- `segmentDuration`: 分段时长（秒）
- `segmentEnabled`: 是否启用分段录制

### `recording`

录制配置：

- `quality`: 画质，可选值：`origin`, `uhd`, `hd`, `sd`, `ld`
- `reconnect`: 是否自动重连
- `maxRetries`: 最大重试次数
- `retryDelay`: 重试延迟（毫秒）

### `watch`

监听配置：

- `enabled`: 是否启用监听模式
- `interval`: 检查间隔（秒）
- `autoStart`: 开播时是否自动开始录制

### `rooms`

房间列表，每个房间包含：

- `url`: 直播间 URL
- `quality`: 画质设置
- `enabled`: 是否启用

### `api`

API 配置：

- `cookies`: API 模式需要的 Cookie
- `proxy`: 代理设置（可选）

### `browser`

浏览器配置：

- `headless`: 是否使用无头模式

## 使用配置文件

```bash
# 使用默认配置文件
node dist/cli.js config

# 指定配置文件
node dist/cli.js config -f /path/to/config.json

# 启用监听模式
node dist/cli.js config --watch
```

