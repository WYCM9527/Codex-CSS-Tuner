# Cursor CSS Tuner

Cursor 扩展：在内置浏览器里点选元素、可视化调 CSS、实时预览，确定性写回源码并可逐条还原。

使用说明、支持范围和限制见 [packages/extension/README.md](packages/extension/README.md)；这份文档讲开发。

## 仓库结构

| 目录 | 内容 |
| --- | --- |
| `packages/protocol` | 扩展、页面脚本、面板之间的消息类型和数值工具（颜色、单位换算、刻度） |
| `packages/engine` | 写回引擎：Tailwind 类名改写、CSS 规则改写、CSS 变量、CSS Modules 类名映射；纯函数，单元测试最多 |
| `packages/bridge` | 注入到页面里的脚本：点选、高亮、样式快照（命中规则和胜出声明）、预览、应用后校验、元素到源码的定位（React 调试信息 + sourcemap，Next.js 走开发服务器接口） |
| `packages/panel` | 侧栏 webview 面板（React） |
| `packages/extension` | 扩展本体：内置浏览器适配、会话通道、写回计划、改动清单、应用与还原、交给 Agent、自检 |
| `fixtures/` | 端到端测试用的小项目：`tw-react`（Vite + Tailwind 4）、`react-css`（Vite + 普通 CSS / CSS Modules）、`next16`（Next.js 16 App Router）、`static-html` |
| `spike/` | Phase 0 的可行性验证脚本（不参与构建） |

一次调参的数据流：扩展用 Cursor 内置浏览器的 CDP 命令把 `bridge` 注入页面 → 页面经带 token 的 WebSocket 连回扩展 → 选中元素时页面上报样式快照和源码位置 → 扩展为每个属性规划写回目标（Tailwind 类名 / CSS 规则 / 变量定义 / 交给 Agent）→ 拖动时页面只做预览 → 应用时 `engine` 计算文本改动、直接写盘 → 页面等热更新并核对计算样式 → 还原时按快照或语义回退。

## 开发

需要 Node 22、pnpm 11（`corepack enable` 后按 `packageManager` 自动取版本）和最新版 Cursor。

```bash
pnpm install
pnpm build       # bridge → panel → extension
pnpm typecheck
pnpm test
pnpm package     # 产出 packages/extension/dist/cursor-css-tuner.vsix
```

在 Cursor 里调试扩展：先 `pnpm build`，再用开发模式打开一个 fixture 窗口：

```bash
cursor --extensionDevelopmentPath="$PWD/packages/extension" --new-window "$PWD/fixtures/tw-react"
```

fixture 的开发服务器各自启动（`pnpm --filter fixture-tw-react dev`、`pnpm --filter fixture-next16 dev` 等）。改了 `bridge` 或 `panel` 之后要重新 `pnpm build`，扩展构建时会把它们复制进 `packages/extension/media/`。

面板可以脱离 Cursor 在浏览器里调：`pnpm --filter @css-tuner/panel dev`，页面里用模拟宿主驱动。

## 端到端自测

CI 跑不了内置浏览器，端到端测试在本机的 Cursor 里跑：扩展以开发模式启动时，如果 `packages/extension/selftest.json` 存在，就按里面的步骤执行，把结果写到 `out` 指定的文件，跑完可选关闭窗口。正式安装的扩展不会读这个文件，打包时也会排除它。

```json
{
  "out": "/tmp/css-tuner-e2e.json",
  "closeWindow": true,
  "steps": [
    { "do": "backup", "files": ["/abs/path/fixtures/tw-react/src/App.tsx"] },
    { "do": "open", "url": "http://127.0.0.1:5411/" },
    { "do": "select", "selector": "[data-testid=header]", "props": ["padding-left"] },
    { "do": "edit", "props": ["padding-left", "padding-right"], "value": "2rem", "token": "8", "phase": "commit" },
    { "do": "apply" },
    { "do": "fileLine", "file": "/abs/path/fixtures/tw-react/src/App.tsx", "line": 14 },
    { "do": "revert", "index": 0 },
    { "do": "compareFiles", "restore": true }
  ]
}
```

常用步骤：`open`、`serveStatic`、`select`、`hover`、`edit`、`planWrites`、`apply`、`revert`、`diff`、`fileLine` / `fileRange`、`backup` / `compareFiles`（`restore: true` 时把备份写回去）、`viewport`、`exec`（在页面里执行脚本）、`config`（只改工作区级设置，不碰用户设置）、`selfCheck`、`state`。完整列表见 `packages/extension/src/selftest.ts`。

在别人的项目上跑之前先 `backup` 所有可能被写的文件，结尾用 `compareFiles` 确认字节级一致。

## 依赖的内部接口

这两处都不是公开 API，变化时只需要改对应的适配代码：

- **Cursor 内置浏览器命令**（`workbench.action.openBrowserEditor`、`cursor.browserView.*`）：集中在 `packages/extension/src/browser.ts`；启动时 `selfcheck.ts` 会检查命令是否还在。
- **Next.js 开发服务器的 `/__nextjs_original-stack-frames`**（错误浮层用的栈帧解析接口）：请求和 URL 换算在 `packages/bridge/src/source.ts` 和 `packages/bridge/src/next.ts`；接口不可用时退回直接读 sourcemap。

## 发布

1. 改 `packages/extension/package.json` 的 `version`，在 `packages/extension/CHANGELOG.md` 里写更新内容。
2. 推送同名标签（如 `v0.1.0`），`Release` 工作流会检查、测试、打包，发布到 Open VSX，并把 VSIX 附到 GitHub Release。
3. 首次发布前：在 [open-vsx.org](https://open-vsx.org) 用 Eclipse 账号登录、签署发布者协议、生成访问令牌，存为仓库密钥 `OVSX_PAT`。与 `publisher` 同名的命名空间不存在时，工作流会先创建它。

## 许可

[MIT](LICENSE)
