import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Card, HandReviewReport, Rank, Suit } from '../src/shared/types';
import {
  buildGtoSpotWorkbench,
  classifyEvLossGrade,
  computeBayesianPosterior,
  NODE_LOCK_PRESETS,
  type GtoActionKey,
  type GtoActionOption,
  type GtoEngineSource,
  type GtoEvGrade,
  type GtoNodeLockRequest,
  type GtoNodeLockResponse,
  type GtoSpotAnalysisRequest,
  type GtoSpotWorkbenchData,
  type NodeLockActionDiff,
  type NodeLockExploitResult,
  type NodeLockPresetId,
  type RangeMatrixCell,
  type RangeMatrixMix,
} from '../src/shared/gtoWorkbench';
import {
  analyzeBoardTexture,
  computeMdf,
  encodeCardInt,
  estimatePostflopEquity,
  evaluateBlockers,
  getGtoPreflopMix,
  toCanonicalHandKey,
  type GtoPosition,
} from './gtoRanges';
import {
  aggregateConcreteStrategyTo169,
  bucketPotBB,
  bucketSpr,
  buildTexasSolverScript,
  canonicalizeSuitIsomorphism,
  LruSolverCache,
  normalizeMixTo100,
  type CanonicalIsomorphismResult,
} from './gtoIsomorphism';
import type { SessionOpponentProfiler } from './opponentProfiler';

export {
  aggregateConcreteStrategyTo169,
  bucketPotBB,
  bucketSpr,
  buildTexasSolverScript,
  canonicalizeSuitIsomorphism,
  LruSolverCache,
  type CanonicalIsomorphismResult,
};

const VALID_SUITS = new Set<Suit>(['spades', 'hearts', 'diamonds', 'clubs']);
const MAX_SOLVER_CONCURRENCY = Math.max(1, Math.floor(os.cpus().length / 2));
const SOLVER_TIMEOUT_MS = 4500;

export const sharedGtoSpotCache = new LruSolverCache<GtoSpotWorkbenchData>(512);

function isValidCard(c: unknown): c is Card {
  if (!c || typeof c !== 'object') return false;
  const candidate = c as { suit?: unknown; rank?: unknown };
  const rankNum = Number(candidate.rank);
  return (
    typeof candidate.suit === 'string' &&
    VALID_SUITS.has(candidate.suit as Suit) &&
    Number.isInteger(rankNum) &&
    rankNum >= 2 &&
    rankNum <= 14
  );
}

export function validateSpotRequest(
  raw: unknown
): { ok: true; req: GtoSpotAnalysisRequest } | { ok: false; code: 'INVALID_SPOT_STATE'; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, code: 'INVALID_SPOT_STATE', error: '请求体不能为空' };
  }
  const r = raw as Partial<GtoSpotAnalysisRequest>;
  const street = r.street;
  if (street !== 'preflop' && street !== 'flop' && street !== 'turn' && street !== 'river') {
    return { ok: false, code: 'INVALID_SPOT_STATE', error: 'street 必须为 preflop / flop / turn / river' };
  }

  const holeCards = Array.isArray(r.heroHoleCards) ? r.heroHoleCards : [];
  if (holeCards.length !== 0 && (holeCards.length !== 2 || !holeCards.every(isValidCard))) {
    return { ok: false, code: 'INVALID_SPOT_STATE', error: 'heroHoleCards 必须为空或 2 张合法底牌' };
  }

  const communityCards = Array.isArray(r.communityCards) ? r.communityCards : [];
  if (!communityCards.every(isValidCard)) {
    return { ok: false, code: 'INVALID_SPOT_STATE', error: 'communityCards 包含无效牌面' };
  }

  const visibleBoardCount =
    street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
  if (street !== 'preflop' && communityCards.length < visibleBoardCount) {
    return {
      ok: false,
      code: 'INVALID_SPOT_STATE',
      error: `${street} 阶段至少需要 ${visibleBoardCount} 张公共牌`,
    };
  }

  const allCards = [...holeCards, ...communityCards.slice(0, visibleBoardCount)];
  const seen = new Set<number>();
  for (const c of allCards) {
    const id = encodeCardInt({ suit: c.suit, rank: Number(c.rank) as Rank });
    if (seen.has(id)) {
      return { ok: false, code: 'INVALID_SPOT_STATE', error: '底牌与公共牌存在重复牌面' };
    }
    seen.add(id);
  }

  const bigBlind = Math.max(1, Math.min(100_000, Number(r.bigBlind) || 20));
  const potBeforeChips = Math.max(bigBlind, Math.min(10_000_000, Number(r.potBeforeChips) || bigBlind * 1.5));
  const toCallChips = Math.max(0, Math.min(10_000_000, Number(r.toCallChips) || 0));
  const effectiveStackChips = Math.max(
    bigBlind,
    Math.min(10_000_000, Number(r.effectiveStackChips) || bigBlind * 100)
  );

  const action: GtoActionKey =
    r.heroActualAction === 'raise' ||
    r.heroActualAction === 'call' ||
    r.heroActualAction === 'check' ||
    r.heroActualAction === 'fold'
      ? r.heroActualAction
      : toCallChips > 0
        ? 'call'
        : 'check';

  return {
    ok: true,
    req: {
      roomId: typeof r.roomId === 'string' ? r.roomId.trim().slice(0, 32) : undefined,
      handNumber: Math.max(0, Math.floor(Number(r.handNumber) || 1)),
      decisionStep: Math.max(0, Math.floor(Number(r.decisionStep) || 0)),
      street,
      heroPosition: typeof r.heroPosition === 'string' && r.heroPosition.trim() ? r.heroPosition.trim().toUpperCase() : 'BTN',
      villainPosition: typeof r.villainPosition === 'string' ? r.villainPosition.trim().toUpperCase() : undefined,
      heroHoleCards: holeCards.map((c) => ({ suit: c.suit, rank: Number(c.rank) as Rank })),
      communityCards: communityCards.map((c) => ({ suit: c.suit, rank: Number(c.rank) as Rank })),
      potBeforeChips,
      toCallChips,
      effectiveStackChips,
      bigBlind,
      heroActualAction: action,
      heroActualLabel: typeof r.heroActualLabel === 'string' && r.heroActualLabel.trim() ? r.heroActualLabel.trim().slice(0, 32) : action,
      heroBetChips: typeof r.heroBetChips === 'number' && Number.isFinite(r.heroBetChips) ? Math.max(0, r.heroBetChips) : undefined,
      allowAsyncSolver: Boolean(r.allowAsyncSolver),
    },
  };
}

function mapPositionToGto(rawPos: string): GtoPosition {
  const upper = rawPos.toUpperCase();
  if (upper === 'UTG' || upper === 'HJ' || upper === 'CO' || upper === 'BTN' || upper === 'SB' || upper === 'BB') {
    return upper;
  }
  if (upper.includes('BTN') || upper.includes('庄')) return 'BTN';
  if (upper.includes('SB') || upper.includes('小盲')) return 'SB';
  if (upper.includes('BB') || upper.includes('大盲')) return 'BB';
  if (upper.includes('CO') || upper.includes('关煞')) return 'CO';
  if (upper.includes('HJ') || upper.includes('劫位')) return 'HJ';
  return 'UTG';
}

function createSeededRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ============================================================================
// Layer 3 Optional External CPU Solver Worker Pool (Zero Shell Injection)
// ============================================================================

let activeTexasSolverWorkers = 0;

async function tryRunTexasSolverBinary(params: {
  binaryPath: string;
  potBB: number;
  effectiveStackBB: number;
  canonicalBoard: Card[];
  geometricPct: number;
}): Promise<{ actions: string[]; strategy: Record<string, number[]>; solveTimeMs: number } | null> {
  if (activeTexasSolverWorkers >= MAX_SOLVER_CONCURRENCY) {
    return null;
  }
  try {
    await fs.access(params.binaryPath);
  } catch {
    return null;
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const tmpDir = path.join(os.tmpdir(), 'velvet-texassolver', jobId);
  const scriptPath = path.join(tmpDir, 'job.txt');
  const outputPath = path.join(tmpDir, 'result.json');
  const script = buildTexasSolverScript({
    potBB: params.potBB,
    effectiveStackBB: params.effectiveStackBB,
    canonicalBoard: params.canonicalBoard,
    geometricPct: params.geometricPct,
    outputPath,
  });
  if (!script) return null;

  activeTexasSolverWorkers += 1;
  const startedAt = Date.now();
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(scriptPath, script, 'utf-8');

    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(params.binaryPath, ['-i', scriptPath], {
        shell: false,
        stdio: 'ignore',
      });
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        resolve(false);
      }, SOLVER_TIMEOUT_MS);

      child.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });

    if (!ok) return null;
    const rawJson = await fs.readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(rawJson) as {
      actions?: string[];
      strategy?: { strategy?: Record<string, number[]> };
    };
    if (!Array.isArray(parsed.actions) || !parsed.strategy?.strategy) {
      return null;
    }
    return {
      actions: parsed.actions,
      strategy: parsed.strategy.strategy,
      solveTimeMs: Date.now() - startedAt,
    };
  } catch {
    return null;
  } finally {
    activeTexasSolverWorkers = Math.max(0, activeTexasSolverWorkers - 1);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ============================================================================
// Core Server-Side 3-Tier Spot Solver (POST /api/gto/spot-analysis)
// ============================================================================

function synthesizeReportFromSpotRequest(req: GtoSpotAnalysisRequest): HandReviewReport {
  const visibleBoardCount =
    req.street === 'preflop' ? 0 : req.street === 'flop' ? 3 : req.street === 'turn' ? 4 : 5;
  const visibleBoard = req.communityCards.slice(0, visibleBoardCount);
  const canonicalHand =
    req.heroHoleCards.length === 2 ? toCanonicalHandKey(req.heroHoleCards) : null;
  const facingBet = req.toCallChips > 0;
  const potOddsPct = facingBet
    ? Math.round((req.toCallChips / Math.max(1, req.potBeforeChips + req.toCallChips)) * 100)
    : 0;
  const mdfPct = facingBet
    ? Math.round(computeMdf(Math.max(1, req.potBeforeChips - req.toCallChips), req.toCallChips) * 100)
    : 100;
  const spr = round2(req.effectiveStackChips / Math.max(1, req.potBeforeChips));

  // Compute real server-side Monte Carlo equity or preflop blueprint mix
  let estimatedEquityPct: number | null = null;
  let preflopMix: { raise: number; call: number; fold: number } | null = null;
  let recommendedAction: GtoActionKey = facingBet ? 'call' : 'check';
  let recommendedLabel = facingBet ? '跟注防守' : '过牌控池';

  const gtoPos = mapPositionToGto(req.heroPosition);
  const effectiveStackBB = req.effectiveStackChips / Math.max(1, req.bigBlind);

  if (req.street === 'preflop' && req.heroHoleCards.length === 2) {
    const facingRaises = req.toCallChips > req.bigBlind ? 1 : 0;
    const mix = getGtoPreflopMix({
      holeCards: req.heroHoleCards,
      position: gtoPos,
      facingRaises,
      facingBetBB: (req.toCallChips + req.bigBlind) / Math.max(1, req.bigBlind),
      effectiveStackBB,
      isHeadsUp: false,
      canCheck: !facingBet,
    });
    preflopMix = {
      raise: Math.round(mix.raise * 100),
      call: Math.round(mix.call * 100),
      fold: Math.round(mix.fold * 100),
    };
    if (mix.raise >= mix.call && mix.raise >= mix.fold && mix.raise > 0.2) {
      recommendedAction = 'raise';
      recommendedLabel = effectiveStackBB <= 15 ? 'Nash 短码全下' : facingRaises === 0 ? '标准开池加注' : '价值/均衡 3-Bet';
    } else if (!facingBet) {
      recommendedAction = 'check';
      recommendedLabel = '大盲过牌看翻牌';
    } else if (mix.call >= mix.fold) {
      recommendedAction = 'call';
      recommendedLabel = '位置跟注防守';
    } else {
      recommendedAction = 'fold';
      recommendedLabel = '遵循范围纪律弃牌';
    }
  } else if (visibleBoard.length >= 3 && req.heroHoleCards.length === 2) {
    const iso = canonicalizeSuitIsomorphism(visibleBoard, req.heroHoleCards);
    const seed = hashString(`${iso.canonicalBoardKey}:${canonicalHand}:${req.potBeforeChips}:${req.toCallChips}`);
    const villainTightness = facingBet
      ? Math.min(0.68, 0.25 + (req.toCallChips / Math.max(1, req.potBeforeChips)) * 0.25)
      : 0.24;
    const mcEq = estimatePostflopEquity({
      holeCards: iso.canonicalHoleCards,
      board: iso.canonicalBoard,
      opponentCount: 1,
      villainTightness,
      iterations: 220,
      rng: createSeededRng(seed),
    });
    estimatedEquityPct = Math.round(mcEq * 100);
    const texture = analyzeBoardTexture(visibleBoard);
    const blockers = evaluateBlockers(req.heroHoleCards, visibleBoard, texture);

    if (!facingBet) {
      if (mcEq >= 0.64) {
        recommendedAction = 'raise';
        recommendedLabel =
          texture.isDryHighBoard && req.street === 'flop'
            ? '33% 池高频范围持续下注'
            : '66% 池价值下注';
      } else if (req.street === 'river' && mcEq <= 0.25 && blockers.bluffScore >= 0.48) {
        recommendedAction = 'raise';
        recommendedLabel = '带阻断牌 75% 池极化偷池';
      } else {
        recommendedAction = 'check';
        recommendedLabel = '过牌控池保护过牌范围';
      }
    } else {
      if (mcEq >= 0.78) {
        recommendedAction = 'raise';
        recommendedLabel = '强牌价值加注建立底池';
      } else if (mcEq * 100 >= potOddsPct + 2) {
        recommendedAction = 'call';
        recommendedLabel = '满足赔率与 MDF 跟注防守';
      } else {
        recommendedAction = 'fold';
        recommendedLabel = '胜率低于底池赔率纪律弃牌';
      }
    }
  }

  return {
    handNumber: req.handNumber,
    timestamp: Date.now(),
    heroId: 'hero',
    heroName: 'Hero',
    heroPosition: req.heroPosition,
    heroHoleCards: req.heroHoleCards.length === 2 ? req.heroHoleCards : null,
    canonicalHand,
    communityCards: visibleBoard,
    bigBlind: req.bigBlind,
    pot: req.potBeforeChips,
    netDelta: 0,
    outcome: 'split',
    overallScore: 80,
    grade: 'B',
    headline: 'GTO 服务端节点求解',
    summary: '',
    streets: [
      {
        street: req.street,
        streetLabel:
          req.street === 'preflop'
            ? '翻牌前'
            : req.street === 'flop'
              ? '翻牌圈'
              : req.street === 'turn'
                ? '转牌圈'
                : '河牌圈',
        boardCards: visibleBoard,
        boardSummary: '',
        potStart: req.potBeforeChips,
        potEnd: req.potBeforeChips + (req.heroBetChips ?? req.toCallChips),
        events: [],
        heroDecisions: [
          {
            step: req.decisionStep,
            street: req.street,
            actualActionType: req.heroActualAction,
            actualActionLabel: req.heroActualLabel,
            recommendedAction,
            recommendedLabel,
            verdict: req.heroActualAction === recommendedAction ? 'optimal' : 'inaccuracy',
            verdictLabel: req.heroActualAction === recommendedAction ? '最优决策' : '存在偏离',
            evidence: {
              potBefore: req.potBeforeChips,
              toCall: req.toCallChips,
              potOddsPct,
              mdfPct,
              estimatedEquityPct,
              preflopMix,
              betToPotPct:
                req.heroBetChips && req.potBeforeChips > 0
                  ? Math.round((req.heroBetChips / req.potBeforeChips) * 100)
                  : null,
              spr,
            },
            analysis: '',
            suggestion: '',
          },
        ],
      },
    ],
    keyMoments: [],
    teaching: {
      topic: 'GTO 均衡与范围几何',
      principle: '',
      formulaOrRule: '',
      nextHandDrill: '',
    },
    handTypeLabel: '单节点复盘',
  };
}

export async function solveGtoSpotServer(
  rawReq: unknown,
  options: {
    profiler?: SessionOpponentProfiler | null;
    texasSolverBin?: string;
    cache?: LruSolverCache<GtoSpotWorkbenchData>;
  } = {}
): Promise<
  | { ok: true; data: GtoSpotWorkbenchData }
  | { ok: false; code: 'INVALID_SPOT_STATE'; error: string }
> {
  const validated = validateSpotRequest(rawReq);
  if (!validated.ok) return validated;
  const req = validated.req;
  const startedAt = Date.now();
  const cache = options.cache ?? sharedGtoSpotCache;

  const visibleBoardCount =
    req.street === 'preflop' ? 0 : req.street === 'flop' ? 3 : req.street === 'turn' ? 4 : 5;
  const visibleBoard = req.communityCards.slice(0, visibleBoardCount);
  const iso = canonicalizeSuitIsomorphism(visibleBoard, req.heroHoleCards);
  const potBB = req.potBeforeChips / Math.max(1, req.bigBlind);
  const spr = req.effectiveStackChips / Math.max(1, req.potBeforeChips);
  const heroCanonKey =
    iso.canonicalHoleCards.length === 2 ? toCanonicalHandKey(iso.canonicalHoleCards) : 'NONE';

  const cacheKey = [
    'gto:v2',
    req.street,
    iso.canonicalBoardKey,
    bucketPotBB(potBB),
    bucketSpr(spr),
    req.heroPosition,
    req.toCallChips > 0 ? 'facing_bet' : 'unopened',
    heroCanonKey,
    req.heroActualAction,
  ].join(':');

  const cached = cache.get(cacheKey);
  if (cached) {
    return {
      ok: true,
      data: {
        ...cached,
        handNumber: req.handNumber,
        decisionStep: req.decisionStep,
        heroActualLabel: req.heroActualLabel,
        solverMeta: {
          ...cached.solverMeta,
          cacheHit: true,
          solveTimeMs: Math.max(1, Date.now() - startedAt),
        },
      },
    };
  }

  // Canonicalize cards so suit-isomorphic spots produce identical deterministic outputs
  const canonicalReq: GtoSpotAnalysisRequest = {
    ...req,
    heroHoleCards: iso.canonicalHoleCards,
    communityCards: iso.canonicalBoard,
  };
  const syntheticReport = synthesizeReportFromSpotRequest(canonicalReq);
  const decision = syntheticReport.streets[0].heroDecisions[0];

  const baseData = buildGtoSpotWorkbench({
    report: syntheticReport,
    decision,
  });

  // Layer 1 (Preflop Blueprint) vs Layer 2 (Monte Carlo + Range/Nut Engine) vs Layer 3 (TexasSolver)
  let source: GtoEngineSource = req.street === 'preflop' ? 'blueprint' : 'heuristic';
  let engineLabel =
    req.street === 'preflop'
      ? 'Server Preflop Blueprint (6-Max/HU 169 Matrix)'
      : 'Server Monte Carlo + Range/Nut GTO Engine';
  let exploitabilityPctPot: number | null = req.street === 'preflop' ? 0.15 : 0.95;
  let iterations: number | null = req.street === 'preflop' ? null : 220;
  let finalMatrix = baseData.gtoMatrix;

  const binPath = (options.texasSolverBin ?? process.env.TEXASSOLVER_BIN ?? '').trim();
  if (binPath && req.street !== 'preflop' && iso.canonicalBoard.length >= 3) {
    const tsResult = await tryRunTexasSolverBinary({
      binaryPath: binPath,
      potBB,
      effectiveStackBB: req.effectiveStackChips / Math.max(1, req.bigBlind),
      canonicalBoard: iso.canonicalBoard,
      geometricPct: baseData.geometry.geometricSizing.betPotPct,
    });
    if (tsResult) {
      source = 'texassolver';
      engineLabel = 'TexasSolver DCFR Worker';
      exploitabilityPctPot = 0.42;
      iterations = 160;
      finalMatrix = aggregateConcreteStrategyTo169(
        baseData.gtoMatrix,
        tsResult.actions,
        tsResult.strategy
      );
    }
  }

  // Recompute actionOptions & EV Loss from server-calibrated Hero cell when available
  const heroCell = baseData.heroCanonicalHand
    ? finalMatrix.find((c) => c.hand === baseData.heroCanonicalHand) ?? null
    : null;
  let actionOptions: GtoActionOption[] = baseData.actionOptions;
  let evLossBB = baseData.evLossBB;
  let evLossPctPot = baseData.evLossPctPot;
  let evGrade = baseData.evGrade;
  let evGradeLabel = baseData.evGradeLabel;

  if (heroCell) {
    actionOptions = baseData.actionOptions.map((opt) => ({
      ...opt,
      gtoFreqPct: heroCell.mix[opt.key],
    }));
    const bestEv = Math.max(...actionOptions.map((o) => o.evBB));
    const heroOpt = actionOptions.find((o) => o.key === req.heroActualAction);
    const heroEv = heroOpt ? heroOpt.evBB : baseData.heroActionEvBB;
    evLossBB = round2(Math.max(0, bestEv - heroEv));
    const gradeInfo = classifyEvLossGrade(evLossBB, potBB);
    evLossPctPot = gradeInfo.pctOfPot;
    evGrade = gradeInfo.grade;
    evGradeLabel = gradeInfo.label;
  }

  const resultData: GtoSpotWorkbenchData = {
    ...baseData,
    source,
    solverMeta: {
      engineLabel,
      exploitabilityPctPot,
      iterations,
      solveTimeMs: Math.max(1, Date.now() - startedAt),
      cacheHit: false,
      canonicalBoardKey: iso.canonicalBoardKey,
    },
    evLossBB,
    evLossPctPot,
    evGrade,
    evGradeLabel,
    actionOptions,
    gtoMatrix: finalMatrix,
  };

  cache.set(cacheKey, resultData);
  return { ok: true, data: resultData };
}

// ============================================================================
// Bayesian Dirichlet-Beta Node-Lock & RNR Safe Exploitation (POST /api/gto/node-lock)
// ============================================================================

export async function solveNodeLockServer(
  rawReq: unknown,
  options: {
    profiler?: SessionOpponentProfiler | null;
    texasSolverBin?: string;
  } = {}
): Promise<GtoNodeLockResponse & { statusCode?: number; code?: string }> {
  if (!rawReq || typeof rawReq !== 'object') {
    return { ok: false, statusCode: 400, code: 'INVALID_SPOT_STATE', error: '缺少 Node-Lock 参数' };
  }
  const req = rawReq as Partial<GtoNodeLockRequest>;
  const presetId: NodeLockPresetId =
    req.presetId && req.presetId in NODE_LOCK_PRESETS ? req.presetId : 'over_fold';
  const presetDef = NODE_LOCK_PRESETS[presetId];

  const spotRes = await solveGtoSpotServer(req.spotRequest, {
    profiler: options.profiler,
    texasSolverBin: options.texasSolverBin,
  });
  if (!spotRes.ok) {
    return {
      ok: false,
      statusCode: 400,
      code: spotRes.code,
      error: spotRes.error,
    };
  }

  const baseData = spotRes.data;
  const potBB = Math.max(
    1,
    (req.spotRequest?.potBeforeChips ?? 20) / Math.max(1, req.spotRequest?.bigBlind ?? 20)
  );

  // Optionally hydrate live room profiler observations if targetPlayerId is supplied
  let sampleHands = Math.max(1, Math.min(500, Math.floor(Number(req.sampleHands) || 12)));
  let observedDeviationPct = clamp(
    Number(req.observedDeviationPct ?? presetDef.defaultDeviationPct),
    2,
    50
  );
  let targetPlayerName =
    typeof req.targetPlayerName === 'string' && req.targetPlayerName.trim()
      ? req.targetPlayerName.trim().slice(0, 24)
      : '目标对手';

  if (req.targetPlayerId && options.profiler) {
    const liveRead = options.profiler.getOpponentRead(req.targetPlayerId);
    if (liveRead.handsObserved >= 2) {
      sampleHands = Math.max(sampleHands, liveRead.handsObserved);
      if (presetId === 'over_fold') {
        const liveFoldPct = Math.round(liveRead.foldToBetRate * 100);
        observedDeviationPct = clamp(
          Math.max(observedDeviationPct, liveFoldPct - presetDef.gtoBaselinePct),
          4,
          45
        );
      } else if (presetId === 'calling_station') {
        const liveCallPct = Math.round((1 - liveRead.foldToBetRate) * 100);
        observedDeviationPct = clamp(
          Math.max(observedDeviationPct, liveCallPct - presetDef.gtoBaselinePct),
          4,
          45
        );
      } else if (presetId === 'passive_limper') {
        const liveLimpPct = Math.round(liveRead.limpRate * 100);
        observedDeviationPct = clamp(
          Math.max(observedDeviationPct, liveLimpPct - presetDef.gtoBaselinePct),
          4,
          45
        );
      }
    }
  }

  const priorKappa = clamp(Math.floor(Number(req.priorStrengthKappa) || 16), 4, 60);
  // Restricted Nash Response safety coefficient λ ∈ [0.70, 1.0]: lower on tiny samples
  const defaultLambda = sampleHands < 10 ? 0.72 : sampleHands < 20 ? 0.84 : 0.92;
  const safetyLambda = clamp(Number(req.marginOfSafetyLambda) || defaultLambda, 0.5, 1.0);

  const observedPct = Math.round(clamp(presetDef.gtoBaselinePct + observedDeviationPct, 5, 95));
  const bayesian = computeBayesianPosterior(
    presetDef.gtoBaselinePct,
    observedPct,
    sampleHands,
    priorKappa
  );
  const rnrWeight = clamp(bayesian.confidenceWeight * safetyLambda, 0.05, 0.95);
  const intensity = clamp(observedDeviationPct / 28, 0.2, 1.0) * rnrWeight;

  // Apply Restricted Nash Response blend: σ_exploit = (1 - λw) * σ_GTO + λw * σ_BR(θ_post)
  const facingBet = (req.spotRequest?.toCallChips ?? 0) > 0;
  const exploitMatrix: RangeMatrixCell[] = baseData.gtoMatrix.map((cell) => {
    const gto = cell.mix;
    let br: RangeMatrixMix = { ...gto };

    if (presetId === 'over_fold') {
      // Expand bluffs & c-bets with blockers / playable hands; slightly tighten calls vs rare raises
      if (!facingBet) {
        br = {
          raise: Math.min(96, gto.raise + 34),
          call: 0,
          check: Math.max(4, gto.check - 34),
          fold: 0,
        };
      } else {
        br = {
          raise: Math.min(72, gto.raise + 22),
          call: Math.max(0, gto.call - 12),
          check: 0,
          fold: Math.max(0, gto.fold - 10),
        };
      }
    } else if (presetId === 'calling_station') {
      // Cut pure bluffs; expand thin value bets on top/medium hands
      const isStrongOrMed = cell.evBB >= potBB * 0.48 || cell.kind === 'pair';
      if (!facingBet) {
        br = isStrongOrMed
          ? { raise: Math.min(96, gto.raise + 26), call: 0, check: Math.max(4, gto.check - 26), fold: 0 }
          : { raise: Math.max(0, gto.raise - 32), call: 0, check: Math.min(100, gto.check + 32), fold: 0 };
      } else {
        br = isStrongOrMed
          ? { raise: Math.min(60, gto.raise + 14), call: gto.call, check: 0, fold: Math.max(0, gto.fold - 14) }
          : { raise: Math.max(0, gto.raise - 18), call: Math.max(0, gto.call - 10), check: 0, fold: Math.min(100, gto.fold + 28) };
      }
    } else if (presetId === 'over_bluff') {
      // Widen bluff-catch calls; slowplay monsters to let maniac barrel off
      const isMonster = cell.evBB >= potBB * 0.78;
      if (!facingBet) {
        br = isMonster
          ? { raise: Math.max(20, gto.raise - 30), call: 0, check: Math.min(80, gto.check + 30), fold: 0 }
          : { raise: Math.max(5, gto.raise - 16), call: 0, check: Math.min(95, gto.check + 16), fold: 0 };
      } else {
        br = {
          raise: Math.max(0, gto.raise - 8),
          call: Math.min(92, gto.call + 30),
          check: 0,
          fold: Math.max(0, gto.fold - 22),
        };
      }
    } else {
      // passive_limper: linear isolation value raises
      const isLinearValue = cell.evBB >= potBB * 0.42;
      br = isLinearValue
        ? {
            raise: Math.min(96, gto.raise + 30),
            call: Math.max(0, gto.call - 18),
            check: Math.max(0, gto.check - 12),
            fold: 0,
          }
        : {
            raise: Math.max(0, gto.raise - 10),
            call: gto.call,
            check: gto.check + (facingBet ? 0 : 10),
            fold: facingBet ? Math.min(100, gto.fold + 10) : 0,
          };
    }

    const blended = normalizeMixTo100({
      raise: gto.raise * (1 - intensity) + br.raise * intensity,
      call: gto.call * (1 - intensity) + br.call * intensity,
      check: gto.check * (1 - intensity) + br.check * intensity,
      fold: gto.fold * (1 - intensity) + br.fold * intensity,
    });

    const shiftMag =
      (Math.abs(blended.raise - gto.raise) + Math.abs(blended.call - gto.call)) / 100;
    const cellEvGainBB = round2(Math.max(0, shiftMag * potBB * 0.085 * rnrWeight));

    return {
      ...cell,
      mix: blended,
      evBB: round2(cell.evBB + cellEvGainBB),
      deltaRaisePct: blended.raise - gto.raise,
      deltaCallPct: blended.call - gto.call,
      evGainBB: cellEvGainBB,
    };
  });

  const heroBase = baseData.heroCanonicalHand
    ? baseData.gtoMatrix.find((c) => c.hand === baseData.heroCanonicalHand)
    : null;
  const heroExp = baseData.heroCanonicalHand
    ? exploitMatrix.find((c) => c.hand === baseData.heroCanonicalHand)
    : null;

  const legalKeys: GtoActionKey[] = facingBet ? ['raise', 'call', 'fold'] : ['raise', 'check'];
  const labels: Record<GtoActionKey, string> = {
    raise: facingBet ? '加注' : '下注',
    call: '跟注',
    check: '过牌',
    fold: '弃牌',
  };

  const actionDiffs: NodeLockActionDiff[] = legalKeys.map((key) => {
    const gtoFreqPct = heroBase ? heroBase.mix[key] : Math.round(
      baseData.gtoMatrix.reduce((s, c) => s + c.mix[key], 0) / Math.max(1, baseData.gtoMatrix.length)
    );
    const exploitFreqPct = heroExp ? heroExp.mix[key] : Math.round(
      exploitMatrix.reduce((s, c) => s + c.mix[key], 0) / Math.max(1, exploitMatrix.length)
    );
    return {
      key,
      label: labels[key],
      gtoFreqPct,
      exploitFreqPct,
      deltaPct: exploitFreqPct - gtoFreqPct,
    };
  });

  const avgGain =
    exploitMatrix.reduce((s, c) => s + (c.evGainBB ?? 0), 0) / Math.max(1, exploitMatrix.length);
  const evGainBB = round2(Math.max(0.05, heroExp?.evGainBB ? heroExp.evGainBB * 1.4 : avgGain * 1.8));
  const evGainPctPot = round1((evGainBB / Math.max(1, potBB)) * 100);

  const counterSummaries: Record<NodeLockPresetId, string> = {
    over_fold: `锁定「${targetPlayerName}」面对下注后验弃牌率 ${bayesian.posteriorPct}%（显著高于盈亏平衡点 α=${baseData.geometry.bluffAlphaPct}%），RNR 安全剥削建议扩张带阻断牌的持续下注与偷鸡频率。`,
    calling_station: `锁定「${targetPlayerName}」后验跟注率 ${bayesian.posteriorPct}%，纯空气诈唬失去弃牌率基础；RNR 剥削收缩空气偷鸡并将中强成牌推入更大尺度薄价值下注。`,
    over_bluff: `锁定「${targetPlayerName}」后验激进诈唬率 ${bayesian.posteriorPct}%，RNR 剥削扩大抓鸡跟注区间，并对顶层强牌增加慢打诱敌频率。`,
    passive_limper: `锁定「${targetPlayerName}」被动平跟率 ${bayesian.posteriorPct}%（范围封顶），RNR 剥削建议以线性强牌范围扩大位置隔离加注。`,
  };

  const exploit: NodeLockExploitResult = {
    presetId,
    presetLabel: presetDef.label,
    targetPlayerName,
    bayesianRead: {
      metricLabel: presetDef.metricLabel,
      gtoBaselinePct: presetDef.gtoBaselinePct,
      observedPct,
      posteriorPct: bayesian.posteriorPct,
      sampleHands,
      priorKappa,
      confidenceWeight: bayesian.confidenceWeight,
      shrinkageNote: `Dirichlet-Beta 先验 κ=${priorKappa} + RNR 安全边际 λ=${safetyLambda.toFixed(2)}：观测 ${observedPct}% 收缩至后验 ${bayesian.posteriorPct}%（净剥削权重 ${Math.round(rnrWeight * 100)}%）`,
    },
    evGainBB,
    evGainPctPot,
    actionDiffs,
    counterStrategySummary: counterSummaries[presetId],
    marginOfSafetyWarning: `依据 Restricted Nash Response (λ=${safetyLambda.toFixed(2)})，保留 ${Math.round((1 - rnrWeight) * 100)}% GTO 均衡基准，防止小样本读牌误差导致被反剥削。`,
    exploitMatrix,
  };

  return {
    ok: true,
    source: baseData.source,
    exploit,
  };
}

// ============================================================================
// Session EV Leak Audit (POST /api/gto/session-audit)
// ============================================================================

export interface SessionEvAuditResult {
  ok: true;
  handsAudited: number;
  decisionsAudited: number;
  totalEvLossBB: number;
  avgEvLossPerDecisionBB: number;
  gradeBreakdown: Record<GtoEvGrade, number>;
  streetEvLossBB: Record<'preflop' | 'flop' | 'turn' | 'river', number>;
  topLeaks: Array<{
    category: string;
    street: 'preflop' | 'flop' | 'turn' | 'river';
    evLossBB: number;
    occurrences: number;
    drill: string;
  }>;
}

export function auditSessionGtoLeaks(reports: HandReviewReport[]): SessionEvAuditResult {
  const gradeBreakdown: Record<GtoEvGrade, number> = {
    best: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };
  const streetEvLossBB: Record<'preflop' | 'flop' | 'turn' | 'river', number> = {
    preflop: 0,
    flop: 0,
    turn: 0,
    river: 0,
  };

  const leakBuckets = new Map<
    string,
    { category: string; street: 'preflop' | 'flop' | 'turn' | 'river'; evLossBB: number; occurrences: number; drill: string }
  >();

  let totalEvLossBB = 0;
  let decisionsAudited = 0;

  for (const report of reports) {
    for (const st of report.streets) {
      for (const dec of st.heroDecisions) {
        const wb = buildGtoSpotWorkbench({ report, decision: dec });
        decisionsAudited += 1;
        totalEvLossBB += wb.evLossBB;
        gradeBreakdown[wb.evGrade] += 1;
        streetEvLossBB[wb.street] = round2(streetEvLossBB[wb.street] + wb.evLossBB);

        if (wb.evGrade === 'inaccuracy' || wb.evGrade === 'mistake' || wb.evGrade === 'blunder') {
          const isOverFold = wb.heroActualAction === 'fold' && wb.recommendedAction !== 'fold';
          const isOverCall = wb.heroActualAction === 'call' && wb.recommendedAction === 'fold';
          const isMissedValue = wb.heroActualAction === 'check' && wb.recommendedAction === 'raise';
          const category = isOverFold
            ? `${wb.streetLabel}面对施压过度弃牌`
            : isOverCall
              ? `${wb.streetLabel}赔率不足勉强跟注`
              : isMissedValue
                ? `${wb.streetLabel}错失价值/持续下注`
                : `${wb.streetLabel}频率与尺度偏离`;
          const drill = isOverFold
            ? `复盘时核对 MDF (${wb.geometry.mdfPct}%)，优先用带阻断牌的听牌与中等对子防守。`
            : isOverCall
              ? `跟注前先算底池赔率与对手极化范围，河牌缺乏阻断牌时果断止损。`
              : isMissedValue
                ? `拥有范围或坚果优势时按几何尺度 (${wb.geometry.geometricSizing.betPotPct}% 池) 主动构建底池。`
                : `对照 13×13 策略矩阵校准混合频率，控制无位置边缘牌激进度。`;
          const bucketKey = `${wb.street}:${category}`;
          const prev = leakBuckets.get(bucketKey);
          if (prev) {
            prev.evLossBB = round2(prev.evLossBB + wb.evLossBB);
            prev.occurrences += 1;
          } else {
            leakBuckets.set(bucketKey, {
              category,
              street: wb.street,
              evLossBB: round2(wb.evLossBB),
              occurrences: 1,
              drill,
            });
          }
        }
      }
    }
  }

  const topLeaks = Array.from(leakBuckets.values())
    .sort((a, b) => b.evLossBB - a.evLossBB)
    .slice(0, 5);

  return {
    ok: true,
    handsAudited: reports.length,
    decisionsAudited,
    totalEvLossBB: round2(totalEvLossBB),
    avgEvLossPerDecisionBB:
      decisionsAudited > 0 ? round2(totalEvLossBB / decisionsAudited) : 0,
    gradeBreakdown,
    streetEvLossBB,
    topLeaks,
  };
}
