/** RELIC × KAIZENVERSE — THE RUN.
 * Voxel troll-platformer generated from a wallet's real history.
 * The chain already trolled you. Survive it this time. */
import * as THREE from "three";
import { fetchTimeline } from "../engine/explorer.js";
import { extractMoments } from "../engine/moments.js";
import { assign, computeStats, type Assignment } from "../engine/archetype.js";
import { generateLevel, type LevelSpec, type Segment, type TrapEvent } from "../engine/levelgen.js";
import type { Timeline } from "../indexer/types.js";
import { buildWorld, buildFighter, BIOME_COLORS, updateFighterPose, setFighterFrame, type WorldHandles } from "./world.js";

// ---------- DOM ----------
const $ = (id: string) => document.getElementById(id)!;
const ui = {
  gate: $("gate"), addr: $("addr") as HTMLInputElement, forgeBtn: $("forge-btn"),
  gateStatus: $("gate-status"), hud: $("hud"), deaths: $("deaths"), coins: $("coins"),
  era: $("era-toast"), caption: $("caption"), endcard: $("endcard"), endStats: $("end-stats"),
  endTitle: $("end-title"), endPortrait: $("end-portrait") as HTMLImageElement, endEvidence: $("end-evidence"), shareBtn: $("share-btn"),
  againBtn: $("again-btn"), canvasWrap: $("canvas-wrap"),
};

const CHARACTER_ASSETS: Partial<Record<string, { portrait: string; icon: string }>> = {
  wanderer: {
    portrait: "assets/kaizen/base/portrait.png",
    icon: "assets/kaizen/base/small_icon.png",
  },
};

// ---------- three.js ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
ui.canvasWrap.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 220);
const sun = new THREE.DirectionalLight(0xffffff, 1.25);
sun.position.set(6, 12, 8);
const ambient = new THREE.AmbientLight(0xbfc6d0, 0.55);
scene.add(sun, ambient);

function resize() {
  const w = ui.canvasWrap.clientWidth, h = ui.canvasWrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

// ---------- game state ----------
interface RunState {
  level: LevelSpec; world: WorldHandles; fighter: THREE.Group; assignment: Assignment;
  x: number; y: number; vy: number; grounded: boolean;
  deaths: number; coinsGot: number; startedAt: number;
  timeScale: number; jumpBuffer: number; coyote: number;
  segment: Segment | null; ended: boolean;
  runaway: { mesh: THREE.Mesh; hops: number; trap: TrapEvent; gone: boolean } | null;
  tolls: Map<number, { group: THREE.Group; trap: TrapEvent; paid: boolean }>;
  shownCaptions: Set<string>;
}
let run: RunState | null = null;

const GRAV = -26, RUN_SPEED = 4.6, JUMP_V = 9.6;

// ---------- input ----------
function queueJump() { if (run && !run.ended) run.jumpBuffer = 0.14; }
addEventListener("keydown", (e) => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); queueJump(); } });
renderer.domElement.addEventListener("pointerdown", queueJump);

// ---------- captions / toasts ----------
let captionTimer = 0;
function caption(text: string, ms = 2600) {
  ui.caption.textContent = text;
  ui.caption.classList.add("show");
  clearTimeout(captionTimer);
  captionTimer = window.setTimeout(() => ui.caption.classList.remove("show"), ms);
}
let eraTimer = 0;
function eraToast(text: string) {
  ui.era.textContent = text;
  ui.era.classList.add("show");
  clearTimeout(eraTimer);
  eraTimer = window.setTimeout(() => ui.era.classList.remove("show"), 2200);
}

// ---------- forge ----------
async function forge(address: string) {
  ui.gateStatus.textContent = "READING THE CHAIN…";
  let tl: Timeline;
  try {
    tl = await withTimeout(fetchTimeline(address as `0x${string}`), 25000);
  } catch (err) {
    // R6: committed demo snapshot fallback
    try {
      const res = await fetch(`demo/${address.toLowerCase()}.json`);
      if (!res.ok) throw err;
      tl = (await res.json()) as Timeline;
      ui.gateStatus.textContent = "LIVE API UNREACHABLE — USING COMMITTED SNAPSHOT";
      await sleep(900);
    } catch {
      ui.gateStatus.textContent = `THE CHAIN DID NOT ANSWER (${(err as Error).message}). TRY AGAIN.`;
      return;
    }
  }
  ui.gateStatus.textContent = "EXTRACTING MOMENTS…";
  await sleep(250);
  const moments = extractMoments(tl);
  const assignment = assign(tl, moments);
  ui.gateStatus.textContent = `${assignment.archetype.name} — ${assignment.archetype.tagline}`;
  await sleep(1400);
  const level = generateLevel(tl, moments);
  startRun(level, assignment);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- run lifecycle ----------
function startRun(level: LevelSpec, assignment: Assignment) {
  // clear previous
  if (run) { scene.remove(run.world.group); scene.remove(run.fighter); }
  scene.fog = new THREE.Fog(BIOME_COLORS.origins.fog, 14, 60);
  scene.background = new THREE.Color(BIOME_COLORS.origins.sky);

  const world = buildWorld(scene, level);
  const fighter = buildFighter(assignment.archetype.palette, assignment.archetype.id);
  scene.add(fighter);

  run = {
    level, world, fighter, assignment,
    x: 1.5, y: 1, vy: 0, grounded: false,
    deaths: 0, coinsGot: 0, startedAt: performance.now(),
    timeScale: 1, jumpBuffer: 0, coyote: 0,
    segment: null, ended: false, runaway: null,
    tolls: new Map(), shownCaptions: new Set(),
  };

  // build runaway coin + toll gates from traps
  for (const seg of level.segments) {
    for (const trap of seg.traps) {
      if (trap.kind === "runaway_coin") {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.6, 0.2),
          new THREE.MeshStandardMaterial({ color: "#FFD45E", metalness: 0.8, roughness: 0.2, emissive: "#5e4400" }),
        );
        const gy = world.groundAt(trap.atX) ?? 0;
        mesh.position.set(trap.atX, gy + 1.4, 0);
        world.group.add(mesh);
        run.runaway = { mesh, hops: 0, trap, gone: false };
      }
      if (trap.kind === "toll_gate") {
        const g = new THREE.Group();
        const m = new THREE.MeshStandardMaterial({ color: "#C25C45", emissive: "#3a0d05", metalness: 0.4, roughness: 0.5 });
        for (const [dx, dy, sx, sy] of [[-0.8, 1.2, 0.25, 2.6], [0.8, 1.2, 0.25, 2.6], [0, 2.6, 1.9, 0.25]] as const) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.4), m);
          bar.position.set(dx, dy, 0);
          g.add(bar);
        }
        const gy = world.groundAt(trap.atX) ?? 0;
        g.position.set(trap.atX, gy, 0);
        world.group.add(g);
        run.tolls.set(trap.atX, { group: g, trap, paid: false });
      }
    }
  }

  ui.gate.classList.add("hidden");
  ui.hud.classList.remove("hidden");
  ui.endcard.classList.add("hidden");
  updateHud();
  resize();
  eraToast("GENESIS");

  // debug/demo handle
  (globalThis as Record<string, unknown>).__relic = {
    get state() {
      return run && { x: run.x, y: run.y, deaths: run.deaths, coins: run.coinsGot, ended: run.ended, len: run.level.totalLength, era: run.segment?.era };
    },
    warp(x: number) { if (run) { run.x = x; run.y = 6; run.vy = 0; } },
  };
}

function updateHud() {
  if (!run) return;
  ui.deaths.textContent = `DEATHS ${run.deaths}`;
  ui.coins.textContent = `BLOCKS ${run.coinsGot}`;
}

function respawn() {
  if (!run) return;
  run.deaths++;
  const seg = run.segment ?? run.level.segments[0]!;
  run.x = seg.startX + 1;
  run.y = (run.world.groundAt(Math.round(run.x)) ?? 0) + 1;
  run.vy = 0;
  run.timeScale = 1;
  // restore traps in this segment
  for (const [x, v] of run.world.vanishTiles) {
    if (x >= seg.startX && x <= seg.endX) {
      v.state = "solid"; v.t = 0;
      v.mesh.visible = true;
      v.mesh.position.y = v.tile.groundY - 0.5;
      (v.mesh.material as THREE.MeshLambertMaterial).opacity = 1;
    }
  }
  for (const [x, s] of run.world.spikes) {
    if (x >= seg.startX && x <= seg.endX) { s.armed = false; s.popped = false; s.mesh.visible = false; s.mesh.position.y = (run.level.segments.flatMap(g => g.tiles).find(t => t.x === x)?.groundY ?? 0) + 1 - 1.3; }
  }
  updateHud();
  caption(pick(DEATH_LINES), 1400);
}

const DEATH_LINES = [
  "The chain remembers.", "That was also a mistake the first time.", "Gas non-refundable.",
  "Skill issue (on-chain).", "You signed for this.", "Slippage.",
];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;

// ---------- end ----------
function endRun() {
  if (!run || run.ended) return;
  run.ended = true;
  setFighterFrame(run.fighter, "victory");
  const secs = ((performance.now() - run.startedAt) / 1000).toFixed(1);
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
  ui.endTitle.textContent = `${a.archetype.name} · RELIC FORGED`;
  ui.endStats.innerHTML =
    `<div><b>${run.deaths}</b><span>deaths in your own history</span></div>` +
    `<div><b>${secs}s</b><span>run time</span></div>` +
    `<div><b>${run.coinsGot}</b><span>blocks reclaimed</span></div>` +
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
    const txt = `My wallet is a troll level. ${a.archetype.name}, ${run!.deaths} deaths in my own on-chain history. The chain already trolled you — survive it: https://ronkenx9.github.io/relic/ #MantleAIHackathon`;
    navigator.clipboard?.writeText(txt);
    ui.shareBtn.textContent = "COPIED — POST IT";
  };
  setTimeout(() => { ui.endcard.classList.remove("hidden"); ui.hud.classList.add("hidden"); }, 2300);
}

ui.againBtn.onclick = () => location.reload();

// ---------- main loop ----------
let last = performance.now();
const camTarget = new THREE.Vector3();
let walk = 0;

function tick(now: number) {
  requestAnimationFrame(tick);
  const dtRaw = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (!run) { renderer.render(scene, camera); return; }

  const r = run;
  const dt = dtRaw * r.timeScale;

  if (!r.ended) {
    // --- segment & era bookkeeping ---
    const seg = r.world.segmentAt(Math.round(r.x));
    if (seg && seg !== r.segment) {
      r.segment = seg;
      eraToast(seg.era);
      const c = BIOME_COLORS[seg.biome];
      (scene.fog as THREE.Fog).color.set(c.fog);
      (scene.background as THREE.Color).set(c.sky);
      // captioned segment-wide traps announce on entry
      for (const trap of seg.traps) {
        if ((trap.kind === "dark_zone" || trap.kind === "speed_flip" || trap.kind === "long_nothing") && !r.shownCaptions.has(trap.label)) {
          r.shownCaptions.add(trap.label);
          caption(trap.label, 3600);
        }
      }
    }
    const inDark = !!seg?.traps.some((t) => t.kind === "dark_zone");
    const inSpeed = !!seg?.traps.some((t) => t.kind === "speed_flip");
    sun.intensity += ((inDark ? 0.06 : 1.25) - sun.intensity) * Math.min(1, dt * 3);
    ambient.intensity += ((inDark ? 0.04 : 0.55) - ambient.intensity) * Math.min(1, dt * 3);
    r.timeScale += ((inSpeed ? 1.55 : 1) - r.timeScale) * Math.min(1, dtRaw * 4);
    const fovT = inSpeed ? 78 : 70;
    camera.fov += (fovT - camera.fov) * Math.min(1, dtRaw * 4);
    camera.updateProjectionMatrix();

    // --- physics ---
    r.jumpBuffer = Math.max(0, r.jumpBuffer - dtRaw);
    r.coyote = Math.max(0, r.coyote - dtRaw);

    const nextX = r.x + RUN_SPEED * dt;
    const aheadTile = Math.round(nextX + 0.3);
    const aheadGround = r.world.groundAt(aheadTile);
    const wallTop = aheadGround !== null ? aheadGround + 1 : null; // surface y of the column ahead
    const feet = r.y;
    if (wallTop !== null && wallTop - feet > 0.45) {
      // wall: hold position (auto-run pressure), jump clears it
    } else {
      r.x = nextX;
    }

    r.vy += GRAV * dt;
    r.y += r.vy * dt;

    const tileX = Math.round(r.x);
    const ground = r.world.groundAt(tileX);
    const surface = ground !== null ? ground + 1 : null;
    if (surface !== null && r.y <= surface && r.vy <= 0 && feet >= surface - 0.6) {
      r.y = surface; r.vy = 0;
      if (!r.grounded) r.coyote = 0.1;
      r.grounded = true; r.coyote = 0.12;
    } else {
      r.grounded = false;
    }
    if (r.jumpBuffer > 0 && (r.grounded || r.coyote > 0)) {
      r.vy = JUMP_V; r.grounded = false; r.jumpBuffer = 0; r.coyote = 0;
    }

    // --- vanish tiles ---
    for (const [x, v] of r.world.vanishTiles) {
      if (v.state === "solid" && Math.abs(r.x - x) < 0.7 && surface !== null && Math.abs(r.y - ((v.tile.groundY) + 1)) < 0.4) {
        v.state = "falling"; v.t = 0;
      }
      if (v.state === "falling") {
        v.t += dtRaw;
        if (v.t > 0.12) {
          v.mesh.position.y -= 9 * dtRaw * (v.t * 6);
          if (v.t > 0.8) { v.state = "gone"; v.mesh.visible = false; }
        }
      }
    }

    // --- spikes ---
    for (const [x, s] of r.world.spikes) {
      if (!s.armed && x - r.x < 1.8 && x - r.x > 0) { s.armed = true; }
      if (s.armed && !s.popped) {
        s.popped = true; s.mesh.visible = true;
      }
      if (s.popped && s.mesh.position.y < (r.world.groundAt(x) ?? 0) + 1 - 0.45) {
        s.mesh.position.y += 6 * dtRaw;
      }
      if (s.popped && Math.abs(r.x - x) < 0.42 && r.y - (r.world.groundAt(x) ?? 0) - 1 < 0.5) {
        respawn(); break;
      }
    }

    // --- pits ---
    if (r.y < -6) respawn();

    // --- coins ---
    for (const [x, mesh] of r.world.coins) {
      mesh.rotation.y += dtRaw * 2.4;
      if (Math.abs(r.x - x) < 0.55 && Math.abs(r.y + 0.6 - mesh.position.y) < 1.2) {
        r.world.coins.delete(x);
        r.world.group.remove(mesh);
        r.coinsGot++;
        updateHud();
      }
    }

    // --- runaway coin (the one you let go) ---
    const rc = r.runaway;
    if (rc && !rc.gone) {
      rc.mesh.rotation.y += dtRaw * 3;
      const d = rc.mesh.position.x - r.x;
      if (d < 3.4 && d > -1) {
        if (rc.hops < 3) {
          rc.hops++;
          rc.mesh.position.x += 5;
          const gy = r.world.groundAt(Math.round(rc.mesh.position.x));
          rc.mesh.position.y = (gy ?? rc.mesh.position.y) + 1.4;
          if (rc.hops === 1) caption("It moves away from you. Familiar.", 2000);
        } else {
          rc.gone = true;
          rc.mesh.visible = false;
          caption(rc.trap.label + " — and it's gone. Again.", 3400);
        }
      }
    }

    // --- toll gates ---
    for (const [x, t] of r.tolls) {
      if (!t.paid && r.x >= x - 0.2) {
        t.paid = true;
        const tax = Math.max(1, Math.floor(r.coinsGot * 0.25));
        r.coinsGot = Math.max(0, r.coinsGot - tax);
        updateHud();
        caption(`${t.trap.label} — toll: ${tax} blocks.`, 3200);
        ((t.group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 2;
      }
    }

    // --- portal / finish ---
    if (r.x >= r.world.portalX) endRun();

    // --- fighter pose ---
    walk += dt * 11;
    r.fighter.position.set(r.x, r.y, 0);
    updateFighterPose(r.fighter, walk, r.grounded, r.vy);

    // --- portal shimmer ---
    r.world.portal.rotation.y = Math.sin(now / 700) * 0.08;
  }

  // --- camera ---
  if (r.ended) {
    // pull back to reveal the whole chainscape — the share shot
    const mid = r.level.totalLength / 2;
    camTarget.set(mid, 6, Math.max(26, r.level.totalLength * 0.42));
    camera.position.lerp(camTarget, Math.min(1, dtRaw * 1.2));
    camera.lookAt(mid, 1, 0);
  } else {
    camTarget.set(r.x + 3.6, r.y + 3.1, 10.5);
    camera.position.lerp(camTarget, Math.min(1, dtRaw * 6));
    camera.lookAt(camera.position.x - 0.4, camera.position.y - 2.1, 0);
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(tick);
resize();

// ---------- gate wiring ----------
ui.forgeBtn.addEventListener("click", () => {
  const a = ui.addr.value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
    ui.gateStatus.textContent = "PASTE A FULL 0x ADDRESS (ENS NOT YET — HONESTY OVER MAGIC).";
    return;
  }
  void forge(a);
});
ui.addr.addEventListener("keydown", (e) => { if (e.key === "Enter") (ui.forgeBtn as HTMLButtonElement).click(); });
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-demo]"))) {
  btn.addEventListener("click", () => { ui.addr.value = btn.dataset.demo!; (ui.forgeBtn as HTMLButtonElement).click(); });
}
