"use strict";

// Lightweight client for the locks WebSocket server.
// Exposes: connectLocks(sessionId, storyId, slide, deviceToken)

function wsBase() {
  // Prefer explicit config on window, else localhost fallback
  const u = (window.LOCKS_WS_URL || "").trim();
  if (u) return u.replace(/\/$/, "");
  const loc = location;
  const host = loc.hostname || "localhost";
  const port = (window.LOCKS_WS_PORT || "8000").trim();
  const scheme = (loc.protocol === "https:") ? "wss" : "ws";
  return `${scheme}://${host}:${port}`;
}

export async function connectLocks(sessionId, storyId, slide, deviceToken) {
  if (!sessionId || !storyId || !slide) {
    return null;
  }

  const url = `${wsBase()}/ws/${encodeURIComponent(sessionId)}/${encodeURIComponent(storyId)}/${encodeURIComponent(slide)}`;
  let ws = null;
  let ready = false;
  let onStatusCb = () => {};
  let cbSet = false;
  const owned = new Set();
  let heartbeatTimer = 0;
  let presenceTimer = 0;
  const pending = [];
  const state = new Map(); // charId -> { locked, isSelf }
  let reconnectTimer = 0;
  let backoffMs = 200;
  const maxBackoff = 2000;

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = window.setInterval(() => {
      for (const ch of owned) {
        trySend({ type: "heartbeat", charId: ch });
      }
    }, 5000);
  }
  function stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = 0; } }

  function trySend(obj) {
    try { ws && ws.readyState === 1 && ws.send(JSON.stringify(obj)); } catch {}
  }

  function onOpen() {
    backoffMs = 200;
    trySend({ type: "hello", sessionId, deviceToken });
    startPresence();
  }

  function onMessage(ev){
    try {
      const msg = JSON.parse(ev.data);
      const t = msg?.type;
      if (t === "snapshot") {
        ready = true;
        for (const it of (msg.locks || [])) {
          // Queue current lock status and emit if callback is set
          pending.push([it.charId, !!it.locked, !!it.isSelf]);
          state.set(it.charId, { locked: !!it.locked, isSelf: !!it.isSelf });
          if (cbSet) onStatusCb(it.charId, !!it.locked, !!it.isSelf);
          if (it.locked && it.isSelf) owned.add(it.charId);
        }
        if (owned.size) startHeartbeat();
      } else if (t === "status") {
        // Another user claimed/released
        const { charId, locked } = msg;
        if (!charId) return;
        if (!locked) owned.delete(charId);
        const tuple = [charId, !!locked, owned.has(charId)];
        pending.push(tuple);
        state.set(charId, { locked: !!locked, isSelf: owned.has(charId) });
        if (cbSet) onStatusCb(charId, !!locked, owned.has(charId));
      } else if (t === "claim-result") {
        // handled at claim() promise side
      }
    } catch {}
  }

  function scheduleReconnect(){
    if (reconnectTimer) return;
    stopHeartbeat();
    stopPresence();
    reconnectTimer = window.setTimeout(()=>{
      reconnectTimer = 0;
      backoffMs = Math.min(maxBackoff, backoffMs * 2);
      open();
    }, backoffMs + Math.random()*200);
  }

  function startPresence(){
    if (presenceTimer) return;
    presenceTimer = window.setInterval(()=>{ trySend({ type: "presence" }); }, 10000);
  }
  function stopPresence(){ if (presenceTimer){ clearInterval(presenceTimer); presenceTimer=0; } }

  function open(){
    try { ws = new WebSocket(url); }
    catch(e){ console.warn('[locks] WS open failed', e); scheduleReconnect(); return; }
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', scheduleReconnect);
    ws.addEventListener('error', scheduleReconnect);
  }

  open();

  const waitReady = new Promise(res => {
    const t = setInterval(() => {
      if (ready || ws?.readyState === 3) { clearInterval(t); res(); }
    }, 50);
    setTimeout(() => { clearInterval(t); res(); }, 1500);
  });
  await waitReady;

  async function claim(charId) {
    if (!ws || ws.readyState !== 1) return false;
    return new Promise(resolve => {
      const onMsg = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m?.type === "claim-result" && m.charId === charId) {
            ws.removeEventListener("message", onMsg);
            if (m.ok) {
              owned.add(charId);
              startHeartbeat();
            }
            resolve(!!m.ok);
          }
        } catch {}
      };
      ws.addEventListener("message", onMsg);
      trySend({ type: "claim", charId });
      setTimeout(() => { // fail-safe timeout
        ws.removeEventListener("message", onMsg);
        resolve(false);
      }, 1500);
    });
  }

  function release(charId) {
    owned.delete(charId);
    trySend({ type: "release", charId });
  }

  window.addEventListener("beforeunload", () => {
    for (const ch of owned) { trySend({ type: "release", charId: ch }); }
    stopHeartbeat();
    stopPresence();
  });

  return {
    onStatus(cb) {
      onStatusCb = cb;
      cbSet = true;
      // Flush any queued statuses so UI reflects current snapshot immediately
      try { for (const [cid, locked, isSelf] of pending.splice(0)) cb(cid, locked, isSelf); } catch {}
    },
    claim,
    release,
    socket: ws,
    isLocked(charId){ const v = state.get(charId); return !!(v && v.locked && !v.isSelf); },
    getState(){ return new Map(state); },
  };
}


