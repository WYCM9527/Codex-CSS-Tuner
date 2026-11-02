import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { Buttons } from './Buttons';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Buttons />
  </StrictMode>,
);
