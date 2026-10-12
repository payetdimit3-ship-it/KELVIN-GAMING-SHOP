// js/config.js
// Hii file inatengenezwa na build.sh wakati wa deploy
// HAIPASWI kuwa kwenye GitHub

window.ENV = {
  SUPABASE_URL: '%%SUPABASE_URL%%',
  SUPABASE_ANON_KEY: '%%SUPABASE_ANON_KEY%%',
  
  // Optional (zinaweza kubadilishwa kwenye Admin Settings baadaye)
  SITE_NAME: 'LifeisGameTz',
  SITE_URL: 'https://lifesgametz.com',
  CURRENCY: 'TSh',
  CURRENCY_CODE: 'TZS',
  LANGUAGE: 'sw'
};