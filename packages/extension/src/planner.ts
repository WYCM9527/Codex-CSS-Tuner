import { t, type ElementSnapshot, type PageInfo, type PreviewTarget, type RuleRef, type Scope, type SheetInfo, type Target } from '@css-tuner/protocol';
import type { ProjectResolver } from './project';
import type { LiteralInfo, SiteInfo } from './sites';

/** 引擎写回需要的全部信息 */
export type WriteSpec =
  | {
      kind: 'tailwind';
      file: string;
      line: number;
      column: number;
      /** 当前生效的工具类（含变体），没有时表示新增类名 */
      utility: string | null;
      /** 含 @import "tailwindcss" 的 CSS 入口，用来加载项目的设计系统 */
      entry: string | null;
      /** (line, column) 是类名字符串字面量（变体、cva 基础类、类名常量） */
      literal?: boolean;
      /** 在调用处追加覆盖类，只改这一处实例 */
      override?: boolean;
    }
  | {
      kind: 'css';
      file: string;
      selector: string;
      fullSelector: string;
      conditions: string[];
      ordinal: number;
      /** edit：改命中规则里的声明；add：往元素自己的规则里加声明 */
      mode: 'edit' | 'add';
      /** 值来自哪个声明（简写 / 逻辑别名），引擎据此决定改哪一条 */
      via: string | null;
    }
  /** Tailwind 主题变量：改 @theme 里的声明，项目没声明过就加一条 */
  | { kind: 'theme'; file: string; name: string }
  /** (line, column) 处 JSX 元素的文字子节点，segment 是运行时 children 数组里的下标 */
  | { kind: 'jsxText'; file: string; line: number; column: number; segment: number }
  /** (line, column) 处 JSX 元素上的属性，如组件调用处的 title="..." */
  | { kind: 'jsxAttr'; file: string; line: number; column: number; name: string }
  /** 多语言 JSON 文件里的一条消息 */
  | { kind: 'message'; file: string; keyPath: string[] }
  /** 换序：jsxOrder 的 (line, column) 是父元素，arrayOrder 的是 .map() 用的数组字面量 */
  | { kind: 'jsxOrder' | 'arrayOrder'; file: string; line: number; column: number; from: number; to: number }
  /** 纯 HTML：path 是元素从 <html> 起逐层的子元素下标 */
  | { kind: 'htmlText'; file: string; path: number[]; segment: number }
  | { kind: 'htmlOrder'; file: string; path: number[]; from: number; to: number }
  | { kind: 'agent'; reason: string };

export interface Plan {
  view: Target;
  preview: PreviewTarget;
  write: WriteSpec;
}

export interface PlanContext {
  page: PageInfo;
  project: ProjectResolver;
  strategy: 'editRule' | 'agent';
  varStrategy: 'editDefinition' | 'agent';
  /** instance：尽量只改这一处实例；source：改组件定义 / 变体，所有用到的地方一起变 */
  scope: Scope;
  /** JSX 位置上 className 的静态信息，读不到或解析不了时为 null */
  classSite: (file: string, line: number, column: number) => SiteInfo | null;
  /** 文件里写类名的字符串字面量（变体、cva 基础类、类名常量） */
  classLiterals: (file: string) => LiteralInfo[] | null;
  /** 规则实际所在的文件（入口样式表 @import 进来的文件）和源文件里的选择器写法，找不到时为 null */
  ruleSource: (entry: string, ref: RuleRef) => { file: string; selector: string } | null;
  /** 类名是不是项目设计系统里的工具类（设计系统没加载时当作不是） */
  isUtility: (candidate: string) => boolean;
}

/** Tailwind 4 的工具类都在 @layer utilities 里；不在层里的类名规则多半是写在入口 CSS 里的普通规则 */
function utilityOf(ref: RuleRef, ctx: PlanContext): string | null {
  if (!ref.utility) return null;
  return ref.layer !== null || ctx.isUtility(ref.utility) ? ref.utility : null;
}

interface ClassWriteSite {
  file: string;
  line: number;
  column: number;
  affects: number;
  /** 0 是元素自己的组件，n 是第 n 层组件调用处 */
  depth: number;
  label: string;
  literal: boolean;
  override: boolean;
  /** 写在变体字符串里：预览只作用于带这个类的同源元素 */
  withClass?: string;
}

const FRAMEWORK_LAYERS = new Set(['theme', 'base', 'properties']);

function sheetOf(page: PageInfo, ref: RuleRef): SheetInfo | undefined {
  return page.sheets.find((s) => s.index === ref.sheet.index);
}

function isFramework(page: PageInfo, ref: RuleRef): boolean {
  const s = sheetOf(page, ref);
  return !!s?.tailwind && ref.layer !== null && FRAMEWORK_LAYERS.has(ref.layer.split('.')[0]);
}

/** 页面上 Tailwind 样式表对应的 CSS 入口文件 */
export function tailwindEntry(page: PageInfo, project: ProjectResolver): string | null {
  for (const s of page.sheets) {
    if (!s.tailwind || (!s.devId && !s.href)) continue;
    const f = project.sheetFile(page.url, s);
    if (f) return f;
  }
  return null;
}

/** 嵌套规则显示展开后的选择器：`& .row` → `.panel .row` */
export function prettySelector(ref: RuleRef): string {
  if (!ref.selector.includes('&')) return ref.selector;
  return ref.fullSelector.replace(/:is\(([^(),]+)\)/g, '$1');
}

export function sourceKeyOf(el: ElementSnapshot): string | null {
  return el.source ? `${el.source.path}:${el.source.line}:${el.source.column}` : null;
}

/** 给选中元素的某个属性决定写回目标和预览方式 */
export function plan(el: ElementSnapshot, prop: string, ctx: PlanContext): Plan {
  const { page, project } = ctx;
  const pageUrl = page.url;
  const w = el.winners[prop];
  const srcFile = el.source ? project.fileFor(pageUrl, el.source.path, el.source.file) : null;
  const srcLabel = srcFile && el.source ? `${project.label(srcFile)}:${el.source.line} className` : '';
  const inline: PreviewTarget = { kind: 'inline', uid: el.uid, sourceKey: sourceKeyOf(el) };
  const instanceAffects = el.source ? el.sameSource : 1;
  const twPage = page.sheets.some((s) => s.tailwind);

  const agent = (reason: string, preview: PreviewTarget = { kind: 'inline', uid: el.uid, sourceKey: null }): Plan => ({
    view: { kind: 'agent', label: t('plan.agent'), affects: preview.kind === 'inline' && preview.sourceKey ? instanceAffects : 1, reason },
    preview,
    write: { kind: 'agent', reason },
  });

  /**
   * 类名写在哪：元素自己的 JSX、外层组件调用处（经 className 参数传进来）、或定义文件里的变体字符串。
   * instance 范围下，组件用 cn / twMerge 合并类名时，在调用处追加覆盖类，只改这一处实例。
   */
  const classSite = (utility: string | null): ClassWriteSite | { reason: string } => {
    const own: ClassWriteSite = { file: srcFile!, line: el.source!.line, column: el.source!.column, affects: instanceAffects, depth: 0, label: srcLabel, literal: false, override: false };
    const ownInfo = ctx.classSite(own.file, own.line, own.column);
    const callers = (el.callers ?? []).flatMap((c, i) => {
      const file = project.fileFor(pageUrl, c.source.path, c.source.file);
      const info = file ? ctx.classSite(file, c.source.line, c.source.column) : null;
      return file && info ? [{ c, depth: i + 1, file, info }] : [];
    });
    type Caller = (typeof callers)[number];
    const atCaller = (x: Caller, override: boolean): ClassWriteSite => ({
      file: x.file,
      line: x.c.source.line,
      column: x.c.source.column,
      affects: x.c.same,
      depth: x.depth,
      label: `${project.label(x.file)}:${x.c.source.line} <${x.c.component ?? t('plan.component')}> className${override ? t('plan.override') : ''}`,
      literal: false,
      override,
    });
    // 调用处写的类会落到这个元素上：字面量里的类都在元素上；或调用处没写 className，而组件把 className 参数传了下去
    const passes = (x: Caller) =>
      x.info.tokens.length ? x.info.tokens.every((t) => el.classes.includes(t)) : x.depth === 1 && !x.info.hasClassName && !!ownInfo?.passesClassName;
    // 变体字符串：含这个类、且其余类大多也在元素上（排除别的变体）；同分取靠后的，cn / cva 里后写的覆盖先写的
    const literalIn = (file: string, depth: number, token: string): ClassWriteSite | null => {
      const best = (ctx.classLiterals(file) ?? [])
        .filter((l) => l.tokens.includes(token))
        .map((l) => ({ l, s: l.tokens.filter((t) => el.classes.includes(t)).length / l.tokens.length }))
        .filter((x) => x.s >= 0.5)
        .sort((a, b) => b.s - a.s || b.l.line - a.l.line)[0]?.l;
      if (!best) return null;
      return {
        file,
        line: best.line,
        column: best.column,
        affects: el.classCounts?.[token] ?? instanceAffects,
        depth,
        label: `${project.label(file)}:${best.line} ${best.name || t('plan.classString')}`,
        literal: true,
        override: false,
        withClass: token,
      };
    };
    const recipeBase = (): ClassWriteSite | null => {
      const r = ownInfo?.recipe;
      if (!r) return null;
      const lit = ctx.classLiterals(own.file)?.find((l) => l.line === r.line && l.column === r.column);
      return { ...own, line: r.line, column: r.column, label: `${project.label(own.file)}:${r.line} ${lit?.name || t('plan.componentBase')}`, literal: true };
    };

    if (!utility) {
      if (ctx.scope === 'instance') {
        const x = callers.find((x) => passes(x) && x.c.same <= own.affects);
        if (x) return atCaller(x, false);
      }
      if (ownInfo?.hasClassName && !ownInfo.tokens.length) return recipeBase() ?? own;
      return own;
    }

    let where: ClassWriteSite | null = null;
    if (!ownInfo || ownInfo.tokens.includes(utility)) where = own;
    else {
      const x = callers.find((x) => x.info.tokens.includes(utility));
      if (x) where = atCaller(x, false);
    }
    where ??= literalIn(own.file, 0, utility);
    for (const x of callers) where ??= literalIn(x.file, x.depth, utility);
    if (!where) return { reason: t('plan.utilityNowhere', { cls: utility }) };

    if (ctx.scope === 'instance' && where.depth === 0 && where.affects > 1 && ownInfo?.merges) {
      const narrower = callers.find((x) => passes(x) && x.c.same < where!.affects);
      if (narrower) return atCaller(narrower, true);
    }
    return where;
  };

  const tailwind = (utility: string | null): Plan => {
    if (!srcFile || !el.source) return agent(t('plan.noJsxSource'));
    const site = classSite(utility);
    if ('reason' in site) return agent(site.reason);
    const preview: PreviewTarget =
      site.depth === 0 && !site.withClass ? inline : { ...inline, ...(site.depth ? { depth: site.depth } : {}), ...(site.withClass ? { withClass: site.withClass } : {}) };
    return {
      view: { kind: 'tailwind', label: site.label, file: site.file, line: site.line, column: site.column, affects: site.affects },
      preview,
      write: {
        kind: 'tailwind',
        file: site.file,
        line: site.line,
        column: site.column,
        utility,
        entry: tailwindEntry(page, project),
        ...(site.literal ? { literal: true } : {}),
        ...(site.override ? { override: true } : {}),
      },
    };
  };

  const css = (ref: RuleRef, mode: 'edit' | 'add', via: string | null): Plan => {
    const file = project.sheetFile(pageUrl, ref.sheet);
    if (!file) return agent(t('plan.noRuleFile'), { kind: 'rule', rule: ref, uid: el.uid });
    if (ctx.strategy === 'agent') return agent(t('plan.cssToAgent'), { kind: 'rule', rule: ref, uid: el.uid });
    const src = ctx.ruleSource(file, ref);
    const real = src?.file ?? file;
    return {
      view: { kind: 'css', label: `${project.label(real)} ${src?.selector ?? prettySelector(ref)}`, file: real, affects: ref.matchCount },
      preview: { kind: 'rule', rule: ref, uid: el.uid },
      write: { kind: 'css', file, selector: ref.selector, fullSelector: ref.fullSelector, conditions: ref.conditions, ordinal: ref.ordinal, mode, via },
    };
  };

  if (w?.origin === 'inline') return agent(t('plan.inlineStyle'));

  if (w?.origin === 'rule' && w.rule && !isFramework(page, w.rule)) {
    const utility = utilityOf(w.rule, ctx);
    if (utility) return tailwind(utility);
    if (/^\s*>|:has\(|:hover|:focus/.test(w.rule.selector) && w.rule.matchCount > 1 && sheetOf(page, w.rule)?.tailwind) {
      return agent(t('plan.parentTwSelector'));
    }
    return css(w.rule, 'edit', w.via);
  }

  // 没有作者声明（继承、初始值或只命中了 Tailwind 预设样式）：Tailwind 项目加类名，CSS 项目加到元素自己的规则里
  if (twPage && el.source && srcFile) return tailwind(null);
  const own = ownRule(el, page, (r) => !utilityOf(r, ctx) && !!project.sheetFile(pageUrl, r.sheet));
  if (own) return css(own, 'add', null);
  return agent(t('plan.noWritableRule'));
}

/**
 * 改元素用到的 CSS 变量：预览改定义它的那条规则，页面上用到它的地方一起变；
 * 写回改定义处，Tailwind 的主题变量改 @theme。
 */
export function planVar(el: ElementSnapshot, name: string, ctx: PlanContext): Plan {
  const { page, project } = ctx;
  const w = el.winners[name];
  const agent = (reason: string, preview: PreviewTarget = { kind: 'inline', uid: el.uid, sourceKey: null }): Plan => ({
    view: { kind: 'agent', label: t('plan.agent'), affects: 1, reason },
    preview,
    write: { kind: 'agent', reason },
  });
  if (!w || w.origin === 'initial') return agent(t('plan.varNotFound'));
  if (!w.rule) return agent(t('plan.varInline'));
  const preview: PreviewTarget = { kind: 'rule', rule: w.rule, uid: el.uid };
  if (ctx.varStrategy === 'agent') return agent(t('plan.varToAgent'), preview);
  const file = project.sheetFile(page.url, w.rule.sheet);
  if (!file) return agent(t('plan.varNoFile'), preview);
  if (sheetOf(page, w.rule)?.tailwind && w.rule.layer?.split('.')[0] === 'theme') {
    return { view: { kind: 'css', label: `${project.label(file)} @theme ${name}`, file, affects: 0 }, preview, write: { kind: 'theme', file, name } };
  }
  if (isFramework(page, w.rule)) return agent(t('plan.varInPreset'), preview);
  const src = ctx.ruleSource(file, w.rule);
  const real = src?.file ?? file;
  return {
    view: { kind: 'css', label: `${project.label(real)} ${src?.selector ?? prettySelector(w.rule)} ${name}`, file: real, affects: 0 },
    preview,
    write: { kind: 'css', file, selector: w.rule.selector, fullSelector: w.rule.fullSelector, conditions: w.rule.conditions, ordinal: w.rule.ordinal, mode: 'edit', via: null },
  };
}

/** 加声明用的规则：优先级最高、且最后一段选择器写着元素自己的类名或 id 的作者规则 */
function ownRule(el: ElementSnapshot, page: PageInfo, writable: (r: RuleRef) => boolean): RuleRef | null {
  const candidates = [...el.rules].reverse().filter((r) => !isFramework(page, r) && writable(r));
  const subject = (r: RuleRef) => r.fullSelector.split(/\s*[\s>+~]\s*/).pop() ?? '';
  return (
    candidates.find((r) => {
      const last = subject(r);
      return el.classes.some((c) => last.includes(`.${c}`)) || (!!el.id && last.includes(`#${el.id}`));
    }) ??
    candidates[0] ??
    null
  );
}
