/**
 * Inline script run before hydration to set the .dark class on <html> based on
 * localStorage or the user's prefers-color-scheme. Prevents the flash of light
 * theme on dark-mode visitors.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('storyframe-theme');var d=t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');document.documentElement.dataset.themeReady='1'}catch(e){}})();`;
