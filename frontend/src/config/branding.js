/**
 * NEURAL STRIKE — single source of truth for all user-facing branding.
 *
 * Change the game name, tagline, colours and community links HERE and they
 * update everywhere. Nothing user-facing should hard-code these strings.
 */

export const BRAND = {
  GAME_NAME: 'NEURAL STRIKE',
  GAME_SHORT: 'NS',
  GAME_TAGLINE: 'Enter the grid. Own the fight.',
  LOGO: '/logo.svg', // served from public/
  VERSION: '1.0.0',

  // Brand colours (also mirrored in CSS variables in src/ui/theme.css).
  PRIMARY_BRAND: '#00E5FF', // neon cyan
  ACCENT_BRAND: '#FF2D6E', // hot magenta
  BG_VOID: '#05070D',

  // Community / links — swap placeholders for real URLs.
  WEBSITE: 'https://example.com',
  DISCORD: 'https://discord.gg/your-invite',
  TWITTER: 'https://x.com/your-handle',
  UPDATES: 'https://example.com/updates',

  // Attribution (kept for the in-game Credits screen).
  BASED_ON: 'Built on the open-source Workmelt / Claude of Duty engine (MIT).',
};

export default BRAND;
