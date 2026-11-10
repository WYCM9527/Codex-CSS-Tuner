# CSS Tuner for Codex

A Codex plugin: pick elements on your running page, tune their CSS, edit their text and their components' props, and reorder them among their siblings with live preview in a panel inside the page, hand the changes to Codex to put in your source code, see them checked on the page, and revert any single change.

![The tuning panel on a pricing page, with three changes and where each one is in the code](plugins/css-tuner/assets/screenshot.png)

User guide: [English](plugins/css-tuner/README.md) · [简体中文](plugins/css-tuner/README.zh-CN.md). The rest of this document covers development and is written in Chinese.

---

Codex 插件：在运行中的页面上点选元素、可视化调 CSS、改文字和组件属性、在兄弟之间换序，在页面里的面板上实时预览，交给 Codex 写进源码、页面上自动核对，并可逐条还原。

使用说明、支持范围和限制见 [plugins/css-tuner/README.zh-CN.md](plugins/css-tuner/README.zh-CN.md)（英文版 [README.md](plugins/css-tuner/README.md)）；这份文档讲开发。

## 仓库结构

| 目录 | 内容 |
| --- | --- |
| `.agents/plugins/marketplace.json` | 插件市场清单，`codex plugin marketplace add` 读的就是它；里面只有 `plugins/css-tuner` 一个插件 |
| `plugins/css-tuner` | 插件本体，Codex 安装时整个复制走：`.codex-plugin/plugin.json`（清单）、`.mcp.json`（MCP 服务的启动命令、要转发的环境变量和超时）、`skills/css-tuner/SKILL.md`（什么时候用、怎么用这些工具）、`scripts/launch-mcp` 和 `launch-mcp.cmd`（找 Node 再启动 MCP 服务）、`assets/`（图标和截图）、`server/`（构建产物） |
| `packages/protocol` | 服务端、页面脚本、面板之间的消息类型，界面文案（`i18n/`，中英），数值工具（颜色、单位换算、刻度） |
| `packages/engine` | 定位引擎：在源码里找到改动对应的位置，写进给 Codex 的说明，自己不改文件。Tailwind 类名出现在哪（v4 用项目里 `@tailwindcss/node` 的设计系统；v3 由 `tailwind/v3.ts` 适配成同样的接口：用项目自己的 tailwindcss 读 tailwind.config、按候选类生成 CSS），主题刻度（`tailwind/scales.ts`），令牌对应的工具类顺带设置、预览时要一起设上的属性（如 `text-lg` 的行高，`tailwind/classes.ts`）；命中的 CSS 规则（`css/rules.ts`）、CSS Modules 类名映射；Vue / Svelte 单文件组件（`sfc.ts` 用项目自己的 `vue/compiler-sfc`、`svelte/compiler` 解析，样式块和脚本按原位置抠出来；`tailwind/template.ts` 把模板里的 `class`、`:class`、`class:` 转成和 JSX 一样的 `ClassSite`，`tailwind/sites.ts` 按文件类型分派）；`structure/` 里定位 JSX 文字和字符串 prop、翻译 JSON 里的键（jsonc-parser）、JSX 子节点和 `.map()` 用的数组字面量（`reorder.ts`）、组件调用处的属性和 `cva` / `tv` 配方的变体（`attr.ts`）。纯函数，单元测试最多 |
| `packages/bridge` | 注入到页面里的脚本：启动时分三种情况（`index.ts` 的 `boot`）：顶层页面在面板停靠时先停下加载、把自己换成视口框页面（`dock.ts`；刚换过不到 4 秒又回到了顶层，说明页面自己跳出了 iframe，这次不换，这个站点记成浮动并提示一次），面板浮动时直接挂上面板；视口框页面也挂面板，注释落在框上；框里的页面用外层的面板。页内面板的外壳（`shell.ts`：同源 iframe，停靠左右、拖宽、收成胶囊、停靠或浮动，按站点记在 localStorage；停靠时给页面至少留 320px）、交给 Codex 的注释（`annotate.ts`）、点选、高亮、样式快照（命中规则和胜出声明）、文字分段、兄弟组识别（按 fiber 链分叉处分项，`.map()` 渲染的各项单独成组）、预览（样式、文字、用 `order` / 位移模拟的换序）、删属性后的值（`fallback.ts` 临时去掉生效的声明量出计算值）、双击编辑、覆盖层上的拖动把手、组件 props 的读取和预览（`devtools.ts`、`props.ts`）、交给 Codex 后的核对（`verify.ts` 的 `probe`：临时撤下预览，读出源码给出的值，对上了再撤掉预览）、图片和视频的收集（`assets.ts`）、页面用 `@font-face` 加载的字体（`page.ts` 读 `document.fonts`）、标尺（`measure.ts`）、元素到源码的定位（`locator.ts` 定义每种框架的定位适配器，`source.ts` 按元素分派：React 读调试信息 + sourcemap（`react-source.ts`），Next.js 走开发服务器接口；Vue 把组件实例的渲染树和从开发服务器取回的模板按编译器的规则对齐（`vue-source.ts`、`vue-template.ts`）；Svelte 读开发态挂在元素上的 `__svelte_meta`（`svelte-source.ts`）；都不是时按纯 HTML 处理。Nuxt、SvelteKit 这类服务端渲染的页面等激活完再连回服务端） |
| `packages/panel` | 调参面板（React），在页面里的同源 iframe 中运行，经 WebSocket 连服务端（`host.ts`）；`pnpm --filter @css-tuner/panel dev` 可以脱离页面用模拟宿主调 |
| `packages/server` | 服务端，构建成 `plugins/css-tuner/server/` 下的几个入口：`mcp.mjs`（MCP stdio 前端，`mcp.ts` + `tools.ts`）、`daemon.mjs`（后台服务）、`cli.mjs`（命令行）、`ts-worker.mjs`（TS 语言服务，给属性补全用）。后台服务一个用户一个（`daemon.ts`；`client.ts` 负责找到或拉起它，版本旧了就换掉），控制端口是带 token 的 HTTP RPC（`rpc.ts`）。站点（`hub.ts`）：每个站点一个本地端口，开发服务器走反向代理（`proxy.ts`，HTML 由 `inject.ts` 插入桥接脚本），本地 HTML 走静态服务（`static.ts`）；`/__css_tuner__/` 下是桥接脚本、面板页、视口框页（`pages.ts`：框铺满停靠的面板旁边剩下的地方）和 WebSocket；后台服务重启后按 `sites.json` 在原端口恢复站点。会话（`session.ts`）：同一个站点只认最新连上的标签页。其余从 Cursor 版移植：控制器（`controller.ts`）、定位计划（`planner.ts`）、属性的可选值（`completions.ts`）、改动清单（`journal.ts`）、上一步 / 下一步（`history.ts`）、交给 Codex（`prompt.ts` 写说明，`applier.ts` 记批次、复制剪贴板、盯着文件变化和页面更新核对）、图片和视频（`assets.ts`）、本机字体列表（`fonts.ts`：macOS 用 JXA 调 `NSFontManager`，Windows 用 PowerShell，Linux 用 `fc-list`；第一次打开字体菜单时读，缓存一分钟）；新增的设置（`settings.ts`）、文件监听（`watch.ts`）、系统操作（`system.ts`：剪贴板、在编辑器里打开、在访达里显示） |
| `fixtures/` | 端到端测试用的小项目：`tw-react`（Vite + Tailwind 4，带 react-i18next）、`tw3-react`（Vite + Tailwind 3.4，主题在 `tailwind.config.ts`）、`react-css`（Vite + 普通 CSS / CSS Modules）、`next16`（Next.js 16 App Router，带 next-intl；`dev` 是 Turbopack，`dev:webpack` 是 webpack）、`vue3`（Vite + Vue 3 + Tailwind 4，带 scoped 样式、插槽、透传类名的组件）、`svelte5`（Vite + Svelte 5 + Tailwind 4，带组件样式、snippet、`class:` 指令）、`nuxt`（Nuxt 4）和 `sveltekit`（SvelteKit 3）两个冒烟用的最小项目、`static-html`；`demo` 是截图用的英文演示页 |
| `examples/static-demo` | 不用开发服务器的英文示例页（普通 CSS），插件目录的审核用例和试用都用它；发布时打包成 `css-tuner-demo.zip` |
| `PRIVACY.md`、`TERMS.md` | 隐私政策和使用条款（中英），插件清单里的链接指向 GitHub 上的这两个文件 |
| `scripts/` | `check-plugin.mjs`（按 Codex 插件目录的规则检查清单、图标、技能、MCP 配置、审核用例和构建产物）、`mcp-smoke.mjs`（起一个真的 MCP 服务，走一遍握手、列工具、带着 Codex 的对话 id 打开静态页、查状态并确认记下了对话、关掉）、`mcp-call.mjs`（像 Codex 那样调一次工具）、`screenshots.mjs`（重新生成截图）、`pack-submission.mjs`（生成提交到 OpenAI 插件目录的 ZIP） |

一次调参的数据流：Codex 调 `open_page` → MCP 前端找到（没有就拉起）后台服务 → 后台服务给站点开一个本地端口，代理开发服务器（HTML 的 `<head>` 最前面插入 `<script src="/__css_tuner__/bridge.js">`，去掉 CSP 和 `X-Frame-Options`，Host、Origin、Referer 换成开发服务器的，`Location` 换回代理的，热更新的 WebSocket 原样转发）或者给本地 HTML 起静态服务 → Codex 在内置浏览器里打开这个地址 → 桥接脚本在页面里挂上面板，两边各自经带 token 的 WebSocket 连回后台服务 → 选中元素时页面上报样式快照、文字分段、兄弟组、所属组件收到的 props 和源码位置 → 服务端为每个属性、每段文字、兄弟组和组件属性找代码位置（找不到时记下原因）→ 拖动和输入时页面只做预览 → 应用时面板生成批次号交给服务端，服务端记下这一批，用 `codex://threads/<对话 id>?prompt=…` 链接把完整说明放进在用这个项目的 Codex 对话的输入框（对话 id 是 Codex 调工具时在 `_meta.threadId` 里带来的，记在项目的 `state.json`），同时复制到剪贴板；还不知道是哪个对话时，面板在点击当中调内置浏览器的注释接口放一条注释（一句话 + 批次号），没有注释接口就只走剪贴板；预览留着 → 用户发送后 Codex 照着说明改代码（只拿到批次号时调 `get_handoff` 取说明），再调 `verify` 核对 → 同时服务端盯着项目里的文件变化和页面热更新（改翻译文件时 Vite 会整页刷新，Next 的 webpack 模式改 CSS Module 也会，页面重新连上后再核对），页面脚本临时撤下预览，读出源码给出的计算样式、文字、兄弟的顺序和组件收到的 props，和预览对上就标为已应用、撤掉预览，面板上的提示换成“改好了”；只改某一档的改动切到那一档的宽度再读 → 还原同样交给 Codex。

## 开发

需要 Node 22、pnpm 11（`corepack enable` 后按 `packageManager` 自动取版本）。

```bash
pnpm install
pnpm build              # bridge → panel → server，输出到 plugins/css-tuner/server/
pnpm typecheck
pnpm test
pnpm check:plugin       # 插件清单、图标、技能、MCP 配置、构建产物
node scripts/mcp-smoke.mjs
```

`plugins/css-tuner/server/` 是构建产物，要提交进仓库：Codex 安装插件只是复制文件夹，不装依赖。改了 `packages/` 下的代码就重新 `pnpm build`，和源码一起提交；CI 会检查提交的产物是不是最新的。

装进本机的 Codex 试（用隔离的 `CODEX_HOME` 就不会动到自己的配置）：

```bash
codex plugin marketplace add "$PWD"
codex plugin add css-tuner@codex-css-tuner
```

Codex 把插件复制到 `~/.codex/plugins/cache/codex-css-tuner/css-tuner/<版本>/`。改了代码之后：`pnpm build`，再执行一次 `codex plugin add`（同一个版本号也会覆盖缓存），然后 `node plugins/css-tuner/server/cli.mjs stop` 停掉还在跑旧代码的后台服务（新版本号的 MCP 前端连上时会自动换掉旧版本的后台服务，版本号没变时不会），再开新的 Codex 对话。

## 端到端测试

CI 跑不了浏览器，端到端在本机测。用单独的数据目录，免得动到自己的设置和改动记录：

```bash
export CSS_TUNER_DATA=/tmp/css-tuner-e2e
pnpm --filter fixture-tw-react dev                       # 另开一个终端
node plugins/css-tuner/server/cli.mjs open http://localhost:5173/ --root fixtures/tw-react
# 输出的地址（http://localhost:15173/）在浏览器里打开，选元素、改值、点“应用”
node scripts/mcp-call.mjs get_handoff '{"projectRoot":"'"$PWD"'/fixtures/tw-react"}'
# 照说明改 fixture 的代码，等页面热更新后
node scripts/mcp-call.mjs verify '{"projectRoot":"'"$PWD"'/fixtures/tw-react"}'
node plugins/css-tuner/server/cli.mjs stop
```

“应用”不管走哪条路都会复制到剪贴板（会覆盖剪贴板内容）；记着对话 id 时还会打开 `codex://` 链接，Codex 会切到那个对话、填好输入框，在自己的 Codex 里测时留意别把测试用的提示词发出去。冒烟测试用的是临时数据目录和假的对话 id，不点“应用”就不会打开链接。浏览器自动化点不进面板的 iframe 时，用 `Runtime.evaluate` 从 `document.querySelector('css-tuner-panel').shadowRoot.querySelector('iframe').contentDocument` 里找按钮调 `click()`；React 的输入框要用原生的 `value` setter 加 `input` 事件再按回车。

在别人的项目上测之前先备份可能被改的文件，测完对比确认字节级一致。

截图：起演示页（`pnpm --filter fixture-demo dev --port 5174`）和 CSS Tuner 后运行 `node scripts/screenshots.mjs <地址>`，用无头 Chrome 中英文各截一张，写进 `plugins/css-tuner/assets/`，用法见脚本开头。

## 依赖的内部接口

这几处都不是公开 API，变化时只需要改对应的适配代码：

- **Codex 内置浏览器的注释接口** `document.oai.annotation.request(target, { initialComment, metadata })`：只在顶层的安全页面上有（localhost 算），要在用户操作当中同步调用，同步返回 `{ accepted }`；元数据最多 6 项、共 2048 字节，键要匹配 `/^[A-Za-z][A-Za-z0-9 _-]{0,63}$/`，字符串值最多 256 个字符；`initialComment` 最多 240 个 UTF-16 码元。集中在 `packages/bridge/src/annotate.ts`，面板在同源 iframe 里经 `parent.__CSS_TUNER_ANNOTATE__` 调用。在 Codex 26.1029 上实测：接口在，`request` 也返回 `accepted: true`，但主进程经常不显示站点发起的注释框（`handleRuntimeOpenEditor` 的条件很多，比如浏览器正被代理控制、页面地址对不上），之后的请求还会被拒，所以现在只在不知道对话时当后备。
- **Codex 的 `codex://` 链接**：`codex://threads/<对话 id>?prompt=<文字>` 让 Codex 切到那个对话、把文字放进输入框（不发送）。协议是 Codex 应用注册的（macOS 上由 ChatGPT.app 处理），解析代码在应用的 `app.asar` 里，没有文档。太长的链接不一定传得到（Windows 的命令行最长 32767 个字符），超过 30000 个字符时只放一句话 + 批次号，让 Codex 用 `get_handoff` 取；中文编码后大约 9 倍长，三千来字的提示词就会走这条路。集中在 `packages/server/src/system.ts` 的 `codexLink` 和 `openCodexLink`（macOS 用 `open`，Windows 用 `rundll32 url.dll,FileProtocolHandler`，不经过 cmd）。
- **MCP 工具调用里的 `_meta.threadId`**：Codex 调 MCP 工具时在 `params._meta` 里带上当前对话的 `threadId`（还有 `sessionId`），见 openai/codex 的 `codex-rs/core/src/mcp_tool_call.rs`。`packages/server/src/mcp.ts` 的 `threadOf` 取出来，随 RPC 交给后台服务，带了 `projectRoot` 的调用会把它记成这个项目的 `cssTuner.thread`。
- **Codex 的插件格式和 Node**：插件用 Codex 的兼容格式（`.codex-plugin/plugin.json` + `.mcp.json`），因为通用格式的 `mcp.json` 不支持 `env_vars`，而 Codex 只把 `env_vars` 里列出的环境变量转发给 MCP 服务。`scripts/launch-mcp` 依次找 `CSS_TUNER_NODE`、`PATH` 里 20 以上的 node、`~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node`、`CODEX_MCP_NODE_PATH`、`CODEX_BROWSER_USE_NODE_PATH`、Codex 应用里的 `cua_node`。`PATH` 排在前面，因为 macOS 上 Codex 应用的 `cua_node` 开了 hardened runtime 又没有 `disable-library-validation`，加载不了别人签名的原生模块（Tailwind 4 的 lightningcss），而 lightningcss 会把真正的错误吞掉，只报找不到 `.node` 文件。Windows 没有这个限制，`launch-mcp.cmd` 还是先找 Codex 自带的 Node，最后才是 `PATH`。
- **Vite 客户端的断线重连**：Vite 的客户端断开后马上、之后每秒用 `vite-ping` 子协议试连一次，连上就整页刷新。所以后台服务退出时要放掉站点的端口，新的后台服务按 `sites.json` 在原端口把站点恢复，页面就自己回来了。
- **Next.js 开发服务器的 `/__nextjs_original-stack-frames`**（错误浮层用的栈帧解析接口）：请求和 URL 换算在 `packages/bridge/src/react-source.ts` 和 `packages/bridge/src/next.ts`；接口不可用时退回直接读 sourcemap。webpack 模式的栈帧是 `webpack-internal:///…`，原样交给这个接口解析；它的 CSS 没有 sourcemap，靠 webpack 在模块前面留下的 `!*** css …!./src/app/globals.css ***!` 注释认出源文件（`webpackCssSources`）。
- **Tailwind 3 的内部模块**（`tailwindcss/lib/lib/setupContextUtils` 的 `createContext`、`tailwindcss/lib/lib/generateRules`）：v3 适配器用它们同步地为候选类生成规则，集中在 `packages/engine/src/tailwind/v3.ts`。
- **React DevTools 全局钩子**（`__REACT_DEVTOOLS_GLOBAL_HOOK__`，renderer 注册时带上的 `overrideProps`）：props 预览用，集中在 `packages/bridge/src/devtools.ts`。钩子要在 React 加载前装上，所以代理把桥接脚本插在 `<head>` 最前面同步执行；拿不到 `overrideProps` 时面板提示刷新页面。
- **Vue 开发态挂在 DOM 上的 `__vnode`**（vnode 的 `ctx`、组件的 `type.__file`、编译器给 v-if 分支注入的 key、开发态根片段的 patchFlag）：集中在 `packages/bridge/src/vue-source.ts`；模板原文用 Vite 的 `/@fs/…?raw` 从开发服务器取。
- **Svelte 开发态的 `__svelte_meta`**（元素的 `loc` 和一层层的 `parent`）：集中在 `packages/bridge/src/svelte-source.ts`。
- **激活信号**：Nuxt 挂载完在 `#__nuxt` 上放 `__vue_app__`，SvelteKit 开发态激活前一刻删掉内联的 `<style data-sveltekit>`；`packages/bridge/src/source.ts` 的 `whenHydrated` 据此等页面激活完再连回服务端。

Cursor 版 CSS Tuner 的桥接也可能在同一个页面里（在 Cursor 的内置浏览器里打开代理地址时），两边的全局变量和钩子标记分开：这边是 `__CSS_TUNER_BRIDGE__` 和 `__cssTunerTap`，Cursor 版是 `__CSS_TUNER__` 和 `__cssTuner`。

## 发布

1. 改 `plugins/css-tuner/.codex-plugin/plugin.json` 和 `packages/server/package.json` 的 `version`（两处要一致，`check:plugin` 会查），在 `CHANGELOG.md` 里写更新内容，`pnpm build` 后一起提交。
2. 推送同名标签（如 `v0.11.0`），`Release` 工作流会检查版本号、测试、确认构建产物是最新的，创建 GitHub Release，附上插件文件夹的 zip 和示例页 `css-tuner-demo.zip`（审核用例按 `releases/latest/download/css-tuner-demo.zip` 引用它）。
3. 用户添加 `WYCM9527/Codex-CSS-Tuner` 这个插件市场（Codex 应用里的“添加插件市场”，或 `codex plugin marketplace add`）拿到的是默认分支上的插件，“Git 引用”或 `--ref <标签>` 固定在某个版本；在设置的“市场”里点“升级”或运行 `codex plugin marketplace upgrade codex-css-tuner`，已经装上的插件会跟着换成新版本，不用再装一次。

## 提交到 OpenAI 插件目录

CSS Tuner 带本机 MCP 服务，属于“仅桌面端”插件（上架后带 Desktop only 标记，只能在支持的桌面应用里装）。[官方规定](https://developers.openai.com/plugins/deploy/desktop-only)本地 MCP 插件只接受获批合作伙伴的提交，所以要先拿到白名单：

1. 在 [OpenAI Platform 的组织设置](https://platform.openai.com/settings/organization/general)里完成个人或企业身份验证，记下组织 ID。目录里显示的开发者名称取自这个身份，和清单里的 `developerName` 无关。提交的人要有 `api.apps.write` 权限（组织 Owner 自带）。
2. 把组织 ID 发给 OpenAI 的对接人，申请加入本地 MCP 提交的白名单，等对方确认。
3. 先在本地开发安装中录制真实演示，展示选取元素、预览、交接、源码修改和页面核对，并检查视频中没有私人内容。把视频托管到审核员无需登录就能播放的地址，验证播放后写进 `plugin.json` 的 `extensions.com.openai.review.demo_recording_url`。
4. `pnpm build && pnpm pack:submission`，得到 `dist/css-tuner-<版本>-submission.zip`。它和插件文件夹一样，只是去掉了截图：这条路线不接受 `interface.screenshots`。没有视频链接时脚本仍能生成预备包，但会警告；这样的包还未完成审核材料。
5. 在[提交门户](https://platform.openai.com/plugins)选 **Create plugin → Skills only**，上传最终 ZIP，处理自动检查的结果，核对导入的文案、国家/地区、视频和用例，再运行保存版本的检查并提交审核。通过后在门户里点 **Publish**。

已经写进清单的：网站、支持、隐私政策和使用条款的链接（`interface.*URL`，都要是 HTTPS 而且能打开）；5 个正向、3 个反向审核用例（`extensions.com.openai.review.test_cases`，用 Release 里的示例页），`check:plugin` 会检查数量、必填字段和工具名，改了工具或面板文案时要跟着改；发布说明和简体中文的标题、简介（`extensions.com.openai.publication`）。

以后改了插件信息或技能，要换新的 `version` 重新打包上传，审核通过后再发布。同一时间只能有一个版本在审核，提交后想改就先 **Cancel Review**，改完重新提交。

## 许可

[MIT](LICENSE)
