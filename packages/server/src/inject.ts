/** 本地服务自己的路径前缀：这些请求不转发给开发服务器 */
export const PREFIX = '/__css_tuner__/';
export const BRIDGE_PATH = `${PREFIX}bridge.js`;
export const BRIDGE_WS = `${PREFIX}ws/bridge`;
export const PANEL_WS = `${PREFIX}ws/panel`;
export const PANEL_PATH = `${PREFIX}panel/`;
export const FRAME_PATH = `${PREFIX}frame`;

/** 桥接脚本必须是第一个执行的同步脚本：React 初始化之前挂上 DevTools 钩子，组件属性才能在页面上预览 */
export const BRIDGE_TAG = `<script src="${BRIDGE_PATH}" data-css-tuner></script>`;

/** 找到能插脚本的位置之前最多攒这么多字节（流式的 HTML 也不会等太久） */
export const HEAD_LIMIT = 64 * 1024;

const CSP_META = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy(?:-report-only)?["']?[^>]*>/gi;

/**
 * 在 HTML 开头这段里插桥接脚本：<head> 之后，没有 <head> 时在 <html> 之后，再没有就在 doctype 之后或最前面。
 * 顺带去掉 <meta> 里的 CSP（响应头里的由代理去掉）。final 为 false 且还没看到 <head> 时返回 null，等更多内容
 */
export function injectHead(prefix: string, final: boolean, tag = BRIDGE_TAG): string | null {
  const head = /<head(?:\s[^>]*)?>/i.exec(prefix);
  if (!head && !final && prefix.length < HEAD_LIMIT && !/<body[\s>]/i.test(prefix)) return null;
  const html = prefix.replace(CSP_META, '');
  const at = (re: RegExp) => {
    const m = re.exec(html);
    return m ? m.index + m[0].length : -1;
  };
  let pos = at(/<head(?:\s[^>]*)?>/i);
  if (pos < 0) pos = at(/<html(?:\s[^>]*)?>/i);
  if (pos < 0) pos = at(/<!doctype[^>]*>/i);
  if (pos < 0) pos = 0;
  return html.slice(0, pos) + tag + html.slice(pos);
}

export interface BootConfig {
  token: string;
  session: string;
  /** 同源的 WebSocket 路径，桥接脚本按页面地址拼出完整地址 */
  ws: string;
  /** 页内面板的地址；设备框里的页面不放面板（面板在外面那层） */
  panel: string;
  /** 设备框页面的路径 */
  frame: string;
  /** 页面上的几句话（面板收起后的胶囊、被另一个标签页顶替时的提示） */
  text: { pill: string; pillTitle: string; superseded: string; resize: string };
}

/** 桥接脚本的内容：打包好的 bridge.js 加一句启动 */
export function bridgeScript(bundle: string, cfg: BootConfig): string {
  return `${bundle}\n;try{__cssTunerBridge.boot(${JSON.stringify(cfg)})}catch(e){console.warn('[css-tuner]',e)}\n`;
}
