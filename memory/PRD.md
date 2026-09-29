# NEURAL STRIKE — PRD

## Original problem statement
Turn the open-source Workmelt (Claude of Duty) browser multiplayer FPS into a
polished standalone game "NEURAL STRIKE": preserve the working Three.js FPS +
real WebSocket multiplayer, rebrand, and add a modern AAA menu/UI. Deploy the
frontend + multiplayer backend behind one public HTTPS URL with working WSS and
invite links (`?room=ABCD`). Working multiplayer FIRST, polish SECOND.

## Architecture (as built on this platform)
- **Frontend** (`/app/frontend`): Workmelt's Vite + Three.js client, served by
  supervisor `yarn start` → Vite on :3000. Only runtime dep: `three`.
- **Backend** (`/app/backend/server.py`): Workmelt's Node relay faithfully
  **ported to a FastAPI WebSocket** at `/api/ws` (uvicorn :8001). Real
  server-authoritative relay: rooms, roster, skins, ready-up, 3-2-1 countdown,
  20 Hz snapshot tick, fire/hit/kill relay, score, bounded FFA + ceremony.
- Ingress routes `/api/*` (incl. WS upgrade) → 8001; else → 3000. Client connects
  same-origin `wss://<host>/api/ws`.
- Cloudflare Worker/DO files kept in repo for alternative edge deploy.

## User personas
- Player who opens a link and wants to jump into a quick FPS match with friends.
- Host who creates a room, picks a map, shares the invite link.

## Core requirements (static)
- Preserve gameplay: rendering, FPS controller, weapons, physics, damage,
  networking, room/match/scoreboard, remote interpolation. (Untouched.)
- New branding via one config file; MIT + third-party attribution preserved.
- New main menu: PLAY / LOADOUT / PROFILE / LEADERBOARD / COMMUNITY / SETTINGS.
- Real network multiplayer, HTTPS/WSS, working invite URLs.

## Implemented (2026-06)
- **Phase 1 verified**: client served + all modules transform; lobby DOM renders
  with all maps; relay protocol 19/19; WSS handshake over ingress; testing agent
  backend 5/5 + frontend 44/44, zero issues.
- **Phase 2 preserved**: no gameplay systems modified (only net server URL,
  brand tokens, one additive `stats:result` emit, and an additive menu shell).
- **Phase 3 branding**: `src/config/branding.js` is the single source; wordmark,
  page title, pause-menu title, and accent colour all derive from it. Cyan
  accent (#00E5FF). Credits & Licenses page with full attribution.
- **Phase 4 main menu shell** (`src/ui/shell/`): animated dark/tactical menu over
  the live scene. PLAY (callsign + Quick/Create/Join, map select, invite
  deep-link), LOADOUT (real M4A1/MPX-9/G31/AX-7 stats), PROFILE (local career
  stats via CareerStats), LEADERBOARD (live room roster), COMMUNITY (config
  links), SETTINGS (opens the real in-game settings), CREDITS.
- Existing Workmelt lobby, HUD, pause/settings, scoreboard, match ceremony all
  preserved and reachable.
- README with dev / multiplayer testing / deploy / env vars / branding / maps /
  weapons / community docs.

## Backlog / remaining (P1/P2)
- **P1** Persist a "Main Menu" return button on the match-end ceremony and pause
  menu (currently ceremony walks back to the lobby; shell is the initial gate).
- **P1** Wire real community URLs (user said they'd provide) into branding.js.
- **P2** Cloud leaderboard/profile backend (Mongo is wired; endpoints TBD).
- **P2** Accuracy stat (needs local-vs-bot shot disambiguation).
- **P2** Replace deprecated FastAPI `on_event` with a lifespan handler.

## Next tasks
- Add global "Main Menu" entry points from pause/ceremony to reopen the shell.
- Optional: Mongo-backed global leaderboard behind `/api/leaderboard`.
