import { createRoot } from 'react-dom/client';
import { getLocale, localeFrom, setLocale } from '@css-tuner/protocol';
import { App } from './App';
import { getHost } from './host';
import './styles.css';

// 扩展生成的页面在 <html lang> 上标好界面语言；浏览器里调试面板时用 ?lang=en / ?lang=zh-CN 切换
setLocale(localeFrom(new URLSearchParams(location.search).get('lang') ?? document.documentElement.lang));
document.documentElement.lang = getLocale();

void getHost().then((host) => {
  createRoot(document.getElementById('root')!).render(<App host={host} />);
});
