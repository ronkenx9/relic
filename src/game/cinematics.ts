/** Cinematic quality layer for the 3D runner — post-processing, era-banded road,
 * camera feel, atmosphere, hit feedback. Self-contained: runner3d/main only call hooks. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { LevelSpec, Segment } from "../engine/levelgen.js";
import { BIOME_COLORS } from "./world.js";

type Biome = Segment["biome"];

/** Road palette per era — saturated top color + line color, AAA-graded under ACES. */
const ROAD: Record<Biome, { base: string; line: string; edge: string }> = {
  origins: { base: "#B98F4A", line: "#8A6A33", edge: "#E3C68C" },
  mintspring: { base: "#3FA45C", line: "#2C7440", edge: "#8FE3A8" },
  crucible: { base: "#8A3A2C", line: "#5C2218", edge: "#FF7A5C" },
  darkwinter: { base: "#2A3642", line: "#1A222C", edge: "#5C7894" },
  neon: { base: "#4A2E7A", line: "#2E1A52", edge: "#FF5CA8" },
  quiet: { base: "#C9C4B8", line: "#A39E90", edge: "#EDE9E0" },
  now: { base: "#3E4750", line: "#262C33", edge: "#E3A52F" },
};

/** One long road texture: color bands per era along the run — the wallet's story
 * is under your feet, not just in the sky. Grid kept (runner DNA), tinted per band. */
export function buildEraRoadTexture(level: LevelSpec): THREE.CanvasTexture {
  const W = 256, H = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const total = level.totalLength;

  // plane is rotated -90°: v=1 (canvas TOP, flipY) = far end of the road. Paint last era at top.
  for (const seg of level.segments) {
    const y0 = H - Math.ceil(((seg.endX + 1) / total) * H);
    const y1 = H - Math.floor((seg.startX / total) * H);
    const r = ROAD[seg.biome];
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, r.line);
    g.addColorStop(0.12, r.base);
    g.addColorStop(0.5, r.base);
    g.addColorStop(0.88, r.base);
    g.addColorStop(1, r.line);
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, W, y1 - y0);

    // center lane glow stripe
    const cg = ctx.createLinearGradient(0, 0, W, 0);
    cg.addColorStop(0.46, "rgba(255,255,255,0)");
    cg.addColorStop(0.5, "rgba(255,255,255,0.10)");
    cg.addColorStop(0.54, "rgba(255,255,255,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(0, y0, W, y1 - y0);

    // grid: tinted, subtler than greybox
    ctx.strokeStyle = r.line;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2;
    for (let y = y0; y <= y1; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let x = 0; x <= W; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // soften band seams
  ctx.globalAlpha = 0.45;
  ctx.filter = "blur(6px)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;

  // speckle noise so ACES has something to bite on
  for (let i = 0; i < 2600; i++) {
    const x = (i * 97) % W, y = (i * 211) % H;
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Wall tint at a given run position — walls inherit the era, not one global purple. */
export function wallColorAt(level: LevelSpec, x: number): { wall: string; tower: string } {
  const seg = level.segments.find((s) => x >= s.startX && x <= s.endX) ?? level.segments.at(-1)!;
  const c = new THREE.Color(BIOME_COLORS[seg.biome].accent);
  const base = new THREE.Color("#55488B");
  const wall = base.clone().lerp(c, 0.45);
  const tower = base.clone().lerp(c, 0.3).multiplyScalar(1.12);
  return { wall: `#${wall.getHexString()}`, tower: `#${tower.getHexString()}` };
}

const ATMOS: Record<Biome, { mode: "dust" | "embers" | "snow" | "none"; color: string; size: number; opacity: number }> = {
  origins: { mode: "dust", color: "#E3C68C", size: 0.09, opacity: 0.4 },
  mintspring: { mode: "dust", color: "#A8E3B8", size: 0.09, opacity: 0.35 },
  crucible: { mode: "embers", color: "#FF6A4D", size: 0.08, opacity: 0.85 },
  darkwinter: { mode: "snow", color: "#D8E4F0", size: 0.11, opacity: 0.9 },
  neon: { mode: "embers", color: "#FF5CA8", size: 0.07, opacity: 0.8 },
  quiet: { mode: "none", color: "#EDE9E0", size: 0.08, opacity: 0 },
  now: { mode: "dust", color: "#E3A52F", size: 0.09, opacity: 0.45 },
};

export interface Cinematics {
  render(): void;
  resize(w: number, h: number): void;
  /** per-frame: biome drives atmosphere + horizon; camera gets shake applied. */
  update(dt: number, camera: THREE.PerspectiveCamera, playerZ: number, biome: Biome | undefined): void;
  /** feedback hooks */
  shake(mag: number): void;
  hitFlash(): void;
  coinPulse(el: HTMLElement): void;
}

export function createCinematics(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  mount: HTMLElement,
): Cinematics {
  // --- grading + bloom ---
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- hit flash overlay (DOM, created here — zero index.html edits) ---
  const flash = document.createElement("div");
  flash.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:6;opacity:0;" +
    "background:radial-gradient(ellipse at 50% 55%, rgba(255,58,87,0) 38%, rgba(255,58,87,0.42) 100%);" +
    "transition:opacity .09s ease-out;";
  mount.appendChild(flash);
  let flashTimer = 0;

  // --- vignette (constant, subtle — the cheapest 'graded' look there is) ---
  const vignette = document.createElement("div");
  vignette.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:4;" +
    "background:radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 56%, rgba(6,8,11,0.5) 100%);";
  mount.appendChild(vignette);

  // --- atmosphere particles (z-axis window around the player) ---
  const N = 800;
  const pos = new Float32Array(N * 3);
  const drift = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 1] = Math.random() * 12;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    drift[i * 2] = Math.random() - 0.5;
    drift[i * 2 + 1] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pMat = new THREE.PointsMaterial({ color: "#E3C68C", size: 0.09, transparent: true, opacity: 0.4, depthWrite: false });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);
  let atmosMode: "dust" | "embers" | "snow" | "none" = "dust";

  // --- horizon glow billboard: depth at the end of the road ---
  const hCanvas = document.createElement("canvas");
  hCanvas.width = 256; hCanvas.height = 128;
  const hCtx = hCanvas.getContext("2d")!;
  const hTex = new THREE.CanvasTexture(hCanvas);
  hTex.colorSpace = THREE.SRGBColorSpace;
  const horizon = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 70),
    new THREE.MeshBasicMaterial({ map: hTex, transparent: true, depthWrite: false, fog: false }),
  );
  horizon.renderOrder = -5;
  scene.add(horizon);
  const horizonColor = new THREE.Color("#E3A52F");

  function paintHorizon(c: THREE.Color) {
    hCtx.clearRect(0, 0, 256, 128);
    const g = hCtx.createRadialGradient(128, 96, 6, 128, 96, 120);
    const css = `#${c.getHexString()}`;
    g.addColorStop(0, css + "cc");
    g.addColorStop(0.45, css + "55");
    g.addColorStop(1, css + "00");
    hCtx.fillStyle = g;
    hCtx.fillRect(0, 0, 256, 128);
    hTex.needsUpdate = true;
  }
  paintHorizon(horizonColor);

  let shakeMag = 0;
  let lastBiome: Biome | undefined;
  let repaint = 0;

  return {
    render: () => composer.render(),
    resize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
    update(dt, cam, playerZ, biome) {
      // biome switch: atmosphere recipe + horizon tint target
      if (biome && biome !== lastBiome) {
        lastBiome = biome;
        const a = ATMOS[biome];
        atmosMode = a.mode;
        pMat.color.set(a.color);
        pMat.size = a.size;
        pMat.opacity = a.opacity;
      }
      if (biome) {
        const target = new THREE.Color(ROAD[biome].edge);
        horizonColor.lerp(target, Math.min(1, dt * 1.5));
        repaint += dt;
        if (repaint > 0.25) { repaint = 0; paintHorizon(horizonColor); }
      }

      // particles drift in a window around the player
      if (atmosMode !== "none") {
        const p = pGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < N; i++) {
          let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          if (atmosMode === "snow") { y -= dt * (0.7 + drift[i * 2 + 1]! * 0.8); x += Math.sin(y * 1.4 + i) * dt * 0.5; }
          else if (atmosMode === "embers") { y += dt * (0.6 + drift[i * 2 + 1]!); x += drift[i * 2]! * dt * 0.7; }
          else { x += drift[i * 2]! * dt * 0.3; y += Math.sin(x + i) * dt * 0.06; }
          if (y < 0) y = 12;
          if (y > 12.5) y = 0.2;
          const rel = z - playerZ;
          if (rel > 14) z = playerZ - 56;
          if (rel < -58) z = playerZ + 12;
          p.setXYZ(i, x, y, z);
        }
        p.needsUpdate = true;
      }

      // horizon billboard rides ahead of the camera
      horizon.position.set(cam.position.x * 0.6, 14, playerZ - 95);

      // camera shake (after the runner has positioned the camera)
      if (shakeMag > 0.002) {
        cam.position.x += (Math.random() - 0.5) * shakeMag;
        cam.position.y += (Math.random() - 0.5) * shakeMag * 0.7;
        shakeMag *= Math.max(0, 1 - dt * 7);
      }
    },
    shake(mag) { shakeMag = Math.max(shakeMag, mag); },
    hitFlash() {
      flash.style.opacity = "1";
      clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => { flash.style.opacity = "0"; }, 110);
    },
    coinPulse(el) {
      el.animate(
        [{ transform: "scale(1.22)", color: "#FFD45E" }, { transform: "scale(1)", color: "" }],
        { duration: 200, easing: "ease-out" },
      );
    },
  };
}
