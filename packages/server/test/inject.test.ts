import { describe, expect, it } from 'vitest';
import { BRIDGE_TAG, HEAD_LIMIT, bridgeScript, injectHead } from '../src/inject';

const T = '<s/>';

describe('injectHead', () => {
  it('插在 <head> 后面（带属性的也认），排在页面自己的脚本前面', () => {
    expect(injectHead('<html><head><script src="/a.js"></script>', false, T)).toBe(`<html><head>${T}<script src="/a.js"></script>`);
    expect(injectHead('<HTML><HEAD data-x="1"><title>', false, T)).toBe(`<HTML><HEAD data-x="1">${T}<title>`);
    expect(injectHead('<header>x</header>', true, T)).toBe(`${T}<header>x</header>`);
  });

  it('还没看到 <head> 时等更多内容；收完了、看到 <body> 或攒够了就不等了', () => {
    expect(injectHead('<!doctype html><html lang="en">', false, T)).toBeNull();
    expect(injectHead('<!doctype html><html lang="en">', true, T)).toBe(`<!doctype html><html lang="en">${T}`);
    expect(injectHead('<!DOCTYPE html><body>x', false, T)).toBe(`<!DOCTYPE html>${T}<body>x`);
    expect(injectHead('plain text', true, T)).toBe(`${T}plain text`);
    expect(injectHead(' '.repeat(HEAD_LIMIT), false, T)).not.toBeNull();
  });

  it('去掉 <meta> 里的 CSP，别的 meta 不动', () => {
    const html = `<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'none'"><meta http-equiv=content-security-policy-report-only content="x"><meta name="viewport" content="width=device-width">`;
    expect(injectHead(html, false, T)).toBe(`<head>${T}<meta charset="utf-8"><meta name="viewport" content="width=device-width">`);
  });

  it('默认插桥接脚本标签', () => {
    expect(injectHead('<head>', true)).toBe(`<head>${BRIDGE_TAG}`);
  });
});

describe('bridgeScript', () => {
  it('打包的脚本后面接一句带配置的启动，出错只警告', () => {
    const text = { pill: 'P', pillTitle: 'PT', superseded: 'S', resize: 'R' };
    const js = bridgeScript('var __cssTunerBridge={}', { token: 't', session: 's', ws: '/w', panel: '/p/', frame: '/f', text });
    expect(js).toContain(
      '__cssTunerBridge.boot({"token":"t","session":"s","ws":"/w","panel":"/p/","frame":"/f","text":{"pill":"P","pillTitle":"PT","superseded":"S","resize":"R"}})',
    );
    expect(js).toContain("console.warn('[css-tuner]',e)");
  });
});
