import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App';
import { Buttons } from './Buttons';
import { Texts } from './Texts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Buttons />
    <Texts />
  </StrictMode>,
);
