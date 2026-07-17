import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initRouter } from './router';
import './index.css';

// URL ⇄ screen sync (every feature has its own path).
initRouter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
