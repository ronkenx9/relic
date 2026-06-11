/** Voxel world builder — renders a LevelSpec as instanced cubes. */
import * as THREE from "three";
import type { LevelSpec, Segment, Tile } from "../engine/levelgen.js";

export const BIOME_COLORS: Record<Segment["biome"], { ground: string; accent: string; fog: string; sky: string }> = {
  origins: { ground: "#C9A86A", accent: "#E3C68C", fog: "#2A2118", sky: "#171310" },
  mintspring: { ground: "#5C8A5E", accent: "#8FBF8F", fog: "#1C2A1E", sky: "#101810" },
  crucible: { ground: "#7A3B32", accent: "#C25C45", fog: "#2A1512", sky: "#180D0B" },
  darkwinter: { ground: "#2E3A45", accent: "#46586A", fog: "#06080C", sky: "#02030A" },
  neon: { ground: "#3B2E5E", accent: "#8C5CFF", fog: "#150F2E", sky: "#0B0820" },
  quiet: { ground: "#D8D4CB", accent: "#EDE9E0", fog: "#3A3830", sky: "#23211C" },
  now: { ground: "#39414A", accent: "#E3A52F", fog: "#14171B", sky: "#0C0E11" },
};

export interface WorldHandles {
  group: THREE.Group;
  /** tileX → segment */
  segmentAt(x: number): Segment | undefined;
  /** vanishable tile meshes keyed by tile x (only tiles flagged vanish) */
  vanishTiles: Map<number, { mesh: THREE.Mesh; tile: Tile; state: "solid" | "falling" | "gone"; t: number }>;
  /** spike cones keyed by tile x (hidden until popped) */
  spikes: Map<number, { mesh: THREE.Mesh; armed: boolean; popped: boolean }>;
  /** coin meshes keyed by tile x */
  coins: Map<number, THREE.Mesh>;
  /** ground top at tile x, accounting for vanish state (null = pit) */
  groundAt(x: number): number | null;
  portalX: number;
  portal: THREE.Group;
}

const TILE = 1;

export function buildWorld(scene: THREE.Scene, level: LevelSpec): WorldHandles {
  const group = new THREE.Group();
  scene.add(group);

  const tileIndex = new Map<number, Tile>();
  const segIndex: Segment[] = [];
  for (const seg of level.segments) {
    for (const t of seg.tiles) tileIndex.set(t.x, t);
    segIndex.push(seg);
  }

  // --- static ground: one InstancedMesh of cubes (3 deep, 2 rows of depth for chunk feel) ---
  const solidTiles: { tile: Tile; seg: Segment }[] = [];
  for (const seg of level.segments)
    for (const t of seg.tiles) if (t.groundY >= 0 && !t.vanish) solidTiles.push({ tile: t, seg });

  const depth = 3; // blocks below surface
  const rows = 2; // z-depth rows for visual thickness
  const box = new THREE.BoxGeometry(TILE, TILE, TILE);
  const mat = new THREE.MeshLambertMaterial();
  const inst = new THREE.InstancedMesh(box, mat, solidTiles.length * depth * rows);
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(inst.count * 3), 3);
  const m4 = new THREE.Matrix4();
  const color = new THREE.Color();
  let i = 0;
  for (const { tile, seg } of solidTiles) {
    const c = BIOME_COLORS[seg.biome];
    for (let d = 0; d < depth; d++) {
      for (let r = 0; r < rows; r++) {
        m4.setPosition(tile.x * TILE, (tile.groundY - d) * TILE - TILE / 2, -r * TILE);
        inst.setMatrixAt(i, m4);
        color.set(d === 0 ? c.ground : c.accent).multiplyScalar(d === 0 ? 1 : 0.55 - r * 0.12);
        // subtle per-block variation so it doesn't look like plastic
        const v = 0.92 + ((tile.x * 7 + d * 13 + r * 29) % 17) / 100;
        color.multiplyScalar(v);
        inst.setColorAt(i, color);
        i++;
      }
    }
  }
  inst.count = i;
  group.add(inst);

  // --- vanishable tiles: individual meshes so they can fall ---
  const vanishTiles: WorldHandles["vanishTiles"] = new Map();
  for (const seg of level.segments)
    for (const t of seg.tiles)
      if (t.vanish && t.groundY >= 0) {
        const c = BIOME_COLORS[seg.biome];
        const mesh = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: c.ground }));
        mesh.position.set(t.x * TILE, t.groundY * TILE - TILE / 2, 0);
        group.add(mesh);
        vanishTiles.set(t.x, { mesh, tile: t, state: "solid", t: 0 });
      }

  // --- spikes: cones hidden underground until popped ---
  const spikes: WorldHandles["spikes"] = new Map();
  const spikeGeo = new THREE.ConeGeometry(0.32, 0.8, 4);
  for (const seg of level.segments)
    for (const t of seg.tiles)
      if (t.spike) {
        const mesh = new THREE.Mesh(spikeGeo, new THREE.MeshLambertMaterial({ color: "#D8D4CB" }));
        mesh.position.set(t.x * TILE, (t.groundY + 1) * TILE - 1.3, 0); // submerged
        mesh.visible = false;
        group.add(mesh);
        spikes.set(t.x, { mesh, armed: false, popped: false });
      }

  // --- coins ---
  const coins: WorldHandles["coins"] = new Map();
  const coinGeo = new THREE.BoxGeometry(0.34, 0.34, 0.12);
  const coinMat = new THREE.MeshStandardMaterial({ color: "#E3A52F", metalness: 0.7, roughness: 0.3, emissive: "#3A2A00" });
  for (const seg of level.segments)
    for (const t of seg.tiles)
      if (t.coin && t.groundY >= 0) {
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        mesh.position.set(t.x * TILE, (t.groundY + 1.1) * TILE, 0);
        group.add(mesh);
        coins.set(t.x, mesh);
      }

  // --- the forge portal at the end ---
  const portal = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: "#E3A52F", emissive: "#7A5200", metalness: 0.6, roughness: 0.35 });
  for (const [dx, dy, sx, sy] of [[-1.1, 1.4, 0.35, 3.2], [1.1, 1.4, 0.35, 3.2], [0, 3.2, 2.55, 0.35]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.5), frameMat);
    bar.position.set(dx, dy, 0);
    portal.add(bar);
  }
  const portalX = level.totalLength - 3;
  const endSeg = level.segments.at(-1)!;
  const endTile = tileIndex.get(portalX) ?? endSeg.tiles.at(-1)!;
  portal.position.set(portalX * TILE, endTile.groundY * TILE, 0);
  group.add(portal);

  // --- backdrop pillars per segment (cheap skyline depth) ---
  const back = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), level.segments.length * 8);
  back.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(back.count * 3), 3);
  let bi = 0;
  for (const seg of level.segments) {
    const c = new THREE.Color(BIOME_COLORS[seg.biome].accent).multiplyScalar(0.32);
    const w = seg.endX - seg.startX;
    for (let k = 0; k < 8; k++) {
      const px = seg.startX + ((k * 37 + seg.startX * 11) % Math.max(1, w));
      const h = 2 + ((px * 13) % 5);
      m4.makeScale(1, h, 1);
      m4.setPosition(px * TILE, h / 2 - 0.5, -4 - ((px * 7) % 3));
      back.setMatrixAt(bi, m4);
      back.setColorAt(bi, c);
      bi++;
    }
  }
  back.count = bi;
  group.add(back);

  return {
    group,
    segmentAt: (x) => segIndex.find((s) => x >= s.startX && x <= s.endX),
    vanishTiles,
    spikes,
    coins,
    groundAt: (x) => {
      const t = tileIndex.get(x);
      if (!t || t.groundY < 0) return null;
      const v = vanishTiles.get(x);
      if (v && v.state !== "solid") return null;
      return t.groundY;
    },
    portalX,
    portal,
  };
}

/** Procedural voxel chibi fighter from an archetype palette — no art assets needed. */
export function buildFighter(palette: { body: string; trim: string; glow: string }): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: palette.body });
  const trim = new THREE.MeshLambertMaterial({ color: palette.trim });
  const glow = new THREE.MeshStandardMaterial({ color: palette.glow, emissive: palette.glow, emissiveIntensity: 0.8 });

  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };

  add(0.5, 0.55, 0.4, 0, 0.95, 0, body); // torso
  add(0.42, 0.42, 0.42, 0, 1.45, 0, trim); // head
  add(0.44, 0.1, 0.44, 0, 1.32, 0, body); // collar
  add(0.12, 0.12, 0.06, -0.09, 1.48, 0.21, glow); // eyes
  add(0.12, 0.12, 0.06, 0.11, 1.48, 0.21, glow);
  const legL = add(0.16, 0.45, 0.2, -0.13, 0.42, 0, body);
  const legR = add(0.16, 0.45, 0.2, 0.13, 0.42, 0, body);
  const armL = add(0.13, 0.42, 0.16, -0.34, 0.95, 0, trim);
  const armR = add(0.13, 0.42, 0.16, 0.34, 0.95, 0, trim);
  add(0.1, 0.5, 0.1, 0.3, 1.5, -0.18, glow); // katana hilt over the shoulder

  g.userData = { legL, legR, armL, armR };
  return g;
}
