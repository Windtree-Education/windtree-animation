from __future__ import annotations

import json
import os
import time
from typing import Dict, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


def get_allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "*")
    if raw.strip() == "*":
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="WT Animation Locks Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


# Rooms and locks are kept in-memory for a single-process deployment.
# For multi-instance deployments, back these with Redis and pub/sub room broadcasts.
rooms: Dict[str, Set[WebSocket]] = {}
locks: Dict[str, dict] = {}

LOCK_TTL_SECONDS = int(os.getenv("LOCK_TTL_SECONDS", "20"))


async def broadcast(room_key: str, msg: dict | str) -> None:
    payload = msg if isinstance(msg, str) else json.dumps(msg)
    dead: list[WebSocket] = []
    for ws in rooms.get(room_key, set()).copy():
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        try:
            rooms.get(room_key, set()).discard(ws)
        except Exception:
            pass


@app.get("/health")
async def health():
    return {"ok": True}


@app.websocket("/ws/{sessionId}/{storyId}/{slide}")
async def ws_room(ws: WebSocket, sessionId: str, storyId: str, slide: int):
    await ws.accept()
    room_key = f"{sessionId}:{storyId}:{slide}"
    rooms.setdefault(room_key, set()).add(ws)

    device_token: str | None = None

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            t = msg.get("type")
            now = time.time()

            if t == "hello":
                device_token = msg.get("deviceToken")

                # Build and send snapshot for this room
                snap = []
                for key, state in list(locks.items()):
                    s, st, sl, ch = key.split(":", 3)
                    if s == sessionId and st == storyId and sl == str(slide):
                        alive = bool(state and state.get("expiresAt", 0) > now)
                        if not alive:
                            # opportunistic cleanup of expired entries
                            locks.pop(key, None)
                            continue
                        snap.append({
                            "charId": ch,
                            "locked": True,
                            "isSelf": (state.get("owner", {}).get("deviceToken") == device_token),
                        })
                await ws.send_text(json.dumps({"type": "snapshot", "locks": snap}))

            elif t == "claim":
                char = (msg.get("charId") or "").strip()
                if not char:
                    continue
                key = f"{sessionId}:{storyId}:{slide}:{char}"
                state = locks.get(key)
                if (not state) or (state.get("expiresAt", 0) <= now):
                    locks[key] = {
                        "owner": {"sessionId": sessionId, "deviceToken": device_token},
                        "expiresAt": now + LOCK_TTL_SECONDS,
                    }
                    await ws.send_text(json.dumps({"type": "claim-result", "charId": char, "ok": True}))
                    await broadcast(room_key, {"type": "status", "charId": char, "locked": True})
                else:
                    await ws.send_text(json.dumps({"type": "claim-result", "charId": char, "ok": False}))

            elif t == "release":
                char = (msg.get("charId") or "").strip()
                if not char:
                    continue
                key = f"{sessionId}:{storyId}:{slide}:{char}"
                state = locks.get(key)
                if state and state.get("owner", {}).get("deviceToken") == device_token:
                    locks.pop(key, None)
                    await broadcast(room_key, {"type": "status", "charId": char, "locked": False})

            elif t == "heartbeat":
                char = (msg.get("charId") or "").strip()
                if not char:
                    continue
                key = f"{sessionId}:{storyId}:{slide}:{char}"
                state = locks.get(key)
                if state and state.get("owner", {}).get("deviceToken") == device_token:
                    state["expiresAt"] = time.time() + LOCK_TTL_SECONDS

    except WebSocketDisconnect:
        pass
    finally:
        try:
            rooms.get(room_key, set()).discard(ws)
        except Exception:
            pass


