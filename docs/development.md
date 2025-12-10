# 开发指南

## 项目结构

```
src/
├── api/              # API 客户端
├── config/           # 配置管理
├── download/         # 短视频下载模块
├── monitor/          # 监控模块
├── recorders/        # 录制器
├── types/            # 类型定义
├── cli.ts            # CLI 入口
└── utils.ts          # 工具函数
```

## 开发命令

```bash
# 编译 TypeScript
npm run build

# 开发模式（直接运行 TS，无需编译）
npm run dev record -r 379595210124

# 代码检查
npm run lint

# 自动修复代码问题
npm run lint:fix

# 格式化代码
npm run format

# 检查代码格式
npm run format:check

# 类型检查（不生成文件）
npm run type-check
```

## TypeScript 配置

项目使用 TypeScript 编写，配置文件为 `tsconfig.json`。

**重要**: 请使用 `npm run build` 或 `tsc`（不带参数）来编译项目，不要直接运行 `tsc src/cli.ts`，因为那样不会使用 `tsconfig.json` 配置。

## 开发流程

1. 克隆项目并安装依赖
2. 使用 `npm run dev` 进行开发（无需编译）
3. 使用 `npm run lint` 检查代码
4. 使用 `npm run build` 编译项目
5. 测试编译后的代码

