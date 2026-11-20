import * as THREE from 'three';
import type { Card, Rank, Suit } from '../shared/types';

export type ChipDenom = 5 | 25 | 100 | 500 | 1000;

interface ChipPalette {
  base: string;
  stripe: string;
  trim: string;
  inlay: string;
  inlayEdge: string;
  text: string;
}

const CHIP_PALETTES: Record<ChipDenom, ChipPalette> = {
  5: {
    base: '#B32026',
    stripe: '#F7F3E9',
    trim: '#D8A94E',
    inlay: '#FAF7EF',
    inlayEdge: '#E7DFCE',
    text: '#8D1319',
  },
  25: {
    base: '#0D6B44',
    stripe: '#F5F1E6',
    trim: '#8AD2A6',
    inlay: '#FAF7EF',
    inlayEdge: '#E4DDD0',
    text: '#094E31',
  },
  100: {
    base: '#191D23',
    stripe: '#E2B459',
    trim: '#F6F1E4',
    inlay: '#F9F6EE',
    inlayEdge: '#E5DEC9',
    text: '#13161B',
  },
  500: {
    base: '#5A2B7E',
    stripe: '#EFCE88',
    trim: '#C49BE6',
    inlay: '#FAF7EF',
    inlayEdge: '#E5DDD0',
    text: '#411C5E',
  },
  1000: {
    base: '#CFA03D',
    stripe: '#17191E',
    trim: '#FFF8E8',
    inlay: '#FCF9F1',
    inlayEdge: '#E6DEC9',
    text: '#14161A',
  },
};

const RANK_LABELS: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

export interface ProceduralTexturePack {
  feltColor: THREE.CanvasTexture;
  feltBump: THREE.CanvasTexture;
  woodColor: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  leatherColor: THREE.CanvasTexture;
  cardBack: THREE.CanvasTexture;
  cardLinenBump: THREE.CanvasTexture;
  cardRoughness: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  cardDropShadow: THREE.CanvasTexture;
  impactRing: THREE.CanvasTexture;
  chipTextures: Record<
    ChipDenom,
    {
      top: THREE.CanvasTexture;
      side: THREE.CanvasTexture;
      topBump: THREE.CanvasTexture;
      sideBump: THREE.CanvasTexture;
    }
  >;
  getCardFace: (card: Card) => THREE.CanvasTexture;
  dispose: () => void;
}

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  maxAniso: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

function finalizeDataTexture(
  canvas: HTMLCanvasElement,
  maxAniso: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

function drawSuitPath(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  cx: number,
  cy: number,
  r: number,
  inverted: boolean = false
) {
  ctx.save();
  ctx.translate(cx, cy);
  if (inverted) ctx.rotate(Math.PI);

  ctx.beginPath();
  if (suit === 'spades') {
    ctx.moveTo(0, -r * 1.02);
    ctx.bezierCurveTo(-r * 0.25, -r * 0.55, -r * 0.98, -r * 0.1, -r * 0.92, r * 0.34);
    ctx.bezierCurveTo(-r * 0.88, r * 0.68, -r * 0.32, r * 0.72, -r * 0.14, r * 0.44);
    ctx.bezierCurveTo(-r * 0.18, r * 0.72, -r * 0.26, r * 0.88, -r * 0.42, r * 0.98);
    ctx.lineTo(r * 0.42, r * 0.98);
    ctx.bezierCurveTo(r * 0.26, r * 0.88, r * 0.18, r * 0.72, r * 0.14, r * 0.44);
    ctx.bezierCurveTo(r * 0.32, r * 0.72, r * 0.88, r * 0.68, r * 0.92, r * 0.34);
    ctx.bezierCurveTo(r * 0.98, -r * 0.1, r * 0.25, -r * 0.55, 0, -r * 1.02);
    ctx.closePath();
  } else if (suit === 'hearts') {
    ctx.moveTo(0, r * 0.98);
    ctx.bezierCurveTo(-r * 0.28, r * 0.66, -r * 1.02, r * 0.16, -r * 0.96, -r * 0.34);
    ctx.bezierCurveTo(-r * 0.9, -r * 0.82, -r * 0.26, -r * 0.92, 0, -r * 0.46);
    ctx.bezierCurveTo(r * 0.26, -r * 0.92, r * 0.9, -r * 0.82, r * 0.96, -r * 0.34);
    ctx.bezierCurveTo(r * 1.02, r * 0.16, r * 0.28, r * 0.66, 0, r * 0.98);
    ctx.closePath();
  } else if (suit === 'diamonds') {
    ctx.moveTo(0, -r * 1.02);
    ctx.quadraticCurveTo(r * 0.36, -r * 0.38, r * 0.86, 0);
    ctx.quadraticCurveTo(r * 0.36, r * 0.38, 0, r * 1.02);
    ctx.quadraticCurveTo(-r * 0.36, r * 0.38, -r * 0.86, 0);
    ctx.quadraticCurveTo(-r * 0.36, -r * 0.38, 0, -r * 1.02);
    ctx.closePath();
  } else {
    // clubs
    const lr = r * 0.42;
    ctx.arc(0, -r * 0.44, lr, 0, Math.PI * 2);
    ctx.moveTo(-r * 0.46 + lr, r * 0.18);
    ctx.arc(-r * 0.46, r * 0.18, lr, 0, Math.PI * 2);
    ctx.moveTo(r * 0.46 + lr, r * 0.18);
    ctx.arc(r * 0.46, r * 0.18, lr, 0, Math.PI * 2);
    ctx.moveTo(-r * 0.13, r * 0.2);
    ctx.quadraticCurveTo(-r * 0.18, r * 0.72, -r * 0.4, r * 0.96);
    ctx.lineTo(r * 0.4, r * 0.96);
    ctx.quadraticCurveTo(r * 0.18, r * 0.72, r * 0.13, r * 0.2);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

function createFeltPair(maxAniso: number) {
  const w = 1024;
  const h = 576;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = w;
  cCanvas.height = h;
  const ctx = cCanvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(w * 0.5, h * 0.46, 30, w * 0.5, h * 0.5, w * 0.55);
  grad.addColorStop(0, '#16523D');
  grad.addColorStop(0.58, '#0E392A');
  grad.addColorStop(1, '#082319');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const bSize = 256;
  const bCanvas = document.createElement('canvas');
  bCanvas.width = bSize;
  bCanvas.height = bSize;
  const bCtx = bCanvas.getContext('2d')!;
  const imgData = bCtx.createImageData(bSize, bSize);
  const data = imgData.data;
  for (let y = 0; y < bSize; y++) {
    for (let x = 0; x < bSize; x++) {
      const i = (y * bSize + x) * 4;
      const weave = ((x + y) % 2 === 0 ? 10 : -10) + (x % 3 === 0 ? 6 : -3);
      const grain = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 28;
      const v = Math.max(0, Math.min(255, 128 + weave + grain - 14));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  bCtx.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.drawImage(bCanvas, 0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(212, 168, 83, 0.36)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.365, h * 0.34, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(212, 168, 83, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.376, h * 0.355, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(212, 168, 83, 0.09)';
  drawSuitPath(ctx, 'spades', w / 2, h / 2, 28);
  ctx.restore();

  const feltBump = finalizeDataTexture(bCanvas, maxAniso);
  feltBump.wrapS = THREE.RepeatWrapping;
  feltBump.wrapT = THREE.RepeatWrapping;
  feltBump.repeat.set(10, 6);

  return {
    feltColor: finalizeColorTexture(cCanvas, maxAniso),
    feltBump,
  };
}

function createWoodPair(maxAniso: number) {
  const cCanvas = document.createElement('canvas');
  cCanvas.width = 512;
  cCanvas.height = 512;
  const ctx = cCanvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = 512;
  bCanvas.height = 512;
  const bCtx = bCanvas.getContext('2d')!;

  ctx.fillStyle = '#2B1B13';
  ctx.fillRect(0, 0, 512, 512);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y++) {
    const wave = Math.sin(y * 0.065) * 14 + Math.sin(y * 0.21) * 5;
    const tone = Math.sin(y * 0.14 + wave * 0.08);
    const r = Math.round(42 + tone * 11);
    const g = Math.round(25 + tone * 7);
    const b = Math.round(17 + tone * 5);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, 512, 1);

    const bv = Math.round(128 + tone * 24);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(0, y, 512, 1);
  }

  const woodColor = finalizeColorTexture(cCanvas, maxAniso);
  woodColor.wrapS = THREE.RepeatWrapping;
  woodColor.wrapT = THREE.RepeatWrapping;
  woodColor.repeat.set(4, 2);

  const woodBump = finalizeDataTexture(bCanvas, maxAniso);
  woodBump.wrapS = THREE.RepeatWrapping;
  woodBump.wrapT = THREE.RepeatWrapping;
  woodBump.repeat.set(4, 2);

  return { woodColor, woodBump };
}

function createLeather(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#181412';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2400; i++) {
    const x = (Math.sin(i * 19.31) * 0.5 + 0.5) * 256;
    const y = (Math.cos(i * 41.73) * 0.5 + 0.5) * 256;
    const v = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.22)';
    ctx.fillStyle = v;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = finalizeColorTexture(canvas, maxAniso);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 3);
  return tex;
}

function createChipPair(denom: ChipDenom, maxAniso: number) {
  const palette = CHIP_PALETTES[denom];
  const size = 512;
  const cx = 256;
  const cy = 256;

  // 1. Top Clay Chip Albedo (512x512)
  const tCanvas = document.createElement('canvas');
  tCanvas.width = size;
  tCanvas.height = size;
  const ctx = tCanvas.getContext('2d')!;

  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, size, size);

  // Subtle radial shading on outer clay ring
  const outerGrad = ctx.createRadialGradient(cx, cy, 145, cx, cy, 256);
  outerGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
  outerGrad.addColorStop(0.75, 'rgba(0,0,0,0)');
  outerGrad.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = outerGrad;
  ctx.fillRect(0, 0, size, size);

  // Authentic compressed clay micro-speckle texture
  for (let i = 0; i < 2200; i++) {
    const px = ((Math.sin(i * 17.13 + denom) * 0.5 + 0.5) * size) | 0;
    const py = ((Math.cos(i * 31.71 + denom) * 0.5 + 0.5) * size) | 0;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)';
    ctx.fillRect(px, py, 2, 2);
  }

  // 8 classic tri-bar Paulson-style trapezoid edge spots
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 4);
    // Outer trim wings
    ctx.fillStyle = palette.trim;
    ctx.beginPath();
    ctx.moveTo(-22, -162);
    ctx.lineTo(22, -162);
    ctx.lineTo(31, -256);
    ctx.lineTo(-31, -256);
    ctx.closePath();
    ctx.fill();

    // Main center edge spot bar
    ctx.fillStyle = palette.stripe;
    ctx.beginPath();
    ctx.moveTo(-14, -162);
    ctx.lineTo(14, -162);
    ctx.lineTo(20, -256);
    ctx.lineTo(-20, -256);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 24 molded clay rim notches around collar (r = 194)
  for (let i = 0; i < 24; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / 24 + Math.PI / 24);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-5, -203, 10, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-4, -202, 8, 5);
    ctx.restore();
  }
  ctx.restore();

  // Recessed collar groove & rim highlight
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 155, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 159, 0, Math.PI * 2);
  ctx.stroke();

  // Center satin pearl medallion inlay
  const inlayGrad = ctx.createRadialGradient(cx - 24, cy - 28, 12, cx, cy, 150);
  inlayGrad.addColorStop(0, palette.inlay);
  inlayGrad.addColorStop(1, palette.inlayEdge);
  ctx.fillStyle = inlayGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 149, 0, Math.PI * 2);
  ctx.fill();

  // Double inner guilloche ring inside inlay
  ctx.strokeStyle = palette.base;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 136, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = palette.trim;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.arc(cx, cy, 124, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Subtle club header & bottom diamond pip inside inlay
  ctx.fillStyle = 'rgba(20, 22, 26, 0.55)';
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VELVET CLUB', cx, cy - 82);
  drawSuitPath(ctx, 'spades', cx, cy + 84, 13);

  // Crisp bold denomination numeral
  ctx.fillStyle = palette.text;
  ctx.font = `800 ${denom >= 1000 ? 96 : denom >= 100 ? 122 : 148}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(denom), cx, cy + 2);

  // 2. Top Bump Map (512x512 NoColorSpace) — clay grain, molded collar ticks, sunken inlay ring
  const tbCanvas = document.createElement('canvas');
  tbCanvas.width = size;
  tbCanvas.height = size;
  const tbCtx = tbCanvas.getContext('2d')!;
  tbCtx.fillStyle = '#828282';
  tbCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2400; i++) {
    const px = ((Math.sin(i * 17.13 + denom) * 0.5 + 0.5) * size) | 0;
    const py = ((Math.cos(i * 31.71 + denom) * 0.5 + 0.5) * size) | 0;
    tbCtx.fillStyle = i % 2 === 0 ? '#929292' : '#707070';
    tbCtx.fillRect(px, py, 2, 2);
  }

  tbCtx.save();
  tbCtx.translate(cx, cy);
  for (let i = 0; i < 24; i++) {
    tbCtx.save();
    tbCtx.rotate((i * Math.PI * 2) / 24 + Math.PI / 24);
    tbCtx.fillStyle = '#505050';
    tbCtx.fillRect(-5, -203, 10, 14);
    tbCtx.fillStyle = '#B8B8B8';
    tbCtx.fillRect(-4, -202, 8, 4);
    tbCtx.restore();
  }
  tbCtx.restore();

  // Sunken inlay step + recessed groove
  tbCtx.fillStyle = '#747474';
  tbCtx.beginPath();
  tbCtx.arc(cx, cy, 150, 0, Math.PI * 2);
  tbCtx.fill();

  tbCtx.strokeStyle = '#323232';
  tbCtx.lineWidth = 6;
  tbCtx.beginPath();
  tbCtx.arc(cx, cy, 153, 0, Math.PI * 2);
  tbCtx.stroke();

  tbCtx.strokeStyle = '#A8A8A8';
  tbCtx.lineWidth = 3;
  tbCtx.beginPath();
  tbCtx.arc(cx, cy, 136, 0, Math.PI * 2);
  tbCtx.stroke();

  // Subtle embossed denomination relief
  tbCtx.fillStyle = '#929292';
  tbCtx.font = `800 ${denom >= 1000 ? 96 : denom >= 100 ? 122 : 148}px "JetBrains Mono", monospace`;
  tbCtx.textAlign = 'center';
  tbCtx.textBaseline = 'middle';
  tbCtx.fillText(String(denom), cx, cy + 2);

  // 3. Side Rim Albedo & Knurled Bump (512x64)
  const sCanvas = document.createElement('canvas');
  sCanvas.width = 512;
  sCanvas.height = 64;
  const sCtx = sCanvas.getContext('2d')!;
  sCtx.fillStyle = palette.base;
  sCtx.fillRect(0, 0, 512, 64);

  const seg = 512 / 8;
  for (let i = 0; i < 8; i++) {
    const startX = i * seg;
    sCtx.fillStyle = palette.trim;
    sCtx.fillRect(startX + seg * 0.16, 0, seg * 0.68, 64);
    sCtx.fillStyle = palette.stripe;
    sCtx.fillRect(startX + seg * 0.27, 0, seg * 0.46, 64);
  }

  // Crisp top & bottom bevel shading so stacked chips separate clearly
  sCtx.fillStyle = 'rgba(0,0,0,0.58)';
  sCtx.fillRect(0, 0, 512, 7);
  sCtx.fillRect(0, 57, 512, 7);
  sCtx.fillStyle = 'rgba(255,255,255,0.16)';
  sCtx.fillRect(0, 7, 512, 2);

  // Side vertical knurling bump map
  const sbCanvas = document.createElement('canvas');
  sbCanvas.width = 512;
  sbCanvas.height = 64;
  const sbCtx = sbCanvas.getContext('2d')!;
  sbCtx.fillStyle = '#808080';
  sbCtx.fillRect(0, 0, 512, 64);
  for (let x = 0; x < 512; x += 4) {
    sbCtx.fillStyle = x % 8 === 0 ? '#A8A8A8' : '#585858';
    sbCtx.fillRect(x, 7, 2, 50);
  }
  sbCtx.fillStyle = '#303030';
  sbCtx.fillRect(0, 0, 512, 7);
  sbCtx.fillRect(0, 57, 512, 7);

  return {
    top: finalizeColorTexture(tCanvas, maxAniso),
    side: finalizeColorTexture(sCanvas, maxAniso),
    topBump: finalizeDataTexture(tbCanvas, maxAniso),
    sideBump: finalizeDataTexture(sbCanvas, maxAniso),
  };
}

function createCardLinenBump(maxAniso: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const d = imgData.data;

  // Air-cushion diamond crosshatch embossing + multi-octave cotton-rag paper grain
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const diagA = Math.sin(((x + y) / 3.6) * Math.PI);
      const diagB = Math.sin(((x - y) / 3.6) * Math.PI);
      const weave = diagA * diagB * 34;
      const grainFine = ((Math.sin(x * 13.7 + y * 41.3) * 43758.5453) % 1) * 18 - 9;
      const grainCoarse = Math.sin(x * 0.24 + Math.cos(y * 0.19) * 2.1) * 8;
      const v = Math.max(0, Math.min(255, Math.round(128 + weave + grainFine + grainCoarse)));
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = finalizeDataTexture(canvas, maxAniso);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 4.8);
  return tex;
}

function createCardRoughness(maxAniso: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const d = imgData.data;

  // Matte linen core (~0.62-0.74 roughness) with subtle satin perimeter coat (~0.42)
  for (let y = 0; y < size; y++) {
    const ny = Math.abs((y / (size - 1)) * 2 - 1);
    for (let x = 0; x < size; x++) {
      const nx = Math.abs((x / (size - 1)) * 2 - 1);
      const edgeFactor = Math.max(0, Math.min(1, (Math.max(nx, ny) - 0.84) / 0.16));
      const weaveMod =
        Math.sin(((x + y) / 3.6) * Math.PI) * Math.sin(((x - y) / 3.6) * Math.PI) * 14;
      const micro = ((Math.sin(x * 23.1 + y * 17.9) * 29431.7) % 1) * 14 - 7;
      const baseRough = 172 - edgeFactor * 54 + weaveMod + micro;
      const v = Math.max(92, Math.min(212, Math.round(baseRough)));
      const i = (y * size + x) * 4;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = finalizeDataTexture(canvas, maxAniso);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createCardBack(maxAniso: number): THREE.CanvasTexture {
  const w = 512;
  const h = 720;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.scale(1.5, 1.5);

  // Clean casino ivory card border
  ctx.fillStyle = '#F6F1E6';
  ctx.fillRect(0, 0, w, h);

  // Deep emerald velvet core
  const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.72);
  bgGrad.addColorStop(0, '#144232');
  bgGrad.addColorStop(1, '#0A251C');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(24, 24, w - 48, h - 48);

  // Outer & inner brushed-gold framing lines
  ctx.strokeStyle = '#D4A853';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, w - 72, h - 72);

  ctx.strokeStyle = 'rgba(212, 168, 83, 0.55)';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(46, 46, w - 92, h - 92);

  // Fine diamond guilloche lattice
  ctx.save();
  ctx.beginPath();
  ctx.rect(50, 50, w - 100, h - 100);
  ctx.clip();

  ctx.strokeStyle = 'rgba(212, 168, 83, 0.24)';
  ctx.lineWidth = 1.5;
  for (let y = 56; y < h - 44; y += 34) {
    for (let x = 56; x < w - 44; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x + 12, y);
      ctx.lineTo(x, y + 12);
      ctx.lineTo(x - 12, y);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  // Four corner diamond rosettes
  const corners = [
    [66, 66],
    [w - 66, 66],
    [66, h - 66],
    [w - 66, h - 66],
  ];
  for (const [cx, cy] of corners) {
    ctx.fillStyle = '#0F3326';
    ctx.strokeStyle = '#D4A853';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx + 12, cy);
    ctx.lineTo(cx, cy + 12);
    ctx.lineTo(cx - 12, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Central layered club crest
  ctx.fillStyle = '#0D2D22';
  ctx.strokeStyle = '#E6C16C';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w / 2, h / 2 - 78);
  ctx.lineTo(w / 2 + 58, h / 2);
  ctx.lineTo(w / 2, h / 2 + 78);
  ctx.lineTo(w / 2 - 58, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(230, 193, 108, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w / 2, h / 2 - 60);
  ctx.lineTo(w / 2 + 44, h / 2);
  ctx.lineTo(w / 2, h / 2 + 60);
  ctx.lineTo(w / 2 - 44, h / 2);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = '#E6C16C';
  drawSuitPath(ctx, 'spades', w / 2, h / 2, 22);

  return finalizeColorTexture(canvas, maxAniso);
}

// Standard playing card normalized pip coordinates [nx (-1..1), ny (-1..1), inverted?]
const NUMBER_PIP_LAYOUTS: Record<number, Array<[number, number, boolean?]>> = {
  2: [
    [0, -0.72],
    [0, 0.72, true],
  ],
  3: [
    [0, -0.74],
    [0, 0],
    [0, 0.74, true],
  ],
  4: [
    [-0.56, -0.72],
    [0.56, -0.72],
    [-0.56, 0.72, true],
    [0.56, 0.72, true],
  ],
  5: [
    [-0.56, -0.72],
    [0.56, -0.72],
    [0, 0],
    [-0.56, 0.72, true],
    [0.56, 0.72, true],
  ],
  6: [
    [-0.56, -0.72],
    [0.56, -0.72],
    [-0.56, 0],
    [0.56, 0],
    [-0.56, 0.72, true],
    [0.56, 0.72, true],
  ],
  7: [
    [-0.56, -0.74],
    [0.56, -0.74],
    [0, -0.37],
    [-0.56, 0],
    [0.56, 0],
    [-0.56, 0.74, true],
    [0.56, 0.74, true],
  ],
  8: [
    [-0.56, -0.74],
    [0.56, -0.74],
    [0, -0.37],
    [-0.56, 0],
    [0.56, 0],
    [0, 0.37, true],
    [-0.56, 0.74, true],
    [0.56, 0.74, true],
  ],
  9: [
    [-0.56, -0.76],
    [0.56, -0.76],
    [-0.56, -0.26],
    [0.56, -0.26],
    [0, 0],
    [-0.56, 0.26, true],
    [0.56, 0.26, true],
    [-0.56, 0.76, true],
    [0.56, 0.76, true],
  ],
  10: [
    [-0.56, -0.76],
    [0.56, -0.76],
    [0, -0.5],
    [-0.56, -0.26],
    [0.56, -0.26],
    [-0.56, 0.26, true],
    [0.56, 0.26, true],
    [0, 0.5, true],
    [-0.56, 0.76, true],
    [0.56, 0.76, true],
  ],
};

interface CanvasCourtPalette {
  ink: string;
  primary: string;
  secondary: string;
  gold: string;
  goldLight: string;
  skin: string;
  skinShadow: string;
  hair: string;
  cream: string;
  bgTint: string;
}

function getCanvasCourtPalette(suit: Suit): CanvasCourtPalette {
  const isRed = suit === 'hearts' || suit === 'diamonds';
  if (isRed) {
    return {
      ink: '#0B0809',
      primary: '#9E0E18',
      secondary: '#124633',
      gold: '#B68328',
      goldLight: '#E8C56C',
      skin: '#E6BD94',
      skinShadow: '#C89467',
      hair: '#452212',
      cream: '#EFE8DA',
      bgTint: '#E8DFCC',
    };
  }
  return {
    ink: '#080B12',
    primary: '#142C5E',
    secondary: '#96121C',
    gold: '#B68328',
    goldLight: '#E8C56C',
    skin: '#E4BB92',
    skinShadow: '#C59164',
    hair: '#291A13',
    cream: '#EFE8DA',
    bgTint: '#E2DED3',
  };
}

/**
 * Draws one upright upper bust half inside normalized local space [-140..140, -240..0]
 * where (0, 0) is the center waist sash line of the court box.
 */
function drawCanvasBustHalf(
  ctx: CanvasRenderingContext2D,
  rank: Rank,
  suit: Suit,
  p: CanvasCourtPalette
) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (rank === 11) {
    // JACK: Plumed Tudor Beret + Cavalier Face + Upright Halberd
    // Background heraldic diamond halo
    ctx.fillStyle = 'rgba(244, 218, 142, 0.28)';
    ctx.beginPath();
    ctx.moveTo(0, -210);
    ctx.lineTo(86, -108);
    ctx.lineTo(0, -6);
    ctx.lineTo(-86, -108);
    ctx.closePath();
    ctx.fill();

    // Upright Steel Halberd
    ctx.fillStyle = p.hair;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.fillRect(-102, -196, 8, 196);
    ctx.strokeRect(-102, -196, 8, 196);

    // Spear tip
    ctx.fillStyle = '#D8DFE8';
    ctx.beginPath();
    ctx.moveTo(-98, -226);
    ctx.lineTo(-86, -192);
    ctx.lineTo(-110, -192);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Curved axe blade
    ctx.fillStyle = '#C7D1DD';
    ctx.beginPath();
    ctx.moveTo(-94, -190);
    ctx.quadraticCurveTo(-56, -192, -52, -162);
    ctx.quadraticCurveTo(-72, -152, -94, -159);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cape & Quartered Doublet
    ctx.fillStyle = p.primary;
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(-98, 0);
    ctx.quadraticCurveTo(-90, -66, -42, -82);
    ctx.lineTo(42, -82);
    ctx.quadraticCurveTo(90, -66, 98, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Left quartering panel
    ctx.fillStyle = p.secondary;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-36, -80);
    ctx.lineTo(0, 0);
    ctx.lineTo(-66, 0);
    ctx.lineTo(-66, -62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gold tunic center band + buttons
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -80);
    ctx.lineTo(0, 0);
    ctx.stroke();

    for (const by of [-56, -32]) {
      ctx.fillStyle = p.goldLight;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, by, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Lace Collar
    ctx.fillStyle = p.cream;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-36, -82);
    ctx.lineTo(-18, -64);
    ctx.lineTo(0, -76);
    ctx.lineTo(18, -64);
    ctx.lineTo(36, -82);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Neck
    ctx.fillStyle = p.skinShadow;
    ctx.fillRect(-16, -106, 32, 26);
    ctx.strokeRect(-16, -106, 32, 26);

    // Pageboy Hair
    ctx.fillStyle = p.hair;
    ctx.beginPath();
    ctx.moveTo(-42, -148);
    ctx.quadraticCurveTo(-56, -110, -44, -84);
    ctx.lineTo(-26, -90);
    ctx.lineTo(-28, -140);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(42, -148);
    ctx.quadraticCurveTo(56, -110, 44, -84);
    ctx.lineTo(26, -90);
    ctx.lineTo(28, -140);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.fillStyle = p.skin;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-34, -158);
    ctx.bezierCurveTo(-34, -188, 34, -188, 34, -158);
    ctx.bezierCurveTo(34, -120, 18, -96, 0, -94);
    ctx.bezierCurveTo(-18, -96, -34, -120, -34, -158);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Facial features
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-22, -146);
    ctx.quadraticCurveTo(-15, -151, -8, -146);
    ctx.moveTo(8, -146);
    ctx.quadraticCurveTo(15, -151, 22, -146);
    ctx.stroke();

    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(-15, -138, 3.4, 0, Math.PI * 2);
    ctx.arc(15, -138, 3.4, 0, Math.PI * 2);
    ctx.fill();

    // Nose & mouth
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -141);
    ctx.lineTo(-2, -124);
    ctx.lineTo(4, -121);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-8, -110);
    ctx.quadraticCurveTo(0, -105, 8, -110);
    ctx.stroke();

    // Sweeping Plumed Feather
    ctx.fillStyle = p.secondary;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(32, -178);
    ctx.quadraticCurveTo(84, -214, 96, -182);
    ctx.quadraticCurveTo(64, -172, 32, -168);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Slanted Velvet Beret
    ctx.fillStyle = p.primary;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-50, -158);
    ctx.bezierCurveTo(-56, -196, -12, -208, 34, -196);
    ctx.bezierCurveTo(58, -190, 56, -162, 36, -158);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gold brim
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(-42, -159);
    ctx.lineTo(38, -159);
    ctx.stroke();

    ctx.fillStyle = p.goldLight;
    drawSuitPath(ctx, suit, -4, -180, 10);

    // Gloved hand on halberd
    ctx.fillStyle = p.skin;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-96, -50, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (rank === 12) {
    // QUEEN: Floral Diadem, Braided Hair, Lace Collar & Blooming Rose
    ctx.fillStyle = 'rgba(244, 218, 142, 0.24)';
    ctx.beginPath();
    ctx.arc(0, -118, 74, Math.PI, 0);
    ctx.lineTo(74, 0);
    ctx.lineTo(-74, 0);
    ctx.closePath();
    ctx.fill();

    // Gown & Mantle
    ctx.fillStyle = p.primary;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(-96, 0);
    ctx.quadraticCurveTo(-88, -68, -40, -82);
    ctx.lineTo(40, -82);
    ctx.quadraticCurveTo(88, -68, 96, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Embroidered bodice
    ctx.fillStyle = p.secondary;
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-34, -80);
    ctx.lineTo(34, -80);
    ctx.lineTo(22, 0);
    ctx.lineTo(-22, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = p.goldLight;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(-18, -64);
    ctx.lineTo(0, -38);
    ctx.lineTo(18, -64);
    ctx.stroke();

    ctx.fillStyle = p.gold;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, -33, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Scalloped Lace Ruff
    ctx.fillStyle = p.cream;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-52, -108);
    ctx.quadraticCurveTo(-60, -82, -36, -72);
    ctx.lineTo(0, -62);
    ctx.lineTo(36, -72);
    ctx.quadraticCurveTo(60, -82, 52, -108);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Braided Hair
    ctx.fillStyle = p.hair;
    ctx.beginPath();
    ctx.moveTo(-44, -154);
    ctx.bezierCurveTo(-60, -130, -56, -92, -40, -76);
    ctx.lineTo(-26, -86);
    ctx.bezierCurveTo(-36, -108, -36, -138, -30, -152);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(44, -154);
    ctx.bezierCurveTo(60, -130, 56, -92, 40, -76);
    ctx.lineTo(26, -86);
    ctx.bezierCurveTo(36, -108, 36, -138, 30, -152);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Neck
    ctx.fillStyle = p.skinShadow;
    ctx.fillRect(-14, -106, 28, 24);
    ctx.strokeRect(-14, -106, 28, 24);

    // Face
    ctx.fillStyle = p.skin;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-32, -156);
    ctx.bezierCurveTo(-32, -184, 32, -184, 32, -156);
    ctx.bezierCurveTo(32, -120, 17, -98, 0, -96);
    ctx.bezierCurveTo(-17, -98, -32, -120, -32, -156);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cheek blush
    ctx.fillStyle = 'rgba(223, 107, 107, 0.28)';
    ctx.beginPath();
    ctx.ellipse(-20, -126, 7, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(20, -126, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes, brows, nose, rose lips
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-21, -146);
    ctx.quadraticCurveTo(-14, -150, -7, -146);
    ctx.moveTo(7, -146);
    ctx.quadraticCurveTo(14, -150, 21, -146);
    ctx.stroke();

    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(-14, -139, 3.2, 0, Math.PI * 2);
    ctx.arc(14, -139, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -140);
    ctx.lineTo(-1.5, -126);
    ctx.lineTo(3, -124);
    ctx.stroke();

    ctx.strokeStyle = '#B43B44';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-7, -112);
    ctx.quadraticCurveTo(0, -106, 7, -112);
    ctx.stroke();

    // Jeweled Queen Tiara
    ctx.fillStyle = p.gold;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-40, -166);
    ctx.quadraticCurveTo(-44, -196, -24, -204);
    ctx.quadraticCurveTo(-14, -184, 0, -216);
    ctx.quadraticCurveTo(14, -184, 24, -204);
    ctx.quadraticCurveTo(44, -196, 40, -166);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = p.goldLight;
    ctx.fillRect(-40, -173, 80, 10);
    ctx.strokeRect(-40, -173, 80, 10);

    for (const [px, py, pr] of [
      [0, -218, 5.5],
      [-26, -206, 4.5],
      [26, -206, 4.5],
    ]) {
      ctx.fillStyle = p.cream;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Blooming Rose held on right
    ctx.strokeStyle = '#1E6846';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(86, -66);
    ctx.lineTo(76, -12);
    ctx.stroke();

    ctx.fillStyle = '#C92434';
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(86, -74, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#F05A66';
    ctx.beginPath();
    ctx.arc(85, -75, 8, 0, Math.PI * 2);
    ctx.fill();

    // Hand
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(77, -38, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // KING: Sovereign Monarch with 5-Arch Crown, Beard & Broadsword
    ctx.fillStyle = 'rgba(244, 218, 142, 0.22)';
    ctx.beginPath();
    ctx.arc(0, -108, 82, 0, Math.PI * 2);
    ctx.fill();

    // Upraised Broadsword on right
    ctx.fillStyle = '#DCE2EA';
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(94, -220);
    ctx.lineTo(103, -196);
    ctx.lineTo(103, -74);
    ctx.lineTo(85, -74);
    ctx.lineTo(85, -196);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = p.gold;
    ctx.fillRect(68, -76, 52, 10);
    ctx.strokeRect(68, -76, 52, 10);
    ctx.fillStyle = p.primary;
    ctx.fillRect(89, -66, 10, 26);
    ctx.strokeRect(89, -66, 10, 26);

    // Mantle Cape
    ctx.fillStyle = p.primary;
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(-102, 0);
    ctx.quadraticCurveTo(-96, -68, -46, -84);
    ctx.lineTo(46, -84);
    ctx.quadraticCurveTo(96, -68, 102, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Ermine Fur Mantle
    ctx.fillStyle = p.cream;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-76, -70);
    ctx.quadraticCurveTo(-38, -86, 0, -80);
    ctx.quadraticCurveTo(38, -86, 76, -70);
    ctx.lineTo(64, -36);
    ctx.quadraticCurveTo(0, -48, -64, -36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = p.ink;
    for (const [ex, ey] of [
      [-48, -60],
      [-28, -54],
      [28, -54],
      [48, -60],
    ]) {
      ctx.beginPath();
      ctx.arc(ex, ey, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gold Sovereign Collar Chain
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(-44, -40);
    ctx.quadraticCurveTo(0, -12, 44, -40);
    ctx.stroke();

    ctx.fillStyle = p.secondary;
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -25, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // King's Hair Locks
    ctx.fillStyle = p.hair;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-46, -150);
    ctx.quadraticCurveTo(-58, -120, -46, -94);
    ctx.lineTo(-30, -100);
    ctx.lineTo(-32, -148);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(46, -150);
    ctx.quadraticCurveTo(58, -120, 46, -94);
    ctx.lineTo(30, -100);
    ctx.lineTo(32, -148);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.fillStyle = p.skin;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-36, -158);
    ctx.bezierCurveTo(-36, -184, 36, -184, 36, -158);
    ctx.bezierCurveTo(36, -120, 20, -98, 0, -94);
    ctx.bezierCurveTo(-20, -98, -36, -120, -36, -158);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Royal Beard & Mustache
    ctx.fillStyle = p.hair;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-34, -128);
    ctx.bezierCurveTo(-34, -98, -18, -82, 0, -80);
    ctx.bezierCurveTo(18, -82, 34, -98, 34, -128);
    ctx.quadraticCurveTo(18, -114, 0, -120);
    ctx.quadraticCurveTo(-18, -114, -34, -128);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(-20, -119);
    ctx.quadraticCurveTo(-10, -126, 0, -118);
    ctx.quadraticCurveTo(10, -126, 20, -119);
    ctx.stroke();

    // Regal Eyes & Brows
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-24, -148);
    ctx.quadraticCurveTo(-15, -153, -6, -147);
    ctx.moveTo(6, -147);
    ctx.quadraticCurveTo(15, -153, 24, -148);
    ctx.stroke();

    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(-15, -140, 3.5, 0, Math.PI * 2);
    ctx.arc(15, -140, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Grand 5-Arch Crown
    ctx.fillStyle = p.gold;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-46, -166);
    ctx.lineTo(-52, -204);
    ctx.lineTo(-24, -185);
    ctx.lineTo(0, -216);
    ctx.lineTo(24, -185);
    ctx.lineTo(52, -204);
    ctx.lineTo(46, -166);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cross on top
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -230);
    ctx.lineTo(0, -215);
    ctx.moveTo(-7, -224);
    ctx.lineTo(7, -224);
    ctx.stroke();

    ctx.fillStyle = p.goldLight;
    ctx.lineWidth = 2.8;
    ctx.fillRect(-46, -174, 92, 12);
    ctx.strokeRect(-46, -174, 92, 12);

    ctx.fillStyle = p.secondary;
    ctx.beginPath();
    ctx.arc(0, -168, 4, 0, Math.PI * 2);
    ctx.fill();

    // Sword gripping hand
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(92, -52, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawCourtPortrait(
  ctx: CanvasRenderingContext2D,
  rank: Rank,
  suit: Suit,
  ink: string,
  w: number,
  h: number
) {
  const cx = w / 2;
  const cy = h / 2;
  const p = getCanvasCourtPalette(suit);

  const boxX = 110;
  const boxY = 104;
  const boxW = w - 220;
  const boxH = h - 208;

  ctx.save();
  // Parchment court panel & double gilt border
  ctx.fillStyle = p.bgTint;
  ctx.fillRect(boxX, boxY, boxW, boxH);

  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 4.5;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.strokeStyle = ink === '#C41C24' ? 'rgba(196, 28, 36, 0.25)' : 'rgba(20, 24, 29, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 8, boxY + 8, boxW - 16, boxH - 16);

  // Inner suit pips
  ctx.fillStyle = p.primary;
  drawSuitPath(ctx, suit, boxX + 28, boxY + 34, 17);
  drawSuitPath(ctx, suit, boxX + boxW - 28, boxY + boxH - 34, 17, true);

  // Clip portrait cleanly inside the court frame
  ctx.beginPath();
  ctx.rect(boxX + 6, boxY + 6, boxW - 12, boxH - 12);
  ctx.clip();

  // Upper upright bust
  ctx.save();
  ctx.translate(cx, cy);
  drawCanvasBustHalf(ctx, rank, suit, p);
  ctx.restore();

  // Lower mirrored bust
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI);
  drawCanvasBustHalf(ctx, rank, suit, p);
  ctx.restore();

  // Classic diagonal gold waist sash
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(boxX + 10, cy + 14);
  ctx.lineTo(boxX + boxW - 10, cy - 14);
  ctx.stroke();

  ctx.fillStyle = p.goldLight;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawJokerCardFace(
  ctx: CanvasRenderingContext2D,
  kind: 'little' | 'big',
  w: number,
  h: number
) {
  const isBig = kind === 'big';
  const ink = isBig ? '#1E1418' : '#181C22';
  const cornerColor = isBig ? '#C61D28' : '#171B21';
  const motleyA = isBig ? '#C81F2C' : '#2C323B';
  const motleyB = isBig ? '#1B6548' : '#7A838F';
  const motleyC = isBig ? '#1E4380' : '#4D5560';
  const gold = isBig ? '#DDA83F' : '#B5BCC4';
  const goldLight = isBig ? '#F8E092' : '#E3E7EC';
  const skin = isBig ? '#F6D9BA' : '#EDEBE6';

  // Corner stacked J O K E R indices
  const letters = ['J', 'O', 'K', 'E', 'R'];
  ctx.fillStyle = cornerColor;
  ctx.font = '800 32px "Playfair Display", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  letters.forEach((ch, idx) => ctx.fillText(ch, 58, 34 + idx * 34));

  ctx.save();
  ctx.translate(w - 58, h - 34);
  ctx.rotate(Math.PI);
  letters.forEach((ch, idx) => ctx.fillText(ch, 0, idx * 34));
  ctx.restore();

  // Inner ornate Joker panel
  const boxX = 104;
  const boxY = 90;
  const boxW = w - 208;
  const boxH = h - 180;

  ctx.save();
  ctx.fillStyle = isBig ? '#FAF4E8' : '#F4F4F2';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = isBig ? '#D4A853' : '#535B66';
  ctx.lineWidth = 4.5;
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = isBig ? 'rgba(200,31,44,0.24)' : 'rgba(24,28,34,0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 10, boxY + 10, boxW - 20, boxH - 20);

  const cx = w / 2;
  const cy = h / 2 - 12;

  // Starburst halo
  ctx.fillStyle = isBig ? 'rgba(221, 168, 63, 0.16)' : 'rgba(90, 98, 108, 0.1)';
  ctx.beginPath();
  ctx.arc(cx, cy - 10, 108, 0, Math.PI * 2);
  ctx.fill();

  // Marotte scepter on right
  ctx.save();
  ctx.translate(cx + 82, cy - 38);
  ctx.rotate(0.2);
  ctx.fillStyle = gold;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.fillRect(-4, 24, 8, 154);
  ctx.strokeRect(-4, 24, 8, 154);
  ctx.fillStyle = motleyA;
  ctx.beginPath();
  ctx.arc(0, 18, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, 18, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Motley tunic body
  ctx.fillStyle = motleyA;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(cx - 94, cy + 168);
  ctx.bezierCurveTo(cx - 92, cy + 72, cx - 54, cy + 36, cx, cy + 36);
  ctx.bezierCurveTo(cx + 54, cy + 36, cx + 92, cy + 72, cx + 94, cy + 168);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = motleyB;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 36);
  ctx.bezierCurveTo(cx + 54, cy + 36, cx + 92, cy + 72, cx + 94, cy + 168);
  ctx.lineTo(cx, cy + 168);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Diamond motley patches
  for (const [dx, dy, col] of [
    [cx - 42, cy + 114, goldLight],
    [cx + 42, cy + 114, motleyC],
    [cx, cy + 144, gold],
  ] as Array<[number, number, string]>) {
    ctx.fillStyle = col;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(dx, dy - 22);
    ctx.lineTo(dx + 18, dy);
    ctx.lineTo(dx, dy + 22);
    ctx.lineTo(dx - 18, dy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Zigzag ruff collar + bells
  ctx.fillStyle = '#FBF8F1';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(cx - 76, cy + 44);
  ctx.lineTo(cx - 52, cy + 82);
  ctx.lineTo(cx - 30, cy + 50);
  ctx.lineTo(cx, cy + 86);
  ctx.lineTo(cx + 30, cy + 50);
  ctx.lineTo(cx + 52, cy + 82);
  ctx.lineTo(cx + 76, cy + 44);
  ctx.lineTo(cx + 48, cy + 20);
  ctx.lineTo(cx - 48, cy + 20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  for (const [bx, by] of [
    [cx - 52, cy + 86],
    [cx, cy + 92],
    [cx + 52, cy + 86],
  ]) {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(bx, by, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Jester Head
  ctx.fillStyle = skin;
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(cx - 40, cy - 60);
  ctx.bezierCurveTo(cx - 40, cy - 98, cx + 40, cy - 98, cx + 40, cy - 60);
  ctx.bezierCurveTo(cx + 40, cy - 16, cx + 20, cy + 12, cx, cy + 14);
  ctx.bezierCurveTo(cx - 20, cy + 12, cx - 40, cy - 16, cx - 40, cy - 60);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Mischievous smile, brows, eyes & nose
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy - 60);
  ctx.quadraticCurveTo(cx - 16, cy - 70, cx - 7, cy - 60);
  ctx.moveTo(cx + 7, cy - 60);
  ctx.quadraticCurveTo(cx + 16, cy - 70, cx + 26, cy - 60);
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(cx - 16, cy - 50, 4.5, 0, Math.PI * 2);
  ctx.arc(cx + 16, cy - 50, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isBig ? '#C81F2C' : '#3C434D';
  ctx.beginPath();
  ctx.arc(cx, cy - 38, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isBig ? '#C81F2C' : '#2C323B';
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy - 22);
  ctx.quadraticCurveTo(cx, cy + 2, cx + 24, cy - 22);
  ctx.quadraticCurveTo(cx, cy - 10, cx - 24, cy - 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Ornate Jester Cap Horns + Bells
  // Left horn
  ctx.fillStyle = motleyA;
  ctx.beginPath();
  ctx.moveTo(cx - 36, cy - 76);
  ctx.bezierCurveTo(cx - 58, cy - 110, cx - 94, cy - 124, cx - 112, cy - 96);
  ctx.quadraticCurveTo(cx - 94, cy - 82, cx - 48, cy - 68);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Right horn
  ctx.fillStyle = motleyB;
  ctx.beginPath();
  ctx.moveTo(cx + 36, cy - 76);
  ctx.bezierCurveTo(cx + 58, cy - 110, cx + 94, cy - 124, cx + 112, cy - 96);
  ctx.quadraticCurveTo(cx + 94, cy - 82, cx + 48, cy - 68);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Center crown horns
  ctx.fillStyle = motleyC;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy - 88);
  ctx.quadraticCurveTo(cx, cy - 166, cx + 18, cy - 88);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (isBig) {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(cx + 12, cy - 86);
    ctx.quadraticCurveTo(cx + 54, cy - 150, cx + 76, cy - 134);
    ctx.quadraticCurveTo(cx + 52, cy - 112, cx + 30, cy - 78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = motleyA;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 86);
    ctx.quadraticCurveTo(cx - 54, cy - 150, cx - 76, cy - 134);
    ctx.quadraticCurveTo(cx - 52, cy - 112, cx - 30, cy - 78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Cap bells
  const bellPositions: Array<[number, number]> = [
    [cx - 114, cy - 94],
    [cx + 114, cy - 94],
    [cx, cy - 166],
  ];
  if (isBig) {
    bellPositions.push([cx - 78, cy - 134], [cx + 78, cy - 134]);
  }
  for (const [bx, by] of bellPositions) {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Gold headband
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(cx - 44, cy - 76);
  ctx.quadraticCurveTo(cx, cy - 96, cx + 44, cy - 76);
  ctx.lineTo(cx + 40, cy - 62);
  ctx.quadraticCurveTo(cx, cy - 80, cx - 40, cy - 62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bottom Banner
  ctx.fillStyle = isBig ? '#B61D28' : '#2A3038';
  ctx.font = '800 22px "Playfair Display", serif';
  ctx.textAlign = 'center';
  ctx.fillText(isBig ? 'GRAND JOKER' : 'LITTLE JOKER', cx, boxY + boxH - 40);
  ctx.restore();
}

function createCardFace(card: Card, maxAniso: number): THREE.CanvasTexture {
  const w = 512;
  const h = 720;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.scale(1.5, 1.5);

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const ink = isRed ? '#C80815' : '#000000';
  const rankStr = RANK_LABELS[card.rank];

  // Crisp, high-contrast ivory-linen cardstock so cards pop vividly against dark emerald felt
  const stockGrad = ctx.createRadialGradient(w / 2, h / 2, 36, w / 2, h / 2, w * 0.82);
  stockGrad.addColorStop(0, '#FDFBF7');
  stockGrad.addColorStop(0.76, '#F7F3EA');
  stockGrad.addColorStop(1, '#ECE5D6');
  ctx.fillStyle = stockGrad;
  ctx.fillRect(0, 0, w, h);

  // Subtle embossed warm linen micro-grain
  ctx.save();
  for (let i = 0; i < 900; i++) {
    const gx = Math.abs(Math.sin(i * 12.9898 + card.rank * 3.1) * 43758.5453) % 1;
    const gy = Math.abs(Math.sin(i * 78.233 + card.rank * 7.7) * 29431.7) % 1;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(84, 70, 48, 0.028)' : 'rgba(255, 255, 255, 0.035)';
    ctx.fillRect(gx * w, gy * h, 2, 2);
  }
  ctx.restore();

  // High-definition outer card border + subtle gilt inner frame for crisp edge separation
  ctx.strokeStyle = 'rgba(10, 12, 16, 0.34)';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  ctx.strokeStyle = 'rgba(180, 134, 46, 0.52)';
  ctx.lineWidth = 2.6;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  ctx.strokeStyle = 'rgba(10, 12, 16, 0.28)';
  ctx.lineWidth = 2.4;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  if (card.joker) {
    drawJokerCardFace(ctx, card.joker, w, h);
    ctx.restore();
    return finalizeColorTexture(canvas, maxAniso);
  }

  // Top-left jumbo club index (ultra-crisp bold rank + bold vector suit)
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = card.rank === 10
    ? '900 112px "Plus Jakarta Sans", sans-serif'
    : '900 128px "Plus Jakarta Sans", sans-serif';
  ctx.strokeText(rankStr, 80, 24);
  ctx.fillText(rankStr, 80, 24);
  drawSuitPath(ctx, card.suit, 80, 190, 41);

  // Bottom-right rotated index
  ctx.save();
  ctx.translate(w - 80, h - 24);
  ctx.rotate(Math.PI);
  ctx.strokeText(rankStr, 0, 0);
  ctx.fillText(rankStr, 0, 0);
  ctx.restore();
  drawSuitPath(ctx, card.suit, w - 80, h - 190, 41, true);

  // Center playfield
  if (card.rank === 14) {
    // Ornate Ace centerpiece
    if (card.suit === 'spades') {
      ctx.strokeStyle = 'rgba(182, 134, 48, 0.88)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 122, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(10, 12, 16, 0.44)';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 108, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = ink;
      drawSuitPath(ctx, 'spades', w / 2, h / 2 - 4, 90);

      ctx.fillStyle = 'rgba(10, 12, 16, 0.78)';
      ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VELVET CLUB', w / 2, h / 2 + 138);
    } else {
      ctx.fillStyle = ink;
      drawSuitPath(ctx, card.suit, w / 2, h / 2, 106);
    }
  } else if (card.rank >= 11) {
    drawCourtPortrait(ctx, card.rank, card.suit, ink, w, h);
  } else {
    const layout = NUMBER_PIP_LAYOUTS[card.rank] ?? [];
    const spanX = 116;
    const spanY = 208;
    const pipR = card.rank <= 4 ? 46 : card.rank <= 7 ? 40 : 35;
    ctx.fillStyle = ink;
    for (const [nx, ny, inv] of layout) {
      drawSuitPath(ctx, card.suit, w / 2 + nx * spanX, h / 2 + ny * spanY, pipR, Boolean(inv));
    }
  }

  ctx.restore();
  return finalizeColorTexture(canvas, maxAniso);
}

function createContactShadow(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  g.addColorStop(0.58, 'rgba(0, 0, 0, 0.34)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createCardDropShadow(): THREE.CanvasTexture {
  const w = 256;
  const h = 360;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const drawRounded = (x: number, y: number, rw: number, rh: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + rw - r, y);
    ctx.quadraticCurveTo(x + rw, y, x + rw, y + r);
    ctx.lineTo(x + rw, y + rh - r);
    ctx.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh);
    ctx.lineTo(x + r, y + rh);
    ctx.quadraticCurveTo(x, y + rh, x, y + rh - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // Multi-layered soft penumbra + tight dark ambient-occlusion rim under card perimeter
  ctx.save();
  ctx.filter = 'blur(14px)';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
  drawRounded(26, 26, w - 52, h - 52, 20);
  ctx.fill();

  ctx.filter = 'blur(6px)';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  drawRounded(30, 30, w - 60, h - 60, 18);
  ctx.fill();

  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  drawRounded(34, 34, w - 68, h - 68, 16);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createImpactRing(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 28, 64, 64, 60);
  g.addColorStop(0, 'rgba(231, 195, 114, 0)');
  g.addColorStop(0.62, 'rgba(231, 195, 114, 0.85)');
  g.addColorStop(0.84, 'rgba(231, 195, 114, 0.22)');
  g.addColorStop(1, 'rgba(231, 195, 114, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTexturePack(maxAniso: number): ProceduralTexturePack {
  const { feltColor, feltBump } = createFeltPair(maxAniso);
  const { woodColor, woodBump } = createWoodPair(maxAniso);
  const leatherColor = createLeather(maxAniso);
  const cardBack = createCardBack(maxAniso);
  const cardLinenBump = createCardLinenBump(maxAniso);
  const cardRoughness = createCardRoughness(maxAniso);
  const contactShadow = createContactShadow();
  const cardDropShadow = createCardDropShadow();
  const impactRing = createImpactRing();

  const denoms: ChipDenom[] = [5, 25, 100, 500, 1000];
  const chipTextures = {} as ProceduralTexturePack['chipTextures'];
  for (const d of denoms) {
    chipTextures[d] = createChipPair(d, maxAniso);
  }

  const cardFaceCache = new Map<string, THREE.CanvasTexture>();
  const getCardFace = (card: Card): THREE.CanvasTexture => {
    const key = card.joker ? `joker_${card.joker}` : `${card.rank}_${card.suit}`;
    let tex = cardFaceCache.get(key);
    if (!tex) {
      tex = createCardFace(card, maxAniso);
      cardFaceCache.set(key, tex);
    }
    return tex;
  };

  return {
    feltColor,
    feltBump,
    woodColor,
    woodBump,
    leatherColor,
    cardBack,
    cardLinenBump,
    cardRoughness,
    contactShadow,
    cardDropShadow,
    impactRing,
    chipTextures,
    getCardFace,
    dispose: () => {
      feltColor.dispose();
      feltBump.dispose();
      woodColor.dispose();
      woodBump.dispose();
      leatherColor.dispose();
      cardBack.dispose();
      cardLinenBump.dispose();
      cardRoughness.dispose();
      contactShadow.dispose();
      cardDropShadow.dispose();
      impactRing.dispose();
      for (const d of denoms) {
        chipTextures[d].top.dispose();
        chipTextures[d].side.dispose();
        chipTextures[d].topBump.dispose();
        chipTextures[d].sideBump.dispose();
      }
      for (const t of cardFaceCache.values()) {
        t.dispose();
      }
      cardFaceCache.clear();
    },
  };
}
