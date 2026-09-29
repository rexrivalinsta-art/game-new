from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import time
import asyncio
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("neural-strike")


# ─────────────────────────────────────────────────────────────────────────
# Status models (kept from template)
# ─────────────────────────────────────────────────────────────────────────
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


@api_router.get("/")
async def root():
    return {"message": "NEURAL STRIKE relay online"}


@api_router.get("/healthz")
async def healthz():
    return {"status": "ok", "rooms": len(ROOMS)}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


# ─────────────────────────────────────────────────────────────────────────
# Multiplayer relay — a faithful Python port of Workmelt's server/index.mjs.
#
# It is a RELAY, not an authoritative simulation: each client owns its own
# player and reports transform + events; the server fans them out. The one
# piece of state the relay owns is the match-start lobby (ready flags, the
# start signal) and the bounded free-for-all scoreline / clock.
# ─────────────────────────────────────────────────────────────────────────
TICK_HZ = int(os.environ.get('TICK_HZ', 20))
MAX_ROOM = int(os.environ.get('MAX_ROOM', 12))
COUNTDOWN_MS = int(os.environ.get('COUNTDOWN_MS', 3000))
MAX_START_MS = int(os.environ.get('MAX_START_MS', COUNTDOWN_MS * 3))
SCORE_LIMIT = max(1, int(os.environ.get('SCORE_LIMIT', 15)))
MATCH_MS = max(10_000, int(os.environ.get('MATCH_MS', 5 * 60_000)))

ROOMS = {}          # code -> Room
_next_id = 1


def now_ms():
    return int(time.time() * 1000)


class Peer:
    __slots__ = ('id', 'ws', 'room', 'name', 'kills', 'deaths', 'skin',
                 'state', 'alive', 'ready', 'deployed', 'warm', 'last_seen')

    def __init__(self, pid, ws):
        self.id = pid
        self.ws = ws
        self.room = None
        self.name = 'Operator'
        self.kills = 0
        self.deaths = 0
        self.skin = 0
        self.state = None
        self.alive = True
        self.ready = False
        self.deployed = False
        self.warm = False
        self.last_seen = now_ms()


class Room:
    __slots__ = ('code', 'peers', 'map', 'start_at', 'start_cap', 'starting', 'match_until')

    def __init__(self, code):
        self.code = code
        self.peers = {}          # id -> Peer
        self.map = None
        self.start_at = 0
        self.start_cap = 0
        self.starting = set()
        self.match_until = 0


def get_room(code):
    r = ROOMS.get(code)
    if not r:
        r = Room(code)
        ROOMS[code] = r
    return r


def roster(room):
    out = []
    for p in room.peers.values():
        hp = 100
        if p.state and isinstance(p.state, dict) and 'hp' in p.state:
            hp = p.state.get('hp', 100)
        out.append({'id': p.id, 'name': p.name, 'kills': p.kills,
                    'deaths': p.deaths, 'hp': hp, 'skin': p.skin})
    return out


def take_skin(room):
    used = {p.skin for p in room.peers.values()}
    s = 0
    while s in used:
        s += 1
    return s


def lobby(room):
    return [{'id': p.id, 'name': p.name, 'ready': bool(p.ready),
             'deployed': bool(p.deployed), 'warm': bool(p.warm)}
            for p in room.peers.values()]


def in_match(p):
    return bool(p.deployed) and not p.warm


def start_remaining(room):
    return max(0, room.start_at - now_ms())


def is_live(room):
    if start_remaining(room) > 0:
        return True
    for p in room.peers.values():
        if in_match(p):
            return True
    return False


def sanitise_map(v):
    s = str(v or '')[:24].lower()
    import re
    return s if re.match(r'^[a-z0-9][a-z0-9_-]*$', s) else None


async def send(peer, obj):
    try:
        await peer.ws.send_text(json.dumps(obj))
    except Exception:
        pass


async def broadcast(room, obj, except_id=None):
    msg = json.dumps(obj)
    for p in list(room.peers.values()):
        if p.id == except_id:
            continue
        try:
            await p.ws.send_text(msg)
        except Exception:
            pass


async def broadcast_match(room, obj, except_id=None):
    msg = json.dumps(obj)
    for p in list(room.peers.values()):
        if p.id == except_id or p.warm:
            continue
        try:
            await p.ws.send_text(msg)
        except Exception:
            pass


async def send_lobby(room):
    await broadcast(room, {'t': 'lobby', 'live': is_live(room),
                           'players': lobby(room), 'map': room.map})


def standings(room):
    rows = [p for p in room.peers.values() if in_match(p)]
    rows.sort(key=lambda p: (-p.kills, p.deaths, p.id))
    return [{'id': p.id, 'name': p.name, 'kills': p.kills,
             'deaths': p.deaths, 'skin': p.skin} for p in rows]


async def start_match(room, cohort):
    now = now_ms()
    room.start_at = now + COUNTDOWN_MS
    room.start_cap = now + MAX_START_MS
    room.starting = {p.id for p in cohort}
    for p in cohort:
        p.ready = False
        p.kills = 0
        p.deaths = 0
    room.match_until = room.start_at + MATCH_MS
    await broadcast(room, {'t': 'match_start', 'in': COUNTDOWN_MS,
                           'ids': list(room.starting), 'limit': SCORE_LIMIT, 'ms': MATCH_MS})
    await broadcast(room, {'t': 'score', 'roster': roster(room)})
    await send_lobby(room)


async def maybe_start(room, force=False):
    if is_live(room):
        return
    peers = list(room.peers.values())
    if len(peers) < 2:
        return
    in_lobby = [p for p in peers if not p.deployed]
    ready = [p for p in peers if p.ready]
    consensus = len(in_lobby) > 0 and all(p.ready for p in in_lobby)
    if not consensus and not (force and len(ready) >= 2):
        return
    cohort = [p for p in peers if p.ready or p.warm]
    if len(cohort) < 2:
        return
    await start_match(room, cohort)


async def end_match(room, reason, winner_id):
    rows = standings(room)
    if not rows:
        return
    await broadcast(room, {'t': 'match_end', 'reason': reason,
                           'winner': winner_id, 'limit': SCORE_LIMIT,
                           'ms': MATCH_MS, 'standings': rows})
    room.match_until = 0
    for p in room.peers.values():
        if not in_match(p):
            continue
        p.deployed = False
        p.warm = False
        p.ready = False
    await send_lobby(room)
    await maybe_start(room)


async def maybe_end_on_score(room, killer):
    if killer and in_match(killer) and killer.kills >= SCORE_LIMIT:
        await end_match(room, 'score', killer.id)


async def maybe_end_on_time(room):
    if not room.match_until or now_ms() < room.match_until:
        return
    if start_remaining(room) > 0:
        return
    rows = standings(room)
    if not rows:
        room.match_until = 0
        return
    a = rows[0]
    b = rows[1] if len(rows) > 1 else None
    if (not b) or a['kills'] > b['kills'] or (a['kills'] == b['kills'] and a['deaths'] < b['deaths']):
        winner = a['id']
    else:
        winner = None
    await end_match(room, 'time', winner)


def extend_start(room):
    now = now_ms()
    room.start_at = max(room.start_at, min(now + COUNTDOWN_MS, room.start_cap))
    return start_remaining(room)


async def handle(peer, msg):
    t = msg.get('t')

    if t == 'join':
        code = str(msg.get('room') or 'lobby')[:24].lower()
        peer.name = str(msg.get('name') or 'Operator')[:20] or 'Operator'
        room = get_room(code)
        if len(room.peers) >= MAX_ROOM:
            await send(peer, {'t': 'full', 'room': code, 'max': MAX_ROOM})
            return
        peer.room = code
        peer.skin = take_skin(room)
        room.peers[peer.id] = peer
        if not room.map:
            room.map = sanitise_map(msg.get('map'))
        await send(peer, {
            't': 'welcome', 'id': peer.id, 'room': code, 'skin': peer.skin,
            'tickHz': TICK_HZ, 'live': is_live(room), 'map': room.map,
            'startIn': start_remaining(room), 'limit': SCORE_LIMIT,
            'matchLeft': max(0, room.match_until - now_ms()) if room.match_until else 0,
            'peers': [r for r in roster(room) if r['id'] != peer.id],
        })
        await broadcast(room, {'t': 'peer_join', 'id': peer.id, 'name': peer.name, 'skin': peer.skin}, peer.id)
        if start_remaining(room) > 0:
            room.starting.add(peer.id)
            await broadcast(room, {'t': 'match_start', 'in': extend_start(room), 'ids': list(room.starting)})
        await send_lobby(room)

    elif t == 'map':
        room = ROOMS.get(peer.room) if peer.room else None
        if not room or is_live(room):
            return
        nxt = sanitise_map(msg.get('map'))
        if not nxt or nxt == room.map:
            return
        room.map = nxt
        for p in room.peers.values():
            if p.id != peer.id:
                p.ready = False
        await send_lobby(room)

    elif t == 'ready':
        room = ROOMS.get(peer.room) if peer.room else None
        if not room:
            return
        peer.ready = bool(msg.get('ready'))
        await send_lobby(room)
        await maybe_start(room, bool(msg.get('force')) and peer.ready)

    elif t == 'deploy':
        room = ROOMS.get(peer.room) if peer.room else None
        if not room:
            return
        peer.deployed = True
        peer.warm = bool(msg.get('solo'))
        peer.ready = False
        room.starting.discard(peer.id)
        if in_match(peer):
            peer.kills = 0
            peer.deaths = 0
            if not room.match_until:
                room.match_until = now_ms() + MATCH_MS
            await broadcast(room, {'t': 'score', 'roster': roster(room)})
        await send_lobby(room)
        await maybe_start(room)

    elif t == 'undeploy':
        room = ROOMS.get(peer.room) if peer.room else None
        if not room:
            return
        peer.deployed = False
        peer.warm = False
        peer.ready = False
        room.starting.discard(peer.id)
        if not is_live(room):
            room.match_until = 0
        await send_lobby(room)
        await maybe_start(room)

    elif t == 'state':
        if not peer.room:
            return
        peer.state = msg.get('s')
        if peer.state and isinstance(peer.state, dict) and isinstance(peer.state.get('hp'), (int, float)):
            peer.alive = peer.state['hp'] > 0

    elif t == 'fire':
        room = ROOMS.get(peer.room) if peer.room else None
        if not room or peer.warm:
            return
        await broadcast_match(room, {'t': 'fire', 'id': peer.id, 'o': msg.get('o'),
                                     'd': msg.get('d'), 'w': msg.get('w'), 'seed': msg.get('seed')}, peer.id)

    elif t == 'hit':
        room = ROOMS.get(peer.room) if peer.room else None
        if not room or peer.warm:
            return
        victim = room.peers.get(msg.get('target'))
        if not victim or victim.warm:
            return
        try:
            dmg = max(0, min(200, float(msg.get('dmg') or 0)))
        except (TypeError, ValueError):
            dmg = 0
        await send(victim, {'t': 'hit', 'from': peer.id, 'fromName': peer.name,
                            'dmg': dmg, 'part': msg.get('part') or 'body',
                            'o': msg.get('o'), 'w': msg.get('w')})

    elif t == 'kill':
        room = ROOMS.get(peer.room) if peer.room else None
        if not room or peer.warm:
            return
        peer.deaths += 1
        killer = room.peers.get(msg.get('by'))
        if killer and killer.id != peer.id:
            killer.kills += 1
        await broadcast(room, {'t': 'kill', 'by': msg.get('by'),
                               'byName': killer.name if killer else '???',
                               'victim': peer.id, 'victimName': peer.name,
                               'headshot': bool(msg.get('headshot'))})
        await broadcast(room, {'t': 'score', 'roster': roster(room)})
        await maybe_end_on_score(room, killer)

    elif t == 'respawn':
        peer.alive = True

    elif t == 'spawn':
        room = ROOMS.get(peer.room) if peer.room else None
        p = msg.get('p')
        if not room or peer.warm or not isinstance(p, list) or len(p) < 3:
            return
        try:
            p = [float(x) for x in p]
        except (TypeError, ValueError):
            return
        await broadcast_match(room, {'t': 'spawn', 'id': peer.id, 'p': p}, peer.id)

    elif t == 'chat':
        room = ROOMS.get(peer.room) if peer.room else None
        if not room:
            return
        text = str(msg.get('text') or '')[:200]
        if text:
            await broadcast(room, {'t': 'chat', 'id': peer.id, 'name': peer.name, 'text': text})

    elif t == 'name':
        peer.name = str(msg.get('name') or peer.name)[:20] or peer.name
        room = ROOMS.get(peer.room) if peer.room else None
        if room:
            await broadcast(room, {'t': 'score', 'roster': roster(room)})

    elif t == 'ping':
        await send(peer, {'t': 'pong', 'ts': msg.get('ts')})


async def leave(peer):
    if not peer.room:
        return
    room = ROOMS.get(peer.room)
    peer.room = None
    if not room:
        return
    room.peers.pop(peer.id, None)
    room.starting.discard(peer.id)
    await broadcast(room, {'t': 'peer_leave', 'id': peer.id})
    await broadcast(room, {'t': 'score', 'roster': roster(room)})
    if len(room.peers) == 0:
        ROOMS.pop(room.code, None)
        return
    if not is_live(room):
        room.match_until = 0
    await send_lobby(room)
    await maybe_start(room)


@app.websocket("/api/ws")
async def ws_endpoint(websocket: WebSocket):
    global _next_id
    await websocket.accept()
    peer = Peer(_next_id, websocket)
    _next_id += 1
    await send(peer, {'t': 'hello', 'id': peer.id})
    try:
        while True:
            raw = await websocket.receive_text()
            peer.last_seen = now_ms()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if isinstance(msg, dict):
                await handle(peer, msg)
    except WebSocketDisconnect:
        await leave(peer)
    except Exception:
        await leave(peer)


async def tick_loop():
    interval = 1.0 / TICK_HZ
    while True:
        await asyncio.sleep(interval)
        try:
            for room in list(ROOMS.values()):
                await maybe_end_on_time(room)
                states = []
                for p in room.peers.values():
                    if not p.state or p.warm:
                        continue
                    states.append({'id': p.id, 'name': p.name, 's': p.state})
                if states:
                    await broadcast_match(room, {'t': 'snapshot', 'states': states})
        except Exception as e:
            logger.warning(f"tick error: {e}")


async def reaper_loop():
    while True:
        await asyncio.sleep(10)
        now = now_ms()
        for room in list(ROOMS.values()):
            for p in list(room.peers.values()):
                if now - p.last_seen > 30000:
                    try:
                        await p.ws.close()
                    except Exception:
                        pass
                    await leave(p)


@app.on_event("startup")
async def _startup():
    asyncio.create_task(tick_loop())
    asyncio.create_task(reaper_loop())
    logger.info(f"NEURAL STRIKE relay online (tick {TICK_HZ}Hz, max {MAX_ROOM}/room)")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
