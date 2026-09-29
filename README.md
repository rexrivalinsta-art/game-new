# NEURAL STRIKE

A modern browser multiplayer FPS. Built on the open-source **Workmelt** engine
(forked from **Claude of Duty**), rebranded and wrapped in a new AAA-style
front-end. Three.js rendering, hand-built physics, procedural assets, and **real
WebSocket multiplayer** — preserved intact. Only the presentation, branding and
menu shell are new.

> The original engine README (rendering, physics, maps, tooling, performance,
> honest assessment) is preserved at `frontend/README.md`.

---

## Architecture on this platform

The upstream project ships a Vite client + a Node WebSocket relay (and an
optional Cloudflare Worker/Durable-Objects path). This deployment adapts it to
the platform's fixed two-process layout **without faking multiplayer**:

| Piece | Runs as | Notes |
|------|---------|-------|
| **Client** (Vite + Three.js) | `frontend` (`yarn start` → Vite on :3000) | the game + new NEURAL STRIKE menu shell |
| **Multiplayer relay** | `backend` (FastAPI/uvicorn on :8001) | Workmelt's Node relay **faithfully ported to a FastAPI WebSocket** at `/api/ws` |

The Kubernetes ingress terminates HTTPS and routes `/api/*` (including the WS
upgrade) to the backend, everything else to the client. So the client connects
same-origin to `wss://<host>/api/ws` — real server-authoritative relay
multiplayer over production HTTPS. The Cloudflare Worker files (`frontend/worker/`,
`frontend/wrangler.toml`) are kept for an alternative edge deploy.

The relay is a faithful port of `frontend/server/index.mjs`: rooms, roster,
distinct colour slots, ready-up, 3-2-1 countdown, 20 Hz snapshot tick, fire/hit
relay (trust-the-shooter), authoritative score, bounded free-for-all
(first to 15 / 5 min) and the end-of-match ceremony.

---

## Local development

```bash
# client
cd frontend && yarn install && yarn start        # Vite on :3000

# relay (this platform runs it as the FastAPI backend)
cd backend && uvicorn server:app --host 0.0.0.0 --port 8001
```

Or run the original upstream stack directly from `frontend/`:
`yarn dev` (client only) / `npm run dev:mp` (client + Node relay on :8787).

### Multiplayer local testing (no browser / no GPU)

The relay protocol can be driven directly — fast and deterministic:

```bash
python tests/relay_test.py        # two clients vs localhost:8001/api/ws (19 checks)
python tests/wss_ingress_test.py  # handshake over the production WSS ingress
```

The 3D game itself needs a real GPU browser. In a headless/SwiftShader container
use engine-free UI mode: open `http://localhost:3000/?renderGame=false` to render
the menu + lobby DOM instantly with no WebGL.

---

## Production deployment

Deploy the platform's frontend + backend. HTTPS and the `/api/ws` WebSocket work
over the ingress automatically. Invite links are same-origin, e.g.
`https://<your-domain>/?room=abcd12` — opening one drops the player straight into
the Join Room experience for that room.

### Environment variables (backend relay — all optional, sensible defaults)

| Var | Default | Meaning |
|-----|---------|---------|
| `MONGO_URL`, `DB_NAME` | (provided) | Mongo connection (reserved for future cloud leaderboard/profiles) |
| `TICK_HZ` | 20 | snapshot broadcast rate |
| `MAX_ROOM` | 12 | max players per room |
| `COUNTDOWN_MS` | 3000 | pre-match countdown |
| `SCORE_LIMIT` | 15 | kills that win a match |
| `MATCH_MS` | 300000 | match length before the leader wins on time |

---

## How to change the branding

Edit **one file**: `frontend/src/config/branding.js`.

```js
export const BRAND = {
  GAME_NAME: 'NEURAL STRIKE',   // wordmark, menu, page title, pause menu
  GAME_TAGLINE: '…',
  PRIMARY_BRAND: '#00E5FF',      // accent colour across the whole UI
  ACCENT_BRAND:  '#FF2D6E',
  VERSION: '1.0.0',
  WEBSITE, DISCORD, TWITTER, UPDATES,  // Community page links
};
```

`GAME_NAME` and `PRIMARY_BRAND` propagate to the menu shell, the wordmark
(`src/ui/brand.js`), the in-game pause/settings title (`src/ui/menu.js`) and the
`--wm-accent` token used by the lobby / HUD / scoreboard.

## How to configure community links

Same file — `WEBSITE`, `DISCORD`, `TWITTER`, `UPDATES`. They render on the
Community page. Placeholders ship by default; drop in your real URLs.

## How to add maps

Maps are code modules. Add one module + one line in `frontend/src/world/maps.js`
(see `frontend/ARCHITECTURE.md`). It then appears automatically in the Create
Room map selector and the lobby.

## How to change weapons

Weapon definitions live in `frontend/src/weapons/defs.js` (`WEAPON_DEFS`). The
Loadout screen reads this catalogue directly, so edits show up there and in-game.
Balance is preserved as shipped.

---

## Legal / attribution

MIT-licensed. The `LICENSE` file and all third-party attribution are preserved:
- Engine: Workmelt / Claude of Duty (MIT)
- three.js (MIT)
- Footstep SFX pack (CC BY 3.0) — `frontend/public/sfx/CREDITS.md`
- G31 model (CC BY 4.0) — `frontend/public/models/CREDITS.md`

All of the above are surfaced in-game on the **Credits & Licenses** menu page.
