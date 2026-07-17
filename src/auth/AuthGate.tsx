/**
 * The login gate: nothing in the app renders until the user is signed in.
 * Fully local email/password accounts (server/data/users.json) — no cloud
 * identity provider. Unauthenticated visitors get a branded landing page
 * with working Sign in / Create account forms.
 */

import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { GradientLogo } from '../components/GradientLogo';
import { colors, gradients } from '../theme';
import { getAuthState, login, signup, subscribeAuth } from './local';

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
      <div style={{ textAlign: 'center', maxWidth: 430, width: '100%' }}>{children}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: colors.card,
  border: `1px solid ${colors.border9}`,
  borderRadius: 10,
  color: colors.text,
  fontSize: 14,
  padding: '11px 13px',
};

function AuthForms() {
  const [mode, setMode] = useState<'landing' | 'signin' | 'signup'>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') await signup({ email, password, name: name || undefined });
      else await login({ email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const primaryBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 22px',
    borderRadius: 11,
    background: colors.accent,
    border: 'none',
    color: '#fff',
    fontSize: 14.5,
    fontWeight: 600,
    cursor: 'pointer',
  };
  const ghostBtn: React.CSSProperties = {
    ...primaryBtn,
    background: colors.control,
    border: `1px solid ${colors.border9}`,
    color: colors.textSoft,
  };

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 18 }}>
        <GradientLogo size={34} radius={9} />
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Deep Video</span>
      </div>

      {mode === 'landing' ? (
        <>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em', margin: '0 0 10px' }}>
            Turn ideas into finished videos
          </h1>
          <p style={{ margin: '0 0 28px', color: colors.textDim, fontSize: 15, lineHeight: 1.55 }}>
            Script, footage, motion graphics, and edit — produced by the agent, refined by you.
            Sign in to start creating.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => setMode('signup')} className="hv-blue" style={primaryBtn}>
              <UserPlus size={16} />
              Create account
            </button>
            <button onClick={() => setMode('signin')} className="hv-dark" style={ghostBtn}>
              <LogIn size={16} />
              Sign in
            </button>
          </div>
          <p style={{ marginTop: 22, fontSize: 12, color: colors.textGhost }}>
            Accounts are stored locally on this machine — no cloud services.
          </p>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          style={{
            background: colors.panel,
            border: `1px solid ${colors.border9}`,
            borderRadius: 18,
            padding: 22,
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxShadow: '0 26px 70px rgba(0,0,0,.5)',
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', marginBottom: 2 }}>
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </div>

          {mode === 'signup' && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              autoComplete="name"
              style={inputStyle}
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            required
            autoComplete="email"
            style={inputStyle}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'Password (min 6 characters)' : 'Password'}
            type="password"
            required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            style={inputStyle}
          />

          {error && (
            <div style={{ fontSize: 12.5, color: '#e46a6a', lineHeight: 1.45 }}>{error}</div>
          )}

          <button type="submit" disabled={busy} className="hv-blue" style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}>
            {busy ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : mode === 'signup' ? (
              <UserPlus size={16} />
            ) : (
              <LogIn size={16} />
            )}
            {mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>

          <div style={{ fontSize: 12.5, color: colors.textGhost, textAlign: 'center' }}>
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <a
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  style={{ color: '#6f9bff', cursor: 'pointer' }}
                >
                  Sign in
                </a>
              </>
            ) : (
              <>
                New here?{' '}
                <a
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  style={{ color: '#6f9bff', cursor: 'pointer' }}
                >
                  Create an account
                </a>
              </>
            )}
          </div>
        </form>
      )}
    </Shell>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useSyncExternalStore(subscribeAuth, getAuthState);

  if (auth.status === 'loading') {
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

  if (auth.status !== 'signedIn') return <AuthForms />;
  return <>{children}</>;
}
