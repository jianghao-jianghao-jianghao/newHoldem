import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Card, ClientPlayerView, ClientTableView } from '../shared/types';
import { type DealStage, soundFx } from '../utils/soundFx';
import {
  buildDealerButtonGroup,
  buildDealerShoeGroup,
  buildPokerTableGroup,
  buildTableMarkerButtonGroup,
  breakdownChipsForStack,
  CARD_HEIGHT,
  CHIP_HEIGHT,
  CHIP_RADIUS,
  createSharedAssetFactory,
  type SharedAssetFactory,
} from '../three/pokerModels';
import {
  createProceduralTexturePack,
  type ChipDenom,
  type ProceduralTexturePack,
} from '../three/proceduralTextures';
import {
  applyStackCollisionImpulse,
  type ChipMotionMode,
  type ChipPhysicsBody,
  computeChipStackHeightProfile,
  createChipPhysicsBody,
  createStackSpringState,
  type StackSpringState,
  stepChipPhysicsBody,
  stepStackSpringPhysics,
} from '../three/chipPhysics';

export type CameraPreset = 'classic' | 'overhead';

interface PokerScene3DProps {
  table: ClientTableView | null;
  myPlayerId: string;
  cameraPreset?: CameraPreset;
  ambientOnly?: boolean;
  nudgePulse?: { targetPlayerId: string; key: number } | null;
}

interface SeatAnchors3D {
  stackPos: THREE.Vector3;
  betPos: THREE.Vector3;
  cardPos: THREE.Vector3;
  dealerPos: THREE.Vector3;
  blindPos: THREE.Vector3;
  facingAngle: number;
}

interface ChipStackSlot {
  group: THREE.Group;
  amount: number;
  isAllIn: boolean;
  baseX: number;
  baseZ: number;
  maxCols: number;
  maxPerCol: number;
  topY: number;
  chips: { mesh: THREE.Mesh; baseX: number; baseY: number; baseZ: number; level: number }[];
  spring: StackSpringState;
  springActive: boolean;
  riseProgress: number;
  enterFrom: THREE.Vector3 | null;
  enterProgress: number;
}

interface FlyingChip {
  mesh: THREE.Mesh;
  body: ChipPhysicsBody;
  targetStackKey: string;
}

interface FlyingCard {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  targetRotY: number;
  flipToFaceUp: boolean;
  elapsed: number;
  delay: number;
  duration: number;
  slapTime: number;
  landed: boolean;
  onLand?: () => void;
}

interface ImpactRingFx {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  elapsed: number;
  duration: number;
}

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _scratchVecA = new THREE.Vector3();
const _scratchVecB = new THREE.Vector3();

const SHOE_WORLD_POS = new THREE.Vector3(-3.28, 0.14, -0.76);
const POT_WORLD_POS = new THREE.Vector3(0, 0, -0.84);
const COMMUNITY_SLOTS_X = [-1.04, -0.52, 0, 0.52, 1.04];
const COMMUNITY_Z = -0.04;

function computeSeatAnchors(
  players: ClientPlayerView[],
  myPlayerId: string
): Map<string, SeatAnchors3D> {
  const map = new Map<string, SeatAnchors3D>();
  if (players.length === 0) return map;

  const selfIdx = players.findIndex((p) => p.id === myPlayerId);
  const ordered: ClientPlayerView[] = [];
  if (selfIdx >= 0) {
    for (let i = 0; i < players.length; i++) {
      ordered.push(players[(selfIdx + i) % players.length]);
    }
  } else {
    ordered.push(...players);
  }

  const hasSelf = selfIdx >= 0;
  const opponents = hasSelf ? ordered.slice(1) : ordered;

  if (hasSelf) {
    const self = ordered[0];
    map.set(self.id, {
      stackPos: new THREE.Vector3(-1.76, 0, 1.44),
      betPos: new THREE.Vector3(-0.96, 0, 0.80),
      cardPos: new THREE.Vector3(0, 0, 1.24),
      dealerPos: new THREE.Vector3(0.94, 0, 1.38),
      blindPos: new THREE.Vector3(-1.24, 0, 1.34),
      facingAngle: 0,
    });
  }

  const n = opponents.length;
  const arcStart = n <= 3 ? Math.PI * 1.22 : Math.PI * 0.92;
  const arcEnd = n <= 3 ? Math.PI * 1.78 : Math.PI * 2.08;

  for (let i = 0; i < n; i++) {
    const opp = opponents[i];
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = THREE.MathUtils.lerp(arcStart, arcEnd, t);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const tangentX = -sin;
    const tangentZ = cos;
    const stackOffset = 0.62;

    const cardPos = new THREE.Vector3(cos * 3.12, 0, sin * 1.84);
    const stackPos = new THREE.Vector3(
      cos * 3.38 + tangentX * stackOffset,
      0,
      sin * 1.90 + tangentZ * stackOffset
    );
    const betPos = new THREE.Vector3(
      cos * 2.22 + tangentX * 0.56,
      0,
      sin * 1.30 + tangentZ * 0.42
    );
    const dealerPos = new THREE.Vector3(
      cos * 3.04 - tangentX * 0.64,
      0,
      sin * 1.80 - tangentZ * 0.46
    );
    const blindPos = new THREE.Vector3(
      cos * 2.78 + tangentX * 0.56,
      0,
      sin * 1.58 + tangentZ * 0.44
    );

    const facingAngle = Math.atan2(-cos, -sin);
    map.set(opp.id, { stackPos, betPos, cardPos, dealerPos, blindPos, facingAngle });
  }

  return map;
}

function getCameraGoal(
  preset: CameraPreset,
  aspect: number,
  ambientOnly: boolean
): { pos: THREE.Vector3; target: THREE.Vector3; fov: number } {
  const isPortrait = aspect < 1.05;
  if (ambientOnly) {
    return {
      pos: new THREE.Vector3(0, 5.0, 6.2),
      target: new THREE.Vector3(0, -0.18, 0.1),
      fov: isPortrait ? 48 : 40,
    };
  }
  if (preset === 'overhead') {
    return {
      pos: new THREE.Vector3(0, isPortrait ? 11.2 : 8.2, isPortrait ? 3.1 : 2.35),
      target: new THREE.Vector3(0, 0, isPortrait ? 0.25 : 0.08),
      fov: isPortrait ? 48 : 41,
    };
  }
  return {
    pos: new THREE.Vector3(0, isPortrait ? 9.2 : 5.35, isPortrait ? 7.8 : 5.35),
    target: new THREE.Vector3(0, -0.04, isPortrait ? 0.35 : 0.08),
    fov: isPortrait ? 48 : 42,
  };
}

export function PokerScene3D({
  table,
  myPlayerId,
  cameraPreset = 'classic',
  ambientOnly = false,
  nudgePulse = null,
}: PokerScene3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const propsRef = useRef({ table, myPlayerId, cameraPreset, ambientOnly });
  propsRef.current = { table, myPlayerId, cameraPreset, ambientOnly };

  const syncTableFnRef = useRef<(() => void) | null>(null);
  const cameraGoalFnRef = useRef<(() => void) | null>(null);
  const nudgePulseFnRef = useRef<((targetPlayerId: string) => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const aspect = width / Math.max(1, height);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090b0c);
    scene.fog = new THREE.FogExp2(0x090b0c, 0.042);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    const initGoal = getCameraGoal(
      propsRef.current.cameraPreset,
      aspect,
      propsRef.current.ambientOnly
    );
    const camera = new THREE.PerspectiveCamera(initGoal.fov, aspect, 0.1, 40);
    camera.position.copy(initGoal.pos);
    camera.lookAt(initGoal.target);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(initGoal.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minPolarAngle = 0.22;
    controls.maxPolarAngle = 1.12;
    controls.minDistance = 4.5;
    controls.maxDistance = 13.5;
    controls.enabled = !propsRef.current.ambientOnly;

    let cameraTransitionActive = false;
    const camGoalPos = initGoal.pos.clone();
    const camGoalTarget = initGoal.target.clone();
    let camGoalFov = initGoal.fov;

    let wakeSoftwareLoopFn: (() => void) | null = null;

    controls.addEventListener('start', () => {
      cameraTransitionActive = false;
    });
    controls.addEventListener('change', () => {
      wakeSoftwareLoopFn?.();
    });

    cameraGoalFnRef.current = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const g = getCameraGoal(
        propsRef.current.cameraPreset,
        w / Math.max(1, h),
        propsRef.current.ambientOnly
      );
      camGoalPos.copy(g.pos);
      camGoalTarget.copy(g.target);
      camGoalFov = g.fov;
      cameraTransitionActive = true;
      wakeSoftwareLoopFn?.();
    };

    const hemiLight = new THREE.HemisphereLight(0xb8d4f0, 0x1a1510, 0.52);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(2.4, 7.5, 3.6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 20;
    const d = 6.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0002;
    keyLight.shadow.normalBias = 0.006;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xd4a853, 0.72);
    rimLight.position.set(-4.5, 3.2, -4.5);
    scene.add(rimLight);

    const maxAniso = isSoftwareGl ? 1 : renderer.capabilities.getMaxAnisotropy();
    const textures: ProceduralTexturePack = createProceduralTexturePack(maxAniso);
    const factory: SharedAssetFactory = createSharedAssetFactory(textures, isSoftwareGl);

    const tableModel = buildPokerTableGroup(textures);
    scene.add(tableModel.group);

    const shoeModel = buildDealerShoeGroup(textures, isSoftwareGl);
    shoeModel.group.position.copy(SHOE_WORLD_POS);
    shoeModel.group.position.y = 0;
    shoeModel.group.rotation.y = -0.45;
    scene.add(shoeModel.group);

    const dealerButtonModel = buildDealerButtonGroup(textures.contactShadow);
    dealerButtonModel.group.visible = false;
    scene.add(dealerButtonModel.group);
    const dealerBtnGoal = new THREE.Vector3();

    const sbButtonModel = buildTableMarkerButtonGroup('sb', textures.contactShadow);
    sbButtonModel.group.visible = false;
    scene.add(sbButtonModel.group);
    const sbBtnGoal = new THREE.Vector3();

    const bbButtonModel = buildTableMarkerButtonGroup('bb', textures.contactShadow);
    bbButtonModel.group.visible = false;
    scene.add(bbButtonModel.group);
    const bbBtnGoal = new THREE.Vector3();

    // Active turn felt spotlight halo ring
    const turnRingGeo = new THREE.RingGeometry(0.32, 0.40, 48);
    turnRingGeo.rotateX(-Math.PI / 2);
    const turnRingMat = new THREE.MeshBasicMaterial({
      color: 0xd4a853,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    const turnHaloMesh = new THREE.Mesh(turnRingGeo, turnRingMat);
    turnHaloMesh.position.y = 0.005;
    turnHaloMesh.visible = false;
    scene.add(turnHaloMesh);
    const turnHaloGoal = new THREE.Vector3();

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    const stacks = new Map<string, ChipStackSlot>();
    const communityCardMeshes: (THREE.Mesh | null)[] = [null, null, null, null, null];
    const holeCardMeshes = new Map<string, THREE.Mesh[]>();
    const flyingChips: FlyingChip[] = [];
    const flyingCards: FlyingCard[] = [];
    const impactRings: ImpactRingFx[] = [];
    const knownPlayerIds = new Set<string>();

    function spawnImpactRing(x: number, z: number, scale = 1.0) {
      const mat = new THREE.MeshBasicMaterial({
        map: textures.impactRing,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(factory.impactRingGeometry, mat);
      mesh.position.set(x, 0.004, z);
      mesh.scale.setScalar(0.35 * scale);
      dynamicGroup.add(mesh);
      impactRings.push({
        mesh,
        material: mat,
        elapsed: 0,
        duration: 0.38,
      });
    }

    nudgePulseFnRef.current = (targetPlayerId: string) => {
      const { table: t, myPlayerId: selfId } = propsRef.current;
      if (!t) return;
      const anchors = computeSeatAnchors(t.players, selfId);
      const a = anchors.get(targetPlayerId);
      if (!a) return;
      spawnImpactRing(a.cardPos.x, a.cardPos.z, 1.55);
      spawnImpactRing(a.stackPos.x, a.stackPos.z, 1.25);
      wakeSoftwareLoopFn?.();
    };

    function ensureStackSlot(
      key: string,
      x: number,
      z: number,
      maxCols: number,
      maxPerCol: number,
      animateEntrance = false
    ): ChipStackSlot {
      let slot = stacks.get(key);
      if (!slot) {
        const group = new THREE.Group();
        let enterFrom: THREE.Vector3 | null = null;
        if (animateEntrance) {
          enterFrom = new THREE.Vector3(x * 1.28, 0.28, z * 1.28);
          group.position.copy(enterFrom);
        } else {
          group.position.set(x, 0, z);
        }
        dynamicGroup.add(group);
        slot = {
          group,
          amount: -1,
          isAllIn: false,
          baseX: x,
          baseZ: z,
          maxCols,
          maxPerCol,
          topY: CHIP_HEIGHT / 2,
          chips: [],
          spring: createStackSpringState(),
          springActive: false,
          riseProgress: 1,
          enterFrom,
          enterProgress: animateEntrance ? 0 : 1,
        };
        stacks.set(key, slot);
      } else {
        slot.maxCols = maxCols;
        slot.maxPerCol = maxPerCol;
        slot.baseX = x;
        slot.baseZ = z;
        if (!slot.enterFrom || slot.enterProgress >= 1) {
          slot.group.position.set(x, 0, z);
        }
      }
      return slot;
    }

    function rebuildStackSlot(
      slot: ChipStackSlot,
      amount: number,
      triggerPop = false,
      stackMeta?: { bigBlind?: number; startingChips?: number; isAllIn?: boolean }
    ) {
      const nextAllIn = Boolean(stackMeta?.isAllIn);
      if (slot.amount === amount && slot.isAllIn === nextAllIn) return;
      const grew = amount > slot.amount && slot.amount >= 0;
      slot.amount = amount;
      slot.isAllIn = nextAllIn;

      while (slot.group.children.length > 0) {
        slot.group.remove(slot.group.children[0]);
      }
      slot.chips = [];

      if (amount <= 0) {
        slot.topY = CHIP_HEIGHT / 2;
        return;
      }

      const columns = breakdownChipsForStack(amount, slot.maxCols, slot.maxPerCol);
      const profile = computeChipStackHeightProfile(columns, {
        amount,
        bigBlind: stackMeta?.bigBlind ?? 20,
        startingChips: stackMeta?.startingChips ?? 2000,
        isAllIn: nextAllIn,
        maxColumns: slot.maxCols,
        maxPerColumn: slot.maxPerCol,
        chipHeight: CHIP_HEIGHT,
      });

      const s = CHIP_RADIUS * 2.08;
      const colCount = profile.barrels.length;
      const clusterOffsets: Array<[number, number]> = [];

      // Order offsets back-to-front / center-out so profile.barrels[0] (tallest) forms the rear anchor
      if (colCount === 1) {
        clusterOffsets.push([0, 0]);
      } else if (colCount === 2) {
        clusterOffsets.push([-s * 0.44, -s * 0.14], [s * 0.48, s * 0.16]);
      } else if (colCount === 3) {
        clusterOffsets.push(
          [0, -s * 0.56],
          [-s * 0.53, s * 0.34],
          [s * 0.53, s * 0.34]
        );
      } else {
        const backCount = Math.ceil(colCount / 2);
        const frontCount = colCount - backCount;
        for (let b = 0; b < backCount; b++) {
          clusterOffsets.push([(b - (backCount - 1) / 2) * s * 1.02, -s * 0.48]);
        }
        for (let f = 0; f < frontCount; f++) {
          clusterOffsets.push([(f - (frontCount - 1) / 2) * s * 1.02, s * 0.46]);
        }
      }

      let highestY = CHIP_HEIGHT / 2;

      profile.barrels.forEach((barrel, cIdx) => {
        const [offsetX, offsetZ] = clusterOffsets[cIdx] ?? [0, 0];

        barrel.denoms.forEach((denom, lvl) => {
          const mesh = factory.createChipMesh(denom);
          const jitterX = Math.sin((cIdx + 1) * 7.3 + lvl * 13.7) * 0.0028;
          const jitterZ = Math.cos((cIdx + 1) * 11.1 + lvl * 5.9) * 0.0028;
          const baseY = CHIP_HEIGHT / 2 + lvl * CHIP_HEIGHT;
          const baseX = offsetX + jitterX;
          const baseZ = offsetZ + jitterZ;

          mesh.position.set(baseX, baseY, baseZ);
          mesh.rotation.y = (lvl * 0.78 + cIdx * 1.15) % (Math.PI * 2);
          slot.group.add(mesh);
          slot.chips.push({ mesh, baseX, baseY, baseZ, level: lvl });
          if (baseY > highestY) highestY = baseY;
        });
      });

      slot.topY = highestY + CHIP_HEIGHT;
      if (triggerPop || grew) {
        slot.riseProgress = 0.32;
        applyStackCollisionImpulse(slot.spring, nextAllIn ? 1.15 : 0.78, 0.15, -0.15);
        slot.springActive = true;
      }
    }

    function launchChipPhysics(
      from: THREE.Vector3,
      to: THREE.Vector3,
      targetStackKey: string,
      amountDiff: number,
      delayOffset: number = 0,
      mode: ChipMotionMode = 'push',
      isAllInPush = false
    ) {
      const maxCols = isAllInPush ? 3 : 2;
      const maxPerCol = isAllInPush ? 6 : 5;
      const denoms = breakdownChipsForStack(amountDiff, maxCols, maxPerCol).flat();
      const desiredCount = isAllInPush ? 12 : amountDiff >= 500 ? 8 : amountDiff >= 100 ? 6 : 3;
      const count = Math.min(12, Math.max(2, Math.max(denoms.length, desiredCount)));
      const fallbackDenoms: ChipDenom[] = [100, 25, 5, 500, 1000];

      const dirX = to.x - from.x;
      const dirZ = to.z - from.z;
      const dist = Math.max(0.001, Math.hypot(dirX, dirZ));
      const perpX = -dirZ / dist;
      const perpZ = dirX / dist;

      for (let i = 0; i < count; i++) {
        const denom = denoms[i] ?? fallbackDenoms[i % fallbackDenoms.length];
        const mesh = factory.createChipMesh(denom);
        const laneSpread = ((i % 3) - 1) * (mode === 'push' ? 0.085 : 0.032);
        const stackLayer = Math.floor(i / 3);
        const startPos = _scratchVecA.copy(from);
        startPos.x += perpX * laneSpread;
        startPos.z += perpZ * laneSpread;
        startPos.y = Math.max(CHIP_HEIGHT / 2, from.y - stackLayer * CHIP_HEIGHT * 0.65);

        mesh.position.copy(startPos);
        mesh.visible = false;
        dynamicGroup.add(mesh);

        const scatterR = mode === 'push' ? 0.065 : 0.09;
        const targetX = to.x + perpX * laneSpread * 0.72 + (Math.sin(i * 4.7) * 0.5) * scatterR;
        const targetZ = to.z + perpZ * laneSpread * 0.72 + (Math.cos(i * 6.3) * 0.5) * scatterR;
        const targetY = Math.max(CHIP_HEIGHT / 2, to.y + stackLayer * CHIP_HEIGHT * 0.85);

        const body = createChipPhysicsBody({
          mode,
          fromX: startPos.x,
          fromY: startPos.y,
          fromZ: startPos.z,
          toX: targetX,
          toY: targetY,
          toZ: targetZ,
          delay: delayOffset + (mode === 'push' ? i * 0.026 : i * 0.044),
          spinX: mode === 'push' ? (Math.sin(i * 2.1) * 0.5) : (Math.random() - 0.5) * 12,
          spinZ: mode === 'push' ? (Math.cos(i * 2.9) * 0.5) : (Math.random() - 0.5) * 12,
          yaw: (i * 0.85) % (Math.PI * 2),
        });

        flyingChips.push({
          mesh,
          body,
          targetStackKey,
        });
      }
    }

    function launchCardDeal(
      card: Card | null,
      to: THREE.Vector3,
      targetRotY: number,
      flipToFaceUp: boolean,
      delay: number,
      onLand?: () => void
    ) {
      const mesh = factory.createCardMesh(card);
      mesh.position.copy(SHOE_WORLD_POS);
      mesh.rotation.set(0, -0.45, Math.PI);
      mesh.visible = false;
      dynamicGroup.add(mesh);

      flyingCards.push({
        mesh,
        from: SHOE_WORLD_POS.clone(),
        to: to.clone(),
        targetRotY,
        flipToFaceUp,
        elapsed: 0,
        delay,
        duration: 0.22,
        slapTime: 0,
        landed: false,
        onLand,
      });
    }

    let prevHandNumber = -1;
    let prevPhase = 'waiting';
    let prevCommunityCount = 0;
    const prevPlayerBets = new Map<string, number>();
    const prevPlayerChips = new Map<string, number>();

    function buildAmbientTableState() {
      const potSlot = ensureStackSlot('pot', POT_WORLD_POS.x, POT_WORLD_POS.z, 6, 13);
      rebuildStackSlot(potSlot, 1850, false);

      const sampleSeats = [
        new THREE.Vector3(-1.55, 0, 1.48),
        new THREE.Vector3(-3.35, 0, -0.24),
        new THREE.Vector3(0, 0, -1.78),
        new THREE.Vector3(3.35, 0, -0.24),
      ];
      sampleSeats.forEach((pt, idx) => {
        const s = ensureStackSlot(`ambient-${idx}`, pt.x, pt.z, 3, 10);
        rebuildStackSlot(s, 1200 + idx * 425, false);
      });

      const sampleBoard: Card[] = [
        { suit: 'spades', rank: 14 },
        { suit: 'hearts', rank: 13 },
        { suit: 'spades', rank: 11 },
      ];
      sampleBoard.forEach((c, idx) => {
        const m = factory.createCardMesh(c);
        m.position.set(COMMUNITY_SLOTS_X[idx], CARD_HEIGHT / 2 + 0.008, COMMUNITY_Z);
        m.rotation.set(0, 0, 0);
        dynamicGroup.add(m);
        communityCardMeshes[idx] = m;
      });

      dealerButtonModel.group.position.set(-0.85, 0, 1.38);
      dealerButtonModel.group.visible = true;
      dealerBtnGoal.set(-0.85, 0, 1.38);

      sbButtonModel.group.position.set(-2.65, 0, -0.18);
      sbButtonModel.group.visible = true;
      sbBtnGoal.set(-2.65, 0, -0.18);

      bbButtonModel.group.position.set(0.65, 0, -1.62);
      bbButtonModel.group.visible = true;
      bbBtnGoal.set(0.65, 0, -1.62);
    }

    if (propsRef.current.ambientOnly) {
      buildAmbientTableState();
    }

    let wasAmbient = propsRef.current.ambientOnly;

    function clearDynamicTable() {
      stacks.forEach((s) => dynamicGroup.remove(s.group));
      stacks.clear();
      for (let i = 0; i < 5; i++) {
        if (communityCardMeshes[i]) {
          dynamicGroup.remove(communityCardMeshes[i]!);
          communityCardMeshes[i] = null;
        }
      }
      holeCardMeshes.forEach((arr) => arr.forEach((m) => dynamicGroup.remove(m)));
      holeCardMeshes.clear();
      flyingChips.forEach((f) => dynamicGroup.remove(f.mesh));
      flyingChips.length = 0;
      flyingCards.forEach((fc) => dynamicGroup.remove(fc.mesh));
      flyingCards.length = 0;
      dealerButtonModel.group.visible = false;
      sbButtonModel.group.visible = false;
      bbButtonModel.group.visible = false;
      turnHaloMesh.visible = false;
      knownPlayerIds.clear();
      prevHandNumber = -1;
      prevPhase = 'waiting';
      prevCommunityCount = 0;
      prevPlayerBets.clear();
      prevPlayerChips.clear();
    }

    syncTableFnRef.current = () => {
      const { table: t, myPlayerId: selfId, ambientOnly: isAmbient } = propsRef.current;

      if (isAmbient !== wasAmbient) {
        wasAmbient = isAmbient;
        clearDynamicTable();
        controls.enabled = !isAmbient;
        if (isAmbient) {
          buildAmbientTableState();
          return;
        }
      }

      if (isAmbient || !t) return;

      const anchors = computeSeatAnchors(t.players, selfId);
      const isNewHand = t.handNumber > prevHandNumber && prevHandNumber !== -1;
      const activeStackKeys = new Set<string>(['pot']);

      // 1. Physical 3D Dealer (D 庄), Small Blind (SB 小盲), and Big Blind (BB 大盲) Pucks on Felt
      const showPreviewBlinds = t.phase === 'waiting';
      const activeDealerSeat = showPreviewBlinds
        ? t.previewNextBlinds.dealerSeatIndex
        : t.dealerSeatIndex;
      const activeSbSeat = showPreviewBlinds
        ? t.previewNextBlinds.smallBlindSeatIndex
        : t.smallBlindSeatIndex;
      const activeBbSeat = showPreviewBlinds
        ? t.previewNextBlinds.bigBlindSeatIndex
        : t.bigBlindSeatIndex;

      const dealerPlayer =
        activeDealerSeat !== null && activeDealerSeat >= 0
          ? t.players.find((p) => p.seatIndex === activeDealerSeat)
          : undefined;
      if (dealerPlayer && anchors.has(dealerPlayer.id)) {
        const dp = anchors.get(dealerPlayer.id)!.dealerPos;
        if (!dealerButtonModel.group.visible) {
          dealerButtonModel.group.position.set(dp.x, 0, dp.z);
          dealerButtonModel.group.visible = true;
        }
        dealerBtnGoal.set(dp.x, 0, dp.z);
      } else {
        dealerButtonModel.group.visible = false;
      }

      const sbPlayer =
        activeSbSeat !== null && activeSbSeat >= 0
          ? t.players.find((p) => p.seatIndex === activeSbSeat)
          : undefined;
      if (sbPlayer && anchors.has(sbPlayer.id)) {
        const sp = anchors.get(sbPlayer.id)!.blindPos;
        if (!sbButtonModel.group.visible) {
          sbButtonModel.group.position.set(sp.x, 0, sp.z);
          sbButtonModel.group.visible = true;
        }
        sbBtnGoal.set(sp.x, 0, sp.z);
      } else {
        sbButtonModel.group.visible = false;
      }

      const bbPlayer =
        activeBbSeat !== null && activeBbSeat >= 0
          ? t.players.find((p) => p.seatIndex === activeBbSeat)
          : undefined;
      if (bbPlayer && anchors.has(bbPlayer.id)) {
        const bp = anchors.get(bbPlayer.id)!.blindPos;
        if (!bbButtonModel.group.visible) {
          bbButtonModel.group.position.set(bp.x, 0, bp.z);
          bbButtonModel.group.visible = true;
        }
        bbBtnGoal.set(bp.x, 0, bp.z);
      } else {
        bbButtonModel.group.visible = false;
      }

      // Active Turn 3D Halo Target
      if (t.currentTurnPlayerId && anchors.has(t.currentTurnPlayerId)) {
        const tp = anchors.get(t.currentTurnPlayerId)!.cardPos;
        if (!turnHaloMesh.visible) {
          turnHaloMesh.position.set(tp.x, 0.005, tp.z);
          turnHaloMesh.visible = true;
        }
        turnHaloGoal.set(tp.x, 0.005, tp.z);
      } else {
        turnHaloMesh.visible = false;
      }

      // 2. Sync each player's personal chip stack & bet chip stack
      let betAudioQueued = false;
      const hasInitializedRoom = knownPlayerIds.size > 0;
      const anyAllInInHand = t.players.some((p) => p.allIn && p.inHand && !p.folded);

      for (const p of t.players) {
        const a = anchors.get(p.id);
        if (!a) continue;

        const isNewlyJoined = hasInitializedRoom && !knownPlayerIds.has(p.id);
        knownPlayerIds.add(p.id);

        const seatKey = `seat:${p.id}`;
        const betKey = `bet:${p.id}`;
        activeStackKeys.add(seatKey);
        activeStackKeys.add(betKey);

        const seatSlot = ensureStackSlot(
          seatKey,
          a.stackPos.x,
          a.stackPos.z,
          3,
          12,
          isNewlyJoined
        );
        if (isNewlyJoined) {
          soundFx.playChipStackTap(260);
        }
        const prevChips = prevPlayerChips.get(p.id);
        const gainedChips = prevChips !== undefined && p.chips > prevChips;
        rebuildStackSlot(seatSlot, p.chips, gainedChips, {
          bigBlind: t.bigBlind,
          startingChips: t.startingChips,
          isAllIn: p.chips >= t.startingChips * 1.4,
        });

        const betCols = p.allIn ? 4 : 3;
        const betPerCol = p.allIn ? 14 : 11;
        const betSlot = ensureStackSlot(betKey, a.betPos.x, a.betPos.z, betCols, betPerCol);
        const oldBet = prevPlayerBets.get(p.id) ?? 0;

        if (prevHandNumber !== -1 && p.currentBet > oldBet) {
          const added = p.currentBet - oldBet;
          const fromPos = seatSlot.group.position.clone();
          fromPos.y = Math.max(CHIP_HEIGHT, seatSlot.topY);
          const toPos = betSlot.group.position.clone();
          toPos.y = Math.max(CHIP_HEIGHT, betSlot.topY);

          const isPushBet = p.allIn || added >= t.bigBlind * 2;
          launchChipPhysics(
            fromPos,
            toPos,
            betKey,
            added,
            0,
            isPushBet ? 'push' : 'throw',
            p.allIn
          );
          if (!betAudioQueued) {
            betAudioQueued = true;
            soundFx.playChipBet(added, 260);
            soundFx.playChipStackTap(340);
          }
        }
        const betDisplayAmount = t.phase === 'showdown' ? 0 : p.currentBet;
        rebuildStackSlot(betSlot, betDisplayAmount, betDisplayAmount > oldBet, {
          bigBlind: t.bigBlind,
          startingChips: t.startingChips,
          isAllIn: p.allIn,
        });
      }

      // 3. Street transition: physics push-in sweep from bet stacks into center pot
      const potMaxPerCol = anyAllInInHand ? 12 : 11;
      const potSlot = ensureStackSlot('pot', POT_WORLD_POS.x, POT_WORLD_POS.z, 6, potMaxPerCol);
      if (
        prevHandNumber !== -1 &&
        t.phase !== prevPhase &&
        (prevPhase === 'preflop' || prevPhase === 'flop' || prevPhase === 'turn')
      ) {
        let anySwept = false;
        let sweepIndex = 0;
        prevPlayerBets.forEach((oldBet, pid) => {
          if (oldBet > 0 && anchors.has(pid)) {
            anySwept = true;
            const fromBet = anchors.get(pid)!.betPos.clone();
            fromBet.y = CHIP_HEIGHT * 1.5;
            const toPot = POT_WORLD_POS.clone();
            toPot.y = Math.max(CHIP_HEIGHT, potSlot.topY);
            launchChipPhysics(
              fromBet,
              toPot,
              'pot',
              oldBet,
              0.03 + sweepIndex * 0.035,
              'push',
              oldBet >= t.startingChips * 0.5
            );
            sweepIndex++;
          }
        });
        if (anySwept) {
          soundFx.playPotSweep();
        }
      }

      // 4. Showdown payout: push pot chips out to winner's personal stack & clear center pot tower
      const isShowdownAwarded = t.phase === 'showdown' && t.winners.length > 0;
      const potDisplayAmount = isShowdownAwarded ? 0 : t.pot;
      if (
        prevHandNumber !== -1 &&
        isShowdownAwarded &&
        prevPhase !== 'showdown'
      ) {
        for (const w of t.winners) {
          const wa = anchors.get(w.playerId);
          if (wa) {
            const toSeat = wa.stackPos.clone();
            toSeat.y = CHIP_HEIGHT * 2.5;
            launchChipPhysics(
              new THREE.Vector3(POT_WORLD_POS.x, Math.max(0.12, potSlot.topY), POT_WORLD_POS.z),
              toSeat,
              `seat:${w.playerId}`,
              w.amount,
              0.06,
              'push',
              w.amount >= t.startingChips * 0.6
            );
          }
        }
      }
      rebuildStackSlot(
        potSlot,
        potDisplayAmount,
        potDisplayAmount > potSlot.amount && potSlot.amount >= 0,
        {
          bigBlind: t.bigBlind,
          startingChips: t.startingChips,
          isAllIn: anyAllInInHand || potDisplayAmount >= t.startingChips * 1.2,
        }
      );

      for (const key of Array.from(stacks.keys())) {
        if (!activeStackKeys.has(key)) {
          const oldSlot = stacks.get(key)!;
          dynamicGroup.remove(oldSlot.group);
          stacks.delete(key);
        }
      }

      // 5. Hole cards on felt
      const currentPlayerIds = new Set(t.players.map((p) => p.id));
      for (const pid of Array.from(holeCardMeshes.keys())) {
        if (!currentPlayerIds.has(pid) || isNewHand || t.phase === 'waiting') {
          holeCardMeshes.get(pid)!.forEach((m) => dynamicGroup.remove(m));
          holeCardMeshes.delete(pid);
        }
      }

      if (isNewHand) {
        soundFx.playShuffle();
      }

      if (t.phase !== 'waiting') {
        let dealOrder = 0;
        for (const p of t.players) {
          const a = anchors.get(p.id);
          if (!a) continue;
          const existingCards = holeCardMeshes.get(p.id);

          // Keep revealed folded player's hole cards visible at showdown if they clicked 亮牌
          const hideFoldedCards = p.folded && !(t.phase === 'showdown' && p.revealed);
          if (!p.inHand || hideFoldedCards) {
            if (existingCards) {
              existingCards.forEach((m) => dynamicGroup.remove(m));
              holeCardMeshes.delete(p.id);
            }
            continue;
          }

          const rightX = Math.cos(a.facingAngle);
          const rightZ = -Math.sin(a.facingAngle);
          const isSelfCard = p.id === selfId;

          if (!existingCards || existingCards.length !== p.cardCount) {
            if (existingCards) {
              existingCards.forEach((m) => dynamicGroup.remove(m));
            }
            const created: THREE.Mesh[] = [];
            for (let c = 0; c < p.cardCount; c++) {
              const cardData = p.holeCards?.[c] ?? null;
              const isFaceUp = Boolean(
                cardData && (p.id === selfId || p.revealed || t.phase === 'showdown')
              );
              const cardScale = isSelfCard || isFaceUp ? 1.0 : 0.84;
              const cardSpacing = isSelfCard || isFaceUp ? 0.48 : 0.39;
              const offset = (c - (p.cardCount - 1) / 2) * cardSpacing;
              const tiltX = isSelfCard && isFaceUp ? 0.11 : 0;
              const targetY =
                CARD_HEIGHT / 2 + (isSelfCard && isFaceUp ? 0.024 : 0.006) + c * 0.002;
              const target = new THREE.Vector3(
                a.cardPos.x + rightX * offset,
                targetY,
                a.cardPos.z + rightZ * offset
              );

              if (isNewHand) {
                const delay = 0.14 + dealOrder * 0.055;
                soundFx.playCardSnap(delay * 1000, 'hole');
                dealOrder++;
                const placeholder = factory.createCardMesh(cardData);
                placeholder.position.copy(target);
                placeholder.rotation.set(tiltX, a.facingAngle, isFaceUp ? 0 : Math.PI);
                placeholder.scale.setScalar(cardScale);
                placeholder.visible = false;
                dynamicGroup.add(placeholder);
                created.push(placeholder);

                launchCardDeal(
                  cardData,
                  target,
                  a.facingAngle,
                  isFaceUp,
                  delay,
                  () => {
                    placeholder.visible = true;
                  }
                );
              } else {
                const m = factory.createCardMesh(cardData);
                m.position.copy(target);
                m.rotation.set(tiltX, a.facingAngle, isFaceUp ? 0 : Math.PI);
                m.scale.setScalar(cardScale);
                dynamicGroup.add(m);
                created.push(m);
              }
            }
            holeCardMeshes.set(p.id, created);
          } else {
            existingCards.forEach((m, c) => {
              const cardData = p.holeCards?.[c] ?? null;
              const isFaceUp = Boolean(
                cardData && (p.id === selfId || p.revealed || t.phase === 'showdown')
              );
              const cardScale = isSelfCard || isFaceUp ? 1.0 : 0.84;
              const cardSpacing = isSelfCard || isFaceUp ? 0.48 : 0.39;
              const offset = (c - (existingCards.length - 1) / 2) * cardSpacing;
              const tiltX = isSelfCard && isFaceUp ? 0.11 : 0;
              const targetY =
                CARD_HEIGHT / 2 + (isSelfCard && isFaceUp ? 0.024 : 0.006) + c * 0.002;
              m.position.set(
                a.cardPos.x + rightX * offset,
                targetY,
                a.cardPos.z + rightZ * offset
              );
              m.material = factory.getCardMaterials(cardData);
              m.rotation.set(tiltX, a.facingAngle, isFaceUp ? 0 : Math.PI);
              m.scale.setScalar(cardScale);
            });
          }
        }
      }

      // 6. Community Cards (5 slots centered on felt, stage-aware audio)
      if (t.communityCards.length < prevCommunityCount || isNewHand) {
        for (let i = 0; i < 5; i++) {
          const old = communityCardMeshes[i];
          if (old) {
            dynamicGroup.remove(old);
            communityCardMeshes[i] = null;
          }
        }
      }

      for (let i = 0; i < t.communityCards.length; i++) {
        const card = t.communityCards[i];
        if (!communityCardMeshes[i]) {
          const target = new THREE.Vector3(
            COMMUNITY_SLOTS_X[i],
            CARD_HEIGHT / 2 + 0.006,
            COMMUNITY_Z
          );
          const shouldAnimate = prevHandNumber !== -1 && i >= prevCommunityCount;
          if (shouldAnimate) {
            const delay = (i - prevCommunityCount) * 0.06;
            const stage: DealStage = i < 3 ? 'flop' : i === 3 ? 'turn' : 'river';
            soundFx.playCardSnap(delay * 1000, stage);
            const settledMesh = factory.createCardMesh(card);
            settledMesh.position.copy(target);
            settledMesh.rotation.set(0, 0, 0);
            settledMesh.visible = false;
            dynamicGroup.add(settledMesh);
            communityCardMeshes[i] = settledMesh;

            launchCardDeal(card, target, 0, true, delay, () => {
              settledMesh.visible = true;
            });
          } else {
            const m = factory.createCardMesh(card);
            m.position.copy(target);
            m.rotation.set(0, 0, 0);
            dynamicGroup.add(m);
            communityCardMeshes[i] = m;
          }
        }
      }

      prevHandNumber = t.handNumber;
      prevPhase = t.phase;
      prevCommunityCount = t.communityCards.length;
      prevPlayerBets.clear();
      prevPlayerChips.clear();
      for (const p of t.players) {
        prevPlayerBets.set(p.id, p.currentBet);
        prevPlayerChips.set(p.id, p.chips);
      }

      if (isSoftwareGl) {
        wakeSoftwareLoopFn?.();
      }
    };

    syncTableFnRef.current();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      cameraGoalFnRef.current?.();
    };
    window.addEventListener('resize', onResize);

    const startTimeMs = performance.now();
    let lastTimeMs = startTimeMs;
    let frameId = 0;
    let softwareTimerId = 0;
    let softwareDrawInFlight = false;
    let softwareDirty = false;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (!sync) {
        softwareTimerId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const startedAt = performance.now();
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED && performance.now() - startedAt < 2500) {
          softwareTimerId = window.setTimeout(poll, 12);
        } else {
          gl.deleteSync(sync);
          softwareTimerId = window.setTimeout(cb, 80);
        }
      };
      softwareTimerId = window.setTimeout(poll, 12);
    }

    function scheduleSoftwareTick(delayMs: number) {
      if (disposed || softwareTimerId !== 0 || softwareDrawInFlight) return;
      softwareTimerId = window.setTimeout(() => {
        softwareTimerId = 0;
        tick();
      }, delayMs);
    }

    wakeSoftwareLoopFn = () => {
      if (!isSoftwareGl || disposed) return;
      if (softwareDrawInFlight) {
        softwareDirty = true;
        return;
      }
      if (softwareTimerId !== 0) {
        clearTimeout(softwareTimerId);
        softwareTimerId = 0;
      }
      scheduleSoftwareTick(16);
    };

    function tick() {
      if (disposed) return;
      if (isSoftwareGl && softwareDrawInFlight) {
        softwareDirty = true;
        return;
      }
      const nowMs = performance.now();
      const rawDt = Math.max(0, (nowMs - lastTimeMs) / 1000);
      lastTimeMs = nowMs;
      const dt = Math.min(rawDt, isSoftwareGl ? 0.25 : 0.05);
      const elapsedTotal = (nowMs - startTimeMs) / 1000;

      if (propsRef.current.ambientOnly) {
        camera.position.x = Math.sin(elapsedTotal * 0.16) * 1.25;
        camera.position.z = 6.2 + Math.cos(elapsedTotal * 0.14) * 0.4;
        camera.lookAt(0, -0.15, 0.1);
      } else {
        if (cameraTransitionActive) {
          const alpha = 1 - Math.exp(-6.5 * dt);
          camera.position.lerp(camGoalPos, alpha);
          controls.target.lerp(camGoalTarget, alpha);
          camera.fov = THREE.MathUtils.lerp(camera.fov, camGoalFov, alpha);
          camera.updateProjectionMatrix();
          if (
            camera.position.distanceToSquared(camGoalPos) < 0.0005 &&
            controls.target.distanceToSquared(camGoalTarget) < 0.0005
          ) {
            cameraTransitionActive = false;
          }
        }
        controls.update();
      }

      if (dealerButtonModel.group.visible) {
        const dAlpha = 1 - Math.exp(-10 * dt);
        dealerButtonModel.group.position.lerp(dealerBtnGoal, dAlpha);
      }
      if (sbButtonModel.group.visible) {
        const sbAlpha = 1 - Math.exp(-10 * dt);
        sbButtonModel.group.position.lerp(sbBtnGoal, sbAlpha);
      }
      if (bbButtonModel.group.visible) {
        const bbAlpha = 1 - Math.exp(-10 * dt);
        bbButtonModel.group.position.lerp(bbBtnGoal, bbAlpha);
      }

      if (turnHaloMesh.visible) {
        const hAlpha = 1 - Math.exp(-12 * dt);
        turnHaloMesh.position.lerp(turnHaloGoal, hAlpha);
        const pulse = 1 + Math.sin(elapsedTotal * 5.0) * 0.08;
        turnHaloMesh.scale.setScalar(pulse);
        turnRingMat.opacity = 0.42 + Math.sin(elapsedTotal * 5.0) * 0.2;
      }

      // Stack Entrance Glide + Height Rise + Second-Order Spring Collision Compression
      let hasStackAnim = false;
      stacks.forEach((slot) => {
        if (slot.enterFrom && slot.enterProgress < 1) {
          hasStackAnim = true;
          slot.enterProgress = Math.min(1, slot.enterProgress + dt * 2.2);
          const ease = 1 - Math.pow(1 - slot.enterProgress, 3);
          slot.group.position.set(
            THREE.MathUtils.lerp(slot.enterFrom.x, slot.baseX, ease),
            THREE.MathUtils.lerp(slot.enterFrom.y, 0, ease),
            THREE.MathUtils.lerp(slot.enterFrom.z, slot.baseZ, ease)
          );
          if (slot.enterProgress >= 1) {
            slot.enterFrom = null;
            applyStackCollisionImpulse(slot.spring, 0.72, 0.12, 0.08);
            slot.springActive = true;
          }
        }

        if (slot.riseProgress < 1) {
          hasStackAnim = true;
          slot.riseProgress = Math.min(1, slot.riseProgress + dt * 4.6);
          slot.group.scale.y = 0.28 + 0.72 * (1 - Math.pow(1 - slot.riseProgress, 2));
        } else {
          slot.group.scale.y = 1;
        }

        if (slot.springActive) {
          hasStackAnim = true;
          const stillActive = stepStackSpringPhysics(slot.spring, dt);
          slot.springActive = stillActive;
          const chipCount = Math.max(1, slot.chips.length);
          const comp = Math.max(-0.08, Math.min(0.16, slot.spring.compression));

          for (const chip of slot.chips) {
            const topWeight = (chip.level + 1) / chipCount;
            chip.mesh.position.y = Math.max(
              CHIP_HEIGHT * 0.45,
              chip.baseY * (1 - 0.55 * comp)
            );
            chip.mesh.position.x = chip.baseX + slot.spring.lateralX * topWeight;
            chip.mesh.position.z = chip.baseZ + slot.spring.lateralZ * topWeight;
          }
          if (!stillActive) {
            for (const chip of slot.chips) {
              chip.mesh.position.set(chip.baseX, chip.baseY, chip.baseZ);
            }
          }
        }
      });

      // Physics-Driven Chip Push-In & Ballistic Pot Collision Bounce
      let potClinkPlayedThisFrame = false;
      for (let i = flyingChips.length - 1; i >= 0; i--) {
        const f = flyingChips[i];
        const step = stepChipPhysicsBody(f.body, dt);
        if (!step.active) continue;

        f.mesh.visible = true;
        f.mesh.position.set(f.body.x, f.body.y, f.body.z);
        f.mesh.rotation.set(f.body.pitchTilt, f.body.yaw, f.body.rollTilt);

        if (step.collided) {
          const targetSlot = stacks.get(f.targetStackKey);
          if (targetSlot) {
            const dx = f.body.targetX - f.body.startX;
            const dz = f.body.targetZ - f.body.startZ;
            const len = Math.max(0.01, Math.hypot(dx, dz));
            applyStackCollisionImpulse(
              targetSlot.spring,
              step.collisionIntensity,
              dx / len,
              dz / len
            );
            targetSlot.springActive = true;
          }
          spawnImpactRing(
            f.body.targetX,
            f.body.targetZ,
            f.targetStackKey === 'pot' ? 1.28 : 0.92
          );
          if (f.targetStackKey === 'pot' && !potClinkPlayedThisFrame) {
            potClinkPlayedThisFrame = true;
            soundFx.playChipStackTap(0);
          }
        }

        if (step.settled) {
          dynamicGroup.remove(f.mesh);
          flyingChips.splice(i, 1);
        }
      }

      // Card Dealing Flights + Anisotropic Specular Flip Tilt & Felt Slap Bounce
      for (let i = flyingCards.length - 1; i >= 0; i--) {
        const fc = flyingCards[i];
        fc.elapsed += dt;
        const activeT = fc.elapsed - fc.delay;
        if (activeT < 0) continue;

        fc.mesh.visible = true;
        if (!fc.landed) {
          const p = Math.min(1, activeT / fc.duration);
          const ease = 1 - Math.pow(1 - p, 2.4);

          _scratchVecB.lerpVectors(fc.from, fc.to, ease);
          _scratchVecB.y += Math.sin(p * Math.PI) * 0.25;
          fc.mesh.position.copy(_scratchVecB);

          fc.mesh.rotation.y = THREE.MathUtils.lerp(-0.45, fc.targetRotY, ease);
          if (fc.flipToFaceUp) {
            const flipP = THREE.MathUtils.smoothstep(p, 0.2, 0.88);
            fc.mesh.rotation.z = THREE.MathUtils.lerp(Math.PI, 0, flipP);
          } else {
            fc.mesh.rotation.z = Math.PI;
          }
          // Subtle aerodynamic bank angle to sweep light across anisotropic beveled edges
          fc.mesh.rotation.x = Math.sin(p * Math.PI) * 0.22;

          if (p >= 1) {
            fc.landed = true;
            fc.slapTime = 0;
            spawnImpactRing(fc.to.x, fc.to.z, 0.72);
          }
        } else {
          fc.slapTime += dt;
          const slapDuration = 0.12;
          if (fc.slapTime < slapDuration) {
            const sp = fc.slapTime / slapDuration;
            const bounce = Math.sin(sp * Math.PI) * Math.exp(-4 * sp) * 0.032;
            fc.mesh.position.set(fc.to.x, fc.to.y + bounce, fc.to.z);
            fc.mesh.rotation.x = Math.sin(sp * Math.PI) * 0.065;
          } else {
            fc.onLand?.();
            dynamicGroup.remove(fc.mesh);
            flyingCards.splice(i, 1);
          }
        }
      }

      for (let i = impactRings.length - 1; i >= 0; i--) {
        const r = impactRings[i];
        r.elapsed += dt;
        const p = Math.min(1, r.elapsed / r.duration);
        const s = 0.4 + p * 1.45;
        r.mesh.scale.setScalar(s);
        r.material.opacity = (1 - p) * 0.8;
        if (p >= 1) {
          dynamicGroup.remove(r.mesh);
          r.material.dispose();
          impactRings.splice(i, 1);
        }
      }

      if (isSoftwareGl) {
        softwareDrawInFlight = true;
      }
      renderer.render(scene, camera);
      if (isSoftwareGl) {
        const dealerMoving =
          dealerButtonModel.group.visible &&
          dealerButtonModel.group.position.distanceToSquared(dealerBtnGoal) > 0.0004;
        const sbMoving =
          sbButtonModel.group.visible &&
          sbButtonModel.group.position.distanceToSquared(sbBtnGoal) > 0.0004;
        const bbMoving =
          bbButtonModel.group.visible &&
          bbButtonModel.group.position.distanceToSquared(bbBtnGoal) > 0.0004;
        const hasActiveMotion =
          flyingCards.length > 0 ||
          flyingChips.length > 0 ||
          impactRings.length > 0 ||
          cameraTransitionActive ||
          hasStackAnim ||
          dealerMoving ||
          sbMoving ||
          bbMoving;
        afterDraw(() => {
          softwareDrawInFlight = false;
          if (disposed) return;
          if (softwareDirty || hasActiveMotion) {
            softwareDirty = false;
            tick();
          }
        });
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      softwareDrawInFlight = true;
      renderer.render(scene, camera);
      afterDraw(() => {
        softwareDrawInFlight = false;
        if (!disposed && softwareDirty) {
          softwareDirty = false;
          tick();
        }
      });
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(softwareTimerId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      impactRings.forEach((r) => r.material.dispose());
      turnRingGeo.dispose();
      turnRingMat.dispose();
      controls.dispose();
      tableModel.dispose();
      shoeModel.dispose();
      dealerButtonModel.dispose();
      sbButtonModel.dispose();
      bbButtonModel.dispose();
      factory.dispose();
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    syncTableFnRef.current?.();
  }, [table, myPlayerId, ambientOnly]);

  useEffect(() => {
    cameraGoalFnRef.current?.();
  }, [cameraPreset, ambientOnly]);

  useEffect(() => {
    if (nudgePulse?.targetPlayerId) {
      nudgePulseFnRef.current?.(nudgePulse.targetPlayerId);
    }
  }, [nudgePulse]);

  return (
    <div className="pointer-events-auto absolute inset-0 overflow-hidden bg-[#090B0C]">
      <div ref={mountRef} className="h-full w-full" aria-label="Three.js 3D 德州扑克桌面" />
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#090B0C]/90 text-sm text-[#D4A853]">
          正在恢复 3D 桌面渲染上下文…
        </div>
      )}
    </div>
  );
}
