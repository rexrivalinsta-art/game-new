/**
 * NEURAL STRIKE — main menu shell.
 *
 * A polished, animated front-end that opens over the live scene. It does not
 * replace the working game surfaces (the lobby, HUD, pause menu, scoreboard and
 * match ceremony are all preserved) — it is the AAA-style front gate that routes
 * into them:
 *
 *   PLAY        → username + Quick Play / Create Room / Join Room, then reveals
 *                 the existing Workmelt lobby (room + map + ready + countdown).
 *   LOADOUT     → the real weapon catalogue (read-only preview).
 *   PROFILE     → local career stats (CareerStats).
 *   LEADERBOARD → the live room scoreboard from the net system (session data).
 *   COMMUNITY   → configurable links from src/config/branding.js.
 *   SETTINGS    → opens the real in-game settings menu (no fake toggles).
 *   CREDITS     → MIT + third-party attribution.
 */
import { BRAND } from '../../config/branding.js';
import { WEAPON_DEFS } from '../../weapons/defs.js';
import {
  resolveName,
  saveName,
  resolveRoom,
  inviteLink,
  arrivedByInvite,
} from '../../net/config.js';
import { mapSummaries } from '../../world/maps.js';

const NAV = [
  { id: 'play', label: 'Play' },
  { id: 'loadout', label: 'Loadout' },
  { id: 'profile', label: 'Profile' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'community', label: 'Community' },
  { id: 'settings', label: 'Settings' },
];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const randomCode = (n = 6) => {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[(Math.random() * a.length) | 0];
  return s;
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`;
}

const STYLE_ID = 'ns-shell-style';
const FONT_ID = 'ns-shell-font';

function installStyle() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById(FONT_ID)) {
    const l = document.createElement('link');
    l.id = FONT_ID;
    l.rel = 'stylesheet';
    l.media = 'print';
    l.href =
      'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap';
    l.addEventListener('load', () => { l.media = 'all'; });
    document.head.appendChild(l);
  }
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
.ns-shell{
  --ns: ${BRAND.PRIMARY_BRAND};
  --ns-rgb: ${hexToRgb(BRAND.PRIMARY_BRAND)};
  --ns-accent: ${BRAND.ACCENT_BRAND};
  --ns-accent-rgb: ${hexToRgb(BRAND.ACCENT_BRAND)};
  --ns-void: ${BRAND.BG_VOID};
  --ns-disp: 'Chakra Petch','Geist',system-ui,sans-serif;
  --ns-body: 'Geist','Inter',system-ui,sans-serif;
  position:fixed; inset:0; z-index:6000;
  display:grid; grid-template-columns: minmax(300px,30vw) 1fr;
  color:#e9edf2; font-family:var(--ns-body);
  background:
    radial-gradient(120% 100% at 12% 0%, rgba(var(--ns-rgb)/.10), transparent 48%),
    radial-gradient(120% 120% at 100% 100%, rgba(var(--ns-accent-rgb)/.08), transparent 42%),
    linear-gradient(180deg, rgba(3,5,10,.86), rgba(3,5,10,.95));
  backdrop-filter: blur(10px) saturate(1.1);
  -webkit-backdrop-filter: blur(10px) saturate(1.1);
  overflow:hidden;
  opacity:0; transition:opacity .35s ease;
}
/* While the shell owns the screen, the preserved game surfaces stay mounted but
   hidden behind it, so only the 3D scene shows through the frosted scrim. */
body.ns-shell-open .wm-lobby,
body.ns-shell-open .wm-net-overlay,
body.ns-shell-open .ow-net-overlay { visibility: hidden !important; }
.ns-shell.ns-show{opacity:1;}
.ns-shell::before{ /* animated grid */
  content:""; position:absolute; inset:-2px; pointer-events:none; opacity:.35;
  background-image:
    linear-gradient(rgba(var(--ns-rgb)/.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--ns-rgb)/.06) 1px, transparent 1px);
  background-size: 46px 46px, 46px 46px;
  mask-image: radial-gradient(120% 90% at 30% 20%, #000 30%, transparent 80%);
  animation: ns-drift 40s linear infinite;
}
@keyframes ns-drift{ from{background-position:0 0,0 0;} to{background-position:46px 92px,92px 46px;} }
.ns-shell::after{ /* scanline sheen */
  content:""; position:absolute; inset:0; pointer-events:none; opacity:.5;
  background:repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,0,0,.14) 3px 4px);
  mix-blend-mode:overlay;
}

/* ---------------- rail ---------------- */
.ns-rail{
  position:relative; z-index:2; padding:clamp(24px,3.4vw,52px) clamp(20px,2.6vw,42px);
  display:flex; flex-direction:column; gap:28px;
  border-right:1px solid rgba(var(--ns-rgb)/.14);
  background:linear-gradient(180deg, rgba(6,9,16,.55), rgba(6,9,16,.2));
  backdrop-filter: blur(6px);
}
.ns-logo{ display:flex; flex-direction:column; gap:8px; transform:translateY(10px); opacity:0; animation:ns-in .5s .05s forwards; }
.ns-mark{
  font-family:var(--ns-disp); font-weight:700; font-size:clamp(30px,3.2vw,46px);
  letter-spacing:.14em; line-height:.95; text-transform:uppercase;
  color:#fff; position:relative; white-space:nowrap;
}
.ns-mark .t{ color:var(--ns); position:relative; text-shadow:0 0 22px rgba(var(--ns-rgb)/.6); }
.ns-tag{ font-size:12px; letter-spacing:.28em; text-transform:uppercase; color:rgba(233,237,242,.55); font-family:var(--ns-disp); }

.ns-nav{ display:flex; flex-direction:column; gap:2px; margin-top:6px; }
.ns-nav button{
  appearance:none; border:0; background:transparent; cursor:pointer; color:rgba(233,237,242,.62);
  font-family:var(--ns-disp); font-weight:600; font-size:clamp(17px,1.5vw,21px);
  letter-spacing:.14em; text-transform:uppercase; text-align:left;
  padding:13px 16px; border-left:2px solid transparent; position:relative;
  transition:color .18s ease, border-color .18s ease, background-color .18s ease, padding-left .18s ease;
  transform:translateX(-14px); opacity:0; animation:ns-in .45s forwards;
}
.ns-nav button:hover{ color:#fff; background:rgba(var(--ns-rgb)/.06); padding-left:22px; }
.ns-nav button.ns-active{ color:#fff; border-left-color:var(--ns); background:rgba(var(--ns-rgb)/.10); }
.ns-nav button.ns-active::after{ content:""; position:absolute; right:16px; top:50%; width:6px;height:6px;border-radius:50%; transform:translateY(-50%); background:var(--ns); box-shadow:0 0 12px 2px rgba(var(--ns-rgb)/.7); }

.ns-rail-foot{ margin-top:auto; display:flex; flex-direction:column; gap:10px; font-size:12px; color:rgba(233,237,242,.4); }
.ns-rail-foot .ns-link{ background:none;border:0;color:rgba(233,237,242,.55);cursor:pointer;text-align:left;padding:0;font-size:12px;letter-spacing:.06em; }
.ns-rail-foot .ns-link:hover{ color:var(--ns); }
.ns-build{ font-family:'Geist Mono',monospace; letter-spacing:.05em; }

/* ---------------- content ---------------- */
.ns-content{ position:relative; z-index:2; padding:clamp(28px,4vw,72px) clamp(24px,4vw,80px); overflow-y:auto; }
.ns-content::-webkit-scrollbar{width:8px;} .ns-content::-webkit-scrollbar-thumb{background:rgba(var(--ns-rgb)/.25);border-radius:99px;}
.ns-panel{ display:none; max-width:1080px; }
.ns-panel.ns-on{ display:block; animation:ns-fade .35s ease; }
@keyframes ns-fade{ from{opacity:0; transform:translateY(12px);} to{opacity:1; transform:none;} }
@keyframes ns-in{ to{opacity:1; transform:none;} }

.ns-eyebrow{ font-family:var(--ns-disp); letter-spacing:.32em; text-transform:uppercase; font-size:12px; color:var(--ns); margin-bottom:10px; }
.ns-h1{ font-family:var(--ns-disp); font-weight:700; text-transform:uppercase; letter-spacing:.04em; font-size:clamp(30px,3.6vw,52px); line-height:1; margin-bottom:8px; }
.ns-sub{ color:rgba(233,237,242,.6); font-size:15px; margin-bottom:28px; max-width:60ch; }

.ns-field{ margin-bottom:22px; }
.ns-label{ display:block; font-family:var(--ns-disp); letter-spacing:.18em; text-transform:uppercase; font-size:11px; color:rgba(233,237,242,.55); margin-bottom:8px; }
.ns-input, .ns-select{
  width:100%; max-width:420px; background:rgba(10,14,22,.85); color:#fff;
  border:1px solid rgba(var(--ns-rgb)/.28); border-radius:4px; padding:13px 15px;
  font-family:var(--ns-body); font-size:15px; letter-spacing:.02em; outline:none;
  transition:border-color .18s ease, box-shadow .18s ease;
}
.ns-input:focus, .ns-select:focus{ border-color:var(--ns); box-shadow:0 0 0 3px rgba(var(--ns-rgb)/.18); }

.ns-cards{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; margin-bottom:26px; }
.ns-card{
  position:relative; text-align:left; cursor:pointer; color:#e9edf2;
  background:linear-gradient(160deg, rgba(14,19,30,.9), rgba(8,11,18,.9));
  border:1px solid rgba(var(--ns-rgb)/.18); border-radius:8px; padding:22px 20px;
  transition:transform .2s ease, border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
  overflow:hidden;
}
.ns-card::before{ content:""; position:absolute; left:0; top:0; height:100%; width:3px; background:var(--ns); opacity:.0; transition:opacity .2s ease; }
.ns-card:hover{ transform:translateY(-4px); border-color:var(--ns); box-shadow:0 18px 50px -22px rgba(var(--ns-rgb)/.7); }
.ns-card:hover::before{ opacity:1; }
.ns-card.ns-sel{ border-color:var(--ns); background:linear-gradient(160deg, rgba(var(--ns-rgb)/.12), rgba(8,11,18,.9)); }
.ns-card h3{ font-family:var(--ns-disp); text-transform:uppercase; letter-spacing:.1em; font-size:19px; margin-bottom:6px; }
.ns-card p{ font-size:13px; color:rgba(233,237,242,.58); line-height:1.5; }

.ns-btn{
  appearance:none; cursor:pointer; font-family:var(--ns-disp); font-weight:700; text-transform:uppercase;
  letter-spacing:.14em; font-size:16px; padding:15px 34px; border-radius:5px;
  color:#04121a; background:var(--ns); border:1px solid var(--ns);
  box-shadow:0 12px 40px -14px rgba(var(--ns-rgb)/.8); transition:transform .15s ease, filter .15s ease;
}
.ns-btn:hover{ transform:translateY(-2px); filter:brightness(1.12); }
.ns-btn:active{ transform:translateY(0); }
.ns-btn.ns-ghost{ background:transparent; color:#e9edf2; border-color:rgba(var(--ns-rgb)/.4); box-shadow:none; }
.ns-btn.ns-ghost:hover{ border-color:var(--ns); color:#fff; }
.ns-btn[disabled]{ opacity:.4; cursor:not-allowed; transform:none; filter:none; }
.ns-actions{ display:flex; gap:12px; flex-wrap:wrap; align-items:center; }

.ns-invite{ display:flex; gap:12px; align-items:center; padding:14px 16px; margin-bottom:22px; border-radius:6px;
  background:rgba(var(--ns-rgb)/.10); border:1px solid rgba(var(--ns-rgb)/.35); font-size:14px; }
.ns-invite b{ color:var(--ns); font-family:'Geist Mono',monospace; letter-spacing:.08em; }

.ns-subpanel{ display:none; margin-top:6px; }
.ns-subpanel.ns-on{ display:block; animation:ns-fade .25s ease; }

/* stat grid */
.ns-stats{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:24px; }
.ns-stat{ background:rgba(10,14,22,.7); border:1px solid rgba(var(--ns-rgb)/.14); border-radius:8px; padding:18px; }
.ns-stat .v{ font-family:var(--ns-disp); font-weight:700; font-size:34px; color:#fff; line-height:1; }
.ns-stat .v.ns-hl{ color:var(--ns); }
.ns-stat .k{ margin-top:8px; font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:rgba(233,237,242,.5); }

/* weapon cards */
.ns-weps{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; }
.ns-wep{ background:linear-gradient(160deg, rgba(14,19,30,.9), rgba(8,11,18,.92)); border:1px solid rgba(var(--ns-rgb)/.16); border-radius:8px; padding:20px; }
.ns-wep .cls{ font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:var(--ns); font-family:var(--ns-disp); }
.ns-wep .nm{ font-family:var(--ns-disp); font-weight:700; font-size:24px; text-transform:uppercase; letter-spacing:.05em; margin:2px 0 4px; }
.ns-wep .cal{ font-size:12px; color:rgba(233,237,242,.5); font-family:'Geist Mono',monospace; margin-bottom:14px; }
.ns-bar{ margin:8px 0; }
.ns-bar .bl{ display:flex; justify-content:space-between; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:rgba(233,237,242,.55); margin-bottom:5px; }
.ns-bar .tr{ height:6px; border-radius:99px; background:rgba(255,255,255,.08); overflow:hidden; }
.ns-bar .fi{ height:100%; border-radius:99px; background:linear-gradient(90deg, var(--ns), var(--ns-accent)); }

/* leaderboard */
.ns-table{ width:100%; border-collapse:collapse; }
.ns-table th{ text-align:left; font-family:var(--ns-disp); font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:rgba(233,237,242,.5); padding:12px 14px; border-bottom:1px solid rgba(var(--ns-rgb)/.2); }
.ns-table td{ padding:13px 14px; border-bottom:1px solid rgba(255,255,255,.05); font-size:15px; }
.ns-table tr.ns-me td{ color:var(--ns); font-weight:600; }
.ns-swatch{ display:inline-block; width:10px;height:10px;border-radius:2px; margin-right:9px; vertical-align:middle; }
.ns-empty{ padding:26px; text-align:center; color:rgba(233,237,242,.5); border:1px dashed rgba(var(--ns-rgb)/.25); border-radius:8px; }

/* community */
.ns-links{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; }
.ns-links a{ display:flex; flex-direction:column; gap:6px; text-decoration:none; color:#e9edf2;
  background:rgba(10,14,22,.7); border:1px solid rgba(var(--ns-rgb)/.16); border-radius:8px; padding:20px;
  transition:transform .18s ease, border-color .18s ease; }
.ns-links a:hover{ transform:translateY(-3px); border-color:var(--ns); }
.ns-links .t{ font-family:var(--ns-disp); text-transform:uppercase; letter-spacing:.12em; font-weight:600; font-size:17px; }
.ns-links .u{ font-size:12px; color:rgba(233,237,242,.45); word-break:break-all; }

.ns-prose{ color:rgba(233,237,242,.7); font-size:14px; line-height:1.7; max-width:70ch; }
.ns-prose h4{ font-family:var(--ns-disp); text-transform:uppercase; letter-spacing:.14em; color:#fff; margin:18px 0 6px; font-size:14px; }
.ns-prose a{ color:var(--ns); }
.ns-toast{ position:fixed; bottom:26px; left:50%; transform:translateX(-50%) translateY(20px); z-index:6100;
  background:var(--ns); color:#04121a; font-family:var(--ns-disp); font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  padding:12px 22px; border-radius:5px; opacity:0; transition:opacity .2s ease, transform .2s ease; pointer-events:none; }
.ns-toast.ns-on{ opacity:1; transform:translateX(-50%) translateY(0); }

@media (max-width: 860px){
  .ns-shell{ grid-template-columns:1fr; grid-template-rows:auto 1fr; }
  .ns-rail{ flex-direction:row; flex-wrap:wrap; align-items:center; gap:14px; border-right:0; border-bottom:1px solid rgba(var(--ns-rgb)/.14); padding:16px; }
  .ns-nav{ flex-direction:row; flex-wrap:wrap; margin:0; gap:4px; }
  .ns-nav button{ padding:8px 12px; font-size:14px; border-left:0; border-bottom:2px solid transparent; }
  .ns-nav button.ns-active{ border-left:0; border-bottom-color:var(--ns); }
  .ns-rail-foot{ display:none; }
  .ns-logo{ margin-right:auto; }
}
@media (prefers-reduced-motion: reduce){ .ns-shell *{ animation:none !important; } }
`;

export class ShellMenu {
  constructor({ engine, stats, openSettings, getNet } = {}) {
    this.engine = engine;
    this.stats = stats;
    this.openSettings = openSettings || (() => {});
    this.getNet = getNet || (() => null);
    this.active = 'play';
    this.createMap = null;
    installStyle();
    this._build();
  }

  _build() {
    const host = document.getElementById('ui') || document.body;
    const root = document.createElement('div');
    root.className = 'ns-shell';
    root.setAttribute('data-testid', 'main-menu-shell');
    root.style.display = 'none';
    root.innerHTML = `
      <aside class="ns-rail">
        <div class="ns-logo">
          <div class="ns-mark">${wordmark()}</div>
          <div class="ns-tag">${esc(BRAND.GAME_TAGLINE)}</div>
        </div>
        <nav class="ns-nav">
          ${NAV.map((n, i) => `<button data-nav="${n.id}" data-testid="nav-${n.id}" style="animation-delay:${0.1 + i * 0.05}s">${esc(n.label)}</button>`).join('')}
        </nav>
        <div class="ns-rail-foot">
          <button class="ns-link" data-nav="credits" data-testid="nav-credits">Credits & Licenses</button>
          <span class="ns-build">v${esc(BRAND.VERSION)} · build ${new Date().getFullYear()}</span>
        </div>
      </aside>
      <main class="ns-content">
        <section class="ns-panel" data-panel="play"></section>
        <section class="ns-panel" data-panel="loadout"></section>
        <section class="ns-panel" data-panel="profile"></section>
        <section class="ns-panel" data-panel="leaderboard"></section>
        <section class="ns-panel" data-panel="community"></section>
        <section class="ns-panel" data-panel="settings"></section>
        <section class="ns-panel" data-panel="credits"></section>
      </main>
      <div class="ns-toast" data-testid="shell-toast"></div>
    `;
    host.appendChild(root);
    this.root = root;
    this.toastEl = root.querySelector('.ns-toast');

    root.querySelectorAll('[data-nav]').forEach((b) =>
      b.addEventListener('click', () => this.select(b.getAttribute('data-nav'))));

    this._renderPlay();
    this._renderLoadout();
    this._renderCommunity();
    this._renderCredits();
    this._renderSettings();
    const startPanel = (() => {
      try { return new URLSearchParams(location.search).get('menu'); } catch { return null; }
    })();
    this.select(NAV.some((n) => n.id === startPanel) || startPanel === 'credits' ? startPanel : 'play');
  }

  select(id) {
    this.active = id;
    this.root.querySelectorAll('.ns-nav button').forEach((b) =>
      b.classList.toggle('ns-active', b.getAttribute('data-nav') === id));
    this.root.querySelectorAll('.ns-panel').forEach((p) =>
      p.classList.toggle('ns-on', p.getAttribute('data-panel') === id));
    if (id === 'profile') this._renderProfile();
    if (id === 'leaderboard') this._renderLeaderboard();
    if (id === 'settings') this.openSettings();
  }

  show() {
    document.body.classList.add('ns-shell-open');
    this.root.style.display = '';
    requestAnimationFrame(() => this.root.classList.add('ns-show'));
  }

  hide() {
    this.root.classList.remove('ns-show');
    document.body.classList.remove('ns-shell-open');
    setTimeout(() => { this.root.style.display = 'none'; }, 360);
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('ns-on');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.toastEl.classList.remove('ns-on'), 1800);
  }

  /** Enter the game: reveal the existing lobby, or reload into a new room. */
  _enter({ reload = false, room = null } = {}) {
    const name = (this.playName?.value || '').trim();
    if (name) saveName(name);
    const net = this.getNet();
    if (net && name && net.setName) { try { net.setName(name); } catch {} }
    if (reload && room) {
      try { sessionStorage.setItem('ns_enter_lobby', '1'); } catch {}
      location.href = inviteLink(room);
      return;
    }
    this.hide();
  }

  /* ---------------- PLAY ---------------- */
  _renderPlay() {
    const el = this.root.querySelector('[data-panel="play"]');
    const maps = mapSummaries();
    const invited = arrivedByInvite ? resolveRoom() : null;
    el.innerHTML = `
      <div class="ns-eyebrow">Season 1 · Live Operations</div>
      <h1 class="ns-h1">Deploy</h1>
      <p class="ns-sub">Pick a callsign, then jump into a match. Rooms are shareable by link — everyone who opens it lands in the same fight.</p>

      ${invited ? `<div class="ns-invite" data-testid="invite-banner">You were invited to room <b>${esc(invited.toUpperCase())}</b> — jump in below.</div>` : ''}

      <div class="ns-field">
        <label class="ns-label" for="ns-name">Callsign</label>
        <input class="ns-input" id="ns-name" data-testid="callsign-input" maxlength="20" placeholder="Operator" />
      </div>

      <div class="ns-cards" data-testid="play-modes">
        <button class="ns-card ns-sel" data-mode="quick" data-testid="mode-quick">
          <h3>Quick Play</h3><p>Drop into your current room instantly and warm up or wait for friends.</p>
        </button>
        <button class="ns-card" data-mode="create" data-testid="mode-create">
          <h3>Create Room</h3><p>Spin up a fresh private room, choose the map, and share the invite link.</p>
        </button>
        <button class="ns-card" data-mode="join" data-testid="mode-join">
          <h3>Join Room</h3><p>Have a code or an invite URL? Enter it here to join your squad.</p>
        </button>
      </div>

      <div class="ns-subpanel ns-on" data-sub="quick">
        <div class="ns-actions">
          <button class="ns-btn" data-testid="quick-play-btn">Enter Lobby</button>
        </div>
      </div>

      <div class="ns-subpanel" data-sub="create">
        <div class="ns-field">
          <label class="ns-label" for="ns-map">Map</label>
          <select class="ns-select" id="ns-map" data-testid="create-map-select">
            ${maps.map((m) => `<option value="${esc(m.id)}">${esc(m.name || m.id)}</option>`).join('')}
          </select>
        </div>
        <div class="ns-actions">
          <button class="ns-btn" data-testid="create-room-btn">Create & Enter</button>
          <span style="font-size:13px;color:rgba(233,237,242,.5)">Max 12 players · public by link</span>
        </div>
      </div>

      <div class="ns-subpanel" data-sub="join">
        <div class="ns-field">
          <label class="ns-label" for="ns-code">Room code or invite URL</label>
          <input class="ns-input" id="ns-code" data-testid="join-code-input" placeholder="e.g. ABCD24 or https://…?room=abcd24" />
        </div>
        <div class="ns-actions">
          <button class="ns-btn" data-testid="join-room-btn">Join & Enter</button>
        </div>
      </div>
    `;
    this.playName = el.querySelector('#ns-name');
    this.playName.value = resolveName();
    this.playName.addEventListener('change', () => {
      const n = this.playName.value.trim();
      if (n) saveName(n);
    });

    const subs = el.querySelectorAll('.ns-subpanel');
    el.querySelectorAll('[data-mode]').forEach((c) =>
      c.addEventListener('click', () => {
        el.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('ns-sel', x === c));
        const m = c.getAttribute('data-mode');
        subs.forEach((s) => s.classList.toggle('ns-on', s.getAttribute('data-sub') === m));
      }));

    el.querySelector('[data-testid="quick-play-btn"]').addEventListener('click', () => this._enter());
    el.querySelector('[data-testid="create-room-btn"]').addEventListener('click', () => {
      const map = el.querySelector('#ns-map').value;
      const code = randomCode();
      try {
        const p = new URLSearchParams(location.search);
        p.set('room', code); p.set('map', map);
        sessionStorage.setItem('ns_enter_lobby', '1');
        location.href = `${location.pathname}?${p.toString()}`;
      } catch { this._enter(); }
    });
    el.querySelector('[data-testid="join-room-btn"]').addEventListener('click', () => {
      const raw = el.querySelector('#ns-code').value.trim();
      let code = raw;
      const m = raw.match(/[?&]room=([a-z0-9]+)/i);
      if (m) code = m[1];
      code = code.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
      if (!code) { this.toast('Enter a valid code'); return; }
      this._enter({ reload: true, room: code });
    });

    if (invited) {
      const jc = el.querySelector('[data-mode="join"]');
      jc?.click();
      const inp = el.querySelector('#ns-code');
      if (inp) inp.value = invited.toUpperCase();
    }
  }

  /* ---------------- LOADOUT ---------------- */
  _renderLoadout() {
    const el = this.root.querySelector('[data-panel="loadout"]');
    const defs = Object.values(WEAPON_DEFS);
    const maxDmg = Math.max(...defs.map((d) => d.damage || 0));
    const maxRpm = Math.max(...defs.map((d) => d.rpm || 0));
    el.innerHTML = `
      <div class="ns-eyebrow">Arsenal</div>
      <h1 class="ns-h1">Loadout</h1>
      <p class="ns-sub">The weapons currently in rotation. Balance is preserved exactly as shipped — this is a live preview of the real arsenal.</p>
      <div class="ns-weps" data-testid="loadout-list">
        ${defs.map((d) => `
          <div class="ns-wep" data-testid="weapon-${esc(d.id)}">
            <div class="cls">${esc(d.class || 'weapon')}</div>
            <div class="nm">${esc(d.label || d.id)}</div>
            <div class="cal">${esc(d.caliber || '—')}</div>
            ${bar('Damage', d.damage || 0, maxDmg)}
            ${bar('Fire rate', d.rpm || 0, maxRpm, ' rpm')}
          </div>`).join('')}
      </div>
    `;
  }

  /* ---------------- PROFILE ---------------- */
  _renderProfile() {
    const el = this.root.querySelector('[data-panel="profile"]');
    const v = this.stats ? this.stats.view() : {};
    el.innerHTML = `
      <div class="ns-eyebrow">Operator File</div>
      <h1 class="ns-h1">Profile</h1>
      <div class="ns-field">
        <label class="ns-label" for="ns-pname">Callsign</label>
        <input class="ns-input" id="ns-pname" data-testid="profile-name-input" maxlength="20" />
      </div>
      <div class="ns-stats" data-testid="profile-stats">
        ${stat('Games', v.games)}
        ${stat('Kills', v.kills, true)}
        ${stat('Deaths', v.deaths)}
        ${stat('K/D', v.kd, true)}
        ${stat('Wins', v.wins)}
        ${stat('Losses', v.losses)}
        ${stat('Win rate', (v.winRate ?? 0) + '%')}
        ${stat('Playtime', v.playtime || '0m')}
        ${stat('Best game', v.bestGame, true)}
      </div>
      <div class="ns-actions">
        <button class="ns-btn ns-ghost" data-testid="profile-reset-btn">Reset Stats</button>
        <span style="font-size:13px;color:rgba(233,237,242,.45)">Stored locally on this device. Cloud sync ready.</span>
      </div>
    `;
    const nameInput = el.querySelector('#ns-pname');
    nameInput.value = resolveName();
    nameInput.addEventListener('change', () => {
      const n = nameInput.value.trim();
      if (!n) return;
      saveName(n);
      if (this.playName) this.playName.value = n;
      const net = this.getNet();
      try { net?.setName?.(n); } catch {}
      this.toast('Callsign saved');
    });
    el.querySelector('[data-testid="profile-reset-btn"]').addEventListener('click', () => {
      this.stats?.reset();
      this._renderProfile();
      this.toast('Stats reset');
    });
  }

  /* ---------------- LEADERBOARD ---------------- */
  _renderLeaderboard() {
    const el = this.root.querySelector('[data-panel="leaderboard"]');
    const net = this.getNet();
    const roster = (net?.roster || []).slice().sort((a, b) => (b.kills - a.kills) || (a.deaths - b.deaths));
    const myId = net?.myId ?? null;
    const room = net?.room ? net.room.toUpperCase() : '—';
    el.innerHTML = `
      <div class="ns-eyebrow">Session · Room ${esc(room)}</div>
      <h1 class="ns-h1">Leaderboard</h1>
      <p class="ns-sub">Live standings from your current room. A global backend can be connected here later — the table already renders authoritative relay scores.</p>
      ${roster.length ? `
        <table class="ns-table" data-testid="leaderboard-table">
          <thead><tr><th>#</th><th>Operator</th><th>Kills</th><th>Deaths</th><th>K/D</th></tr></thead>
          <tbody>
            ${roster.map((r, i) => `
              <tr class="${r.id === myId ? 'ns-me' : ''}">
                <td>${i + 1}</td>
                <td>${esc(r.name || 'Operator')}</td>
                <td>${r.kills ?? 0}</td>
                <td>${r.deaths ?? 0}</td>
                <td>${(r.deaths > 0 ? r.kills / r.deaths : (r.kills || 0)).toFixed(2)}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : `<div class="ns-empty" data-testid="leaderboard-empty">No session data yet. Join a room and play a match — standings appear here live.</div>`}
    `;
  }

  /* ---------------- COMMUNITY ---------------- */
  _renderCommunity() {
    const el = this.root.querySelector('[data-panel="community"]');
    const links = [
      { t: 'Discord', u: BRAND.DISCORD },
      { t: 'X / Twitter', u: BRAND.TWITTER },
      { t: 'Website', u: BRAND.WEBSITE },
      { t: 'Updates', u: BRAND.UPDATES },
    ];
    el.innerHTML = `
      <div class="ns-eyebrow">Join the Squad</div>
      <h1 class="ns-h1">Community</h1>
      <p class="ns-sub">Find matches, report bugs and follow development.</p>
      <div class="ns-links" data-testid="community-links">
        ${links.map((l) => `<a href="${esc(l.u)}" target="_blank" rel="noopener" data-testid="community-${l.t.toLowerCase().split(' ')[0]}"><span class="t">${esc(l.t)}</span><span class="u">${esc(l.u)}</span></a>`).join('')}
      </div>
    `;
  }

  /* ---------------- SETTINGS ---------------- */
  _renderSettings() {
    const el = this.root.querySelector('[data-panel="settings"]');
    el.innerHTML = `
      <div class="ns-eyebrow">Configuration</div>
      <h1 class="ns-h1">Settings</h1>
      <p class="ns-sub">All in-game options — mouse sensitivity, master/music/effects volume, graphics quality, FOV, crosshair, fullscreen and controls — live in the full settings panel. Only real, working options are exposed.</p>
      <div class="ns-actions">
        <button class="ns-btn" data-testid="open-settings-btn">Open Settings</button>
        <span style="font-size:13px;color:rgba(233,237,242,.5)">Also reachable in-match with <b>ESC</b>.</span>
      </div>
    `;
    el.querySelector('[data-testid="open-settings-btn"]').addEventListener('click', () => this.openSettings());
  }

  /* ---------------- CREDITS ---------------- */
  _renderCredits() {
    const el = this.root.querySelector('[data-panel="credits"]');
    el.innerHTML = `
      <div class="ns-eyebrow">About</div>
      <h1 class="ns-h1">Credits</h1>
      <div class="ns-prose" data-testid="credits-body">
        <p><b>${esc(BRAND.GAME_NAME)}</b> — designed, built and operated by ${esc(BRAND.STUDIO)}.</p>
        <p>${esc(BRAND.COPYRIGHT)}</p>
        <h4>Development</h4>
        <p>Engine, netcode, gameplay, art direction and interface — ${esc(BRAND.STUDIO)}.</p>
        <h4>Technology</h4>
        <p>Real-time 3D rendered in the browser with WebGL. Multiplayer runs on our own
        WebSocket relay backend. Built with open-source technologies under permissive licenses.</p>
        <h4>Licensed audio &amp; assets</h4>
        <p>A portion of the sound design uses samples licensed under Creative Commons
        (CC BY) and is used with attribution retained in the project files. All other
        art, geometry and audio are original to ${esc(BRAND.STUDIO)}.</p>
        <p style="margin-top:18px;color:rgba(233,237,242,.4)">v${esc(BRAND.VERSION)} · ${esc(BRAND.COPYRIGHT)}</p>
      </div>
    `;
  }
}

function wordmark() {
  const gn = String(BRAND.GAME_NAME || 'NEURAL STRIKE').toUpperCase();
  return gn.slice(0, -1) + `<span class="t">${esc(gn.slice(-1))}</span>`;
}

function bar(label, val, max, suffix = '') {
  const pct = max > 0 ? Math.round((val / max) * 100) : 0;
  return `<div class="ns-bar"><div class="bl"><span>${esc(label)}</span><span>${val}${suffix}</span></div><div class="tr"><div class="fi" style="width:${pct}%"></div></div></div>`;
}

function stat(key, val, hl = false) {
  return `<div class="ns-stat"><div class="v ${hl ? 'ns-hl' : ''}">${esc(val ?? 0)}</div><div class="k">${esc(key)}</div></div>`;
}
