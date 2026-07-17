import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthGate } from './auth/AuthGate';
import { restoreSession } from './auth/local';
import { initRouter } from './router';
import './index.css';

// URL ⇄ screen sync (every feature has its own path).
initRouter();

// Validate any stored local session token before the gate decides what to show.
void restoreSession();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>,
);
