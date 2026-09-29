import asyncio, json, sys
import websockets

URL = "ws://localhost:8001/api/ws"

async def recv_until(ws, pred, timeout=5.0, collect=None):
    """Receive messages until pred(msg) true; return that msg. Optionally collect all."""
    loop = asyncio.get_event_loop()
    end = loop.time() + timeout
    while True:
        remaining = end - loop.time()
        if remaining <= 0:
            raise TimeoutError(f"timeout waiting; collected types so far")
        raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        msg = json.loads(raw)
        if collect is not None:
            collect.append(msg)
        if pred(msg):
            return msg

async def main():
    results = []
    def ok(name, cond, extra=""):
        results.append((name, cond, extra))
        print(("PASS" if cond else "FAIL"), name, extra)

    # Two players connect to the same room
    async with websockets.connect(URL) as a, websockets.connect(URL) as b:
        # hello
        ha = json.loads(await a.recv()); hb = json.loads(await b.recv())
        ok("A gets hello", ha.get("t")=="hello", str(ha))
        ok("B gets hello", hb.get("t")=="hello", str(hb))
        aid = ha["id"]; bid = hb["id"]

        # A joins room r1 with map
        await a.send(json.dumps({"t":"join","room":"r1","name":"Alice","map":"market"}))
        wa = await recv_until(a, lambda m: m.get("t")=="welcome")
        ok("A welcome room", wa.get("room")=="r1", str(wa.get("map")))
        ok("A welcome map=market", wa.get("map")=="market")
        ok("A skin assigned", isinstance(wa.get("skin"), int))

        # B joins same room
        await b.send(json.dumps({"t":"join","room":"r1","name":"Bob"}))
        wb = await recv_until(b, lambda m: m.get("t")=="welcome")
        ok("B welcome sees A peer", any(p.get("name")=="Alice" for p in wb.get("peers",[])), str(wb.get("peers")))
        ok("B distinct skin", wb.get("skin")!=wa.get("skin"), f"a={wa.get('skin')} b={wb.get('skin')}")

        # A should get peer_join for B
        pj = await recv_until(a, lambda m: m.get("t")=="peer_join", timeout=3)
        ok("A sees peer_join B", pj.get("name")=="Bob")

        # Both ready -> match_start countdown
        await a.send(json.dumps({"t":"ready","ready":True}))
        await b.send(json.dumps({"t":"ready","ready":True}))
        ms_a = await recv_until(a, lambda m: m.get("t")=="match_start", timeout=3)
        ms_b = await recv_until(b, lambda m: m.get("t")=="match_start", timeout=3)
        ok("A match_start countdown", ms_a.get("in")>0 and ms_a.get("limit")==15, str(ms_a))
        ok("B match_start countdown", ms_b.get("in")>0, str(ms_b))
        ok("match_start ids include both", set(ms_a.get("ids",[]))=={aid,bid}, str(ms_a.get("ids")))

        # Both deploy into the match (not solo)
        await a.send(json.dumps({"t":"deploy"}))
        await b.send(json.dumps({"t":"deploy"}))
        await asyncio.sleep(0.3)

        # A sends state -> B should get a snapshot including A
        await a.send(json.dumps({"t":"state","s":{"p":[1,2,3],"y":0.5,"hp":100}}))
        snap = await recv_until(b, lambda m: m.get("t")=="snapshot", timeout=3)
        ok("B gets snapshot of A movement", any(s.get("id")==aid for s in snap.get("states",[])), str(snap))

        # A fires -> B receives fire relay
        await a.send(json.dumps({"t":"fire","o":[0,0,0],"d":[0,0,1],"w":"rifle","seed":42}))
        fire = await recv_until(b, lambda m: m.get("t")=="fire", timeout=3)
        ok("B receives A fire", fire.get("id")==aid and fire.get("w")=="rifle")

        # A claims hit on B -> B receives hit
        await a.send(json.dumps({"t":"hit","target":bid,"dmg":45,"part":"body"}))
        hit = await recv_until(b, lambda m: m.get("t")=="hit", timeout=3)
        ok("B receives hit from A", hit.get("from")==aid and hit.get("dmg")==45.0, str(hit))

        # B confirms death by A -> score sync
        await b.send(json.dumps({"t":"kill","by":aid,"headshot":False}))
        kill = await recv_until(a, lambda m: m.get("t")=="kill", timeout=3)
        ok("A sees killfeed (A killed B)", kill.get("by")==aid and kill.get("victim")==bid, str(kill))
        score = await recv_until(a, lambda m: m.get("t")=="score", timeout=3)
        arow = next((r for r in score.get("roster",[]) if r["id"]==aid), None)
        brow = next((r for r in score.get("roster",[]) if r["id"]==bid), None)
        ok("Score: A kills=1", arow and arow["kills"]==1, str(arow))
        ok("Score: B deaths=1", brow and brow["deaths"]==1, str(brow))

        # ping/pong
        await a.send(json.dumps({"t":"ping","ts":123}))
        pong = await recv_until(a, lambda m: m.get("t")=="pong", timeout=3)
        ok("ping/pong ts echo", pong.get("ts")==123)

    # Room full test
    conns = []
    try:
        for i in range(13):
            w = await websockets.connect(URL)
            await w.recv()  # hello
            await w.send(json.dumps({"t":"join","room":"fullroom","name":f"P{i}"}))
            conns.append(w)
        # the 13th should get 'full'
        got_full = False
        for w in conns:
            try:
                m = await recv_until(w, lambda m: m.get("t")=="full", timeout=0.5)
                got_full = True
                break
            except Exception:
                pass
        ok("13th join into 12-max room -> full", got_full)
    finally:
        for w in conns:
            await w.close()

    passed = sum(1 for _,c,_ in results if c)
    print(f"\n=== {passed}/{len(results)} checks passed ===")
    sys.exit(0 if passed==len(results) else 1)

asyncio.run(main())
