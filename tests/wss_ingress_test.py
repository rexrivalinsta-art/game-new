import asyncio, json, sys
import websockets

URL = "wss://tactical-strike-136.preview.emergentagent.com/api/ws"

async def main():
    try:
        async with websockets.connect(URL, open_timeout=15) as ws:
            hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
            print("PASS connected over WSS, hello:", hello)
            await ws.send(json.dumps({"t":"join","room":"wsscheck","name":"Probe","map":"market"}))
            # read until welcome
            for _ in range(10):
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                if m.get("t")=="welcome":
                    print("PASS welcome over WSS:", {k:m[k] for k in ("room","map","skin","tickHz") if k in m})
                    print("RESULT OK")
                    return
            print("FAIL no welcome")
            sys.exit(1)
    except Exception as e:
        print("FAIL WSS connect:", repr(e))
        sys.exit(2)

asyncio.run(main())
