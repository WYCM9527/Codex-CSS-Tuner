# Cursor CSS Tuner

在 Cursor 内置浏览器里点选元素、拖动数值实时看效果，满意了一键写回源码，每一条都能单独还原。

> Pick an element in Cursor's built-in browser, tune its CSS visually with live preview, then write the change back to your source code deterministically — Tailwind classes, CSS rules or CSS variables — and revert any single change later. Cursor only.

它要解决的事只有一件：**在 Cursor 里快速调参、看效果、把效果应用到代码里**。写回由确定性的引擎完成，不经过 AI；引擎处理不了的改动，会整理成提示词预填进新的 Agent 对话，由你按回车发送。

## 能做什么

- **点选元素**：在内置浏览器的页面上悬停高亮、点击选中，面板显示面包屑和组件结构树，标出同一处 JSX 渲染出的所有实例。
- **调参面板**：布局（flex / grid）、间距、尺寸、定位、文字、填充、圆角、效果、CSS 变量。数值可拖动、可滑动，颜色有取色器；默认吸附到主题刻度和 CSS 变量，按住 Alt 写精确值。
- **实时预览**：改动先只作用在页面上，不碰源码。
- **确定性写回**：点“应用”后按元素的来源写回：
  - Tailwind 4 类名：JSX 里的字符串和模板字符串、`clsx` / `cn` / `twMerge` 参数、`cva` 的基础类和变体、类名常量、组件调用处传进去的 `className`；当前生效的响应式变体（如桌面宽度下的 `md:px-5`）只改那一个。刻度外的值写成任意值类名（可在设置里改成交给 Agent）。
  - 普通 CSS：改命中的那条规则里的声明，简写属性按位置改（`padding: 16px 20px → 24px 20px 16px`）；支持嵌套 `&`、`@import` 进来的文件和 CSS Modules（带哈希的类名会映射回源码里的类名）。没有规则设置这个属性时，加到元素自己的规则里。
  - CSS 变量：改定义处（`:root`、Tailwind 的 `@theme`），用到它的地方一起变；Tailwind 自带的变量（如 `--spacing`）会写进 `@theme`。
- **应用后校验**：写盘后等开发服务器热更新，核对页面上的计算样式和预览时一致；热更新较慢时会在后台再等一轮。
- **逐条还原**：文件在应用后没被改过时按快照字节级恢复；改过的话只回退这一处，找不到原样就停下并给出对比，不会覆盖你后来的修改。
- **作用范围**：“此处”只改当前这个实例（组件用 `cn` / `twMerge` 合并类名时在调用处加覆盖类）；“源头”改组件定义和变体，所有用到的地方一起变。
- **交给 Agent**：写不回去的改动（比如类名来自变量拼接）生成结构化提示词，预填进新的 Agent 对话，不会自动发送。

## 支持的项目

| 技术栈 | 状态 |
| --- | --- |
| React 18 / 19 + Vite，Tailwind 4 | 已验证 |
| React + Vite，普通 CSS / CSS Modules | 已验证 |
| Next.js 16 App Router，`next dev`（Turbopack），服务端组件和客户端组件 | 已验证 |
| 纯 HTML + CSS（用内置静态服务打开） | 只改 CSS 规则 |

页面必须跑在开发模式下：元素到源码的定位依赖 React 开发构建的调试信息和开发服务器的 sourcemap。

## 安装

在 Cursor 的扩展面板搜索 **Cursor CSS Tuner** 安装；也可以从 [GitHub Releases](https://github.com/WYCM9527/Cursor-CSS-Tuner/releases) 下载 `.vsix`，在扩展面板右上角的菜单里选“从 VSIX 安装…”。需要最新版 Cursor。

## 快速开始

1. 启动项目的开发服务器（如 `npm run dev`）。
2. 点活动栏里的 CSS Tuner 图标，在“调参”面板里填页面地址并打开；页面会在 Cursor 内置浏览器的标签页里打开，不需要改项目代码、不需要装任何依赖。
3. 点“选取”，在页面上点一个元素。
4. 拖动面板里的数值，页面实时变化；改动会出现在下方的清单里。
5. 点“应用”写回源码；之后可以对任意一条点“还原”或“对比”。

纯 HTML 项目：在资源管理器里右键 HTML 文件或文件夹，选“CSS Tuner: 用内置静态服务打开 HTML”。

## 命令

| 命令 | 说明 |
| --- | --- |
| CSS Tuner: 打开页面 | 在内置浏览器里打开开发服务器的页面并注入调参脚本 |
| CSS Tuner: 选取元素 | 开关页面上的点选模式 |
| CSS Tuner: 应用全部改动 | 把清单里所有待应用的改动写回源码 |
| CSS Tuner: 用内置静态服务打开 HTML | 给没有开发服务器的 HTML 起一个本地静态服务 |
| CSS Tuner: 把未处理的改动交给 Agent | 生成提示词并预填进新的 Agent 对话 |
| CSS Tuner: 自检 | 在单独的标签页里实际跑一遍注入、连接、选中、预览和刷新后重新注入 |

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `cssTuner.defaultUrl` | `http://localhost:5173/` | 打开页面时的默认地址 |
| `cssTuner.remBase` | `16` | rem 与 px 换算的基准字号 |
| `cssTuner.snap` | `true` | 数值吸附到主题刻度和 CSS 变量（按住 Alt 写精确值） |
| `cssTuner.tailwind.scope` | `instance` | Tailwind 改动默认的作用范围：`instance` 只改当前调用处，`source` 改类名的源头 |
| `cssTuner.tailwind.arbitraryValues` | `allow` | 刻度外的值写成任意值类名（`allow`），或交给 Agent（`agent`） |
| `cssTuner.css.strategy` | `editRule` | 普通 CSS 改动直接改命中的规则（`editRule`），或交给 Agent（`agent`） |
| `cssTuner.vars.strategy` | `editDefinition` | CSS 变量改动直接改定义处（`editDefinition`），或交给 Agent（`agent`） |
| `cssTuner.verifyTimeoutMs` | `8000` | 应用后等待热更新并校验的时间（毫秒），超时的改动会在后台再等一轮 |

## 限制

- **只支持 Cursor**：扩展通过 Cursor 内置浏览器的内部命令（`cursor.browserView.*`）注入脚本，这些不是公开 API，Cursor 更新后可能变化。扩展启动时会检查这些命令是否还在，缺失时会提示；也可以随时运行“CSS Tuner: 自检”。
- **只改 CSS**：不改 DOM 结构和文案。
- **Next.js 的源码定位**借用开发服务器给错误浮层用的内部接口 `/__nextjs_original-stack-frames`，同样不是公开 API；只在 Turbopack 开发模式下验证过，`next dev --webpack` 未验证。服务端组件的热更新可能要几秒，校验会等。
- **热更新的边界情况**：热更新之前就渲染出来、热更新之后才第一次选中的元素，可能定位到旧的行号；位置看起来不对时刷新一下页面。
- **CSS Modules** 的类名映射是按“哈希类名里包含的最长源码类名”匹配的，自定义了 `generateScopedName` 的项目可能对不上。
- **Tailwind 只支持 v4**：设计系统从项目自己的 `node_modules` 加载；v3 项目里的工具类改动写不回去，可以交给 Agent。
- 文件在编辑器里有未保存的修改时，应用和还原会停下，避免覆盖。
- 应用直接写磁盘、不走“编辑 + 保存”，所以不会触发保存时格式化，还原才能做到字节级一致。

## 安全与隐私

- 调参脚本只通过 Cursor 内置浏览器注入到你打开的标签页里，不走代理，也不改项目代码。
- 页面和扩展之间的 WebSocket 只监听 `127.0.0.1`，并要求随机 token。
- 扩展不访问外网；Next.js 项目只会请求你自己的开发服务器。

## 排查问题

- 日志在“输出”面板的 **CSS Tuner** 频道。
- 运行“CSS Tuner: 自检”，会列出每一项检查的结果。
- 页面的 CSP 拦住 WebSocket 时，扩展会自动改用 `executeJavaScript` 通道，功能不变，只是稍慢。
- 选中元素后显示“找不到这个元素的 JSX 源码位置”：确认页面跑在开发模式、React 是开发构建。

## 许可

MIT。这是社区项目，与 Cursor（Anysphere）官方无关。
