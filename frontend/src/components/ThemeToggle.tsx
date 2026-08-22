import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from './icons';

type Theme = 'light' | 'dark';

const THEME_COLORS: Record<Theme, string> = { light: '#f5f6fb', dark: '#0b0d13' };

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Light/dark theme switch. Persists the choice and updates the root attribute
 * that drives the CSS variables. Initial value comes from the no-flash script
 * in index.html, which resolves the system preference on first visit. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[theme]);
  }, [theme]);

  function toggle(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Ignore storage failures (e.g. private browsing).
    }
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
