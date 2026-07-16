/**
 * Auth0 SPA configuration. Domain and Client ID are PUBLIC identifiers by
 * design (the SPA flow is Authorization Code + PKCE — no secret involved).
 * The Client Secret stays in .env for server-side use only and must never
 * appear in frontend code.
 *
 * Auth0 dashboard requirements for this app (Applications → Settings):
 *   - Allowed Callback URLs:  http://localhost:5173
 *   - Allowed Logout URLs:    http://localhost:5173
 *   - Allowed Web Origins:    http://localhost:5173
 * Add any other dev ports/origins you actually serve from.
 */

export const AUTH0_DOMAIN: string =
  (import.meta.env.VITE_AUTH0_DOMAIN as string | undefined) ?? 'dev-bolxj7q0unf8k4ev.us.auth0.com';

export const AUTH0_CLIENT_ID: string =
  (import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined) ?? 'IBn6jriLGNctGGrvAszQrlaUk5V7RKic';
