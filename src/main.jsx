import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initTelegram } from './lib/telegram.js';
import './index.css';

// Тему и размер окна нужно применить до первой отрисовки, иначе будет мигание.
initTelegram();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
