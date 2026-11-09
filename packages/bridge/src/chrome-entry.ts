import { installHook } from './devtools';
import { extensionBridge } from './index';

const CHANNEL = 'css-tuner-extension';
if (window === window.top && sessionStorage.getItem(CHANNEL)) {
  installHook();
  let bridge: ReturnType<typeof extensionBridge> | undefined;
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== CHANNEL || event.data?.direction !== 'to-page') return;
    const { type, text } = event.data;
    if (type === 'open') {
      bridge ??= extensionBridge((text) => window.postMessage({ channel: CHANNEL, direction: 'from-page', text }, location.origin));
      bridge.setRelayOnline(true);
    } else if (type === 'offline') {
      bridge?.setRelayOnline(false);
    } else if (type === 'close') {
      bridge?.shutdown();
      bridge = undefined;
    } else if (type === 'message' && typeof text === 'string') {
      if (bridge?.connected()) bridge.receive(text);
    }
  });
}
