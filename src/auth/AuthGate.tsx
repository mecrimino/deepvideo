/**
 * The login gate: nothing in the app renders until the user is signed in.
 * Unauthenticated visitors see a branded landing page with Sign in / Create
 * account (Auth0 Universal Login handles both). While the SDK restores a
 * session (or exchanges the redirect code) we show a splash, not the app.
 */

import { useAuth0 } from '@auth0/auth0-react';
import { CircleAlert, Loader2, LogIn, UserPlus } from 'lucide-react';
import { GradientLogo } from '../components/GradientLogo';
import { colors, gradients } from '../theme';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: gradients.homeHero,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>{children}</div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, error, loginWithRedirect } = useAuth0();

  if (isLoading) {
    return (
      <Shell>
        <Loader2
          size={34}
          color={colors.accent}
          style={{ margin: '0 auto 16px', animation: 'spin 1s linear infinite' }}
        />
        <div style={{ fontSize: 14, color: colors.textDim }}>Checking your session…</div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <CircleAlert size={40} color="#e46a6a" style={{ margin: '0 auto 16px' }} />
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Sign-in failed</div>
        <div style={{ fontSize: 13, color: colors.textFaint, marginBottom: 20, lineHeight: 1.5 }}>
          {error.message}
        </div>
        <button
          onClick={() => void loginWithRedirect()}
          className="hv-blue"
          style={{
            padding: '10px 22px',
            borderRadius: 10,
            background: colors.accent,
            border: 'none',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </Shell>
    );
  }

  if (!isAuthenticated) {
    return (
      <Shell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 18 }}>
          <GradientLogo size={34} radius={9} />
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Deep Video</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em', margin: '0 0 10px' }}>
          Turn ideas into finished videos
        </h1>
        <p style={{ margin: '0 0 28px', color: colors.textDim, fontSize: 15, lineHeight: 1.55 }}>
          Script, footage, motion graphics, and edit — produced by the agent, refined by you.
          Sign in to start creating.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() =>
              void loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })
            }
            className="hv-blue"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 22px',
              borderRadius: 11,
              background: colors.accent,
              border: 'none',
              color: '#fff',
              fontSize: 14.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <UserPlus size={16} />
            Create account
          </button>
          <button
            onClick={() => void loginWithRedirect()}
            className="hv-dark"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 22px',
              borderRadius: 11,
              background: colors.control,
              border: `1px solid ${colors.border9}`,
              color: colors.textSoft,
              fontSize: 14.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <LogIn size={16} />
            Sign in
          </button>
        </div>
        <div style={{ marginTop: 22, fontSize: 12, color: colors.textGhost }}>
          An account is required to use Deep Video.
        </div>
      </Shell>
    );
  }

  return <>{children}</>;
}
