from __future__ import annotations

import json
import os
import time
from typing import Dict, Set
from dotenv import load_dotenv
from supabase import create_client, Client
from typing import List, Dict, Any
import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(dotenv_path="./.env")

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_ANON_KEY")
supabase = create_client(url, key)

def get_allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "*")
    if raw.strip() == "*":
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]

class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, List[WebSocket]] = {}

    async def connect(self, sid: str, websocket: WebSocket):
        await websocket.accept()
        sockets = self.active.setdefault(sid, [])
        if websocket not in sockets:
            sockets.append(websocket)
        print(f"[WS] Connected {sid}, total sockets={len(sockets)}")

    def disconnect(self, sid: str, websocket: WebSocket):
        if sid in self.active and websocket in self.active[sid]:
            self.active[sid].remove(websocket)
            if not self.active[sid]:
                del self.active[sid]  # clean up empty session
                
    async def broadcast(self, sid: str, payload: dict | str):
        data = payload if isinstance(payload, str) else json.dumps(payload)
        #print(data)
        dead = []
        sockets = self.active.get(sid, [])
        for ws in sockets:
            try:
                await ws.send_text(data)
            except Exception as e:
                print(f"[WS] Failed to send to {sid}: {e}")
                dead.append(ws)
        for ws in dead:
            self.disconnect(sid, ws)

app = FastAPI(title="WT Animation Locks Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

manager = ConnectionManager()

@app.post("/images")
async def upload_image(
    session_id: str = Form(...),
    story_id: str = Form(...),
    slide_id: str = Form(...),
    file: UploadFile = File(...)
    ):
    bucket = supabase.storage.from_("user_images")
    storage_path = f"{session_id}/{story_id}/{slide_id}/{file.filename}"
    bucket.upload(storage_path, await file.read())
    public_url = bucket.get_public_url(storage_path)

    result = supabase.table("user_images").insert({
        "session_id": session_id,
        "story_id": story_id,
        "slide_id": slide_id,
        "image_url": public_url
    }).execute()
    row = result.data[0]

    await manager.broadcast(session_id, {"type": "image-added", "image": row})
    return row


@app.delete("/images/{record_id}")
async def delete_image(record_id: str, session_id: str, story_id: str, slide_id: str, storage_path: str):
    supabase.storage.from_("user-images").remove([storage_path])
    result = supabase.table("user_images").delete().eq("id", record_id).execute()

    await manager.broadcast(session_id, {
        "type": "image-removed",
        "recordId": record_id,
        "storyId": story_id,
        "slideId": slide_id
    })
    return {"deleted": result.data}


@app.post("/locks")
async def claim_lock(session_id: str, story_id: str, slide_id: str, char_id: str, user_id: str):
    result = supabase.table("locks").insert({
        "session_id": session_id,
        "story_id": story_id,
        "slide_id": slide_id,
        "char_id": char_id,
        "user_id": user_id,
        "expires_at": int(time.time()) + 30
    }).execute()
    row = result.data[0]

    await manager.broadcast(session_id, {"type": "lock-claimed", "lock": row})
    return row


@app.delete("/locks/{lock_id}")
async def release_lock(lock_id: str, session_id: str):
    result = supabase.table("locks").delete().eq("id", lock_id).execute()
    await manager.broadcast(session_id, {"type": "lock-released", "lockId": lock_id})
    return {"released": lock_id}

@app.post("/sessions")
async def create_session(user_id: str):
    code = str(uuid.uuid4())[:6]  # or your makeCode() logic
    result = supabase.table("sessions").insert({
        "id": code,
        "owner_id": user_id
    }).execute()
    return result.data[0]

@app.get("/sessions/{code}")
async def check_session(code: str):
    result = supabase.table("sessions").select("*").eq("id", code).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return result.data[0]

@app.get("/health")
async def health():
    return {"ok": True}

@app.websocket("/ws/{sid}")
async def ws_room(ws: WebSocket, sid: str):
    await manager.connect(sid, ws)

    # Snapshot from DB
    locks = supabase.table("locks").select("*").eq("session_id", sid).execute().data
    images = supabase.table("user_images").select("*").eq("session_id", sid).execute().data
    await ws.send_json({"type": "snapshot", "locks": locks, "images": images})

    try:
        while True:
            await ws.receive_text()  # optional heartbeat
    except WebSocketDisconnect:
        manager.disconnect(sid, ws)