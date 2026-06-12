/** Procedural Batch-4 obstacle art. These are runtime meshes, not static PNGs,
 * so wallet-generated traps can inherit the same visual language automatically. */
import * as THREE from "three";
import type { LevelSpec, TrapEvent } from "../engine/levelgen.js";

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function materialPulse(root: THREE.Object3D, value = 2.1): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of mats) {
      if ("emissiveIntensity" in mat) (mat as THREE.MeshStandardMaterial).emissiveIntensity = value;
      if ("opacity" in mat && mat.transparent) mat.opacity = Math.min(1, (mat.opacity ?? 0.7) + 0.18);
    }
  });
}

export function buildGhostToken(): THREE.Group {
  const g = new THREE.Group();
  const aura = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.035, 8, 28),
    new THREE.MeshBasicMaterial({ color: "#A7F7FF", transparent: true, opacity: 0.74, fog: false }),
  );
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.055, 24),
    new THREE.MeshStandardMaterial({
      color: "#EAFDFF", emissive: "#60D7FF", emissiveIntensity: 1.2, metalness: 0.55, roughness: 0.18,
      transparent: true, opacity: 0.82,
    }),
  );
  coin.rotation.x = Math.PI / 2;
  const eyeMat = new THREE.MeshBasicMaterial({ color: "#101820", fog: false });
  for (const dx of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.018), eyeMat);
    eye.position.set(dx, 0.04, 0.035);
    g.add(eye);
  }
  aura.rotation.y = Math.PI / 2;
  g.add(coin, aura);
  const glow = new THREE.PointLight("#60D7FF", 0.8, 3.2);
  glow.position.set(0, 0, 0.3);
  g.add(glow);
  return g;
}

export function buildGasTollGate(): THREE.Group {
  const g = new THREE.Group();
  const barMat = new THREE.MeshStandardMaterial({
    color: "#C25C45", emissive: "#501309", emissiveIntensity: 0.75, metalness: 0.45, roughness: 0.48,
  });
  for (const [dx, dy, sx, sy] of [[-0.8, 1.2, 0.25, 2.6], [0.8, 1.2, 0.25, 2.6], [0, 2.6, 1.9, 0.25]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.4), barMat);
    bar.position.set(dx, dy, 0);
    g.add(bar);
  }

  const shardMat = new THREE.MeshStandardMaterial({ color: "#FF6A4D", emissive: "#C25C45", emissiveIntensity: 1.4, roughness: 0.35 });
  const smokeMat = new THREE.MeshBasicMaterial({ color: "#5C332E", transparent: true, opacity: 0.42, fog: false });
  for (let i = 0; i < 10; i++) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09 + (i % 3) * 0.025), shardMat);
    shard.position.set(-0.58 + (i % 5) * 0.29, 0.55 + (i % 4) * 0.34, 0.15 + (i % 2) * 0.25);
    shard.rotation.set(i * 0.5, i * 0.23, i * 0.37);
    g.add(shard);
  }
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.18 + i * 0.025, 10, 8), smokeMat);
    puff.scale.set(1.3, 0.65, 0.28);
    puff.position.set(-0.45 + i * 0.3, 2.05 + (i % 2) * 0.2, -0.08);
    g.add(puff);
  }

  const light = new THREE.PointLight("#FF6A4D", 0.95, 4);
  light.position.set(0, 1.6, 0.5);
  g.add(light);
  g.userData.pulse = () => materialPulse(g);
  return g;
}

function buildRedCandleSlash(): THREE.Group {
  const g = new THREE.Group();
  const matHot = new THREE.MeshBasicMaterial({ color: "#FF3A57", transparent: true, opacity: 0.88, fog: false, side: THREE.DoubleSide });
  const matCore = new THREE.MeshBasicMaterial({ color: "#FFD2A1", transparent: true, opacity: 0.75, fog: false, side: THREE.DoubleSide });
  for (const [i, mat, w] of [[0, matHot, 0.16], [1, matCore, 0.065], [2, matHot, 0.09]] as const) {
    const slash = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.15 - i * 0.32), mat);
    slash.position.set((i - 1) * 0.13, 1.52 + i * 0.08, 0.22 + i * 0.02);
    slash.rotation.z = -0.72;
    g.add(slash);
  }
  const ember = new THREE.PointLight("#FF3A57", 0.7, 2.8);
  ember.position.set(0, 1.4, 0.5);
  g.add(ember);
  return g;
}

function buildFailedTxGlitch(): THREE.Group {
  const g = new THREE.Group();
  const tex = canvasTexture(192, 192, (ctx) => {
    ctx.clearRect(0, 0, 192, 192);
    ctx.fillStyle = "rgba(8,5,20,0.64)";
    ctx.fillRect(22, 34, 148, 110);
    ctx.strokeStyle = "#FF3A57";
    ctx.lineWidth = 7;
    ctx.strokeRect(28, 40, 136, 98);
    ctx.strokeStyle = "#60D7FF";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(58, 66); ctx.lineTo(134, 118);
    ctx.moveTo(134, 66); ctx.lineTo(58, 118);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? "#FF3A57" : "#60D7FF";
      ctx.fillRect(20 + ((i * 23) % 146), 28 + i * 10, 22 + (i % 3) * 8, 4);
    }
  });
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 1.45),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, fog: false, side: THREE.DoubleSide }),
  );
  plane.position.set(0, 1.95, 0.18);
  g.add(plane);
  const wireMat = new THREE.MeshBasicMaterial({ color: "#60D7FF", wireframe: true, transparent: true, opacity: 0.5, fog: false });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.12), wireMat);
  cube.position.set(0.12, 1.82, 0.11);
  cube.rotation.z = 0.08;
  g.add(cube);
  return g;
}

function buildBearShadow(width: number): THREE.Group {
  const g = new THREE.Group();
  const tex = canvasTexture(384, 192, (ctx) => {
    ctx.clearRect(0, 0, 384, 192);
    const grad = ctx.createRadialGradient(192, 114, 18, 192, 116, 176);
    grad.addColorStop(0, "rgba(2,3,8,0.92)");
    grad.addColorStop(0.55, "rgba(2,3,8,0.72)");
    grad.addColorStop(1, "rgba(2,3,8,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(192, 118, 155, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(2,3,8,0.82)";
    ctx.beginPath();
    ctx.ellipse(134, 88, 62, 44, -0.12, 0, Math.PI * 2);
    ctx.ellipse(244, 88, 62, 44, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(102, 60, 17, 0, Math.PI * 2);
    ctx.arc(282, 60, 17, 0, Math.PI * 2);
    ctx.fill();
  });
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(10, Math.max(5.5, width * 0.44)), 3.2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.62, depthWrite: false, fog: false }),
  );
  shadow.position.set(0, 1.2, -0.18);
  g.add(shadow);
  return g;
}

export function buildCursedTradeBossCard(label: string): THREE.Group {
  const g = new THREE.Group();
  const tex = canvasTexture(320, 448, (ctx) => {
    ctx.fillStyle = "#110809";
    ctx.fillRect(0, 0, 320, 448);
    ctx.strokeStyle = "#FF3A57";
    ctx.lineWidth = 12;
    ctx.strokeRect(18, 18, 284, 412);
    ctx.strokeStyle = "#E3A52F";
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 42, 248, 348);
    ctx.fillStyle = "#EDE9E0";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CURSED TRADE", 160, 82);
    ctx.fillStyle = "#FF3A57";
    ctx.fillRect(70, 198, 180, 14);
    ctx.save();
    ctx.translate(160, 210);
    ctx.rotate(-0.42);
    ctx.fillRect(-112, -7, 224, 14);
    ctx.restore();
    ctx.strokeStyle = "#60D7FF";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(72, 282); ctx.lineTo(112, 238); ctx.lineTo(154, 270); ctx.lineTo(206, 196); ctx.lineTo(246, 232);
    ctx.stroke();
    ctx.fillStyle = "rgba(237,233,224,0.82)";
    ctx.font = "16px sans-serif";
    const words = label.toUpperCase().split(/\s+/).slice(0, 7);
    for (let i = 0; i < Math.min(3, Math.ceil(words.length / 3)); i++) {
      ctx.fillText(words.slice(i * 3, i * 3 + 3).join(" "), 160, 344 + i * 22);
    }
  });
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(1.85, 2.58),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.96, side: THREE.DoubleSide, fog: false }),
  );
  card.position.set(0, 2.05, -0.15);
  const rim = new THREE.PointLight("#FF3A57", 0.6, 4.2);
  rim.position.set(0, 2.2, 0.35);
  g.add(card, rim);
  return g;
}

export function buildTrapDecor(level: LevelSpec): THREE.Group {
  const g = new THREE.Group();
  const groundAt = new Map<number, number>();
  for (const seg of level.segments) for (const tile of seg.tiles) groundAt.set(tile.x, tile.groundY);

  const addAt = (trap: TrapEvent, art: THREE.Group, lift = 0) => {
    const gy = groundAt.get(Math.round(trap.atX)) ?? 0;
    if (gy < 0) return;
    art.position.set(trap.atX, gy + lift, 0);
    g.add(art);
  };

  for (const seg of level.segments) {
    for (const trap of seg.traps) {
      if (trap.kind === "spike_pop") addAt(trap, buildRedCandleSlash(), 0);
      if (trap.kind === "fake_exit") addAt(trap, buildFailedTxGlitch(), 0);
      if (trap.kind === "dark_zone") {
        const bear = buildBearShadow(trap.width);
        const midX = trap.atX;
        const gy = groundAt.get(Math.round(midX)) ?? 0;
        bear.position.set(midX, gy, -0.25);
        g.add(bear);
      }
    }
  }

  return g;
}
