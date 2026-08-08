/**
 * Dark ⇄ light theme switch. Flips `data-theme` on <html> (which swaps the CSS
 * variable palette in index.css) and persists the choice. Default is dark.
 */

import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { colors } from '../styles/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'),
  );

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('deepvideo.ui.theme', next);
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      className="hv-rail"
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      style={{
        width: 32,
        height: 32,
        borderRadius: 7,
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
      }}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
