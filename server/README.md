WT Animation Locks Server (FastAPI)
==================================

A minimal FastAPI WebSocket server that manages realtime character locks scoped to `(sessionId, storyId, slide, charId)`.

- Endpoint: `ws://<HOST>/ws/{sessionId}/{storyId}/{slide}`
- Messages:
  - Client → Server: `hello`, `claim`, `release`, `heartbeat`
  - Server → Client: `snapshot`, `status`, `claim-result`
- TTL: default 20s; client sends heartbeat every ~5s.

Run locally
-----------

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ALLOWED_ORIGINS="*"   # or your site origins separated by commas
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Deploy
------

- Render, Railway, Fly.io, Azure App Service all work.
- Set env vars:
  - `ALLOWED_ORIGINS` to your site origin(s) (comma-separated)
  - `LOCK_TTL_SECONDS` (optional)

For multi-instance scaling, store `locks` in Redis and broadcast room updates via pub/sub.


