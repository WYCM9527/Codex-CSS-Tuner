# Changelog

## 0.2.0

- English and Simplified Chinese: the panel, notifications, the reasons shown when a change can't be written back, and prompts handed to the Agent follow Cursor's display language. Command names and settings descriptions are translated too.
- English store page with a Chinese version, a demo GIF and a screenshot.

## 0.1.0 (preview)

First usable release.

- Pick elements in Cursor's built-in browser: hover highlight, breadcrumb, component tree and same-source instance markers.
- Tuning panel: layout (flex / grid), spacing, size, position, text, fill, radius, effects and CSS variables, with scale snapping; hold Alt for exact values.
- Deterministic write-back:
  - Tailwind 4 classes (literals, template literals, `clsx` / `cn` / `twMerge`, `cva` variants, class-name constants, component call sites). Only the active responsive variant is changed, and off-scale values become arbitrary-value classes.
  - Plain CSS rules (shorthands, nesting, `@import`, CSS Modules).
  - CSS variable definitions (`:root`, `@theme`).
- After applying, waits for hot reload and verifies computed styles, with another round in the background when hot reload is slow.
- Revert one change at a time: byte-for-byte restore, or roll back only this change if the source changed since; stops and shows a diff when it can't.
- Changes that can't be written back become a prompt prefilled in a new Agent chat.
- Plain HTML projects open with a built-in static server.
- Next.js 16 App Router (Turbopack dev mode): source locations for server and client components, `globals.css` and CSS Modules.
- Checks at startup that the built-in browser commands are available; "CSS Tuner: Self-Check" runs the full flow in a separate tab.
