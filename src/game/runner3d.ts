import * as THREE from "three";
import type { Assignment } from "../engine/archetype.js";
import type { LevelSpec, Segment, TrapEvent } from "../engine/levelgen.js";
import { BIOME_COLORS } from "./world.js";
import { buildCursedTradeBossCard, buildGasTollGate, buildGhostToken } from "./obstacles.js";
import { buildBlobShadow } from "./scenery.js";
import { buildEraRoadTexture, wallColorAt } from "./cinematics.js";

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

interface AvatarPalette {
  jacket: string;
  sleeve: string;
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
  accent: string;
  glow: string;
  metal: string;
}

interface AvatarParts {
  torso: THREE.Object3D;
  head: THREE.Object3D;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  footL: THREE.Object3D;
  footR: THREE.Object3D;
  bag: THREE.Object3D;
  katana: THREE.Object3D;
  pendant: THREE.Object3D;
}

const AVATAR_PALETTES: Record<string, AvatarPalette> = {
  wanderer: { jacket: "#E07090", sleeve: "#BFC2C7", shirt: "#171719", pants: "#17191E", skin: "#C98C62", hair: "#191514", accent: "#D73338", glow: "#FF5CA8", metal: "#D8D4CB" },
  trickster: { jacket: "#B34CFF", sleeve: "#27213D", shirt: "#11111B", pants: "#1B1728", skin: "#C98C62", hair: "#17131D", accent: "#F010F0", glow: "#F010F0", metal: "#E6D8FF" },
  duelist: { jacket: "#8A1D1D", sleeve: "#2A1618", shirt: "#161012", pants: "#151417", skin: "#C4895E", hair: "#120E0E", accent: "#FF3A57", glow: "#FF3A57", metal: "#FFD2A1" },
  baron: { jacket: "#7A5A18", sleeve: "#E1C069", shirt: "#15130F", pants: "#181713", skin: "#C6905F", hair: "#16120D", accent: "#E3A52F", glow: "#E3A52F", metal: "#F2D787" },
  oracle: { jacket: "#245C84", sleeve: "#D8ECFF", shirt: "#101720", pants: "#151A22", skin: "#C59066", hair: "#111822", accent: "#60D7FF", glow: "#60D7FF", metal: "#E6F2FF" },
  machine: { jacket: "#4A5058", sleeve: "#C8CDD2", shirt: "#151619", pants: "#181A1E", skin: "#B8A18B", hair: "#111214", accent: "#FF3B30", glow: "#FF3B30", metal: "#E8EBEE" },
  unwritten: { jacket: "#3C3D42", sleeve: "#BFBFC4", shirt: "#101113", pants: "#17181B", skin: "#B89978", hair: "#101113", accent: "#FFFFFF", glow: "#FFFFFF", metal: "#D0D0D4" },
};

function roundedMat(color: string, roughness = 0.42, metalness = 0.06): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function makeCapsule(radius: number, length: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 14), mat);
}

function buildRunnerAvatar(assignment: Assignment): THREE.Group {
  const g = new THREE.Group();
  const p = AVATAR_PALETTES[assignment.archetype.id] ?? AVATAR_PALETTES.wanderer;
  const jacket = roundedMat(p.jacket, 0.38, 0.12);
  const sleeve = roundedMat(p.sleeve, 0.36, 0.08);
  const shirt = roundedMat(p.shirt, 0.5, 0.04);
  const pants = roundedMat(p.pants, 0.48, 0.05);
  const skin = roundedMat(p.skin, 0.5, 0.02);
  const hair = roundedMat(p.hair, 0.55, 0.02);
  const shoe = roundedMat("#0F1012", 0.45, 0.08);
  const metal = roundedMat(p.metal, 0.24, 0.46);
  const glow = new THREE.MeshStandardMaterial({ color: p.glow, emissive: p.glow, emissiveIntensity: 1.45, roughness: 0.22 });

  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.88, 0);
  g.add(pelvis);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.44), pants);
  hips.position.set(0, 0, 0);
  pelvis.add(hips);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.36, 0);
  pelvis.add(torsoPivot);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.62, 8, 16), jacket);
  torso.name = "torso";
  torso.scale.set(1.02, 1, 0.74);
  torso.position.set(0, 0.46, 0);
  torsoPivot.add(torso);

  const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.62, 0.05), shirt);
  shirtPanel.position.set(0, 0.42, 0.26);
  torsoPivot.add(shirtPanel);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 18), sleeve);
  collar.position.set(0, 0.88, 0.05);
  collar.rotation.x = Math.PI / 2;
  torsoPivot.add(collar);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 12), skin);
  neck.position.set(0, 0.93, 0.01);
  torsoPivot.add(neck);

  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 1.16, 0.02);
  torsoPivot.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 16), skin);
  face.scale.set(0.9, 1.04, 0.86);
  head.add(face);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.302, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hair);
  hairCap.scale.set(0.96, 0.74, 0.9);
  hairCap.position.set(0, 0.1, 0);
  head.add(hairCap);
  for (const dx of [-0.085, 0.085]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.018), glow);
    eye.position.set(dx, 0.025, 0.245);
    head.add(eye);
  }

  const makeArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.42, 0.78, 0.02);
    torsoPivot.add(shoulder);
    const upper = makeCapsule(0.075, 0.38, sleeve);
    upper.position.y = -0.21;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.44;
    shoulder.add(elbow);
    const lower = makeCapsule(0.068, 0.34, skin);
    lower.position.y = -0.19;
    elbow.add(lower);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), skin);
    hand.position.y = -0.39;
    elbow.add(hand);
    return { shoulder, elbow };
  };

  const makeLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.22, -0.05, 0);
    pelvis.add(hip);
    const upper = makeCapsule(0.105, 0.45, pants);
    upper.position.y = -0.25;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -0.52;
    hip.add(knee);
    const lower = makeCapsule(0.09, 0.42, pants);
    lower.position.y = -0.24;
    knee.add(lower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.42), shoe);
    foot.position.set(0, -0.49, 0.1);
    knee.add(foot);
    return { hip, knee, foot };
  };

  const armL = makeArm(-1);
  const armR = makeArm(1);
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  const bag = new THREE.Group();
  bag.name = "bag";
  bag.position.set(-0.45, 0.48, 0.16);
  torsoPivot.add(bag);
  const bagBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.44, 0.14), roundedMat("#17120E", 0.5, 0.05));
  bag.add(bagBody);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.16, 0.035), roundedMat("#23170F", 0.48, 0.04));
  strap.position.set(0.33, 0.18, 0.25);
  strap.rotation.z = -0.52;
  torsoPivot.add(strap);

  const katana = new THREE.Group();
  katana.name = "katana";
  katana.position.set(0.43, 0.7, -0.23);
  katana.rotation.set(0.2, 0.16, -0.62);
  torsoPivot.add(katana);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.25, 0.035), metal);
  blade.position.y = 0.18;
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.08), glow);
  hilt.position.y = -0.48;
  katana.add(blade, hilt);

  const pendant = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.035), new THREE.MeshStandardMaterial({ color: p.accent, emissive: p.accent, emissiveIntensity: 0.7, roughness: 0.3 }));
  pendant.name = "pendant";
  pendant.position.set(0.05, 0.2, 0.31);
  torsoPivot.add(pendant);

  g.userData.parts = {
    torso: torsoPivot,
    head,
    shoulderL: armL.shoulder,
    shoulderR: armR.shoulder,
    elbowL: armL.elbow,
    elbowR: armR.elbow,
    hipL: legL.hip,
    hipR: legR.hip,
    kneeL: legL.knee,
    kneeR: legR.knee,
    footL: legL.foot,
    footR: legR.foot,
    bag,
    katana,
    pendant,
  } satisfies AvatarParts;
  g.userData.mode = "rig3d";
  g.scale.setScalar(1.18);
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
  private landingSquash = 0;

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
      if (!this.grounded) {
        const impact = Math.min(1, Math.abs(this.vy) / 14);
        this.landingSquash = Math.max(this.landingSquash, impact);
        this.callbacks.onLand?.(impact);
      }
      this.y = 0;
      this.vy = 0;
      this.grounded = true;
    }

    const targetX = LANES[this.laneTarget];
    this.player.position.x += (targetX - this.player.position.x) * Math.min(1, dtRaw * 12);
    if (Math.abs(this.player.position.x - targetX) < 0.05) this.lane = this.laneTarget;
    this.player.position.y = this.y;
    this.player.position.z = zOf(this.x);
    const laneDelta = targetX - this.player.position.x;
    this.player.rotation.y = Math.PI + Math.sin(now / 160) * 0.035 + laneDelta * -0.08;
    this.player.rotation.z = laneDelta * -0.065;
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

    const cam = new THREE.Vector3(this.player.position.x * 0.58, 3.55 + this.y * 0.2, zOf(this.x) + 6.9);
    camera.position.lerp(cam, Math.min(1, dtRaw * 6));
    camera.lookAt(this.player.position.x * 0.28, 1.45 + this.y * 0.12, zOf(this.x) - 8.4);
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
    const parts = this.player.userData.parts as Partial<AvatarParts>;
    const t = now / 95;
    const wave = Math.sin(t);
    const counter = Math.cos(t);
    const laneLean = this.player.rotation.z;
    const squash = this.landingSquash;
    this.landingSquash = Math.max(0, this.landingSquash - 0.08);

    this.player.scale.set(1 + squash * 0.08, 1 - squash * 0.14, 1 + squash * 0.08);

    if (this.grounded) {
      const stride = wave;
      if (parts.hipL) parts.hipL.rotation.x = stride * 0.72;
      if (parts.hipR) parts.hipR.rotation.x = -stride * 0.72;
      if (parts.kneeL) parts.kneeL.rotation.x = Math.max(0.1, -stride) * 0.98 + 0.08;
      if (parts.kneeR) parts.kneeR.rotation.x = Math.max(0.1, stride) * 0.98 + 0.08;
      if (parts.shoulderL) parts.shoulderL.rotation.x = -stride * 0.72;
      if (parts.shoulderR) parts.shoulderR.rotation.x = stride * 0.72;
      if (parts.elbowL) parts.elbowL.rotation.x = 0.25 + Math.max(0, stride) * 0.45;
      if (parts.elbowR) parts.elbowR.rotation.x = 0.25 + Math.max(0, -stride) * 0.45;
      if (parts.torso) {
        parts.torso.rotation.x = 0.08 + Math.abs(counter) * 0.025;
        parts.torso.rotation.z = laneLean * 0.5;
      }
    } else {
      const rising = this.vy > 0;
      if (parts.hipL) parts.hipL.rotation.x = rising ? -0.25 : 0.28;
      if (parts.hipR) parts.hipR.rotation.x = rising ? -0.08 : 0.18;
      if (parts.kneeL) parts.kneeL.rotation.x = rising ? 1.15 : 0.45;
      if (parts.kneeR) parts.kneeR.rotation.x = rising ? 0.85 : 0.35;
      if (parts.shoulderL) parts.shoulderL.rotation.x = rising ? -0.85 : -0.25;
      if (parts.shoulderR) parts.shoulderR.rotation.x = rising ? -0.65 : -0.15;
      if (parts.elbowL) parts.elbowL.rotation.x = 0.55;
      if (parts.elbowR) parts.elbowR.rotation.x = 0.5;
      if (parts.torso) {
        parts.torso.rotation.x = rising ? -0.14 : 0.2;
        parts.torso.rotation.z = laneLean * 0.6;
      }
    }

    if (parts.head) {
      parts.head.rotation.x = this.grounded ? Math.abs(counter) * 0.035 : this.vy > 0 ? -0.1 : 0.08;
      parts.head.rotation.z = -laneLean * 0.55;
    }
    if (parts.bag) {
      parts.bag.rotation.x = Math.sin(t + 0.8) * 0.18 - this.vy * 0.006;
      parts.bag.rotation.z = -laneLean * 0.8;
    }
    if (parts.katana) {
      parts.katana.rotation.x = 0.2 + Math.sin(t + 1.4) * 0.06 - this.vy * 0.004;
      parts.katana.rotation.z = -0.62 - laneLean * 0.8;
    }
    if (parts.pendant) {
      parts.pendant.rotation.x = Math.sin(t * 1.6) * 0.2 - this.vy * 0.01;
      parts.pendant.rotation.z = laneLean * -1.1;
    }
    if (parts.footL) parts.footL.rotation.x = this.grounded ? -Math.max(0, wave) * 0.42 : 0.26;
    if (parts.footR) parts.footR.rotation.x = this.grounded ? -Math.max(0, -wave) * 0.42 : 0.22;
  }

  private segmentAt(x: number): Segment | undefined {
    return this.level.segments.find((s) => x >= s.startX && x <= s.endX);
  }
}
