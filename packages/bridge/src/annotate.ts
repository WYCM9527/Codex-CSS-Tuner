/** 面板（同源 iframe）在点击处理里同步调用：注释接口只在顶层页面上有，而且要在用户操作当中调 */
export interface AnnotateRequest {
  comment: string;
  metadata?: Record<string, string | number | boolean | null>;
  /** 这次交出去的改动所在的元素，注释落在其中看得见的那个上 */
  uids?: string[];
}

export interface AnnotateResult {
  ok: boolean;
  reason?: 'unavailable' | 'declined' | 'error';
}

type AnnotationApi = { request?: (target: Element, options: Record<string, unknown>) => { accepted?: boolean } | undefined };

function api(): AnnotationApi | undefined {
  return (document as unknown as { oai?: { annotation?: AnnotationApi } }).oai?.annotation;
}

/** 元素至少有一部分在视口里 */
export function inView(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

/** 内置浏览器的元数据最多 6 项、2048 字节；键只能是字母开头的字母、数字、空格、下划线、连字符 */
function metadata(input: AnnotateRequest['metadata']): Record<string, string | number | boolean | null> | undefined {
  if (!input) return undefined;
  // 在本页面的领域里重建对象：面板那边建的对象原型属于另一个窗口
  const out: Record<string, string | number | boolean | null> = {};
  let n = 0;
  for (const [k, v] of Object.entries(input)) {
    if (n >= 6 || !/^[A-Za-z][A-Za-z0-9 _-]{0,63}$/.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 256);
    else if (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || v === null) out[k] = v;
    else continue;
    n++;
  }
  return n && new TextEncoder().encode(JSON.stringify(out)).length <= 2048 ? out : undefined;
}

export function annotationAvailable(): boolean {
  return typeof api()?.request === 'function';
}

/** 在 window 上挂 __CSS_TUNER_ANNOTATE__；target 按这次的元素选一个注释落点 */
export function installAnnotate(target: (uids: string[]) => Element) {
  const w = window as unknown as {
    __CSS_TUNER_ANNOTATE__?: (req: AnnotateRequest) => AnnotateResult;
    __CSS_TUNER_CAN_ANNOTATE__?: () => boolean;
  };
  w.__CSS_TUNER_CAN_ANNOTATE__ = annotationAvailable;
  w.__CSS_TUNER_ANNOTATE__ = (req) => {
    const annotation = api();
    if (typeof annotation?.request !== 'function') return { ok: false, reason: 'unavailable' };
    try {
      const el = target(Array.isArray(req.uids) ? req.uids.map(String) : []);
      const options: Record<string, unknown> = { initialComment: String(req.comment ?? '').slice(0, 240) };
      const meta = metadata(req.metadata);
      if (meta) options.metadata = meta;
      const res = annotation.request(el, options);
      return res?.accepted ? { ok: true } : { ok: false, reason: 'declined' };
    } catch {
      return { ok: false, reason: 'error' };
    }
  };
}
