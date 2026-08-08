import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initRouter } from './router';
import './styles/index.css';

// Apply the saved theme before first paint (default dark). Toggle in the TopBar.
document.documentElement.dataset.theme =
  localStorage.getItem('deepvideo.ui.theme') === 'light' ? 'light' : 'dark';

// URL ⇄ screen sync (every feature has its own path).
initRouter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
