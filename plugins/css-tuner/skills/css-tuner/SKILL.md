---
name: css-tuner
description: Visually tune a running local web page with CSS Tuner (styles, text, element order, component props) and write the changes into the source code. Use when the user wants to open their dev server or an HTML file in CSS Tuner, tweak a page visually, or when a message or browser annotation mentions a CSS Tuner batch to write into code or to check.
---

# CSS Tuner

CSS Tuner puts a tuning panel inside the user's page. The user picks elements and adjusts them with live preview; the panel finds where each value is written in the source (Tailwind class, CSS rule, CSS variable, JSX prop). When the user clicks **Apply**, CSS Tuner puts a prompt describing the changes, with a batch id, into the composer of the chat that opened the page, and the user sends it. You turn it into code edits, then ask CSS Tuner to check the live page.

The tools come from the `css-tuner` MCP server: `open_page`, `status`, `get_handoff`, `verify`, `list_changes`, `close_page`.

## Open a page

1. Work out the project root (your working directory) and the page to tune:
   - A dev server URL such as `http://localhost:5173/pricing`. If no dev server is running, start the project's dev script in the background first (check `package.json`), and wait until it prints its URL.
   - Or a local HTML file or folder, for sites without a dev server.
   - CSS Tuner refuses public websites: it only opens dev servers on this computer or the local network. If the user asks to tune a site on the internet, explain that CSS Tuner changes their own local project, and offer to open its dev server instead.
2. Call `open_page` with `projectRoot` (absolute path) and `url`. It returns a local address such as `http://localhost:15173/pricing`: the same site through a local proxy that adds the panel. Hot reload keeps working.
3. Open that address in the in-app browser with the Browser plugin (`control-in-app-browser`). If you cannot control the browser, give the user the link and ask them to open it in the Codex in-app browser. When CSS Tuner can't reach the Codex app (for example in the Codex CLI), Apply copies the full prompt to the clipboard instead.
4. Tell the user briefly how to use it: click **Pick Element** in the panel and click an element on the page, tune it, then press **Apply** or **Apply All** and send the message that appears in the composer. Picking stays on until they click the button again (it then reads **Stop Picking**): clicking another element switches to it, and the page doesn't respond to clicks meanwhile.

Don't drive the panel yourself unless the user asks you to; the user makes the visual decisions.

## Write a handoff into code

When the user's message is a CSS Tuner prompt, has a CSS Tuner annotation, or mentions a CSS Tuner batch (for example "batch a1b2c3"):

1. If the message already has the full instructions (the prompt CSS Tuner put into the composer), work from them. Otherwise call `get_handoff` with that `batch` (and `projectRoot`). If the user asks to write their CSS Tuner changes without a batch, call `get_handoff` without one: it returns the latest batch still waiting. Pass `includePending: true` only when the user wants the changes they haven't applied yet.
2. Follow the instructions. They list each element, the old and new values, and where CSS Tuner located the code. Make the smallest edit that produces exactly the previewed result:
   - Change the class, rule, variable or prop named in the instructions rather than adding overrides elsewhere.
   - Keep the project's conventions (Tailwind scale tokens instead of arbitrary values when the instructions give a token, existing CSS files and variables).
   - When the instructions say the spot couldn't be located, search for the element using the page path, text and labels given.
   - If a change would affect other places on the page (shared component, shared class), do what the instructions say; ask the user when it's unclear.
   - When the instructions say a change applies to only some of the elements the same code renders (for example 2 of the 3 cards), change only those and leave the rest as they are. If nothing in the code tells them apart, add a condition.
3. Call `verify`. It waits for hot reload and checks each change on the live page. Changes that match are marked applied and their previews are removed; for the rest it reports what the page shows now. Fix what didn't match and call `verify` again. When the same code renders several elements, `verify` also checks that the ones that should change did and the others didn't: a note saying only some of them changed, or that more changed than should have, means the selected element is right but the others aren't yet, so keep fixing.
4. Report in the user's language: what you changed (file and what), and which changes matched. Keep it short.

Reverts work the same way: the instructions ask you to restore the original values.

## Other tools

- `status`: whether the page is connected, the current page, and change counts. Use `waitForPageMs` after opening a page if you need it connected.
- `list_changes`: every change in the panel with its status and source location.
- `close_page`: stop the project's CSS Tuner sites when the user is done.

## Troubleshooting

- `open_page` warns that the dev server isn't responding: start it, the page retries by itself.
- `verify` says the page isn't connected: the CSS Tuner page was closed or navigated away. Open the URL from `open_page` again.
- The panel says CSS Tuner is in use in another tab: only one tab per site is connected; the user can click the notice to switch.
- Links and buttons on the page don't respond: Pick Element or the ruler is on, and while either is on, clicks don't reach the page. The user clicks **Stop Picking** in the panel (Esc turns the ruler off), or folds the panel away, which turns both off.
- The address bar shows `/__css_tuner__/frame?u=…`: that's normal. While the panel is docked, the page runs in a frame next to it and is laid out at the width that's left. If the page misbehaves in the frame, the user can switch the panel to float over the page with the button at the top of the panel.
- Nothing appeared in the composer after Apply: the full prompt is on the clipboard too. Ask the user to paste it, or call `get_handoff` directly.
