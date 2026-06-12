/** Scenery layer — sky, skyline, atmosphere, decorations. Upgrades the world to match
 * the Batch-1 Kaizenverse sprite art direction (painterly, ink-dark, pink/amber energy).
 * Self-contained module: world.ts/main.ts only call build + update. */
import * as THREE from "three";
import type { LevelSpec, Segment } from "../engine/levelgen.js";
import { BIOME_COLORS } from "./world.js";

type Biome = Segment["biome"];

/** Sky mood per biome — gradient stops (top → horizon) + particle recipe. */
const SKY: Record<Biome, { top: string; mid: string; horizon: string; stars: number; particles: "dust" | "embers" | "snow" | "rain" | "none"; pColor: string }> = {
  origins: { top: "#0E0B07", mid: "#2A2118", horizon: "#5C4A2E", stars: 40, particles: "dust", pColor: "#C9A86A" },
  mintspring: { top: "#070D08", mid: "#15291B", horizon: "#3E6B45", stars: 30, particles: "dust", pColor: "#8FBF8F" },
  crucible: { top: "#0D0605", mid: "#2A1512", horizon: "#7A2E1F", stars: 0, particles: "embers", pColor: "#FF6A4D" },
  darkwinter: { top: "#010205", mid: "#06080C", horizon: "#101820", stars: 120, particles: "snow", pColor: "#C9D4E0" },
  neon: { top: "#070417", mid: "#150F2E", horizon: "#52207A", stars: 60, particles: "rain", pColor: "#FF5CA8" },
  quiet: { top: "#15140F", mid: "#3A3830", horizon: "#8C887C", stars: 15, particles: "none", pColor: "#EDE9E0" },
  now: { top: "#06080B", mid: "#14171B", horizon: "#3A3122", stars: 50, particles: "dust", pColor: "#E3A52F" },
};

export interface SceneryHandles {
  group: THREE.Group;
  /** Call each frame: drives particles, portal swirl, lantern flicker. */
  update(dt: number, camX: number, biome: Biome | undefined, now: number): void;
}

/** One long sky canvas: a gradient band per segment, blended at the seams — the sky
 * itself tells the wallet's story as you run. */
function buildSkyStrip(level: LevelSpec): THREE.Mesh {
  const W = 1024, H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const total = level.totalLength;

  for (const seg of level.segments) {
    const x0 = Math.floor((seg.startX / total) * W);
    const x1 = Math.ceil(((seg.endX + 1) / total) * W);
    const sky = SKY[seg.biome];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.55, sky.mid);
    g.addColorStop(1, sky.horizon);
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, x1 - x0, H);
  }
  // blur the biome seams horizontally
  ctx.globalAlpha = 0.5;
  ctx.filter = "blur(14px)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;

  // stars in the upper band, density by biome
  for (const seg of level.segments) {
    const sky = SKY[seg.biome];
    const x0 = (seg.startX / total) * W;
    const x1 = ((seg.endX + 1) / total) * W;
    for (let i = 0; i < sky.stars; i++) {
      const x = x0 + ((i * 73 + seg.startX * 31) % Math.max(1, x1 - x0));
      const y = ((i * 137 + seg.startX * 17) % (H * 0.45));
      const r = 0.5 + ((i * 7) % 10) / 10;
      ctx.fillStyle = `rgba(237,233,224,${0.25 + ((i * 13) % 50) / 100})`;
      ctx.fillRect(x, y, r, r);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(total + 80, 60),
    new THREE.MeshBasicMaterial({ map: tex, depthWrite: false, fog: false }),
  );
  mesh.position.set(total / 2, 16, -26);
  mesh.renderOrder = -10;
  return mesh;
}

/** Two parallax skyline layers per segment — voxel silhouettes; neon gets lit windows. */
function buildSkyline(level: LevelSpec): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const m4 = new THREE.Matrix4();
  const color = new THREE.Color();

  const layers = [
    { z: -7, scale: 1.0, mul: 0.5, perSeg: 7 },
    { z: -13, scale: 1.7, mul: 0.28, perSeg: 5 },
  ];
  let capacity = 0;
  for (const l of layers) capacity += level.segments.length * l.perSeg;
  const inst = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), capacity);
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  let i = 0;
  for (const layer of layers) {
    for (const seg of level.segments) {
      const c = color.set(BIOME_COLORS[seg.biome].accent).multiplyScalar(layer.mul);
      const w = Math.max(1, seg.endX - seg.startX);
      for (let k = 0; k < layer.perSeg; k++) {
        const px = seg.startX + ((k * 41 + seg.startX * 13) % w);
        const h = (2.2 + ((px * 17) % 7)) * layer.scale;
        const wdt = (0.9 + ((px * 5) % 3) * 0.45) * layer.scale;
        m4.makeScale(wdt, h, 1);
        m4.setPosition(px, h / 2 - 0.6, layer.z - ((px * 3) % 2));
        inst.setMatrixAt(i, m4);
        inst.setColorAt(i, c);
        i++;
      }
    }
  }
  inst.count = i;
  g.add(inst);

  // lit windows on the near layer in neon + now biomes (tiny emissive quads)
  const winGeo = new THREE.PlaneGeometry(0.16, 0.22);
  const winMat = new THREE.MeshBasicMaterial({ color: "#FF5CA8", fog: false });
  const winMatAmber = new THREE.MeshBasicMaterial({ color: "#E3A52F", fog: false });
  const windows: THREE.InstancedMesh[] = [
    new THREE.InstancedMesh(winGeo, winMat, 260),
    new THREE.InstancedMesh(winGeo, winMatAmber, 260),
  ];
  const wi = [0, 0];
  for (const seg of level.segments) {
    if (seg.biome !== "neon" && seg.biome !== "now") continue;
    const which = seg.biome === "neon" ? 0 : 1;
    const w = Math.max(1, seg.endX - seg.startX);
    for (let k = 0; k < 7; k++) {
      const px = seg.startX + ((k * 41 + seg.startX * 13) % w);
      const h = 2.2 + ((px * 17) % 7);
      for (let row = 0; row < Math.floor(h / 0.9) && wi[which]! < 258; row++) {
        if ((px * 7 + row * 11) % 3 === 0) continue; // some windows dark
        m4.identity();
        m4.setPosition(px + (((row * 13) % 3) - 1) * 0.22, 0.4 + row * 0.9, -6.45 - ((px * 3) % 2));
        windows[which]!.setMatrixAt(wi[which]!++, m4);
      }
    }
  }
  windows[0]!.count = wi[0]!;
  windows[1]!.count = wi[1]!;
  for (const wm of windows) g.add(wm);
  g.add(buildNeonSigns(level));

  return g;
}

/** Abstract signage for the Neon Ward: no readable UI copy, just Kaizenverse glyph panels. */
function buildNeonSigns(level: LevelSpec): THREE.Group {
  const g = new THREE.Group();
  const signs: THREE.Mesh[] = [];
  const palettes = [
    ["#FF5CA8", "#6EC1FF"],
    ["#E3A52F", "#FF5CA8"],
    ["#8C5CFF", "#EDE9E0"],
  ] as const;

  for (const seg of level.segments) {
    if (seg.biome !== "neon") continue;
    const width = Math.max(1, seg.endX - seg.startX);
    for (let i = 0; i < 5; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 96;
      const ctx = canvas.getContext("2d")!;
      const [hot, cool] = palettes[(i + seg.startX) % palettes.length]!;
      ctx.fillStyle = "rgba(8,5,20,0.82)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = hot;
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
      ctx.strokeStyle = cool;
      ctx.lineWidth = 5;
      for (let k = 0; k < 4; k++) {
        const x = 34 + k * 34;
        ctx.beginPath();
        ctx.moveTo(x, 28 + ((k + i) % 2) * 18);
        ctx.lineTo(x + 18, 48);
        ctx.lineTo(x, 68 - ((k + i) % 2) * 18);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, fog: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), mat);
      const px = seg.startX + 3 + ((i * 37 + seg.startX * 11) % Math.max(1, width - 6));
      sign.position.set(px, 4.2 + ((i * 5) % 4), -5.85 - (i % 2) * 1.2);
      sign.rotation.y = (i % 2 ? -0.08 : 0.08);
      signs.push(sign);
      g.add(sign);
    }
  }

  g.userData.signs = signs;
  return g;
}

/** Per-biome ground decorations: dead trees (darkwinter), glow shards (neon),
 * one lantern at the quiet bench, ember rocks (crucible). */
function buildDecor(level: LevelSpec): { group: THREE.Group; lanterns: THREE.PointLight[] } {
  const g = new THREE.Group();
  const lanterns: THREE.PointLight[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);

  const groundAt = new Map<number, number>();
  for (const seg of level.segments) for (const t of seg.tiles) groundAt.set(t.x, t.groundY);

  for (const seg of level.segments) {
    const w = seg.endX - seg.startX;
    if (seg.biome === "origins") {
      const mat = new THREE.MeshLambertMaterial({ color: "#2A2118" });
      const glow = new THREE.MeshBasicMaterial({ color: "#C9A86A", transparent: true, opacity: 0.55 });
      for (let k = 0; k < 5; k++) {
        const px = seg.startX + 2 + ((k * 17 + seg.startX * 5) % Math.max(1, w - 4));
        const gy = groundAt.get(px) ?? 0;
        if (gy < 0) continue;
        const pipe = new THREE.Mesh(box, mat);
        pipe.scale.set(0.18, 1.4 + (k % 2) * 0.45, 0.18);
        pipe.position.set(px - 0.45, gy + 1 + pipe.scale.y / 2 - 0.4, -1.35);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), glow);
        lamp.position.set(px - 0.45, gy + 1.95 + (k % 2) * 0.45, -1.27);
        g.add(pipe, lamp);
      }
    }
    if (seg.biome === "darkwinter") {
      const mat = new THREE.MeshLambertMaterial({ color: "#1A2027" });
      for (let k = 0; k < 4; k++) {
        const px = seg.startX + 3 + ((k * 29 + seg.startX * 7) % Math.max(1, w - 6));
        const gy = groundAt.get(px) ?? 0;
        if (gy < 0) continue;
        const trunk = new THREE.Mesh(box, mat);
        trunk.scale.set(0.18, 1.6 + (k % 2) * 0.7, 0.18);
        trunk.position.set(px + 0.3, gy + 1 + trunk.scale.y / 2 - 0.5, -1.4);
        const arm = new THREE.Mesh(box, mat);
        arm.scale.set(0.7, 0.12, 0.12);
        arm.position.set(px + 0.55, gy + 1.6 + (k % 2) * 0.5, -1.4);
        arm.rotation.z = 0.4 - (k % 3) * 0.3;
        g.add(trunk, arm);
      }
    }
    if (seg.biome === "neon") {
      const mat = new THREE.MeshBasicMaterial({ color: "#FF5CA8" });
      for (let k = 0; k < 5; k++) {
        const px = seg.startX + 2 + ((k * 23 + seg.startX * 5) % Math.max(1, w - 4));
        const gy = groundAt.get(px) ?? 0;
        if (gy < 0) continue;
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5 + (k % 3) * 0.25, 4), mat);
        shard.position.set(px - 0.25, gy + 1 + 0.22, -1.1);
        shard.rotation.z = ((k * 7) % 5) * 0.12 - 0.25;
        g.add(shard);
      }
    }
    if (seg.biome === "crucible") {
      const mat = new THREE.MeshStandardMaterial({ color: "#3A1410", emissive: "#FF3A1F", emissiveIntensity: 0.5 });
      for (let k = 0; k < 4; k++) {
        const px = seg.startX + 2 + ((k * 19 + seg.startX * 3) % Math.max(1, w - 4));
        const gy = groundAt.get(px) ?? 0;
        if (gy < 0) continue;
        const rock = new THREE.Mesh(box, mat);
        rock.scale.setScalar(0.3 + (k % 3) * 0.12);
        rock.position.set(px + 0.4, gy + 1 + rock.scale.y / 2 - 0.55, -1.2);
        rock.rotation.y = k * 0.7;
        g.add(rock);
      }
    }
    if (seg.biome === "quiet") {
      // the bench and its lantern — the only warm thing in the emptiness
      const mid = Math.floor((seg.startX + seg.endX) / 2);
      const gy = groundAt.get(mid) ?? 0;
      if (gy >= 0) {
        const wood = new THREE.MeshLambertMaterial({ color: "#6B5638" });
        const seat = new THREE.Mesh(box, wood);
        seat.scale.set(1.4, 0.12, 0.45);
        seat.position.set(mid, gy + 1 + 0.42, -0.9);
        const legL = new THREE.Mesh(box, wood);
        legL.scale.set(0.1, 0.42, 0.4);
        legL.position.set(mid - 0.55, gy + 1 + 0.18, -0.9);
        const legR = legL.clone();
        legR.position.x = mid + 0.55;
        const post = new THREE.Mesh(box, wood);
        post.scale.set(0.1, 1.7, 0.1);
        post.position.set(mid + 1.4, gy + 1 + 0.85, -0.9);
        const lampMat = new THREE.MeshBasicMaterial({ color: "#FFD9A0" });
        const lamp = new THREE.Mesh(box, lampMat);
        lamp.scale.setScalar(0.22);
        lamp.position.set(mid + 1.4, gy + 1 + 1.75, -0.9);
        const light = new THREE.PointLight("#FFC87A", 6, 7, 1.6);
        light.position.copy(lamp.position);
        lanterns.push(light);
        g.add(seat, legL, legR, post, lamp, light);
      }
    }
  }
  return { group: g, lanterns };
}

/** Camera-following particle field; recipe switches with the biome. */
function buildAtmos(): { points: THREE.Points; setBiome(b: Biome): void; update(dt: number, camX: number): void } {
  const N = 900;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 2); // x,y drift per particle
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 40;
    pos[i * 3 + 1] = Math.random() * 16 - 2;
    pos[i * 3 + 2] = -2 - Math.random() * 10;
    vel[i * 2] = (Math.random() - 0.5);
    vel[i * 2 + 1] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: "#C9A86A", size: 0.07, transparent: true, opacity: 0.7, depthWrite: false });
  const points = new THREE.Points(geo, mat);

  let mode: "dust" | "embers" | "snow" | "rain" | "none" = "dust";
  let center = 0;
  return {
    points,
    setBiome(b: Biome) {
      const sky = SKY[b];
      mode = sky.particles;
      mat.color.set(sky.pColor);
      mat.size = mode === "rain" ? 0.12 : mode === "snow" ? 0.09 : mode === "embers" ? 0.06 : 0.07;
      mat.opacity = mode === "none" ? 0 : mode === "dust" ? 0.35 : mode === "rain" ? 0.55 : 0.75;
    },
    update(dt: number, camX: number) {
      center = camX;
      if (mode === "none") return;
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        let x = p.getX(i), y = p.getY(i);
        if (mode === "rain") { y -= dt * (6.5 + vel[i * 2 + 1]! * 3.2); x -= dt * 1.2; }
        else if (mode === "snow") { y -= dt * (0.6 + vel[i * 2 + 1]! * 0.7); x += Math.sin(y * 1.7 + i) * dt * 0.4; }
        else if (mode === "embers") { y += dt * (0.5 + vel[i * 2 + 1]!); x += vel[i * 2]! * dt * 0.6; }
        else { x += vel[i * 2]! * dt * 0.25; y += Math.sin(x + i) * dt * 0.05; }
        // wrap around the camera window
        if (y < -2) y = 14;
        if (y > 15) y = -1;
        if (x < center - 22) x = center + 22;
        if (x > center + 22) x = center - 22;
        p.setXY(i, x, y);
      }
      p.needsUpdate = true;
    },
  };
}

/** Animated swirl inside the forge portal — pink/amber energy (the "ability" palette). */
function buildPortalSwirl(level: LevelSpec, portal: THREE.Group): { update(now: number): void } {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.85, 2.9),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),
  );
  mesh.position.set(0, 1.45, 0.05);
  portal.add(mesh);

  const ringMat = new THREE.MeshBasicMaterial({ color: "#FF5CA8", transparent: true, opacity: 0.42, fog: false });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 8, 48), ringMat);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.018, 8, 48), ringMat.clone());
  ringA.position.set(0, 1.45, 0.08);
  ringB.position.set(0, 1.45, 0.09);
  portal.add(ringA, ringB);

  return {
    update(now: number) {
      const t = now / 1000;
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2, cy = size / 2;
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let s = 0; s < 60; s++) {
          const a = t * 1.4 + arm * 2.09 + s * 0.16;
          const r = 8 + s * 1.9;
          const x = cx + Math.cos(a) * r * 0.62;
          const y = cy + Math.sin(a) * r;
          s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = arm === 1 ? "rgba(227,165,47,0.8)" : "rgba(255,92,168,0.75)";
        ctx.lineWidth = 7 - arm * 1.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 60);
      glow.addColorStop(0, "rgba(255,214,160,0.9)");
      glow.addColorStop(1, "rgba(255,92,168,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
      tex.needsUpdate = true;
      ringA.rotation.z = t * 0.9;
      ringB.rotation.z = -t * 0.55;
      (ringA.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 2.2) * 0.1;
      (ringB.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.cos(t * 1.7) * 0.08;
    },
  };
}

/** Soft blob shadow that grounds the fighter (sprite or voxel) on the blocks. */
export function buildBlobShadow(): THREE.Mesh {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(0,0,0,0.45)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.8),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function buildScenery(scene: THREE.Scene, level: LevelSpec, portal: THREE.Group): SceneryHandles {
  const group = new THREE.Group();
  group.add(buildSkyStrip(level));
  group.add(buildSkyline(level));
  const decor = buildDecor(level);
  group.add(decor.group);
  const atmos = buildAtmos();
  group.add(atmos.points);
  const swirl = buildPortalSwirl(level, portal);
  scene.add(group);

  let lastBiome: Biome | undefined;
  let flicker = 0;
  return {
    group,
    update(dt, camX, biome, now) {
      if (biome && biome !== lastBiome) {
        lastBiome = biome;
        atmos.setBiome(biome);
      }
      atmos.update(dt, camX);
      swirl.update(now);
      flicker += dt;
      if (flicker > 0.09) {
        flicker = 0;
        for (const l of decor.lanterns) l.intensity = 5 + Math.random() * 2.2;
      }
    },
  };
}
