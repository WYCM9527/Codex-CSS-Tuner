# Changelog

## 0.3.0

- Edit text: the new Content section lists the selected element's text, split into runs around inline tags such as `<b>`. Edit a run in the panel, or double-click text inside the selected element on the page and type in place. Enter adds the change to the list; Esc undoes it.
- Text is written back deterministically:
  - JSX text in the element itself.
  - The string passed in at a component's call site (`title="…"` or children), so only that use changes.
  - Messages from `t('key')` in react-i18next and next-intl JSON files, in the language shown on the page (taken from the route, then `<html lang>`).
  - Text in plain HTML files, with characters such as `&` and `<` escaped again.
- Text produced by code (expressions, template strings, custom translation helpers, `t.rich`) goes to the Agent together with the code it comes from.
- After applying, the page's text is verified as well, including after the full page reload Vite does when a message file changes.

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
