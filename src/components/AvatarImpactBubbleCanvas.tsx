import { useEffect, useRef } from 'react';
import {
  createImpactSimulation,
  stepImpactSimulation,
  triggerInteractiveRipple,
  type AvatarImpactEvent,
  type ImpactChipParticle,
  type ImpactSimulationState,
  type ImpactSparkParticle,
} from '../utils/avatarImpactFx';

interface AvatarImpactBubbleCanvasProps {
  event: AvatarImpactEvent | null;
  playerId: string;
  placement?: 'self' | 'opponent';
  interactiveNonce?: number;
}

const DIMENSIONS = {
  self: { width: 344, height: 176, originX: 172, originY: 136 },
  opponent: { width: 288, height: 134, originX: 144, originY: 108 },
} as const;

function drawChamferedBubblePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cut: number,
  tailW: number,
  tailH: number
) {
  const halfW = w / 2;
  const cx = x + halfW;
  const right = x + w;
  const bottom = y + h;

  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(right - cut, y);
  ctx.lineTo(right, y + cut);
  ctx.lineTo(right, bottom - cut);
  ctx.lineTo(right - cut, bottom);
  // Downward speech pointer targeting avatar crown
  ctx.lineTo(cx + tailW * 0.5, bottom);
  ctx.lineTo(cx, bottom + tailH);
  ctx.lineTo(cx - tailW * 0.5, bottom);
  ctx.lineTo(x + cut, bottom);
  ctx.lineTo(x, bottom - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

function drawRoundedBubblePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  tailW: number,
  tailH: number
) {
  const cx = x + w / 2;
  const right = x + w;
  const bottom = y + h;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(right - r, y);
  ctx.quadraticCurveTo(right, y, right, y + r);
  ctx.lineTo(right, bottom - r);
  ctx.quadraticCurveTo(right, bottom, right - r, bottom);
  ctx.lineTo(cx + tailW * 0.5, bottom);
  ctx.lineTo(cx, bottom + tailH);
  ctx.lineTo(cx - tailW * 0.5, bottom);
  ctx.lineTo(x + r, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawClayChip(ctx: CanvasRenderingContext2D, chip: ImpactChipParticle) {
  if (chip.life >= chip.maxLife) return;
  const lifeRatio = chip.life / chip.maxLife;
  const alpha = lifeRatio > 0.72 ? Math.max(0, 1 - (lifeRatio - 0.72) / 0.28) : 1;
  if (alpha <= 0.01) return;

  const tiltCos = Math.cos(chip.tilt);
  const foreshorten = 0.34 + 0.66 * Math.abs(tiltCos);
  const rx = chip.radius;
  const ry = Math.max(2.1, chip.radius * foreshorten);
  const thickness = Math.max(1.2, (1 - foreshorten) * 3.6 + 1.1);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(chip.x, chip.y);

  // Soft contact shadow while tumbling near air/table
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  ctx.ellipse(0, thickness + 2.2, rx * 0.92, ry * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3D extruded clay rim (bottom edge)
  ctx.fillStyle = chip.spec.rim;
  ctx.beginPath();
  ctx.ellipse(0, thickness, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main clay chip face
  ctx.fillStyle = chip.spec.base;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rotating 6 casino edge inlays projected onto ellipse
  ctx.strokeStyle = chip.spec.stripe;
  ctx.lineWidth = Math.max(1.2, rx * 0.22);
  for (let i = 0; i < 6; i++) {
    const a = chip.rot + (i * Math.PI) / 3;
    const x1 = Math.cos(a) * rx * 0.68;
    const y1 = Math.sin(a) * ry * 0.68;
    const x2 = Math.cos(a) * rx * 0.96;
    const y2 = Math.sin(a) * ry * 0.96;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Inner embossed recess & brass highlight ring
  ctx.fillStyle = chip.spec.inner;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.56, ry * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 246, 214, 0.48)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.54, ry * 0.54, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Top-left specular glint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.24, -ry * 0.26, rx * 0.26, ry * 0.16, -0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSpark(ctx: CanvasRenderingContext2D, s: ImpactSparkParticle) {
  if (s.life >= s.maxLife) return;
  const p = s.life / s.maxLife;
  const alpha = Math.max(0, 1 - p * p);
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Motion streak trail
  const dx = s.x - s.prevX;
  const dy = s.y - s.prevY;
  if (dx * dx + dy * dy > 0.4) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = Math.max(1, s.size * 0.65);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.prevX - dx * 0.55, s.prevY - dy * 0.55);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
  }

  ctx.fillStyle = s.color;
  if (s.isStar) {
    // 4-point luxury star glint
    const rOuter = s.size * 2.05;
    const rInner = s.size * 0.52;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r = i % 2 === 0 ? rOuter : rInner;
      const px = s.x + Math.cos(a) * r;
      const py = s.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBubblePlaque(
  ctx: CanvasRenderingContext2D,
  sim: ImpactSimulationState,
  isSelf: boolean
) {
  const { event, pose, originX, originY, elapsed } = sim;
  if (pose.opacity <= 0.01) return;

  const isAllIn = event.kind === 'allin';
  const isPotWin = event.kind === 'pot_win';
  const hasSubtitle = Boolean(event.subtitle);

  ctx.save();
  ctx.globalAlpha = pose.opacity;

  // Anchor bubble squarely above impact origin with spring + trauma micro-shake
  const anchorY = isAllIn || isPotWin ? originY - 12 : originY - 8;
  ctx.translate(originX + pose.shakeX, anchorY + pose.offsetY + pose.shakeY);
  ctx.scale(pose.scaleX, pose.scaleY);

  const titleFont = isAllIn
    ? `900 ${isSelf ? 15 : 13.5}px "Space Grotesk", "Noto Sans SC", system-ui, sans-serif`
    : isPotWin
      ? `800 ${isSelf ? 16 : 14}px "JetBrains Mono", "Space Grotesk", monospace`
      : `700 ${isSelf ? 12 : 11}px "Noto Sans SC", system-ui, sans-serif`;

  const subFont = `600 ${isSelf ? 10.5 : 9.5}px "JetBrains Mono", "Noto Sans SC", sans-serif`;

  ctx.font = titleFont;
  const titleW = ctx.measureText(event.title).width;
  let subW = 0;
  if (hasSubtitle && event.subtitle) {
    ctx.font = subFont;
    subW = ctx.measureText(event.subtitle).width;
  }

  const padX = isAllIn ? 18 : isPotWin ? 17 : 12;
  const minW = isAllIn ? (isSelf ? 136 : 122) : isPotWin ? (isSelf ? 132 : 118) : 64;
  const maxW = sim.width - 28;
  const boxW = Math.min(maxW, Math.max(minW, Math.max(titleW, subW) + padX * 2));
  const boxH = isAllIn || isPotWin ? (hasSubtitle ? (isSelf ? 48 : 42) : 34) : 26;
  const tailH = isAllIn || isPotWin ? 7 : 5;
  const tailW = isAllIn || isPotWin ? 12 : 9;

  const left = -boxW / 2;
  const top = -boxH - tailH;

  if (isAllIn) {
    // Crimson/Amber Heavy Strike Outer Glow
    ctx.shadowColor = 'rgba(220, 38, 38, 0.72)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;

    drawChamferedBubblePath(ctx, left, top, boxW, boxH, 7, tailW, tailH);
    const bgGrad = ctx.createLinearGradient(0, top, 0, top + boxH);
    bgGrad.addColorStop(0, '#2B0D0F');
    bgGrad.addColorStop(0.52, '#170809');
    bgGrad.addColorStop(1, '#0F0607');
    ctx.fillStyle = bgGrad;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Diagonal metallic sheen sweep across plaque
    ctx.save();
    drawChamferedBubblePath(ctx, left, top, boxW, boxH, 7, tailW, tailH);
    ctx.clip();
    const sheenT = (elapsed * 1.65) % 1.45;
    const sheenX = left - 40 + sheenT * (boxW + 80);
    const sheenGrad = ctx.createLinearGradient(sheenX - 18, top, sheenX + 18, top + boxH);
    sheenGrad.addColorStop(0, 'rgba(255, 232, 163, 0)');
    sheenGrad.addColorStop(0.5, 'rgba(254, 240, 138, 0.28)');
    sheenGrad.addColorStop(1, 'rgba(255, 232, 163, 0)');
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(left, top, boxW, boxH);

    // Slam-in white-gold impact flash
    if (pose.flashAlpha > 0.02) {
      ctx.fillStyle = `rgba(254, 243, 199, ${pose.flashAlpha * 0.58})`;
      ctx.fillRect(left, top, boxW, boxH);
    }
    ctx.restore();

    // Molten gold-to-crimson outer metallic border
    drawChamferedBubblePath(ctx, left, top, boxW, boxH, 7, tailW, tailH);
    const borderGrad = ctx.createLinearGradient(left, top, left + boxW, top + boxH);
    borderGrad.addColorStop(0, '#FDE68A');
    borderGrad.addColorStop(0.35, '#F59E0B');
    borderGrad.addColorStop(0.7, '#EF4444');
    borderGrad.addColorStop(1, '#FBBF24');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 2.1;
    ctx.stroke();

    // Inner razor hairline accent
    ctx.strokeStyle = 'rgba(254, 215, 170, 0.22)';
    ctx.lineWidth = 0.85;
    ctx.strokeRect(left + 4, top + 3.5, boxW - 8, boxH - 7);

    // Impact diamond emblem centered on top rim
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.moveTo(0, top - 4);
    ctx.lineTo(5, top);
    ctx.lineTo(0, top + 4);
    ctx.lineTo(-5, top);
    ctx.closePath();
    ctx.fill();

    // Headline: ALL-IN 全下
    ctx.font = titleFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleY = hasSubtitle ? top + boxH * 0.39 : top + boxH * 0.52;
    const textGrad = ctx.createLinearGradient(0, titleY - 8, 0, titleY + 8);
    textGrad.addColorStop(0, '#FFFBEB');
    textGrad.addColorStop(0.55, '#FDE047');
    textGrad.addColorStop(1, '#F59E0B');
    ctx.fillStyle = textGrad;
    ctx.fillText(event.title, 0, titleY, boxW - 14);

    if (hasSubtitle && event.subtitle) {
      ctx.font = subFont;
      ctx.fillStyle = '#FCA5A5';
      ctx.fillText(event.subtitle, 0, top + boxH * 0.76, boxW - 16);
    }
  } else if (isPotWin) {
    // Luxury Champagne-Gold & Emerald Victory Plaque
    ctx.shadowColor = 'rgba(212, 168, 83, 0.58)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;

    drawChamferedBubblePath(ctx, left, top, boxW, boxH, 7, tailW, tailH);
    const bgGrad = ctx.createLinearGradient(0, top, 0, top + boxH);
    bgGrad.addColorStop(0, '#13241C');
    bgGrad.addColorStop(0.55, '#0D1712');
    bgGrad.addColorStop(1, '#09100D');
    ctx.fillStyle = bgGrad;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Gold specular sweep
    ctx.save();
    drawChamferedBubblePath(ctx, left, top, boxW, boxH, 7, tailW, tailH);
    ctx.clip();
    const sheenT = (elapsed * 1.15) % 1.45;
    const sheenX = left - 36 + sheenT * (boxW + 72);
    const sheenGrad = ctx.createLinearGradient(sheenX - 20, top, sheenX + 20, top + boxH);
    sheenGrad.addColorStop(0, 'rgba(248, 226, 160, 0)');
    sheenGrad.addColorStop(0.5, 'rgba(248, 226, 160, 0.24)');
    sheenGrad.addColorStop(1, 'rgba(248, 226, 160, 0)');
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(left, top, boxW, boxH);

    if (pose.flashAlpha > 0.02) {
      ctx.fillStyle = `rgba(255, 248, 220, ${pose.flashAlpha * 0.36})`;
      ctx.fillRect(left, top, boxW, boxH);
    }
    ctx.restore();

    // Burnished gold metallic border
    drawChamferedBubblePath(ctx, left, top, boxW, boxH, 7, tailW, tailH);
    const borderGrad = ctx.createLinearGradient(left, top, left + boxW, top + boxH);
    borderGrad.addColorStop(0, '#FFF2C6');
    borderGrad.addColorStop(0.45, '#D4A853');
    borderGrad.addColorStop(0.85, '#6EE7B7');
    borderGrad.addColorStop(1, '#F3DFAC');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    // Top crown diamond accent
    ctx.fillStyle = '#F3DFAC';
    ctx.beginPath();
    ctx.moveTo(0, top - 4);
    ctx.lineTo(4.5, top);
    ctx.lineTo(0, top + 4);
    ctx.lineTo(-4.5, top);
    ctx.closePath();
    ctx.fill();

    // Amount Headline (+1,240)
    ctx.font = titleFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleY = hasSubtitle ? top + boxH * 0.39 : top + boxH * 0.52;
    const textGrad = ctx.createLinearGradient(0, titleY - 8, 0, titleY + 8);
    textGrad.addColorStop(0, '#FFFDF5');
    textGrad.addColorStop(0.6, '#F5DFA4');
    textGrad.addColorStop(1, '#D4A853');
    ctx.fillStyle = textGrad;
    ctx.fillText(event.title, 0, titleY, boxW - 14);

    if (hasSubtitle && event.subtitle) {
      ctx.font = subFont;
      ctx.fillStyle = '#8CD8B8';
      ctx.fillText(event.subtitle, 0, top + boxH * 0.76, boxW - 14);
    }
  } else {
    // Restrained luxury velvet salon bubble for routine poker actions
    const palette =
      event.kind === 'raise'
        ? { bg: 'rgba(20, 17, 11, 0.95)', border: 'rgba(212, 168, 83, 0.68)', text: '#F3DFAC' }
        : event.kind === 'fold'
          ? { bg: 'rgba(24, 13, 15, 0.94)', border: 'rgba(184, 92, 92, 0.55)', text: '#E8A1A1' }
          : event.kind === 'reveal'
            ? { bg: 'rgba(17, 20, 23, 0.95)', border: 'rgba(255, 255, 255, 0.3)', text: '#ECE7DC' }
            : { bg: 'rgba(12, 22, 18, 0.94)', border: 'rgba(94, 158, 130, 0.58)', text: '#9AD4B8' };

    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    drawRoundedBubblePath(ctx, left, top, boxW, boxH, 6, tailW, tailH);
    ctx.fillStyle = palette.bg;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.font = titleFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.text;
    ctx.fillText(event.title, 0, top + boxH * 0.52, boxW - 12);
  }

  ctx.restore();
}

function renderImpactFrame(
  ctx: CanvasRenderingContext2D,
  sim: ImpactSimulationState,
  isSelf: boolean
) {
  const { width, height, originX, originY, event, elapsed } = sim;
  ctx.clearRect(0, 0, width, height);

  const isAllIn = event.kind === 'allin';
  const isPotWin = event.kind === 'pot_win';

  const burstCenterY = originY - 34;

  // 1. Ambient impact burst halo behind shockwaves & plaque
  if ((isAllIn || isPotWin) && sim.pose.opacity > 0.02) {
    const auraAlpha = Math.min(1, sim.pose.opacity) * (isAllIn ? 0.56 : 0.45);
    const auraRadius = isAllIn ? (isSelf ? 96 : 78) : isSelf ? 88 : 72;
    const grad = ctx.createRadialGradient(
      originX,
      burstCenterY,
      6,
      originX,
      burstCenterY,
      auraRadius
    );
    if (isAllIn) {
      grad.addColorStop(0, `rgba(251, 191, 36, ${auraAlpha})`);
      grad.addColorStop(0.42, `rgba(220, 38, 38, ${auraAlpha * 0.72})`);
      grad.addColorStop(1, 'rgba(220, 38, 38, 0)');
    } else {
      grad.addColorStop(0, `rgba(243, 223, 172, ${auraAlpha})`);
      grad.addColorStop(0.45, `rgba(16, 185, 129, ${auraAlpha * 0.52})`);
      grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(originX, burstCenterY, auraRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Expanding double shockwave rings
  for (let i = 0; i < sim.shockwaves.length; i++) {
    const sw = sim.shockwaves[i];
    if (sw.alpha <= 0.01 || sw.progress <= 0 || sw.progress >= 1) continue;
    ctx.save();
    ctx.globalAlpha = sw.alpha;
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = Math.max(0.8, sw.lineWidth * (1 - sw.progress * 0.55));
    if (sw.dashed) {
      ctx.setLineDash([8, 6]);
    }
    ctx.beginPath();
    ctx.ellipse(originX, burstCenterY, sw.radius, sw.radius * 0.58, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Heavy Strike radial kinetic slash spikes (All-in)
  if (sim.strikeRays.length > 0 && elapsed < 1.15) {
    const rayAlpha = Math.max(0, 1 - Math.pow(elapsed / 1.15, 1.35));
    ctx.save();
    ctx.translate(originX + sim.pose.shakeX * 0.5, burstCenterY + sim.pose.shakeY * 0.5);
    ctx.globalAlpha = rayAlpha * 0.96;
    for (let i = 0; i < sim.strikeRays.length; i++) {
      const ray = sim.strikeRays[i];
      const cos = Math.cos(ray.angle);
      const sin = Math.sin(ray.angle);
      const widthFade = Math.max(0.28, 1 - elapsed * 0.65);
      const perpX = -sin * ray.width * widthFade;
      const perpY = cos * ray.width * widthFade;

      const x0 = cos * ray.innerRadius;
      const y0 = sin * ray.innerRadius * 0.72;
      const xMid = cos * (ray.innerRadius + (ray.outerRadius - ray.innerRadius) * 0.42);
      const yMid = sin * (ray.innerRadius + (ray.outerRadius - ray.innerRadius) * 0.42) * 0.72;
      const xTip = cos * ray.outerRadius;
      const yTip = sin * ray.outerRadius * 0.72;

      ctx.fillStyle = ray.color;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(xMid + perpX, yMid + perpY);
      ctx.lineTo(xTip, yTip);
      ctx.lineTo(xMid - perpX, yMid - perpY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 4. Tumbling casino clay chips behind the plaque (keeps typography 100% crisp at launch)
  const plaqueHalfW = isSelf ? 72 : 62;
  const plaqueTopY = originY - (isAllIn || isPotWin ? 64 : 40);
  const plaqueBotY = originY - 10;
  const isBehindPlaque = (c: ImpactChipParticle) =>
    Math.abs(c.x - originX) < plaqueHalfW && c.y > plaqueTopY && c.y < plaqueBotY;

  for (let i = 0; i < sim.chips.length; i++) {
    const chip = sim.chips[i];
    if (isBehindPlaque(chip) || chip.y < plaqueTopY + 14) {
      drawClayChip(ctx, chip);
    }
  }

  // 5. Dynamic Canvas Speech / Impact Plaque
  drawBubblePlaque(ctx, sim, isSelf);

  // 6. Escaped perimeter & lower-arc tumbling clay chips in front for rich 3D depth
  for (let i = 0; i < sim.chips.length; i++) {
    const chip = sim.chips[i];
    if (!isBehindPlaque(chip) && chip.y >= plaqueTopY + 14) {
      drawClayChip(ctx, chip);
    }
  }

  // 7. Foreground ember / gold foil sparks & 4-point glints
  for (let i = 0; i < sim.sparks.length; i++) {
    drawSpark(ctx, sim.sparks[i]);
  }
}

export function AvatarImpactBubbleCanvas({
  event,
  playerId,
  placement = 'opponent',
  interactiveNonce = 0,
}: AvatarImpactBubbleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<ImpactSimulationState | null>(null);
  const lastNonceRef = useRef(interactiveNonce);

  const dims = DIMENSIONS[placement];
  const isSelf = placement === 'self';

  // Trigger live interactive spark/chip ripple when player hovers or taps avatar during active bubble
  useEffect(() => {
    if (interactiveNonce !== lastNonceRef.current) {
      lastNonceRef.current = interactiveNonce;
      if (simRef.current && !simRef.current.done) {
        triggerInteractiveRipple(simRef.current);
      }
    }
  }, [interactiveNonce]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!event || !canvas) {
      simRef.current = null;
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(dims.width * dpr);
    canvas.height = Math.round(dims.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sim = createImpactSimulation(
      event,
      dims.width,
      dims.height,
      dims.originX,
      dims.originY
    );
    simRef.current = sim;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      // Render a crisp single settled frame without camera shake or rapid particle motion
      sim.trauma = 0;
      sim.hitstopRemaining = 0;
      sim.elapsed = 0.28;
      sim.strikeRays = [];
      sim.chips = sim.chips.slice(0, 6);
      sim.sparks = [];
      stepImpactSimulation(sim, 0.016);
      sim.pose.shakeX = 0;
      sim.pose.shakeY = 0;
      renderImpactFrame(ctx, sim, isSelf);
      return () => {
        simRef.current = null;
      };
    }

    let rafId = 0;
    let lastTime = performance.now();

    // Paint initial slam frame immediately so fast screenshots/eye capture zero blank flash
    stepImpactSimulation(sim, 0.016);
    renderImpactFrame(ctx, sim, isSelf);

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      stepImpactSimulation(sim, dt);
      renderImpactFrame(ctx, sim, isSelf);
      if (!sim.done) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, dims.width, dims.height);
      }
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      simRef.current = null;
    };
  }, [event, dims.width, dims.height, dims.originX, dims.originY, isSelf]);

  if (!event) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid={`avatar-impact-canvas-${playerId}`}
      data-impact-kind={event.kind}
      data-impact-title={event.title}
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-full left-1/2 z-50 -translate-x-1/2 select-none ${
        isSelf ? '-mb-8' : '-mb-7'
      }`}
      style={{
        width: `${dims.width}px`,
        height: `${dims.height}px`,
      }}
    />
  );
}
