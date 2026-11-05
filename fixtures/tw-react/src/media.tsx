import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './media.css';
import { MediaPage } from './MediaPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MediaPage />
  </StrictMode>,
);
