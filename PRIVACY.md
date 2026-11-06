# Privacy Policy

Last updated: November 6, 2026 · [简体中文](#隐私政策)

CSS Tuner is an open-source Codex plugin published by WYCM9527 ("we"). It runs entirely on your computer. This policy explains what data CSS Tuner handles, where it goes, and how long it's kept.

## Summary

- We don't collect, receive, share or sell personal data. CSS Tuner has no servers of its own, no accounts, and no analytics or telemetry.
- CSS Tuner keeps its working data on your computer, in `~/.css-tuner` (or the folder set by the `CSS_TUNER_DATA` environment variable).
- When Codex uses CSS Tuner's tools, their results become part of your Codex conversation, which OpenAI processes under your agreement with OpenAI.

## What CSS Tuner handles, and why

| Data | Why | Where it's kept |
| --- | --- | --- |
| The pages you open in CSS Tuner: their addresses and titles, element structure and styles, and the first words of an element's text | To show the tuning panel, preview your changes and describe them | On your computer. The parts that describe a change go to Codex when it calls CSS Tuner's tools |
| Your project's source files | To find where each value is defined (Tailwind classes, CSS rules, CSS variables, component props) | Read on your computer. CSS Tuner doesn't modify them; Codex edits them after you send the request |
| Change records, the descriptions handed to Codex, and copies of the affected files as they were before the first handoff | To list your changes, hand them to Codex, check them on the page and revert them | `~/.css-tuner/projects/` |
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

CSS Tuner returns change descriptions to Codex through its MCP tools: the elements, old and new values, places in your code, and page addresses. In the Codex in-app browser it also adds an annotation with a short comment and the batch number. In other browsers it copies the description to your clipboard instead. What you share with Codex is handled by OpenAI under OpenAI's terms and privacy policy. We don't receive any of it.

## Retention

Everything stays on your computer until you delete it. For each project, CSS Tuner keeps the 20 most recent handoffs and deletes file copies that no change refers to any more. Change records stay until you remove them in the panel or delete the folder. The log starts a new file once it reaches 5 MB and keeps one previous file.

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

最后更新：2026 年 11 月 6 日

CSS Tuner 是 WYCM9527（下称“我们”）发布的开源 Codex 插件，完全在你的电脑上运行。本政策说明 CSS Tuner 处理哪些数据、数据去向和保留多久。

## 概要

- 我们不收集、不接收、不共享也不出售个人数据。CSS Tuner 没有自己的服务器、不需要账号，也没有统计或遥测。
- CSS Tuner 的工作数据放在你电脑上的 `~/.css-tuner`（或环境变量 `CSS_TUNER_DATA` 指定的文件夹）。
- Codex 调用 CSS Tuner 的工具时，工具返回的内容会成为你和 Codex 对话的一部分，由 OpenAI 按你与 OpenAI 之间的协议处理。

## 处理哪些数据、为什么

| 数据 | 用途 | 存放位置 |
| --- | --- | --- |
| 在 CSS Tuner 里打开的页面：地址和标题、元素结构和样式、元素文字的开头几个字 | 显示调节面板、预览和描述改动 | 你的电脑上；描述改动的那部分在 Codex 调用工具时交给 Codex |
| 项目的源码文件 | 找出每个值写在哪里（Tailwind 类名、CSS 规则、CSS 变量、组件属性） | 在你的电脑上读取。CSS Tuner 不改它们，由 Codex 在你发送请求后修改 |
| 改动记录、交给 Codex 的说明、涉及的文件第一次交出前的副本 | 列出改动、交给 Codex、在页面上核对和还原 | `~/.css-tuner/projects/` |
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

CSS Tuner 通过 MCP 工具把改动说明返回给 Codex：涉及的元素、原值和新值、在代码里的位置、页面地址。在 Codex 内置浏览器里，它还会加一条带简短说明和批次号的注释；在别的浏览器里，改为把说明复制到剪贴板。你交给 Codex 的内容由 OpenAI 按其条款和隐私政策处理，我们收不到其中任何内容。

## 保留期限

所有数据都留在你的电脑上，直到你删除。每个项目最多保留最近 20 批交接，不再被任何改动引用的文件副本会被删除。改动记录一直保留，直到你在面板里移除或删掉数据文件夹。日志超过 5 MB 时换一个新文件，只保留上一个。

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
