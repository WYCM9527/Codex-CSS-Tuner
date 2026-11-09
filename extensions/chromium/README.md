# CSS Tuner Chrome extension preview

The Chrome extension shows the tuning panel on an HTTP development page on `localhost` or `127.0.0.1`. The companion CLI reads source in the chosen project, builds handoff batches, and opens drafts in the local Codex chat you bind. The draft is sent when you review and submit it in Codex.

## Build and run on macOS

1. Run `node scripts/build-chrome.mjs` and `node packages/server/build-extension.mjs` from the repository with its workspace dependencies installed.
2. Load `dist/css-tuner-chrome` as an unpacked extension. Start your local development server and open the page in the browser where you installed CSS Tuner.
3. Open the local Codex chat for your project and copy its deep link. The macOS shortcut is `⌘⌥L`.
4. Run the companion while the project tab is active. Paste the `css-tuner://pair?...` link it prints into the CSS Tuner toolbar popup and choose **Connect this project tab**.

   ```sh
   node dist/css-tuner-extension-companion/cli.mjs extension open http://127.0.0.1:5173/ \
     --root /absolute/path/to/project \
     --chat 'codex://threads/YOUR-CHAT-ID' --link
   ```

   The pairing link is valid for five minutes and can be used once. The project tab reloads so the React development hook can start before React. Later reloads of the same paired tab reconnect automatically while the browser and companion session are active. Pair again if you switch project tabs, reload the extension, or restart the browser or companion. The popup also accepts the CLI's original JSON format.

5. Pick an element, change a value, and select **Apply**. Confirm that CSS Tuner may replace the bound chat’s unsent draft. Review and send the draft in Codex. The panel checks the page after your source changes. Use **Revert** on an applied change to draft a separate undo batch.

The CLI prints the session ID. Use `extension status --session <id>` to inspect the connection and `extension close --session <id>` to stop the session and remove its panel. `extension handoff --session <id> --batch <id>` prints a batch, and `extension verify --session <id> --batch <id>` checks it. Pass these commands to the same `cli.mjs` file used to open the session.

The preview focuses on CSS, CSS Modules, Tailwind 3/4 and React development builds. The panel docks beside the page in wide windows and appears below the page in narrow windows. Existing-chat draft filling depends on the installed Codex desktop version. The extension can be uninstalled independently of the companion. The companion keeps history under `~/.css-tuner-extension`. If you set `CSS_TUNER_EXTENSION_DATA`, choose a directory outside the files watched by your development server.
