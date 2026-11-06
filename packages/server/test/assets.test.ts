import { describe, expect, it } from 'vitest';
import { decodeDataUrl } from '../src/assets';

describe('data: 地址解码', () => {
  it('base64', () => {
    const g = decodeDataUrl('data:image/png;base64,iVBORw0KGgo=');
    expect(g.mime).toBe('image/png');
    expect(g.data.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('百分号编码的 SVG 文本', () => {
    const g = decodeDataUrl('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E');
    expect(g.mime).toBe('image/svg+xml');
    expect(g.data.toString('utf8')).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
  });

  it('没编码的字符按 UTF-8，%XX 按字节', () => {
    expect(decodeDataUrl('data:text/plain,星标').data.toString('utf8')).toBe('星标');
    expect([...decodeDataUrl('data:application/octet-stream,%00%FFa').data]).toEqual([0, 255, 97]);
  });
});
