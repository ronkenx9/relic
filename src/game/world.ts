/** Voxel world builder — renders a LevelSpec as instanced cubes. */
import * as THREE from "three";
import type { LevelSpec, Segment, Tile } from "../engine/levelgen.js";
import { buildTrapDecor } from "./obstacles.js";

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
        m4.setPosition(tile.x * TILE, (tile.groundY - d) * TILE + TILE / 2, -r * TILE); // top face at groundY+1 == physics surface
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
        mesh.position.set(t.x * TILE, t.groundY * TILE + TILE / 2, 0); // aligned with physics surface
        group.add(mesh);
        vanishTiles.set(t.x, { mesh, tile: t, state: "solid", t: 0 });
      }

  // --- spikes: obsidian cones with hot tips, hidden underground until popped ---
  const spikes: WorldHandles["spikes"] = new Map();
  const spikeGeo = new THREE.ConeGeometry(0.32, 0.8, 4);
  const spikeMat = new THREE.MeshStandardMaterial({
    color: "#16181D", emissive: "#FF3A57", emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.45,
  });
  for (const seg of level.segments)
    for (const t of seg.tiles)
      if (t.spike) {
        const mesh = new THREE.Mesh(spikeGeo, spikeMat);
        mesh.position.set(t.x * TILE, (t.groundY + 1) * TILE - 0.55, 0); // submerged just below the surface
        mesh.visible = false;
        group.add(mesh);
        spikes.set(t.x, { mesh, armed: false, popped: false });
      }

  // --- coins: gold discs with a warm core glow ---
  const coins: WorldHandles["coins"] = new Map();
  const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.07, 14);
  coinGeo.rotateX(Math.PI / 2); // face the camera, spin on world Y
  const coinMat = new THREE.MeshStandardMaterial({
    color: "#FFC75E", metalness: 0.85, roughness: 0.25, emissive: "#7A5200", emissiveIntensity: 0.9,
  });
  for (const seg of level.segments)
    for (const t of seg.tiles)
      if (t.coin && t.groundY >= 0) {
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        mesh.position.set(t.x * TILE, (t.groundY + 1.55) * TILE, 0);
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
  portal.position.set(portalX * TILE, (endTile.groundY + 1) * TILE, 0);
  group.add(portal);

  // --- fake contact AO: dark strip under the top-front edge + bright top lip ---
  {
    const surfCount = solidTiles.length;
    const aoGeo = new THREE.PlaneGeometry(TILE, 0.16);
    const aoMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28, depthWrite: false });
    const ao = new THREE.InstancedMesh(aoGeo, aoMat, surfCount);
    const lipGeo = new THREE.PlaneGeometry(TILE, TILE);
    lipGeo.rotateX(-Math.PI / 2);
    const lipMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, depthWrite: false, color: "#FFFFFF" });
    const lip = new THREE.InstancedMesh(lipGeo, lipMat, surfCount);
    let ai = 0;
    for (const { tile } of solidTiles) {
      m4.identity();
      m4.setPosition(tile.x * TILE, (tile.groundY + 1) * TILE - 0.09, 0.501);
      ao.setMatrixAt(ai, m4);
      m4.setPosition(tile.x * TILE, (tile.groundY + 1) * TILE + 0.002, 0);
      lip.setMatrixAt(ai, m4);
      ai++;
    }
    ao.count = ai;
    lip.count = ai;
    group.add(ao, lip);
  }

  // (backdrop pillars replaced by scenery.ts parallax skyline)
  group.add(buildTrapDecor(level));

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

type FighterFrame = "idle" | "run_01" | "run_02" | "jump" | "fall" | "hit" | "ability" | "victory";

const SPRITE_SHEETS: Partial<Record<string, string>> = {
  wanderer: "assets/kaizen/base/base-kaizen-spritesheet.png",
  trickster: "assets/kaizen/trickster/trickster-spritesheet.png",
  duelist: "assets/kaizen/duelist/duelist-spritesheet.png",
  baron: "assets/kaizen/baron/baron-spritesheet.png",
  oracle: "assets/kaizen/oracle/oracle-spritesheet.png",
  machine: "assets/kaizen/machine/machine-spritesheet.png",
  unwritten: "assets/kaizen/unwritten/unwritten-spritesheet.png",
};
const SPRITE_FRAMES: Record<FighterFrame, { col: number; row: number }> = {
  idle: { col: 0, row: 0 },
  run_01: { col: 1, row: 0 },
  run_02: { col: 2, row: 0 },
  jump: { col: 3, row: 0 },
  fall: { col: 0, row: 1 },
  hit: { col: 1, row: 1 },
  ability: { col: 2, row: 1 },
  victory: { col: 3, row: 1 },
};

/** Build the playable fighter. Archetypes with generated sprite sheets use them; others keep the procedural fallback. */
export function buildFighter(palette: { body: string; trim: string; glow: string }, archetypeId?: string): THREE.Group {
  const sheet = archetypeId ? SPRITE_SHEETS[archetypeId] : undefined;
  if (sheet) return buildSpriteFighter(sheet);
  return buildVoxelFighter(palette);
}

function buildSpriteFighter(sheetPath: string): THREE.Group {
  const g = new THREE.Group();
  const texture = new THREE.TextureLoader().load(sheetPath);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.25, 0.5);
  texture.offset.set(0, 0.5);
  texture.magFilter = THREE.LinearFilter;

  const mat = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.04,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: "#FFFFFF",
    emissiveMap: texture,
    emissiveIntensity: 0.16, // faint self-light: readable in the dark winter, still dims
  });
  const sprite = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 2.75), mat);
  sprite.position.set(0.25, 1.28, 0.06);
  g.add(sprite);
  g.userData = { mode: "sprite", texture, currentFrame: "idle" satisfies FighterFrame };
  setFighterFrame(g, "idle");
  return g;
}

/** Procedural voxel chibi fighter from an archetype palette — fallback for archetypes without art assets. */
function buildVoxelFighter(palette: { body: string; trim: string; glow: string }): THREE.Group {
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

export function setFighterFrame(fighter: THREE.Group, frame: FighterFrame): void {
  const data = fighter.userData as { mode?: string; texture?: THREE.Texture; currentFrame?: FighterFrame };
  if (data.mode !== "sprite" || !data.texture || data.currentFrame === frame) return;
  const f = SPRITE_FRAMES[frame];
  data.texture.offset.set(f.col * 0.25, f.row === 0 ? 0.5 : 0);
  data.currentFrame = frame;
}

export function updateFighterPose(fighter: THREE.Group, walk: number, grounded: boolean, vy: number): void {
  const data = fighter.userData as Record<string, THREE.Mesh> & { mode?: string };
  if (data.mode === "sprite") {
    if (!grounded) {
      setFighterFrame(fighter, vy > 0 ? "jump" : "fall");
    } else {
      setFighterFrame(fighter, Math.sin(walk) >= 0 ? "run_01" : "run_02");
    }
    return;
  }

  const sw = grounded ? Math.sin(walk) * 0.55 : 0.2;
  data.legL!.rotation.x = sw;
  data.legR!.rotation.x = -sw;
  data.armL!.rotation.x = -sw * 0.7;
  data.armR!.rotation.x = sw * 0.7;
  fighter.rotation.y = 0.18;
}
