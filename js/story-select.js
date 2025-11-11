
// js/story-select.js — minimal: single story, no grades, no manifest
import { readCtx, writeCtx, nextURL } from "./flow.js";

// ---- DOM ----
const grid      = document.getElementById("storyGrid");
const emptyMsg  = document.getElementById("emptyMsg");
const sessionEl = document.getElementById("sessionInfo");

// ---- Session guard ----
const ctx = readCtx();
if (!ctx.session) { location.replace("index.html"); throw 0; }
sessionEl.textContent = `Session: ${ctx.session}`;

// ---- Single story ----
const stories = [
  // Hard-coded thumbnail image
  { id:"tortoise-hare", title:"The Tortoise and the Hare", thumb:"assets/tortoise_and_the_hare/slide1_with_characters.png" }
];

// ---- Render ----
render();

function render() {
  grid.innerHTML = "";
  emptyMsg.hidden = true;

  for (const s of stories) {
    grid.appendChild(makeCard(s));
  }
}

function makeCard(s) {
  const card = document.createElement("div");
  card.className = "card";
  card.setAttribute("role","button");
  card.setAttribute("aria-label", `Choose ${s.title}`);

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  const img = document.createElement("img");
  img.alt = s.title;
  img.loading = "lazy";
  img.decoding = "async";
  // Hard-coded thumbnail source
  img.src = s.thumb;
  thumb.appendChild(img);

  const title = document.createElement("div");
  title.className = `title story-${s.id}`;
  title.textContent = s.title;

  card.append(thumb, title);

  const go = () => {
    const nextCtx = { ...readCtx(), story: s.id };
    writeCtx(nextCtx);
    location.href = nextURL("slide-select.html", nextCtx);
  };
  card.addEventListener("click", go);
  card.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  });

  return card;
}
