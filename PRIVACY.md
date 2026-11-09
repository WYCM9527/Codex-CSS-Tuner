# Privacy Policy

Last updated: November 9, 2026 · [简体中文](#隐私政策)

CSS Tuner is an open-source project published by WYCM9527 ("we"). It includes a Codex plugin and a Chrome extension with a macOS companion. This policy explains what each version handles, where the data goes, and how long it is kept.

## Summary

- We don't collect, receive, share or sell personal data. CSS Tuner has no servers of its own, no accounts, and no analytics or telemetry.
- The Codex plugin keeps working data in `~/.css-tuner`. The Chrome companion keeps separate working data in `~/.css-tuner-extension`. Both locations are configurable.
- OpenAI processes the material shared with Codex under your agreement with OpenAI. For the Chrome extension, you review the draft and send it yourself from Codex.

## What the Codex plugin handles, and why

| Data | Why | Where it's kept |
| --- | --- | --- |
| The pages you open in CSS Tuner: their addresses and titles, element structure and styles, and the first words of an element's text | To show the tuning panel, preview your changes and describe them | On your computer. The parts that describe a change go to Codex when it calls CSS Tuner's tools |
| Your project's source files | To find where each value is defined (Tailwind classes, CSS rules, CSS variables, component props) | Read on your computer. CSS Tuner doesn't modify them; Codex edits them after you send the request |
| Change records, the descriptions handed to Codex, and copies of the affected files as they were before the first handoff | To list your changes, hand them to Codex, check them on the page and revert them | `~/.css-tuner/projects/` |
| The id of the Codex chat that last called CSS Tuner's tools for a project | To put the description into that chat when you select Apply | `~/.css-tuner/projects/` |
| Settings and the list of open sites | To keep your preferences and reconnect open pages after a restart | `~/.css-tuner/settings.json` and `sites.json` |
| Diagnostic logs: addresses and folders opened, and error messages from CSS Tuner and the page | Troubleshooting | `~/.css-tuner/logs/` |
| The list of fonts installed on your computer | The Font menu | Read when you open the menu, and kept in memory only |
| Images and videos you choose to save | Saving assets | Downloaded from the address the page uses, into the folder you choose (Downloads by default) |

## Network connections

CSS Tuner itself only connects to:

- dev servers on your computer or your local network, through its local proxy. It refuses public websites;
- the address of an image or video you choose to save.

CSS Tuner's own servers listen only on `127.0.0.1` and `::1`, and every connection to them needs a random token.

## Sharing with Codex and OpenAI

CSS Tuner returns change descriptions to Codex through its MCP tools: the elements, old and new values, places in your code, and page addresses. When you select Apply, it opens a `codex://` link on your computer that puts the description into the Codex chat using the project, and copies it to your clipboard. Where that isn't possible, the Codex in-app browser gets an annotation with a short comment and the batch number instead, and other browsers only the clipboard copy. What you share with Codex is handled by OpenAI under OpenAI's terms and privacy policy. We don't receive any of it.

## Chrome extension preview

The Chrome extension can inspect HTTP pages on `localhost` and `127.0.0.1`. Editing requires pairing the active tab with the separately installed macOS companion. The extension uses the paired page's URL, element structure, page text, styles, and edit values to provide the panel and identify the relevant source code. It exchanges this information with the companion over authenticated connections on `127.0.0.1`. Pairing credentials are kept in extension session storage. The companion reads source in the project selected in the CLI and stores batch history and snapshots in `~/.css-tuner-extension` or the folder set by `CSS_TUNER_EXTENSION_DATA`.

After you confirm Apply or Revert, the companion opens the bound local Codex chat with a draft containing the change and source references. You decide when to submit it in Codex. The extension and companion have no publisher-operated service or analytics. To remove extension data, uninstall the extension, close the companion session, and delete its local data folder.

## Retention

CSS Tuner retains its own working data locally. For each project, CSS Tuner keeps the 20 most recent handoffs and deletes file copies that no change refers to any more. Change records stay until you remove them in the panel or delete the folder. The log starts a new file once it reaches 5 MB and keeps one previous file.

## Your choices

- Delete `~/.css-tuner` (or your `CSS_TUNER_DATA` folder) at any time to remove all of CSS Tuner's data.
- Stop CSS Tuner by asking Codex to close the page, or with `node <plugin folder>/server/cli.mjs stop`; uninstall the plugin in Codex to remove it.
- Choose where saved images and videos go with the `assetsDir` setting.

## Children

CSS Tuner is a tool for software developers and isn't directed at children.

## Changes to this policy

We'll update this file and the date above. Earlier versions are in the repository's history.

## Contact

Open an issue at <https://github.com/WYCM9527/Codex-CSS-Tuner/issues>.

---

# 隐私政策

最后更新：2026 年 11 月 9 日

CSS Tuner 是 WYCM9527（下称“我们”）发布的开源项目，包括 Codex 插件、Chrome 扩展及其 macOS 本机程序。本政策说明各版本处理哪些数据、数据去向和保留多久。

## 概要

- 我们不收集、不接收、不共享也不出售个人数据。CSS Tuner 没有自己的服务器、不需要账号，也没有统计或遥测。
- Codex 插件把工作数据放在 `~/.css-tuner`，Chrome 扩展的本机程序单独使用 `~/.css-tuner-extension`。两个目录均可自定义。
- 交给 Codex 的内容由 OpenAI 按你与 OpenAI 之间的协议处理。使用 Chrome 扩展时，你在 Codex 中检查草稿并自行发送。

## Codex 插件处理哪些数据、为什么

| 数据 | 用途 | 存放位置 |
| --- | --- | --- |
| 在 CSS Tuner 里打开的页面：地址和标题、元素结构和样式、元素文字的开头几个字 | 显示调节面板、预览和描述改动 | 你的电脑上；描述改动的那部分在 Codex 调用工具时交给 Codex |
| 项目的源码文件 | 找出每个值写在哪里（Tailwind 类名、CSS 规则、CSS 变量、组件属性） | 在你的电脑上读取。CSS Tuner 不改它们，由 Codex 在你发送请求后修改 |
| 改动记录、交给 Codex 的说明、涉及的文件第一次交出前的副本 | 列出改动、交给 Codex、在页面上核对和还原 | `~/.css-tuner/projects/` |
| 最近调用 CSS Tuner 工具的 Codex 对话的 id（每个项目一个） | 点“应用”时把说明放进那个对话 | `~/.css-tuner/projects/` |
| 设置和打开过的站点列表 | 记住偏好，重启后让打开着的页面连回来 | `~/.css-tuner/settings.json` 和 `sites.json` |
| 诊断日志：打开过的地址和文件夹，CSS Tuner 和页面的错误信息 | 排查问题 | `~/.css-tuner/logs/` |
| 电脑上安装的字体列表 | 字体菜单 | 打开菜单时读取，只保存在内存里 |
| 你选择保存的图片和视频 | 保存素材 | 从页面使用的地址下载到你指定的文件夹（默认「下载」） |

## 网络连接

CSS Tuner 自己只连接：

- 你电脑上或局域网里的开发服务器（经由本地代理），公网网站一律拒绝；
- 你选择保存的图片或视频的地址。

CSS Tuner 自己的服务只监听 `127.0.0.1` 和 `::1`，每个连接都要带随机令牌。

## 与 Codex 和 OpenAI 共享

CSS Tuner 通过 MCP 工具把改动说明返回给 Codex：涉及的元素、原值和新值、在代码里的位置、页面地址。点“应用”时，它在你的电脑上打开一个 `codex://` 链接，把说明放进在用这个项目的 Codex 对话，同时复制到剪贴板；做不到时，在 Codex 内置浏览器里改为加一条带简短说明和批次号的注释，在别的浏览器里只复制到剪贴板。你交给 Codex 的内容由 OpenAI 按其条款和隐私政策处理，我们收不到其中任何内容。

## Chrome 扩展预览版

Chrome 扩展的访问范围是 `localhost` 和 `127.0.0.1` 上的 HTTP 页面。开始编辑前，用户将当前标签页与单独安装的 macOS 本机程序配对。扩展处理已配对页面的 URL、元素结构、页面文字、样式及编辑值，用于显示面板和定位源码。扩展通过 `127.0.0.1` 上的鉴权连接与本机程序交换这些信息，配对凭据保存在扩展的会话存储中。本机程序读取 CLI 选定的项目源码，并把批次和快照保存在 `~/.css-tuner-extension` 或 `CSS_TUNER_EXTENSION_DATA` 指定的目录中。

用户确认应用或还原后，本机程序在已绑定的本地 Codex 对话中填入带改动和源码位置的草稿，由用户在 Codex 里决定是否发送。扩展和本机程序都没有发布者运营的服务器或统计服务。用户可以卸载扩展、关闭本机会话并删除对应的数据目录来清理数据。

## 保留期限

CSS Tuner 在本机保留自己的工作数据。每个项目最多保留最近 20 批交接，不再被任何改动引用的文件副本会被删除。改动记录一直保留，直到你在面板里移除或删掉数据文件夹。日志超过 5 MB 时换一个新文件，只保留上一个。

## 你的选择

- 随时删除 `~/.css-tuner`（或你的 `CSS_TUNER_DATA` 文件夹），即可清除 CSS Tuner 的全部数据。
- 让 Codex 关掉页面，或运行 `node <插件目录>/server/cli.mjs stop` 停止 CSS Tuner；在 Codex 里卸载插件即可移除。
- 用 `assetsDir` 设置指定保存图片和视频的文件夹。

## 儿童

CSS Tuner 是给软件开发者用的工具，不面向儿童。

## 政策变更

我们会更新本文件和上面的日期，以前的版本可以在仓库历史里找到。

## 联系方式

在 <https://github.com/WYCM9527/Codex-CSS-Tuner/issues> 提 issue。
