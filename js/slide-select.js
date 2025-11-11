
// js/slide-select.js — interactive slide picker (1–6) for the chosen story
import { readCtx, writeCtx, nextURL } from "./flow.js";

const grid     = document.getElementById("grid");
const emptyMsg = document.getElementById("emptyMsg");
const sub      = document.getElementById("sub");
const backBtn  = document.getElementById("backBtn");

const ctx = readCtx();
const storyId = (ctx.story || "").toLowerCase();

if (!ctx.session) { location.replace("index.html"); throw 0; }
if (!storyId)     { location.replace("story-select.html"); throw 0; }

// Show context: session + story
sub.textContent = `Session: ${ctx.session}  •  Story: ${toTitle(storyId)}`;

// Back to stories
backBtn.addEventListener("click", () => {
  location.href = nextURL("story-select.html", ctx);
});

// Map reduced to only tortoise-hare
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare", "tortoise-hare"]
]);

// Use kebab-case folder names exactly as in your repo
const storyFolder = STORY_FOLDER_MAP.get(storyId) || storyId;

// Render only the first slide
renderSlides(1);

function renderSlides(count) {
  grid.innerHTML = "";
  emptyMsg.hidden = true;

  const items = [];
  for (let i = 1; i <= count; i++) {
    items.push(makeCard(i));
  }

  if (!items.length) {
    emptyMsg.hidden = false;
    return;
  }
  items.forEach(el => grid.appendChild(el));
}

function makeCard(index) {
  const card = document.createElement("div");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Choose Slide ${index}`);

  const thumb = document.createElement("div");
  thumb.className = "thumb";

  const img = document.createElement("img");
  img.alt = `Page ${index}`;
  img.loading = "lazy";
  img.decoding = "async";

  // Hard-coded thumbnail image
  img.src = "assets/tortoise_and_the_hare/slide1_with_characters.png";

  thumb.appendChild(img);

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = `Page ${index}`;

  // Actions row
  const actions = document.createElement("div");
  actions.className = "actions";

  const storyboardBtn = document.createElement("button");
  storyboardBtn.type = "button";
  storyboardBtn.className = "btn btn-mini";
  storyboardBtn.textContent = "Storyboard";
  storyboardBtn.addEventListener("click", e => {
    e.stopPropagation();
    const nextCtx = writeCtx({ ...ctx, slide: String(index) });
    location.href = nextURL("storyboard.html", nextCtx);
  });

  actions.appendChild(storyboardBtn);

  card.append(thumb, title, actions);

  const go = () => {
    const nextCtx = writeCtx({ ...ctx, slide: String(index) });
    location.href = nextURL("sprite-select.html", nextCtx);
  };
  card.addEventListener("click", go);
  card.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  });

  return card;
}

// Helpers
function toTitle(id) {
  return String(id).replace(/-/g," ").replace(/\b\w/g, m => m.toUpperCase());
}
