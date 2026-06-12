import * as THREE from "three";
import type { Assignment } from "../engine/archetype.js";
import type { LevelSpec, Segment, TrapEvent } from "../engine/levelgen.js";
import { BIOME_COLORS } from "./world.js";
import { buildCursedTradeBossCard, buildGasTollGate, buildGhostToken } from "./obstacles.js";
import { buildBlobShadow } from "./scenery.js";
import { buildEraRoadTexture, wallColorAt } from "./cinematics.js";

const SPRITE_SHEETS: Partial<Record<string, string>> = {
  wanderer: "assets/kaizen/base/base-kaizen-spritesheet.png",
  trickster: "assets/kaizen/trickster/trickster-spritesheet.png",
  duelist: "assets/kaizen/duelist/duelist-spritesheet.png",
  baron: "assets/kaizen/baron/baron-spritesheet.png",
  oracle: "assets/kaizen/oracle/oracle-spritesheet.png",
  machine: "assets/kaizen/machine/machine-spritesheet.png",
  unwritten: "assets/kaizen/unwritten/unwritten-spritesheet.png",
};

type FighterFrame = "idle" | "run_01" | "run_02" | "jump" | "fall" | "hit" | "ability" | "victory";

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

function setRunnerFighterFrame(player: THREE.Group, frame: FighterFrame): void {
  const data = player.userData as { mode?: string; texture?: THREE.Texture; currentFrame?: FighterFrame };
  if (data.mode !== "sprite" || !data.texture || data.currentFrame === frame) return;
  const f = SPRITE_FRAMES[frame];
  data.texture.offset.set(f.col * 0.25, f.row === 0 ? 0.5 : 0);
  data.currentFrame = frame;
}

type Lane = -1 | 0 | 1;
type ObstacleKind = "block" | "spike" | "gate" | "glitch" | "bear";

export interface Runner3DCallbacks {
  caption(text: string, ms?: number): void;
  era(text: string): void;
  end(): void;
  /** feedback hooks (optional): hit = death, land = touched down, coin = collected */
  onHit?(): void;
  onLand?(impact: number): void;
  onCoin?(): void;
}

export interface Runner3DState {
  x: number;
  y: number;
  deaths: number;
  coins: number;
  ended: boolean;
  len: number;
  era?: string;
  grounded: boolean;
}

interface CoinHandle {
  x: number;
  lane: Lane;
  mesh: THREE.Object3D;
  taken: boolean;
}

interface ObstacleHandle {
  x: number;
  lane: Lane;
  width: number;
  kind: ObstacleKind;
  label?: string;
  mesh: THREE.Object3D;
  hit: boolean;
}

const LANES: Record<Lane, number> = { [-1]: -2.65, 0: 0, 1: 2.65 };
const ROAD_W = 9.4;
const TILE_Z = 1.25;
const RUN_SPEED = 9.2;
const GRAV = -28;
const JUMP_V = 11.2;
const RUNNER_SKY: Record<Segment["biome"], string> = {
  origins: "#8DB7D7",
  mintspring: "#84BFA1",
  crucible: "#B97865",
  darkwinter: "#4B5D74",
  neon: "#6559A9",
  quiet: "#BBB4D6",
  now: "#8DB7D7",
};

function laneFor(x: number, salt = 0): Lane {
  return ([-1, 0, 1] as Lane[])[Math.abs((x * 17 + salt * 31) % 3)]!;
}

function zOf(x: number): number {
  return -x * TILE_Z;
}

function makeGridTexture(base: string, line: string, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += size / 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i, size);
    ctx.moveTo(0, i); ctx.lineTo(size, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

function buildRunnerAvatar(assignment: Assignment): THREE.Group {
  const archetypeId = assignment.archetype.id;
  const sheetPath = SPRITE_SHEETS[archetypeId];
  if (sheetPath) {
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
      emissiveIntensity: 0.18, // faint self-light: readable in the dark winter, still dims
    });
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 2.75), mat);
    sprite.position.set(0, 1.375, 0);
    g.add(sprite);
    g.userData = { mode: "sprite", texture, currentFrame: "idle" satisfies FighterFrame };
    setRunnerFighterFrame(g, "idle");
    return g;
  }

  // Fallback to voxel avatar
  const g = new THREE.Group();
  const p = assignment.archetype.palette;
  const body = new THREE.MeshStandardMaterial({ color: p.body, roughness: 0.42, metalness: 0.18 });
  const trim = new THREE.MeshStandardMaterial({ color: p.trim, roughness: 0.36, metalness: 0.2 });
  const glow = new THREE.MeshStandardMaterial({ color: p.glow, emissive: p.glow, emissiveIntensity: 1.3, roughness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: "#101216", roughness: 0.48, metalness: 0.2 });

  const addBox = (name: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };

  addBox("torso", 0.72, 1.05, 0.42, 0, 1.34, 0, body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 18, 14), trim);
  head.name = "head";
  head.position.set(0, 2.05, 0);
  g.add(head);
  addBox("bag", 0.18, 0.72, 0.18, -0.5, 1.36, 0.05, dark);
  addBox("katana", 0.08, 1.25, 0.08, 0.42, 1.66, -0.18, glow).rotation.z = -0.55;
  addBox("armL", 0.18, 0.82, 0.18, -0.55, 1.32, 0.03, trim);
  addBox("armR", 0.18, 0.82, 0.18, 0.55, 1.32, 0.03, trim);
  addBox("legL", 0.22, 0.86, 0.22, -0.24, 0.56, 0.02, dark);
  addBox("legR", 0.22, 0.86, 0.22, 0.24, 0.56, 0.02, dark);
  addBox("eyeL", 0.08, 0.08, 0.04, -0.1, 2.08, 0.3, glow);
  addBox("eyeR", 0.08, 0.08, 0.04, 0.1, 2.08, 0.3, glow);

  g.userData.parts = {
    armL: g.getObjectByName("armL"),
    armR: g.getObjectByName("armR"),
    legL: g.getObjectByName("legL"),
    legR: g.getObjectByName("legR"),
  };
  return g;
}

function buildCoin(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#E3D02F", emissive: "#A07300", emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.22 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 10, 24), mat);
  ring.rotation.y = Math.PI / 2;
  const core = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 18), mat);
  core.rotation.y = Math.PI / 2;
  g.add(ring, core);
  return g;
}

function buildBlueBlock(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#0649A8", emissive: "#05235E", roughness: 0.38, metalness: 0.18 });
  for (let y = 0; y < 2; y++) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.82, 0.82), mat);
    block.position.set(0, 0.42 + y * 0.82, 0);
    g.add(block);
  }
  return g;
}

function buildGlitchGate(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: "#60D7FF", wireframe: true, transparent: true, opacity: 0.75, fog: false });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.8, 0.35), mat);
  box.position.y = 0.9;
  const slash = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.16), new THREE.MeshBasicMaterial({ color: "#FF3A57", transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  slash.position.set(0, 1.0, 0.2);
  slash.rotation.z = -0.72;
  g.add(box, slash);
  return g;
}

export class Runner3D {
  readonly group = new THREE.Group();
  readonly player: THREE.Group;
  readonly shadow: THREE.Mesh;
  readonly level: LevelSpec;
  readonly assignment: Assignment;
  readonly callbacks: Runner3DCallbacks;
  readonly coins: CoinHandle[] = [];
  readonly obstacles: ObstacleHandle[] = [];
  readonly shownCaptions = new Set<string>();

  x = 1.5;
  y = 0;
  vy = 0;
  lane: Lane = 0;
  laneTarget: Lane = 0;
  deaths = 0;
  coinsGot = 0;
  startedAt = performance.now();
  segment: Segment | null = null;
  ended = false;
  grounded = true;
  magnet = 0;
  shield = 0;
  private jumpBuffer = 0;

  constructor(scene: THREE.Scene, level: LevelSpec, assignment: Assignment, callbacks: Runner3DCallbacks) {
    this.level = level;
    this.assignment = assignment;
    this.callbacks = callbacks;
    this.player = buildRunnerAvatar(assignment);
    this.player.position.set(0, 0, zOf(this.x));
    this.group.add(this.player);

    this.shadow = buildBlobShadow();
    this.shadow.position.set(0, 0.02, zOf(this.x));
    this.group.add(this.shadow);

    this.buildWorld();
    scene.add(this.group);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
  }

  state(): Runner3DState {
    return { x: this.x, y: this.y, deaths: this.deaths, coins: this.coinsGot, ended: this.ended, len: this.level.totalLength, era: this.segment?.era, grounded: this.grounded };
  }

  steer(dir: -1 | 1): void {
    if (this.ended) return;
    this.laneTarget = Math.max(-1, Math.min(1, this.laneTarget + dir)) as Lane;
  }

  jump(): void {
    if (this.ended) return;
    this.jumpBuffer = 0.14;
  }

  warp(x: number): void {
    this.x = Math.max(1, Math.min(this.level.totalLength - 2, x));
    this.y = 4;
    this.vy = 0;
    this.player.position.z = zOf(this.x);
  }

  update(dtRaw: number, now: number, camera: THREE.PerspectiveCamera, scene: THREE.Scene, sun: THREE.DirectionalLight, ambient: THREE.AmbientLight, hemi: THREE.HemisphereLight): void {
    if (this.ended) {
      camera.position.lerp(new THREE.Vector3(0, 10, zOf(this.level.totalLength * 0.5) + 28), Math.min(1, dtRaw * 1.2));
      camera.lookAt(0, 1.6, zOf(this.level.totalLength * 0.5));
      return;
    }

    const seg = this.segmentAt(Math.round(this.x));
    if (seg && seg !== this.segment) {
      this.segment = seg;
      this.callbacks.era(seg.era);
      const c = BIOME_COLORS[seg.biome];
      (scene.fog as THREE.Fog).color.set(c.fog);
      (scene.background as THREE.Color).set(RUNNER_SKY[seg.biome]);
      for (const trap of seg.traps) {
        if ((trap.kind === "dark_zone" || trap.kind === "speed_flip" || trap.kind === "long_nothing") && !this.shownCaptions.has(trap.label)) {
          this.shownCaptions.add(trap.label);
          this.callbacks.caption(trap.label, 3400);
        }
      }
    }

    const inDark = !!seg?.traps.some((t) => t.kind === "dark_zone");
    const inSpeed = !!seg?.traps.some((t) => t.kind === "speed_flip");
    sun.intensity += ((inDark ? 0.12 : 1.35) - sun.intensity) * Math.min(1, dtRaw * 3);
    ambient.intensity += ((inDark ? 0.08 : 0.52) - ambient.intensity) * Math.min(1, dtRaw * 3);
    hemi.intensity += ((inDark ? 0.04 : 0.6) - hemi.intensity) * Math.min(1, dtRaw * 3);

    const dt = dtRaw * (inSpeed ? 1.45 : 1);
    this.x += RUN_SPEED * dt;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dtRaw);
    if (this.jumpBuffer > 0 && this.grounded) {
      this.vy = JUMP_V;
      this.grounded = false;
      this.jumpBuffer = 0;
    }
    this.vy += GRAV * dtRaw;
    this.y += this.vy * dtRaw;
    if (this.y <= 0) {
      if (!this.grounded) this.callbacks.onLand?.(Math.min(1, Math.abs(this.vy) / 14));
      this.y = 0;
      this.vy = 0;
      this.grounded = true;
    }

    const targetX = LANES[this.laneTarget];
    this.player.position.x += (targetX - this.player.position.x) * Math.min(1, dtRaw * 12);
    if (Math.abs(this.player.position.x - targetX) < 0.05) this.lane = this.laneTarget;
    this.player.position.y = this.y;
    this.player.position.z = zOf(this.x);
    if (this.player.userData.mode === "sprite") {
      this.player.rotation.y = (targetX - this.player.position.x) * -0.12;
      const spriteMesh = this.player.children[0];
      if (spriteMesh) {
        spriteMesh.quaternion.copy(camera.quaternion);
        const tilt = (targetX - this.player.position.x) * -0.05;
        spriteMesh.rotateZ(tilt);
      }
    } else {
      this.player.rotation.y = Math.sin(now / 160) * 0.04 + (targetX - this.player.position.x) * -0.12;
    }
    this.animatePlayer(now);

    // Update shadow position and scale
    this.shadow.position.set(this.player.position.x, 0.02, this.player.position.z);
    const shadowScale = Math.max(0.2, 1.0 - this.y * 0.15);
    this.shadow.scale.set(shadowScale, shadowScale, 1.0);
    if (this.shadow.material) {
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, 0.7 - this.y * 0.12);
    }

    this.updateCoins(dtRaw);
    this.updateObstacles(now);
    this.updateAbilities(dtRaw);

    const cam = new THREE.Vector3(this.player.position.x * 0.55, 4.2 + this.y * 0.18, zOf(this.x) + 8.4);
    camera.position.lerp(cam, Math.min(1, dtRaw * 6));
    camera.lookAt(this.player.position.x * 0.28, 1.7 + this.y * 0.1, zOf(this.x) - 9);
    camera.fov += ((inSpeed ? 78 : 70) - camera.fov) * Math.min(1, dtRaw * 3.5);
    camera.updateProjectionMatrix();

    this.group.children.forEach((child) => {
      if (child.userData.parallax === "side") child.visible = Math.abs(child.position.z - this.player.position.z) < 85;
    });

    if (this.x >= this.level.totalLength - 3) {
      this.ended = true;
      this.callbacks.end();
    }
  }

  private buildWorld(): void {
    const roadTex = buildEraRoadTexture(this.level); // era color bands along the run
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.62, metalness: 0.04 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, this.level.totalLength * TILE_Z), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.02, zOf(this.level.totalLength / 2));
    this.group.add(road);

    const stripMat = new THREE.MeshBasicMaterial({ color: "#EAF5FF", transparent: true, opacity: 0.86 });
    for (const x of [-1.35, 1.35, -4.55, 4.55]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.17, this.level.totalLength * TILE_Z), stripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.012, zOf(this.level.totalLength / 2));
      this.group.add(strip);
    }

    const sidewalkTex = makeGridTexture("#F1EAF8", "#C7BCE1");
    sidewalkTex.repeat.set(2, this.level.totalLength / 4);
    const sideMat = new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.66 });
    for (const x of [-6.8, 6.8]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(3.4, this.level.totalLength * TILE_Z), sideMat);
      side.rotation.x = -Math.PI / 2;
      side.position.set(x, 0, zOf(this.level.totalLength / 2));
      this.group.add(side);
    }

    this.buildWalls();
    this.buildCoins();
    this.buildObstacles();
    this.buildPortal();
  }

  private buildWalls(): void {
    const wallTex = makeGridTexture("#FFFFFF", "#00000022");
    wallTex.repeat.set(6, 16);
    for (const side of [-1, 1]) {
      for (let z = 0; z < this.level.totalLength; z += 13) {
        const h = 10 + ((z * 7) % 5);
        const tint = wallColorAt(this.level, z + 5); // walls inherit the era, not one global purple
        const mat = new THREE.MeshStandardMaterial({ map: wallTex, color: tint.wall, roughness: 0.52, metalness: 0.05 });
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(15.4, h), mat);
        wall.position.set(side * 9.2, h / 2 - 0.05, zOf(z + 5.5));
        wall.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        wall.userData.parallax = "side";
        this.group.add(wall);

        const towerMat = new THREE.MeshStandardMaterial({ color: tint.tower, roughness: 0.6, metalness: 0.03 });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2 + (z % 3), h * 0.75, 5.2), towerMat);
        tower.position.set(side * 12.4, h * 0.38 - 0.05, zOf(z + 4.5));
        tower.rotation.y = side * 0.08;
        tower.userData.parallax = "side";
        this.group.add(tower);
      }
    }
  }

  private buildCoins(): void {
    for (const seg of this.level.segments) {
      for (const tile of seg.tiles) {
        if (!tile.coin || tile.groundY < 0) continue;
        const lane = laneFor(tile.x, this.level.seed);
        const mesh = buildCoin();
        mesh.scale.setScalar(0.8); // reads oversized at near-lane distance otherwise
        mesh.position.set(LANES[lane], 1.52 + ((tile.x * 3) % 3) * 0.16, zOf(tile.x));
        this.coins.push({ x: tile.x, lane, mesh, taken: false });
        this.group.add(mesh);
      }
    }
  }

  private buildObstacles(): void {
    const add = (x: number, lane: Lane, width: number, kind: ObstacleKind, mesh: THREE.Object3D, label?: string) => {
      mesh.position.set(LANES[lane], 0, zOf(x));
      this.obstacles.push({ x, lane, width, kind, mesh, label, hit: false });
      this.group.add(mesh);
    };

    for (const seg of this.level.segments) {
      for (const tile of seg.tiles) {
        if (tile.spike) add(tile.x, laneFor(tile.x, 2), 1, "spike", this.buildSpike());
        if (tile.groundY < 0) add(tile.x, laneFor(tile.x, 5), 1.15, "glitch", buildGlitchGate(), "Failed transaction. Jump it.");
        if (tile.vanish) add(tile.x, laneFor(tile.x, 8), 1, "block", buildBlueBlock());
      }
      for (const trap of seg.traps) {
        if (trap.kind === "toll_gate") add(trap.atX, laneFor(trap.atX, 11), 1.25, "gate", buildGasTollGate(), trap.label);
        if (trap.kind === "fake_exit") add(trap.atX, laneFor(trap.atX, 13), 1.25, "glitch", buildGlitchGate(), trap.label);
        if (trap.kind === "runaway_coin") {
          const ghost = buildGhostToken();
          ghost.position.y = 1.5;
          add(trap.atX, laneFor(trap.atX, 17), 1.05, "block", ghost, trap.label);
          const card = buildCursedTradeBossCard(trap.label);
          card.position.set(LANES[0], 0, zOf(Math.max(seg.startX + 4, trap.atX - 4)));
          this.group.add(card);
        }
        if (trap.kind === "dark_zone") {
          const bear = this.buildBearWarning();
          add(trap.atX, 0, 1.4, "bear", bear, trap.label);
        }
      }
    }
  }

  private buildSpike(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: "#171923", emissive: "#FF3A57", emissiveIntensity: 0.8, roughness: 0.42 });
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.88, 4), mat);
      spike.position.set((i - 1) * 0.38, 0.44, 0);
      g.add(spike);
    }
    return g;
  }

  private buildBearWarning(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: "#03040A", transparent: true, opacity: 0.58 });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), mat);
    shadow.scale.set(1.6, 0.46, 1);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    g.add(shadow);
    return g;
  }

  private buildPortal(): void {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: "#E3A52F", emissive: "#E3A52F", emissiveIntensity: 1.1, metalness: 0.4, roughness: 0.32 });
    for (const [x, y, sx, sy] of [[-1.8, 1.7, 0.28, 3.4], [1.8, 1.7, 0.28, 3.4], [0, 3.35, 3.85, 0.28]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.4), mat);
      bar.position.set(x, y, 0);
      g.add(bar);
    }
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: "#FF5CA8", transparent: true, opacity: 0.9 }));
    swirl.position.y = 1.65;
    g.add(swirl);
    g.position.set(0, 0, zOf(this.level.totalLength - 3));
    this.group.add(g);
  }

  private updateCoins(dt: number): void {
    for (const coin of this.coins) {
      if (coin.taken) continue;
      coin.mesh.rotation.y += dt * 5;
      const dist = Math.abs(coin.x - this.x);
      if (this.magnet > 0 && dist < 8) {
        coin.mesh.position.x += (this.player.position.x - coin.mesh.position.x) * Math.min(1, dt * 6);
        coin.mesh.position.y += (1.25 + this.y - coin.mesh.position.y) * Math.min(1, dt * 6);
      }
      if (dist < 0.72 && Math.abs(coin.mesh.position.x - this.player.position.x) < 0.9 && Math.abs(coin.mesh.position.y - (1.2 + this.y)) < 1.2) {
        coin.taken = true;
        coin.mesh.visible = false;
        this.coinsGot++;
        this.callbacks.onCoin?.();
        if (this.coinsGot % 9 === 0) {
          this.magnet = 4;
          this.callbacks.caption("Magnet relic awakened.", 1400);
        }
      }
    }
  }

  private updateObstacles(now: number): void {
    for (const ob of this.obstacles) {
      if (ob.hit) continue;
      ob.mesh.rotation.y += ob.kind === "block" ? 0.012 : 0;
      const dist = Math.abs(ob.x - this.x);
      if (dist < ob.width && Math.abs(LANES[ob.lane] - this.player.position.x) < 0.82) {
        const canJump = this.y > 1.08 && (ob.kind === "spike" || ob.kind === "glitch");
        if (canJump) continue;
        ob.hit = true;
        if (ob.kind === "gate") {
          const tax = Math.max(1, Math.floor(this.coinsGot * 0.25));
          this.coinsGot = Math.max(0, this.coinsGot - tax);
          (ob.mesh.userData.pulse as (() => void) | undefined)?.();
          this.callbacks.caption(`${ob.label ?? "Gas gate"} — toll: ${tax} blocks.`, 2600);
          continue;
        }
        if (this.shield > 0) {
          this.shield = 0;
          ob.mesh.visible = false;
          this.callbacks.caption("Shield broke the receipt.", 1400);
          continue;
        }
        this.deaths++;
        this.shield = 2;
        this.x = Math.max(1, this.x - 4);
        this.vy = 0;
        this.y = 0;
        this.callbacks.onHit?.();
        this.callbacks.caption(ob.label ?? "The chain remembers.", 1800);
      }
      if (ob.kind === "bear") ob.mesh.scale.setScalar(1 + Math.sin(now / 260) * 0.08);
    }
  }

  private updateAbilities(dt: number): void {
    this.magnet = Math.max(0, this.magnet - dt);
    this.shield = Math.max(0, this.shield - dt);
  }

  private animatePlayer(now: number): void {
    const data = this.player.userData as { mode?: string };
    if (data.mode === "sprite") {
      if (this.ended) {
        setRunnerFighterFrame(this.player, "victory");
      } else if (this.shield > 1.4) {
        setRunnerFighterFrame(this.player, "hit");
      } else if (!this.grounded) {
        setRunnerFighterFrame(this.player, this.vy > 0 ? "jump" : "fall");
      } else {
        const walk = now / 95;
        setRunnerFighterFrame(this.player, Math.sin(walk) >= 0 ? "run_01" : "run_02");
      }
      return;
    }

    const parts = this.player.userData.parts as Record<string, THREE.Object3D | undefined>;
    const t = now / 95;
    const stride = this.grounded ? Math.sin(t) : 0.25;
    if (parts.armL) parts.armL.rotation.x = -stride * 0.7;
    if (parts.armR) parts.armR.rotation.x = stride * 0.7;
    if (parts.legL) parts.legL.rotation.x = stride * 0.9;
    if (parts.legR) parts.legR.rotation.x = -stride * 0.9;
  }

  private segmentAt(x: number): Segment | undefined {
    return this.level.segments.find((s) => x >= s.startX && x <= s.endX);
  }
}
