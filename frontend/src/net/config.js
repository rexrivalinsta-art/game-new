/**
 * Where to connect and which room to join — all derived from the URL so an
 * invite is just a link. The address bar is always a valid share link: if the
 * player arrived without a `?room=`, we mint one and write it back with
 * `history.replaceState`, so "copy the URL" is all it takes to invite a friend.
 */

const CALLSIGNS = [
  'Reaper', 'Ghost', 'Viper', 'Hawk', 'Wolf', 'Raven', 'Fox', 'Bishop',
  'Havoc', 'Cipher', 'Nomad', 'Echo', 'Talon', 'Ruin', 'Saint', 'Vandal',
];

function randomCode(n = 6) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'; // no ambiguous chars
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[(Math.random() * alphabet.length) | 0];
  return s;
}

/**
 * Did this player arrive on somebody's invite link?
 */
export const arrivedByInvite = (() => {
  try {
    return !!new URLSearchParams(location.search).get('room');
  } catch {
    return false;
  }
})();

export function resolveRoom() {
  const params = new URLSearchParams(location.search);
  let room = (params.get('room') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  if (!room) {
    room = randomCode();
    params.set('room', room);
    const url = `${location.pathname}?${params.toString()}${location.hash}`;
    history.replaceState(null, '', url);
  }
  return room;
}

/**
 * The multiplayer relay lives on the platform backend behind the ingress at
 * `/api/ws` (Kubernetes routes every `/api` path to the FastAPI relay on 8001).
 * Same-origin in every environment: the page is always served over the ingress
 * host, so `wss://<host>/api/ws` reaches the relay over production HTTPS. A
 * `?server=` override is still honoured for local relay testing.
 */
export function resolveServerUrl() {
  const params = new URLSearchParams(location.search);
  const override = params.get('server');
  if (override) return override;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/api/ws`;
}

export function resolveName() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('name');
  if (fromUrl) return fromUrl.slice(0, 20);
  try {
    const saved = localStorage.getItem('ns_name') || localStorage.getItem('cod_name');
    if (saved) return saved;
  } catch {}
  const name = `${CALLSIGNS[(Math.random() * CALLSIGNS.length) | 0]}-${(Math.random() * 90 + 10) | 0}`;
  return name;
}

export function saveName(name) {
  try {
    localStorage.setItem('ns_name', name);
    localStorage.setItem('cod_name', name);
  } catch {}
}

export function inviteLink(room) {
  const params = new URLSearchParams(location.search);
  params.set('room', room);
  params.delete('server');
  params.delete('name');
  return `${location.origin}${location.pathname}?${params.toString()}`;
}
