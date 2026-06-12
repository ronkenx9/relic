/** RELIC x KAIZENVERSE — THE RUN.
 * Third-person wallet-history lane runner generated from real on-chain receipts. */
import * as THREE from "three";
import { fetchTimeline } from "../engine/explorer.js";
import { extractMoments, type Moment } from "../engine/moments.js";
import { assign, computeStats, type Assignment } from "../engine/archetype.js";
import { generateLevel, type LevelSpec } from "../engine/levelgen.js";
import type { Timeline } from "../indexer/types.js";
import { BIOME_COLORS } from "./world.js";
import { Runner3D } from "./runner3d.js";
import { createCinematics } from "./cinematics.js";
import { generateFallbackNotes } from "../notes/writer.js";

const $ = (id: string) => document.getElementById(id)!;
const ui = {
  gate: $("gate"), addr: $("addr") as HTMLInputElement, forgeBtn: $("forge-btn") as HTMLButtonElement,
  gateStatus: $("gate-status"), hud: $("hud"), deaths: $("deaths"), coins: $("coins"),
  badgeIcon: $("badge-icon") as HTMLImageElement, badgeName: $("badge-name"), badgeTag: $("badge-tag"),
  healthFill: $("health-fill"), healthText: $("health-text"), styleFill: $("style-fill"), styleText: $("style-text"),
  scoreDeaths: $("score-deaths"), scoreBlocks: $("score-blocks"), scoreEra: $("score-era"),
  era: $("era-toast"), caption: $("caption"), endcard: $("endcard"), endStats: $("end-stats"),
  endTitle: $("end-title"), endRank: $("end-rank"), endPortrait: $("end-portrait") as HTMLImageElement,
  endEvidence: $("end-evidence"), shareBtn: $("share-btn"), mintBtn: $("mint-btn") as HTMLAnchorElement,
  againBtn: $("again-btn"), canvasWrap: $("canvas-wrap"),
  endPersonality: $("end-personality"),
};

const CHARACTER_ASSETS: Partial<Record<string, { portrait: string; icon: string }>> = {
  wanderer: { portrait: "assets/kaizen/base/portrait.png", icon: "assets/kaizen/base/small_icon.png" },
  trickster: { portrait: "assets/kaizen/trickster/portrait.png", icon: "assets/kaizen/trickster/small_icon.png" },
  duelist: { portrait: "assets/kaizen/duelist/portrait.png", icon: "assets/kaizen/duelist/small_icon.png" },
  baron: { portrait: "assets/kaizen/baron/portrait.png", icon: "assets/kaizen/baron/small_icon.png" },
  oracle: { portrait: "assets/kaizen/oracle/portrait.png", icon: "assets/kaizen/oracle/small_icon.png" },
  machine: { portrait: "assets/kaizen/machine/portrait.png", icon: "assets/kaizen/machine/small_icon.png" },
  unwritten: { portrait: "assets/kaizen/unwritten/portrait.png", icon: "assets/kaizen/unwritten/small_icon.png" },
};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); // composer headroom
ui.canvasWrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BIOME_COLORS.origins.fog, 20, 105);
scene.background = new THREE.Color("#8DB7D7");

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 260);
const sun = new THREE.DirectionalLight(0xffffff, 1.35);
sun.position.set(5, 11, 8);
const ambient = new THREE.AmbientLight(0xbfc6d0, 0.52);
const hemi = new THREE.HemisphereLight(0xaec9ee, 0x645f82, 0.6);
scene.add(sun, ambient, hemi);
function nullCinematics(): ReturnType<typeof createCinematics> {
  return {
    render: () => renderer.render(scene, camera),
    resize: () => {},
    update: () => {},
    shake: () => {},
    hitFlash: () => {},
    coinPulse: () => {},
  };
}
let cine: ReturnType<typeof createCinematics>;
try {
  cine = createCinematics(renderer, scene, camera, document.body);
} catch (err) {
  console.warn("cinematics unavailable, plain renderer fallback:", err);
  cine = nullCinematics();
}

interface RunState {
  level: LevelSpec;
  assignment: Assignment;
  runner: Runner3D;
  ended: boolean;
  moments: Moment[];
}

let run: RunState | null = null;
let last = performance.now();
let squash = 0; // landing squash energy (0..1)
let captionTimer = 0;
let eraTimer = 0;
let pointerStartX: number | null = null;

function resize() {
  const w = ui.canvasWrap.clientWidth;
  const h = ui.canvasWrap.clientHeight;
  renderer.setSize(w, h, false);
  cine.resize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

function caption(text: string, ms = 2600) {
  ui.caption.textContent = text;
  ui.caption.classList.add("show");
  clearTimeout(captionTimer);
  captionTimer = window.setTimeout(() => ui.caption.classList.remove("show"), ms);
}

function eraToast(text: string) {
  ui.era.textContent = text;
  ui.era.classList.add("show");
  clearTimeout(eraTimer);
  eraTimer = window.setTimeout(() => ui.era.classList.remove("show"), 2200);
}

function setForgeLoading(on: boolean) {
  ui.gate.classList.toggle("forging", on);
  ui.forgeBtn.disabled = on;
}

async function forge(address: string) {
  setForgeLoading(true);
  ui.gateStatus.textContent = "READING THE CHAIN...";
  let tl: Timeline;
  try {
    tl = await withTimeout(fetchTimeline(address as `0x${string}`), 25000);
  } catch (err) {
    try {
      const res = await fetch(`demo/${address.toLowerCase()}.json`);
      if (!res.ok) throw err;
      tl = (await res.json()) as Timeline;
      ui.gateStatus.textContent = "LIVE API UNREACHABLE — USING COMMITTED SNAPSHOT";
      await sleep(900);
    } catch {
      ui.gateStatus.textContent = `THE CHAIN DID NOT ANSWER (${(err as Error).message}). TRY AGAIN.`;
      setForgeLoading(false);
      return;
    }
  }
  ui.gateStatus.textContent = "EXTRACTING MOMENTS...";
  await sleep(250);
  const moments = extractMoments(tl);
  const assignment = assign(tl, moments);
  ui.gateStatus.textContent = `${assignment.archetype.name} — ${assignment.archetype.tagline}`;
  await sleep(900);
  startRun(generateLevel(tl, moments), assignment, moments);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function startRun(level: LevelSpec, assignment: Assignment, moments: Moment[]) {
  if (run) run.runner.dispose(scene);
  scene.fog = new THREE.Fog(BIOME_COLORS.origins.fog, 18, 105);
  scene.background = new THREE.Color("#8DB7D7");

  const runner = new Runner3D(scene, level, assignment, {
    caption,
    era: eraToast,
    end: endRun,
    onHit: () => { cine.shake(0.42); cine.hitFlash(); },
    onLand: (impact) => { cine.shake(0.05 + impact * 0.06); squash = Math.max(squash, impact); },
    onCoin: () => cine.coinPulse(ui.coins),
  });

  run = { level, assignment, runner, ended: false, moments };
  setHudIdentity(assignment);
  ui.gate.classList.add("hidden");
  setForgeLoading(false);
  ui.hud.classList.remove("hidden");
  ui.endcard.classList.add("hidden");
  ui.shareBtn.textContent = "COPY SHARE TEXT";
  updateHud();
  resize();
  eraToast("GENESIS");
  caption("A / D or arrows — switch lanes. Space — jump.", 2600);

  (globalThis as Record<string, unknown>).__relic = {
    get state() {
      return run?.runner.state();
    },
    runnerMode() {
      return run?.runner.player.userData.mode;
    },
    runnerChildren() {
      return run?.runner.player.children.map((child) => ({ name: child.name, mode: child.userData.mode }));
    },
    warp(x: number) {
      run?.runner.warp(x);
    },
  };
}

function updateHud() {
  if (!run) return;
  const s = run.runner.state();
  ui.deaths.textContent = `DEATHS ${s.deaths}`;
  ui.coins.textContent = `BLOCKS ${s.coins}`;
  ui.scoreDeaths.textContent = String(s.deaths);
  ui.scoreBlocks.textContent = String(s.coins);
  ui.scoreEra.querySelector("b")!.textContent = s.era ?? "GENESIS";

  const health = Math.max(18, 100 - s.deaths * 14);
  const style = Math.min(100, Math.max(0, Math.round(s.coins * 8 + (s.x / s.len) * 40 + (s.grounded ? 0 : 12))));
  ui.healthFill.style.width = `${health}%`;
  ui.healthText.textContent = `${health}%`;
  ui.styleFill.style.width = `${style}%`;
  ui.styleText.textContent = `${style}%`;
}

function setHudIdentity(assignment: Assignment) {
  const assets = CHARACTER_ASSETS[assignment.archetype.id] ?? CHARACTER_ASSETS.wanderer!;
  ui.badgeIcon.src = assets.icon;
  ui.badgeName.textContent = assignment.archetype.name;
  ui.badgeTag.textContent = assignment.archetype.tagline;
}

function endRun() {
  if (!run || run.ended) return;
  run.ended = true;
  const runner = run.runner;
  const secs = ((performance.now() - runner.startedAt) / 1000).toFixed(1);
  const a = run.assignment;
  const stats = computeStats(a.traits);
  const assets = CHARACTER_ASSETS[a.archetype.id];
  if (assets) {
    ui.endPortrait.src = assets.portrait;
    ui.endPortrait.classList.remove("hidden");
  } else {
    ui.endPortrait.removeAttribute("src");
    ui.endPortrait.classList.add("hidden");
  }
  const state = runner.state();
  const styleGrade = state.deaths === 0 ? "S-RANK CLEAN RUN" : state.deaths <= 2 ? "A-RANK SURVIVOR" : state.deaths <= 5 ? "B-RANK CHAIN SCARRED" : "C-RANK STILL FORGED";
  ui.endTitle.textContent = `${a.archetype.name} · RELIC FORGED`;
  ui.endRank.textContent = `${styleGrade} · ${state.coins} BLOCKS`;
  const notes = generateFallbackNotes(a.archetype.id, a.traits, run.moments);
  ui.endPersonality.textContent = notes;
  ui.endStats.innerHTML =
    `<div><b>${state.deaths}</b><span>hits in your own history</span></div>` +
    `<div><b>${secs}s</b><span>run time</span></div>` +
    `<div><b>${state.coins}</b><span>blocks reclaimed</span></div>` +
    `<div><b>${a.traits.txCount}${run.level.truncatedHint ?? ""}</b><span>real txs behind this level</span></div>` +
    `<div class="bars">` +
    (["conviction", "aggression", "vision", "endurance", "chaos"] as const)
      .map((k) => `<div class="bar"><i>${k}</i><u><s style="width:${stats[k]}%"></s></u><em>${stats[k]}</em></div>`)
      .join("") +
    `</div>`;
  ui.endEvidence.innerHTML =
    a.evidence.map((e) => `<li>${e}</li>`).join("") +
    run.level.momentsUsed.slice(0, 4).map((m) => `<li>${m.headline}</li>`).join("");
  ui.shareBtn.onclick = () => {
    const txt = `My wallet is a 3D runner. ${a.archetype.name}, ${state.deaths} hits, ${state.coins} blocks reclaimed from my on-chain history. Survive yours: https://ronkenx9.github.io/relic/ #MantleAIHackathon`;
    navigator.clipboard?.writeText(txt);
    ui.shareBtn.textContent = "COPIED — POST IT";
  };
  setTimeout(() => { ui.endcard.classList.remove("hidden"); ui.hud.classList.add("hidden"); }, 1400);
}

function tick(now: number) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (run) {
    run.runner.update(dt, now, camera, scene, sun, ambient, hemi);
    // squash & stretch on the avatar: land -> squat, rise -> stretch
    const st = run.runner.state();
    squash = Math.max(0, squash - dt * 5);
    const sq = squash * 0.14;
    const stretch = !st.grounded ? 0.06 : 0;
    run.runner.player.scale.set(1 + sq - stretch * 0.5, 1 - sq + stretch, 1);
    cine.update(dt, camera, run.runner.player.position.z, st.era ? run.level.segments.find(s => s.era === st.era)?.biome : undefined);
    updateHud();
  } else {
    cine.update(dt, camera, 0, undefined);
  }
  cine.render();
}

addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") { e.preventDefault(); run?.runner.steer(-1); }
  if (e.code === "ArrowRight" || e.code === "KeyD") { e.preventDefault(); run?.runner.steer(1); }
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); run?.runner.jump(); }
});
renderer.domElement.addEventListener("pointerdown", (e) => { pointerStartX = e.clientX; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (pointerStartX === null) return;
  const dx = e.clientX - pointerStartX;
  pointerStartX = null;
  if (Math.abs(dx) > 42) run?.runner.steer(dx > 0 ? 1 : -1);
  else run?.runner.jump();
});

ui.againBtn.onclick = () => location.reload();
ui.forgeBtn.addEventListener("click", () => {
  const a = ui.addr.value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
    ui.gateStatus.textContent = "PASTE A FULL 0x ADDRESS (ENS NOT YET — HONESTY OVER MAGIC).";
    return;
  }
  void forge(a);
});
ui.addr.addEventListener("keydown", (e) => { if (e.key === "Enter") ui.forgeBtn.click(); });
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-demo]"))) {
  btn.addEventListener("click", () => { ui.addr.value = btn.dataset.demo!; ui.forgeBtn.click(); });
}

requestAnimationFrame(tick);
resize();
