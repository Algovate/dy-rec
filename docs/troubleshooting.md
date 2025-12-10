# 故障排除

## npm start 参数问题

使用 `npm start` 时需要用 `--` 分隔参数：

```bash
# ❌ 错误
npm start record -r 379595210124

# ✅ 正确
npm start -- record -r 379595210124

# ✅ 或直接运行编译后的代码
node dist/cli.js record -r 379595210124
```

## FFmpeg 未找到

确保 FFmpeg 已安装并配置到 PATH:

```bash
ffmpeg -version
```

如果未安装，请根据你的操作系统安装 FFmpeg：

- **macOS**: `brew install ffmpeg`
- **Ubuntu/Debian**: `sudo apt install ffmpeg`
- **Windows**: 从 [FFmpeg 官网](https://ffmpeg.org/download.html) 下载并配置到 PATH

## 编译错误

如果遇到编译错误，确保使用正确的命令：

```bash
# ✅ 正确：使用 npm run build
npm run build

# ❌ 错误：直接运行 tsc src/cli.ts（不会使用 tsconfig.json）
tsc src/cli.ts
```

## API 模式失败

推荐使用 `hybrid` 模式（默认），它会自动在 API 模式失败时回退到浏览器模式。

如果强制使用 `-m api` 模式失败，可能的原因：

1. **需要 Cookie**: 抖音 API 可能有反爬虫机制，需要配置 Cookie
   ```bash
   node dist/cli.js record -r 379595210124 -m api --cookies "your_cookie_here"
   ```

2. **API 已更新**: 抖音可能更新了 API 格式，此时应使用浏览器模式

3. **网络问题**: 检查网络连接和防火墙设置

**建议**: 使用默认的 `hybrid` 模式，无需额外配置即可正常工作。

## 输出路径重复问题

如果遇到 `downloads/downloads/` 这样的重复路径，这通常是因为路径处理问题。确保：

1. 配置文件中的 `output.dir` 是相对路径（如 `./downloads`）
2. 使用最新版本的代码（已修复此问题）

## 录制中断

如果录制经常中断，可以尝试：

1. 使用 `--format fmp4` 或 `--format ts` 格式（中断安全）
2. 启用自动重连（配置文件中设置 `reconnect: true`）
3. 检查网络连接稳定性
4. 使用分段录制（`--segment`）

## 浏览器模式启动失败

如果浏览器模式启动失败：

1. 确保已安装 Chromium/Chrome
2. 检查系统权限设置
3. 尝试使用 `--headful` 选项查看浏览器窗口（如果支持）
4. 检查防火墙和代理设置

