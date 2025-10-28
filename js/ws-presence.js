"use strict";

// Site-wide websocket presence + status badge. Safe to include on any page.
// Requires: js/flow.js (for context) and js/locks.js (for socket connection)

import { readCtx } from './flow.js';
import { connectLocks } from './locks.js';

if (!window.__locksPresenceInit) {
  window.__locksPresenceInit = true;

  (async () => {
    const ctx = readCtx?.() || {};
    const sessionId = ctx.session || localStorage.getItem('sessionCode') || '';
    if (!sessionId) return; // no session yet (join page)

    // Derive room: use selected story/slide if present; otherwise lobby(0)
    const q = new URLSearchParams(location.search);
    const storyId = (ctx.story || q.get('story') || 'lobby').replace(/_/g, '-');
    const slide = Number(q.get('slide')) || Number(ctx.slide) || 0;
    const deviceToken = localStorage.getItem('deviceToken') || (crypto.randomUUID?.() || String(Date.now()));

    // Reuse existing page button if present; else create a floating one
    let btn = document.getElementById('connBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'connBtn';
      btn.textContent = 'Connecting…';
      btn.style.position='fixed'; btn.style.top='10px'; btn.style.right='10px';
      btn.style.zIndex='9999'; btn.style.padding='.55rem .8rem';
      btn.style.border='2px solid #d6dbef'; btn.style.borderRadius='10px';
      btn.style.background='#fff'; btn.style.fontWeight='600'; btn.style.boxShadow='0 3px 8px rgba(0,0,0,.05)';
      document.body.appendChild(btn);
    }

    let redirectTimer = 0;
    function reflect(ws){
      if (!ws) { btn.textContent='Reconnecting…'; scheduleRedirect(); return; }
      if (ws.readyState===1){ btn.textContent='Connected'; if (redirectTimer){ clearTimeout(redirectTimer); redirectTimer=0; } }
      else if (ws.readyState===0){ btn.textContent='Connecting…'; }
      else { btn.textContent='Reconnecting…'; scheduleRedirect(); }
    }
    function scheduleRedirect(){
      if (redirectTimer) return;
      redirectTimer = setTimeout(()=>{
        const u = new URL('index.html', location.href);
        u.searchParams.set('reason','ws');
        location.replace(u.toString());
      }, 60000);
    }

    async function connectOnce(){
      try {
        const l = await connectLocks(sessionId, storyId, slide || 0, deviceToken);
        if (l?.socket){
          const ws = l.socket;
          ws.addEventListener('open',  ()=>reflect(ws));
          ws.addEventListener('close', ()=>reflect(ws));
          ws.addEventListener('error', ()=>reflect(ws));
          reflect(ws);
        } else {
          reflect(null);
        }
      } catch {
        reflect(null);
      }
    }

    btn.addEventListener('click', (e)=>{
      if (btn.textContent !== 'Connected') {
        e.preventDefault();
        location.reload();
      }
    });

    await connectOnce();
  })();
}


