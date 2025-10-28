
// js/sprite-select.js
// Pixel-accurate hover & click on .character sprites.
// Character selection and navigation to canvas (no Azure dependencies)

import { readCtx, nextURL } from "./flow.js";
import { connectLocks } from "./locks.js";

// No Azure: simplified flow

/************ Session / flow ctx ************/
const ctx = readCtx();             // story/grade/etc if user followed the flow
const sessionId = ctx.session || localStorage.getItem("sessionCode") || null;
const storyId = (ctx.story || localStorage.getItem("selectedStory") || "").replace(/_/g, "-");
const slide = (()=>{ const q = new URLSearchParams(location.search); return Number(q.get("slide")) || Number(ctx.slide) || 1; })();

// Stable device token (for locking identity)
const deviceToken = (() => {
  let t = localStorage.getItem("deviceToken");
  if (!t) {
    t = (crypto.randomUUID?.() || String(Date.now()));
    localStorage.setItem("deviceToken", t);
  }
  return t;
})();

/************ Pixel-accurate hover + click ************/
const hit = new Map();

function buildHitCanvas(img) {
  // Only build for successfully loaded images
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  hit.set(img, { canvas: c, ctx: cx, w, h });
}

function isOverInk(img, off, evt) {
  const rect = img.getBoundingClientRect();
  const p = evt.touches ? evt.touches[0] : evt;
  const xEl = p.clientX - rect.left;
  const yEl = p.clientY - rect.top;
  const sx = off.w / rect.width;
  const sy = off.h / rect.height;
  const x = (xEl * sx) | 0;
  const y = (yEl * sy) | 0;
  if (x < 0 || y < 0 || x >= off.w || y >= off.h) return false;
  return off.ctx.getImageData(x, y, 1, 1).data[3] > 10;
}

// Include sprite URL so canvas never confuses cross-story characters
function goToCanvas(charKey, spriteUrl) {
  const url = nextURL("canvas.html", ctx, {
    char: charKey,
    sprite: spriteUrl || ""
  });
  location.href = url;
}

let locks = null;
let disconnectTimer = 0;

function bindSocketEvents(ws){
  if (!ws) return;
  ws.addEventListener('open',   () => { if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = 0; } });
  ws.addEventListener('close',  () => { scheduleRedirect(); });
  ws.addEventListener('error',  () => { scheduleRedirect(); });
}

function scheduleRedirect(){
  if (disconnectTimer) return;
  disconnectTimer = setTimeout(() => {
    const url = new URL(location.href);
    url.pathname = 'index.html';
    url.searchParams.set('reason', 'ws');
    location.replace(url.toString());
  }, 60000);
}

function wire(img) {
  // Build hit-map as soon as the image is ready
  const tryBuild = () => buildHitCanvas(img);
  if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) tryBuild();
  else {
    if ("decode" in img) {
      img.decode().then(() => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) tryBuild();
      }).catch(() => {/* ignore broken image */});
    }
    img.addEventListener("load", tryBuild, { once: true });
    img.addEventListener("error", () => {/* ignore broken image */}, { once: true });
  }

  const onMove = (e) => {
    const off = hit.get(img);
    if (!off) return;
    const over = isOverInk(img, off, e);
    img.classList.toggle("hovered", over && !img.classList.contains("locked"));
  };
  const onLeave = () => img.classList.remove("hovered");

  img.addEventListener("mousemove", onMove);
  img.addEventListener("mouseleave", onLeave);
  img.addEventListener("touchstart", onMove, { passive: true });

  img.addEventListener("click", async (e) => {
    if (img.classList.contains("locked")) return;
    const charKey   = img.dataset.char;
    const spriteUrl = img.dataset.sprite || img.src;
    try {
      if (locks) {
        const ok = await locks.claim(charKey);
        if (!ok) { img.classList.add("locked"); return; }
      }
    } catch {}
    goToCanvas(charKey, spriteUrl);
  }, true);
}

function wireAllCurrentSprites() {
  const sprites = Array.from(document.querySelectorAll(".character"));
  sprites.forEach(wire);

  // Rebuild hit-maps if elements resize
  const ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const el = e.target;
      if (el.classList.contains("character")) buildHitCanvas(el);
    }
  });
  sprites.forEach(img => ro.observe(img));
}

/************ Boot: ALWAYS wire sprites first ************/
async function boot() {
  if (document.readyState === "loading") {
    await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true }));
  }
  wireAllCurrentSprites();   // characters are already injected by sprite-select.html

  // Connect to locks and gray out locked characters in realtime
  try {
    const deviceToken = localStorage.getItem("deviceToken");
    if (sessionId && storyId && slide) {
      locks = await connectLocks(sessionId, storyId, slide, deviceToken);
      locks?.onStatus((charId, locked, isSelf) => {
        const el = document.querySelector(`.character[data-char="${charId}"]`);
        if (!el) return;
        // On selection page, gray out for ANY lock (even self from another tab)
        el.classList.toggle("locked", !!locked);
      });
      // Immediately apply current snapshot to all characters after wiring
      if (locks) {
        const st = locks.getState();
        document.querySelectorAll('.character').forEach(el => {
          const id = el.dataset.char;
          if (!id) return;
          const val = st.get(id);
          if (val) el.classList.toggle('locked', !!val.locked);
        });
      }
      if (locks?.socket){
        bindSocketEvents(locks.socket);
      } else {
        scheduleRedirect();
      }
    }
  } catch {}
}

/************ Refresh locks (non-blocking with backoff) ************/
// No Azure lock polling

boot();
