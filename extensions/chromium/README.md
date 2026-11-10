# CSS Tuner Chrome extension preview

The Chrome extension shows the tuning panel on an HTTP development page on `localhost` or `127.0.0.1`. The companion CLI reads source in the chosen project, builds handoff batches, and opens drafts in the local Codex chat you bind. The draft is sent when you review and submit it in Codex.

## Build and run on macOS

1. Run `node scripts/build-chrome.mjs` and `node packages/server/build-extension.mjs` from the repository with its workspace dependencies installed.
2. Load `dist/css-tuner-chrome` as an unpacked extension and start your local development server.
3. Open the local Codex chat for your project and copy its deep link. The macOS shortcut is `⌘⌥L`.
4. For first-time setup, keep this command running in your terminal.

   ```sh
   node dist/css-tuner-extension-companion/cli.mjs extension setup http://127.0.0.1:5173/ \
     --root /absolute/path/to/project \
     --chat 'codex://threads/YOUR-CHAT-ID'
   ```

   Open the development page at that address. Select the CSS Tuner toolbar icon and choose **Set up this project**. Check that the terminal and extension show the same six digits, then type `y` in the terminal. Reopen the extension menu if it closed. Review the preview address, project folder, and Codex chat, then choose **Agree and save binding**. The command uses a temporary listener on `127.0.0.1:43681` and ends after setup or five minutes.

5. Pick an element, change a value, and select **Apply**. Confirm that CSS Tuner may replace the bound chat’s unsent draft. Review and send the draft in Codex. The panel checks the page after your source changes. Use **Revert** on an applied change to draft a separate undo batch.

If you need the pairing link flow, replace `setup` with `open` and use `--browser` to open the pairing page in your default browser, or use `--link` and paste the output under **Use a pairing link** in the popup. A pairing link is valid for five minutes and can be used once.

## Connect again from the extension

- Open a page at the saved development address. Select the CSS Tuner toolbar icon, then **Connect this project**. The page reloads once so the React development hook can start before React. Subsequent refreshes of the connected tab reconnect automatically while the companion is running.
- The binding survives browser and companion restarts. If the companion is offline, run `node /path/to/cli.mjs extension start` once and then retry the button. The companion stays running in the background while a saved binding exists. To stop it, use `extension stop`.
- The binding applies to one project per browser profile and the exact scheme, host, and port. Use **Disconnect tab** to close the panel and keep the binding. Use **Forget saved project** before setting up a different project, address, or Codex chat. If the companion is offline, forgetting removes the browser copy. The companion's copy can also be removed by deleting its local data folder.

The first setup command prints the session ID. Use `extension status --session <id>` to inspect the connection and `extension close --session <id>` to stop the session and remove its panel. `extension handoff --session <id> --batch <id>` prints a batch, and `extension verify --session <id> --batch <id>` checks it. Pass these commands to the same `cli.mjs` file used to open the session.

The preview focuses on CSS, CSS Modules, Tailwind 3/4 and React development builds. The panel docks beside the page in wide windows and appears below the page in narrow windows. Existing-chat draft filling depends on the installed Codex desktop version. The extension can be uninstalled independently of the companion. The companion keeps history under `~/.css-tuner-extension`. If you set `CSS_TUNER_EXTENSION_DATA`, choose a directory outside the files watched by your development server.
