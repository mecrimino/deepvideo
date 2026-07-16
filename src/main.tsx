import { Auth0Provider } from '@auth0/auth0-react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthGate } from './auth/AuthGate';
import { AUTH0_CLIENT_ID, AUTH0_DOMAIN } from './auth/config';
import { initRouter, pathToScreen } from './router';
import { useAppStore } from './store/useAppStore';
import './index.css';

// URL ⇄ screen sync (every feature has its own path).
initRouter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Auth0Provider
      domain={AUTH0_DOMAIN}
      clientId={AUTH0_CLIENT_ID}
      cacheLocation="localstorage"
      useRefreshTokens
      authorizationParams={{ redirect_uri: window.location.origin }}
      onRedirectCallback={(appState) => {
        // Returning from Auth0: restore the path the user originally opened.
        const target = (appState?.returnTo as string | undefined) ?? window.location.pathname;
        window.history.replaceState({}, '', target);
        useAppStore.setState({ screen: pathToScreen(target) });
      }}
    >
      <AuthGate>
        <App />
      </AuthGate>
    </Auth0Provider>
  </React.StrictMode>,
);
