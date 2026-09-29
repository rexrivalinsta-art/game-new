"""NEURAL STRIKE backend tests: REST + WebSocket relay over WSS ingress."""
import asyncio
import json
import os
import pytest
import requests
import websockets

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://tactical-strike-136.preview.emergentagent.com').rstrip('/')
WS_URL = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/api/ws'


# ────────────────────────────── REST ──────────────────────────────
class TestRest:
    def test_healthz(self):
        r = requests.get(f"{BASE_URL}/api/healthz", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get('status') == 'ok'

    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert 'message' in data


# ────────────────────────────── WS helpers ──────────────────────────────
async def recv_until(ws, pred, timeout=8.0):
    loop = asyncio.get_event_loop()
    end = loop.time() + timeout
    while True:
        rem = end - loop.time()
        if rem <= 0:
            raise TimeoutError("timeout waiting for predicate")
        raw = await asyncio.wait_for(ws.recv(), timeout=rem)
        msg = json.loads(raw)
        if pred(msg):
            return msg


# ────────────────────────────── WS relay ──────────────────────────────
class TestRelay:
    def test_hello_and_two_client_join(self):
        async def run():
            async with websockets.connect(WS_URL, open_timeout=15) as a, \
                       websockets.connect(WS_URL, open_timeout=15) as b:
                ha = json.loads(await asyncio.wait_for(a.recv(), timeout=10))
                hb = json.loads(await asyncio.wait_for(b.recv(), timeout=10))
                assert ha.get('t') == 'hello' and isinstance(ha.get('id'), int)
                assert hb.get('t') == 'hello' and isinstance(hb.get('id'), int)
                aid, bid = ha['id'], hb['id']

                room = f"pyt{aid}{bid}"
                await a.send(json.dumps({"t": "join", "room": room, "name": "Alice", "map": "market"}))
                wa = await recv_until(a, lambda m: m.get('t') == 'welcome')
                assert wa['room'] == room
                assert wa['map'] == 'market'
                assert wa['tickHz'] == 20
                assert isinstance(wa['skin'], int)

                await b.send(json.dumps({"t": "join", "room": room, "name": "Bob"}))
                wb = await recv_until(b, lambda m: m.get('t') == 'welcome')
                assert any(p.get('name') == 'Alice' for p in wb.get('peers', []))
                assert wb['skin'] != wa['skin']

                pj = await recv_until(a, lambda m: m.get('t') == 'peer_join', timeout=5)
                assert pj['name'] == 'Bob'
                return aid, bid, room

        asyncio.run(run())

    def test_full_match_flow(self):
        async def run():
            async with websockets.connect(WS_URL, open_timeout=15) as a, \
                       websockets.connect(WS_URL, open_timeout=15) as b:
                ha = json.loads(await a.recv())
                hb = json.loads(await b.recv())
                aid, bid = ha['id'], hb['id']

                room = f"mf{aid}{bid}"
                await a.send(json.dumps({"t": "join", "room": room, "name": "Alice", "map": "market"}))
                await recv_until(a, lambda m: m.get('t') == 'welcome')
                await b.send(json.dumps({"t": "join", "room": room, "name": "Bob"}))
                await recv_until(b, lambda m: m.get('t') == 'welcome')

                await a.send(json.dumps({"t": "ready", "ready": True}))
                await b.send(json.dumps({"t": "ready", "ready": True}))
                ms_a = await recv_until(a, lambda m: m.get('t') == 'match_start', timeout=5)
                ms_b = await recv_until(b, lambda m: m.get('t') == 'match_start', timeout=5)
                assert ms_a['in'] > 0 and ms_a['limit'] == 15
                assert set(ms_a['ids']) == {aid, bid}
                assert ms_b['in'] > 0

                await a.send(json.dumps({"t": "deploy"}))
                await b.send(json.dumps({"t": "deploy"}))
                await asyncio.sleep(0.4)

                await a.send(json.dumps({"t": "state", "s": {"p": [1, 2, 3], "hp": 100}}))
                snap = await recv_until(b, lambda m: m.get('t') == 'snapshot', timeout=5)
                assert any(s.get('id') == aid for s in snap.get('states', []))

                await a.send(json.dumps({"t": "fire", "o": [0, 0, 0], "d": [0, 0, 1], "w": "rifle", "seed": 42}))
                fire = await recv_until(b, lambda m: m.get('t') == 'fire', timeout=5)
                assert fire['id'] == aid and fire['w'] == 'rifle'

                await a.send(json.dumps({"t": "hit", "target": bid, "dmg": 45, "part": "body"}))
                hit = await recv_until(b, lambda m: m.get('t') == 'hit', timeout=5)
                assert hit['from'] == aid and float(hit['dmg']) == 45.0

                await b.send(json.dumps({"t": "kill", "by": aid, "headshot": False}))
                kill = await recv_until(a, lambda m: m.get('t') == 'kill', timeout=5)
                assert kill['by'] == aid and kill['victim'] == bid
                score = await recv_until(a, lambda m: m.get('t') == 'score', timeout=5)
                arow = next((r for r in score['roster'] if r['id'] == aid), None)
                brow = next((r for r in score['roster'] if r['id'] == bid), None)
                assert arow and arow['kills'] == 1
                assert brow and brow['deaths'] == 1

        asyncio.run(run())

    def test_room_full(self):
        async def run():
            conns = []
            try:
                for i in range(13):
                    w = await websockets.connect(WS_URL, open_timeout=15)
                    await w.recv()  # hello
                    await w.send(json.dumps({"t": "join", "room": "pytfull", "name": f"P{i}"}))
                    conns.append(w)
                got_full = False
                for w in conns:
                    try:
                        await recv_until(w, lambda m: m.get('t') == 'full', timeout=1.0)
                        got_full = True
                        break
                    except Exception:
                        pass
                assert got_full, "expected 13th connection to receive {t:'full'}"
            finally:
                for w in conns:
                    try:
                        await w.close()
                    except Exception:
                        pass

        asyncio.run(run())
