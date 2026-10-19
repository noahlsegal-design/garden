// Choices kept on this phone only (not shared with the garden): what shows on Today, and Auto / Light / Dark.
// index.html sets the theme before the page draws, so dark mode doesn't flash light first; this file changes it
// while the app is open.

const KEY = "garden.prefs";
export const THEMES = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
export const DEFAULTS = { photos: true, whoDid: true, theme: "auto" };

// Whatever was saved, with anything missing or unknown back to its default.
export function cleanPrefs(saved) {
  const s = saved && typeof saved === "object" ? saved : {};
  return {
    photos: typeof s.photos === "boolean" ? s.photos : DEFAULTS.photos,
    whoDid: typeof s.whoDid === "boolean" ? s.whoDid : DEFAULTS.whoDid,
    theme: THEMES.some(([id]) => id === s.theme) ? s.theme : DEFAULTS.theme,
  };
}

let prefs = null;
export function getPrefs() {
  if (!prefs) {
    try { prefs = cleanPrefs(JSON.parse(localStorage.getItem(KEY))); } catch { prefs = cleanPrefs(null); }
  }
  return prefs;
}
export function setPref(name, value) {
  prefs = cleanPrefs({ ...getPrefs(), [name]: value });
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private browsing: it just won't be remembered */ }
  if (name === "theme") applyTheme(prefs.theme);
  return prefs;
}

// The colour behind the clock and battery for each look (the same as --paper in styles.css).
const BAR = { light: "#EEF2E6", dark: "#131A14" };
// Auto leaves data-theme off, so styles.css follows the phone; Light and Dark set it, which overrides the phone.
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const own = /dark/.test(meta.media) ? "dark" : "light";
    meta.content = BAR[theme === "light" || theme === "dark" ? theme : own];
  }
}
