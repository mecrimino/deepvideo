/**
 * The signed-in user's avatar (initial from their local account) with a
 * popover showing who is logged in and a Log out action.
 */

import { LogOut } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { colors, gradients } from '../theme';
import { getAuthState, logout, subscribeAuth } from './local';

export function UserMenu() {
  const { user } = useSyncExternalStore(subscribeAuth, getAuthState);
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={user?.email ?? 'Account'}
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: `1px solid ${colors.border10}`,
          padding: 0,
          cursor: 'pointer',
          overflow: 'hidden',
          background: gradients.avatar,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>
          {(user?.name ?? user?.email ?? '?').slice(0, 1).toUpperCase()}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 42,
            right: 0,
            width: 230,
            background: colors.raised,
            border: `1px solid ${colors.border10}`,
            borderRadius: 12,
            padding: 12,
            boxShadow: '0 18px 44px rgba(0,0,0,.55)',
            zIndex: 30,
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name ?? 'Signed in'}
          </div>
          <div style={{ fontSize: 11.5, color: colors.textGhost, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="hv-dark"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 11px',
              borderRadius: 8,
              background: colors.control,
              border: `1px solid ${colors.border9}`,
              color: colors.textSoft,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <LogOut size={14} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
