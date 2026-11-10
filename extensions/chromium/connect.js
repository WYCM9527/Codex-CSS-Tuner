{
  const button = document.getElementById('css-tuner-connect');
  const status = document.getElementById('css-tuner-connect-status');
  const target = document.getElementById('css-tuner-target');
  if (button && status && target) {
    const zh = /^zh\b/i.test(document.documentElement.lang);
    const code = location.hash.slice(1);
    const unavailable = zh ? '配对链接不可用，请用 CLI 生成新链接。' : 'This pairing link is unavailable. Generate a new link with the CLI.';
    if (!/^[a-f0-9]{64}$/.test(code)) {
      status.textContent = unavailable;
    } else {
      history.replaceState(null, '', location.pathname);
      status.textContent = zh ? '正在确认配对链接…' : 'Checking the pairing link…';
      void chrome.runtime.sendMessage({ type: 'connectDetails', code }).then((details) => {
        if (!details?.ok) throw new Error(unavailable);
        const url = new URL(details.url);
        if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password) throw new Error(unavailable);
        target.textContent = url.href;
        for (const [field, row] of [['root', 'project'], ['chat', 'conversation']]) {
          const output = document.getElementById(`css-tuner-${field}`);
          if (output && details[field]) {
            output.textContent = details[field];
            document.getElementById(`css-tuner-${row}`).hidden = false;
          }
        }
        if (details.canRemember) document.getElementById('css-tuner-remember').hidden = false;
        status.textContent = '';
        button.disabled = false;
        button.addEventListener('click', async (event) => {
          if (!event.isTrusted || button.disabled) return;
          button.disabled = true;
          status.textContent = zh ? '正在配对…' : 'Pairing…';
          try {
            const result = await chrome.runtime.sendMessage({ type: 'connectPreview', code, url: url.href, remember: details.canRemember === true });
            if (!result?.ok) throw new Error(result?.error ?? unavailable);
            location.replace(url.href);
          } catch (error) {
            status.textContent = error.message;
            button.disabled = false;
          }
        });
      }).catch(() => { status.textContent = unavailable; });
    }
  }
}
