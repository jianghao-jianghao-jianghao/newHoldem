import { useEffect, useMemo, useState } from 'react';
import {
  buildGtoSpotWorkbench,
  collectReportHeroDecisions,
  createFallbackPreflopDecision,
  inferRecommendedNodeLockPreset,
  NODE_LOCK_PRESETS,
  type GtoEvGrade,
  type GtoNodeLockRequest,
  type GtoNodeLockResponse,
  type GtoSpotWorkbenchData,
  type NodeLockPresetId,
} from '../shared/gtoWorkbench';
import type { HandReviewReport, HandReviewSessionContext } from '../shared/types';
import { RangeStrategyMatrix } from './RangeStrategyMatrix';

interface GtoSpotInspectorProps {
  report: HandReviewReport;
  sessionProfileContext?: HandReviewSessionContext;
  viewMode: 'gto' | 'nodelock';
  selectedStep: number | null;
  onSelectStep: (step: number) => void;
  /**
   * Optional hook for Claude's backend `/api/gto/node-lock` integration.
   * When omitted, client deterministic Bayesian Node-Lock runs instantaneously.
   */
  onRequestBackendNodeLock?: (req: GtoNodeLockRequest) => Promise<GtoNodeLockResponse>;
}

const EV_GRADE_COLOR: Record<GtoEvGrade, string> = {
  best: 'text-[#8CC9AA]',
  good: 'text-[#8CC9AA]',
  inaccuracy: 'text-[#E8CF96]',
  mistake: 'text-[#D4A853]',
  blunder: 'text-[#E07A7A]',
};

const PRESET_ORDER: NodeLockPresetId[] = [
  'over_fold',
  'calling_station',
  'over_bluff',
  'passive_limper',
];

export function GtoSpotInspector({
  report,
  sessionProfileContext,
  viewMode,
  selectedStep,
  onSelectStep,
}: GtoSpotInspectorProps) {
  const allDecisions = useMemo(() => {
    const recorded = collectReportHeroDecisions(report);
    return recorded.length > 0 ? recorded : [createFallbackPreflopDecision(report)];
  }, [report]);

  const activeEntry = useMemo(() => {
    if (allDecisions.length === 0) return null;
    if (selectedStep !== null) {
      const found = allDecisions.find((item) => item.decision.step === selectedStep);
      if (found) return found;
    }
    // Prefer the highest-impact mistake/inaccuracy decision by default
    const prioritized = [...allDecisions].sort((a, b) => {
      const rank = (v: string) =>
        v === 'mistake' ? 4 : v === 'inaccuracy' ? 3 : v === 'acceptable' ? 2 : 1;
      return rank(b.decision.verdict) - rank(a.decision.verdict);
    });
    return prioritized[0];
  }, [allDecisions, selectedStep]);

  const inferred = useMemo(
    () => inferRecommendedNodeLockPreset(sessionProfileContext),
    [sessionProfileContext]
  );

  const [presetId, setPresetId] = useState<NodeLockPresetId>(inferred.presetId);
  const [deviationPct, setDeviationPct] = useState<number>(inferred.observedDeviationPct);
  const [sampleHands, setSampleHands] = useState<number>(inferred.sampleHands);
  const [selectedOpponentId, setSelectedOpponentId] = useState<string>(
    inferred.targetOpponent?.playerId ?? 'custom'
  );
  const [matrixCompareMode, setMatrixCompareMode] = useState<'exploit' | 'gto'>('exploit');

  // Re-sync defaults when switching to a different hand or session context updates
  useEffect(() => {
    setPresetId(inferred.presetId);
    setDeviationPct(inferred.observedDeviationPct);
    setSampleHands(inferred.sampleHands);
    setSelectedOpponentId(inferred.targetOpponent?.playerId ?? 'custom');
  }, [report.handNumber, inferred.presetId, inferred.observedDeviationPct, inferred.sampleHands, inferred.targetOpponent?.playerId]);

  const selectedOpponent = useMemo(() => {
    if (selectedOpponentId === 'custom') return null;
    return (
      sessionProfileContext?.opponentReads.find((o) => o.playerId === selectedOpponentId) ?? null
    );
  }, [selectedOpponentId, sessionProfileContext]);

  const workbench: GtoSpotWorkbenchData | null = useMemo(() => {
    if (!activeEntry) return null;
    return buildGtoSpotWorkbench({
      report,
      decision: activeEntry.decision,
      sessionProfileContext,
      nodeLockPreset: presetId,
      observedDeviationPct: deviationPct,
      sampleHands,
      targetPlayerName: selectedOpponent?.playerName ?? '自定义对手模型',
    });
  }, [
    report,
    activeEntry,
    sessionProfileContext,
    presetId,
    deviationPct,
    sampleHands,
    selectedOpponent,
  ]);

  if (!activeEntry || !workbench) {
    return (
      <div className="border-y border-white/[0.08] py-8 text-center text-xs text-[#7E8883]">
        本局暂无可供 GTO 求解的 Hero 主动决策节点（例如翻前自动盲注结束）。
      </div>
    );
  }

  const handleSelectOpponentRead = (opponentId: string) => {
    setSelectedOpponentId(opponentId);
    if (opponentId === 'custom') return;
    const opp = sessionProfileContext?.opponentReads.find((o) => o.playerId === opponentId);
    if (!opp) return;
    const mapped = inferRecommendedNodeLockPreset({
      heroTableImage: null,
      exploitativeNotes: [],
      opponentReads: [opp],
    });
    setPresetId(mapped.presetId);
    setDeviationPct(mapped.observedDeviationPct);
    setSampleHands(mapped.sampleHands);
  };

  const handleSelectPreset = (nextPreset: NodeLockPresetId) => {
    setPresetId(nextPreset);
    setDeviationPct(NODE_LOCK_PRESETS[nextPreset].defaultDeviationPct);
  };

  return (
    <div data-testid={`gto-workbench-${viewMode}`} className="space-y-5">
      {/* Decision Node Switcher Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-[#7E8883]">决策节点</span>
          {allDecisions.map(({ streetLabel, decision }) => {
            const isActive = decision.step === activeEntry.decision.step;
            const dotTone =
              decision.verdict === 'optimal'
                ? 'bg-[#8CC9AA]'
                : decision.verdict === 'acceptable'
                  ? 'bg-[#E8CF96]'
                  : decision.verdict === 'inaccuracy'
                    ? 'bg-[#D4A853]'
                    : 'bg-[#E07A7A]';

            return (
              <button
                key={`node-${decision.step}`}
                type="button"
                data-testid={`gto-node-btn-${decision.step}`}
                onClick={() => onSelectStep(decision.step)}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                  isActive
                    ? 'border-[#D4A853]/65 bg-[#D4A853]/[0.1] font-semibold text-[#E8CF96]'
                    : 'border-white/[0.08] bg-transparent text-[#9AA5A0] hover:border-white/[0.18] hover:text-white'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} aria-hidden="true" />
                <span>{streetLabel}</span>
                <span className="font-mono-num text-[10px] text-[#7E8883]">#{decision.step}</span>
                <span>{decision.actualActionLabel}</span>
              </button>
            );
          })}
        </div>

        <span className="font-mono-num text-[10px] text-[#7D8782]">
          {workbench.solverMeta.canonicalBoardKey} · {workbench.heroPosition}
          {workbench.heroCanonicalHand ? ` · ${workbench.heroCanonicalHand}` : ''}
        </span>
      </div>

      {/* ================================================================== */}
      {/* VIEW MODE 1: GTO EQUILIBRIUM MATRIX & EV/BLOCKER WORKBENCH         */}
      {/* ================================================================== */}
      {viewMode === 'gto' && (
        <div className="space-y-5">
          {/* Unboxed 5-Column Hairline EV & Range Geometry Ledger */}
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-y border-white/[0.08] py-3">
            <div className="pb-2.5 sm:pb-0 sm:pr-3">
              <div className="text-[10px] text-[#7E8883]">EV Loss 五级评级</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={`font-mono-num text-sm font-bold leading-none ${EV_GRADE_COLOR[workbench.evGrade]}`}
                >
                  {workbench.evLossBB > 0 ? `-${workbench.evLossBB.toFixed(2)} BB` : '0.00 BB'}
                </span>
                <span className={`text-[11px] font-semibold ${EV_GRADE_COLOR[workbench.evGrade]}`}>
                  {workbench.evGradeLabel}
                </span>
              </div>
              <div className="mt-1 font-mono-num text-[10px] text-[#7D8782]">
                占底池 {workbench.evLossPctPot}%
              </div>
            </div>

            <div className="pb-2.5 pl-3 sm:pb-0 sm:px-3">
              <div className="text-[10px] text-[#7E8883]">范围 / 坚果优势</div>
              <div className="mt-1 font-mono-num text-sm font-bold leading-none text-[#F3F1EC]">
                <span
                  className={
                    workbench.geometry.rangeAdvantagePct >= 0 ? 'text-[#8CC9AA]' : 'text-[#E07A7A]'
                  }
                >
                  {workbench.geometry.rangeAdvantagePct >= 0 ? '+' : ''}
                  {workbench.geometry.rangeAdvantagePct}%
                </span>
                <span className="mx-1 text-white/20">/</span>
                <span
                  className={
                    workbench.geometry.nutAdvantagePct >= 0 ? 'text-[#E8CF96]' : 'text-[#E07A7A]'
                  }
                >
                  {workbench.geometry.nutAdvantagePct >= 0 ? '+' : ''}
                  {workbench.geometry.nutAdvantagePct}%
                </span>
              </div>
              <div className="mt-1 truncate text-[10px] text-[#7D8782]">
                {workbench.geometry.boardTextureLabel}
              </div>
            </div>

            <div className="pt-2.5 sm:pt-0 sm:px-3">
              <div className="text-[10px] text-[#7E8883]">几何下注尺度</div>
              <div className="mt-1 font-mono-num text-sm font-bold leading-none text-[#E8CF96]">
                {workbench.geometry.geometricSizing.betPotPct}% 池
              </div>
              <div className="mt-1 font-mono-num text-[10px] text-[#7D8782]">
                剩余 {workbench.geometry.geometricSizing.streetsRemaining} 街等比打光
              </div>
            </div>

            <div className="pt-2.5 pl-3 sm:pt-0 sm:px-3">
              <div className="text-[10px] text-[#7E8883]">MDF · 偷鸡平衡 α</div>
              <div className="mt-1 font-mono-num text-sm font-bold leading-none text-[#F3F1EC]">
                {workbench.geometry.mdfPct}%
                <span className="ml-1.5 text-[11px] font-normal text-[#9AA5A0]">
                  α {workbench.geometry.bluffAlphaPct}%
                </span>
              </div>
              <div className="mt-1 text-[10px] text-[#7D8782]">
                对手弃牌 &gt; α 即自动盈利
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 pt-2.5 sm:pt-0 sm:pl-3">
              <div className="text-[10px] text-[#7E8883]">有效 SPR 区间</div>
              <div className="mt-1 font-mono-num text-sm font-bold leading-none text-[#F3F1EC]">
                {workbench.geometry.spr}
              </div>
              <div className="mt-1 text-[10px] text-[#7D8782]">
                {workbench.geometry.sprZoneLabel}
              </div>
            </div>
          </div>

          {/* 2-Column Workbench: 13x13 Matrix Left + Action EV & Blockers Right */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
            <RangeStrategyMatrix
              cells={workbench.gtoMatrix}
              title={`${workbench.streetLabel} GTO 均衡范围矩阵 (13×13)`}
              subtitle={`${workbench.heroPosition} 视角`}
              mode="gto"
              heroCanonicalHand={workbench.heroCanonicalHand}
              testId="gto-equilibrium-matrix"
            />

            <div className="space-y-5">
              {/* Action EV & Frequency Breakdown Table */}
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <h4 className="text-xs font-semibold text-[#EAE6DC]">动作频次与期望收益 (EV)</h4>
                  <span className="font-mono-num text-[10px] text-[#7E8883]">
                    最优 {workbench.bestActionEvBB >= 0 ? '+' : ''}
                    {workbench.bestActionEvBB.toFixed(2)} BB
                  </span>
                </div>

                <div className="divide-y divide-white/[0.06] border-y border-white/[0.08]">
                  {workbench.actionOptions.map((opt) => {
                    const barColor =
                      opt.key === 'raise'
                        ? '#C25959'
                        : opt.key === 'call'
                          ? '#579D7E'
                          : opt.key === 'check'
                            ? '#52708B'
                            : '#485258';

                    return (
                      <div
                        key={opt.key}
                        className={`py-2.5 px-2 space-y-1.5 ${
                          opt.isHeroAction ? 'bg-[#D4A853]/[0.06]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2 w-2 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: barColor }}
                              aria-hidden="true"
                            />
                            <span className="font-medium text-[#F3F1EC] truncate">{opt.label}</span>
                            {opt.isRecommended && (
                              <span className="text-[10px] font-semibold text-[#8CC9AA]">
                                均衡首选
                              </span>
                            )}
                            {opt.isHeroAction && (
                              <span className="text-[10px] font-semibold text-[#D4A853]">
                                · 你选择
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 font-mono-num text-[11px] shrink-0">
                            <span className="text-[#C6D0CB]">{opt.gtoFreqPct}%</span>
                            <span
                              className={`w-16 text-right font-semibold ${
                                opt.evBB >= 0 ? 'text-[#8CC9AA]' : 'text-[#E07A7A]'
                              }`}
                            >
                              {opt.evBB >= 0 ? `+${opt.evBB.toFixed(2)}` : opt.evBB.toFixed(2)} BB
                            </span>
                          </div>
                        </div>

                        <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(2, opt.gtoFreqPct)}%`,
                              backgroundColor: barColor,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Blocker / Unblocker Card Removal Ledger */}
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <h4 className="text-xs font-semibold text-[#EAE6DC]">
                    阻断牌与非阻断效应 (Blocker / Unblocker)
                  </h4>
                  <span className="text-[10px] text-[#7E8883]">组合移除评估</span>
                </div>

                <div className="divide-y divide-white/[0.06] border-y border-white/[0.08]">
                  {workbench.blockers.map((blk) => {
                    const tone =
                      blk.impact === 'positive'
                        ? 'text-[#8CC9AA]'
                        : blk.impact === 'negative'
                          ? 'text-[#E07A7A]'
                          : 'text-[#9AA5A0]';
                    const dot =
                      blk.impact === 'positive'
                        ? 'bg-[#8CC9AA]'
                        : blk.impact === 'negative'
                          ? 'bg-[#E07A7A]'
                          : 'bg-[#7E8883]';

                    return (
                      <div key={blk.id} className="py-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
                            <span className={`font-semibold truncate ${tone}`}>{blk.title}</span>
                          </div>
                          {blk.cardRemovalPct > 0 && (
                            <span className="font-mono-num text-[11px] text-[#D4A853] shrink-0">
                              移除约 {blk.cardRemovalPct}%
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] leading-relaxed text-[#9DA7A2]">{blk.detail}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Range Structure Note */}
              <div className="border-t border-white/[0.08] pt-3 space-y-1">
                <div className="text-[11px] font-semibold text-[#E8CF96]">范围结构与尺度建议</div>
                <p className="text-xs leading-relaxed text-[#C6D0CB]">
                  {workbench.geometry.recommendedStructure}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* VIEW MODE 2: BAYESIAN NODE-LOCK EXPLOITATIVE LAB                   */}
      {/* ================================================================== */}
      {viewMode === 'nodelock' && workbench.exploit && (
        <div className="space-y-5">
          {/* Controls Strip: Opponent Selector + Node-Lock Leak Preset + Sliders */}
          <div className="space-y-3.5 border-b border-white/[0.08] pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] text-[#7E8883]">对手漏损锁定</span>
                {PRESET_ORDER.map((id) => {
                  const def = NODE_LOCK_PRESETS[id];
                  const active = presetId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`nodelock-preset-${id}`}
                      onClick={() => handleSelectPreset(id)}
                      className={`rounded border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                        active
                          ? 'border-[#D4A853]/70 bg-[#D4A853]/[0.12] font-semibold text-[#E8CF96]'
                          : 'border-white/[0.08] bg-transparent text-[#9AA5A0] hover:border-white/[0.18] hover:text-white'
                      }`}
                    >
                      {def.shortLabel}
                    </button>
                  );
                })}
              </div>

              {/* Optional live session opponent quick-bind */}
              {sessionProfileContext && sessionProfileContext.opponentReads.length > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-[#7E8883]">同步本场对手</span>
                  <select
                    aria-label="选择本场对手画像"
                    value={selectedOpponentId}
                    onChange={(e) => handleSelectOpponentRead(e.target.value)}
                    className="rounded border border-white/[0.12] bg-[#090B0C] px-2 py-1 text-[11px] text-[#E8CF96] focus:border-[#D4A853] focus:outline-none"
                  >
                    {sessionProfileContext.opponentReads.map((opp) => (
                      <option key={opp.playerId} value={opp.playerId}>
                        {opp.playerName}（{opp.archetypeLabel} · {opp.handsObserved}局）
                      </option>
                    ))}
                    <option value="custom">自定义对手参数</option>
                  </select>
                </div>
              )}
            </div>

            {/* Sliders for Deviation Magnitude & Sample Size (Dirichlet Shrinkage) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#9AA5A0]">
                    对手偏离幅度（{workbench.exploit.bayesianRead.metricLabel}）
                  </span>
                  <span className="font-mono-num text-[#E8CF96]">
                    GTO {workbench.exploit.bayesianRead.gtoBaselinePct}% → 观测{' '}
                    {workbench.exploit.bayesianRead.observedPct}% (+{deviationPct}%)
                  </span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={40}
                  step={2}
                  value={deviationPct}
                  data-testid="nodelock-deviation-slider"
                  onChange={(e) => setDeviationPct(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.1] accent-[#D4A853]"
                />
              </label>

              <label className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#9AA5A0]">观测样本量 n（贝叶斯先验 κ=16 收缩）</span>
                  <span className="font-mono-num text-[#8CC9AA]">
                    {sampleHands} 手 · 剥削权重{' '}
                    {Math.round(workbench.exploit.bayesianRead.confidenceWeight * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={60}
                  step={2}
                  value={sampleHands}
                  data-testid="nodelock-sample-slider"
                  onChange={(e) => setSampleHands(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.1] accent-[#8CC9AA]"
                />
              </label>
            </div>
          </div>

          {/* 4-Column Unboxed Bayesian Dirichlet & EV Gain Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-b border-white/[0.08] pb-3.5">
            <div className="pb-2.5 sm:pb-0 sm:pr-3">
              <div className="text-[10px] text-[#7E8883]">对手原始观测</div>
              <div className="mt-1 font-mono-num text-sm font-bold text-[#F3F1EC]">
                {workbench.exploit.bayesianRead.observedPct}%
              </div>
              <div className="mt-1 font-mono-num text-[10px] text-[#7D8782]">
                GTO 基准 {workbench.exploit.bayesianRead.gtoBaselinePct}%
              </div>
            </div>

            <div className="pb-2.5 pl-3 sm:pb-0 sm:px-3">
              <div className="text-[10px] text-[#7E8883]">贝叶斯后验修正</div>
              <div className="mt-1 font-mono-num text-sm font-bold text-[#E8CF96]">
                {workbench.exploit.bayesianRead.posteriorPct}%
              </div>
              <div className="mt-1 font-mono-num text-[10px] text-[#7D8782]">
                先验强度 κ={workbench.exploit.bayesianRead.priorKappa}
              </div>
            </div>

            <div className="pt-2.5 sm:pt-0 sm:px-3">
              <div className="text-[10px] text-[#7E8883]">安全剥削权重 w</div>
              <div className="mt-1 font-mono-num text-sm font-bold text-[#F3F1EC]">
                {Math.round(workbench.exploit.bayesianRead.confidenceWeight * 100)}%
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-[#D4A853]"
                  style={{
                    width: `${Math.round(workbench.exploit.bayesianRead.confidenceWeight * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="pt-2.5 pl-3 sm:pt-0 sm:pl-3">
              <div className="text-[10px] text-[#7E8883]">Node-Lock 预期 EV 增益</div>
              <div
                data-testid="nodelock-ev-gain"
                className="mt-1 font-mono-num text-sm font-bold text-[#8CC9AA]"
              >
                +{workbench.exploit.evGainBB.toFixed(2)} BB
              </div>
              <div className="mt-1 font-mono-num text-[10px] text-[#7D8782]">
                相对 GTO +{workbench.exploit.evGainPctPot}% 池
              </div>
            </div>
          </div>

          {/* 2-Column Exploit Matrix vs GTO/Exploit Diff Table */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2 text-[11px]">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    data-testid="nodelock-matrix-mode-exploit"
                    onClick={() => setMatrixCompareMode('exploit')}
                    className={`cursor-pointer transition-colors ${
                      matrixCompareMode === 'exploit'
                        ? 'font-semibold text-[#E8CF96]'
                        : 'text-[#7E8883] hover:text-white'
                    }`}
                  >
                    剥削反制矩阵
                  </button>
                  <span aria-hidden="true" className="text-white/15">|</span>
                  <button
                    type="button"
                    data-testid="nodelock-matrix-mode-gto"
                    onClick={() => setMatrixCompareMode('gto')}
                    className={`cursor-pointer transition-colors ${
                      matrixCompareMode === 'gto'
                        ? 'font-semibold text-[#E8CF96]'
                        : 'text-[#7E8883] hover:text-white'
                    }`}
                  >
                    对照 GTO 基准
                  </button>
                </div>
                <span className="text-[10px] text-[#7E8883]">
                  {matrixCompareMode === 'exploit' ? '顶部金线标示显著调频手牌' : '未锁定均衡对照组'}
                </span>
              </div>

              <RangeStrategyMatrix
                cells={
                  matrixCompareMode === 'exploit'
                    ? workbench.exploit.exploitMatrix
                    : workbench.gtoMatrix
                }
                title={
                  matrixCompareMode === 'exploit'
                    ? `Node-Lock 剥削矩阵 · ${NODE_LOCK_PRESETS[presetId].shortLabel}`
                    : 'GTO 均衡基准矩阵'
                }
                mode={matrixCompareMode}
                heroCanonicalHand={workbench.heroCanonicalHand}
                testId="nodelock-range-matrix"
              />
            </div>

            <div className="space-y-5">
              {/* GTO vs Node-Lock Action Frequency Shift Table */}
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <h4 className="text-xs font-semibold text-[#EAE6DC]">
                    GTO 均衡 vs 剥削反制频率对照
                  </h4>
                  <span className="font-mono-num text-[10px] text-[#7E8883]">
                    {workbench.heroCanonicalHand ?? '全范围均值'}
                  </span>
                </div>

                <div className="divide-y divide-white/[0.06] border-y border-white/[0.08]">
                  {workbench.exploit.actionDiffs.map((diff) => {
                    const deltaTone =
                      diff.deltaPct > 0
                        ? 'text-[#8CC9AA]'
                        : diff.deltaPct < 0
                          ? 'text-[#E07A7A]'
                          : 'text-[#7E8883]';
                    return (
                      <div
                        key={diff.key}
                        data-testid={`nodelock-diff-${diff.key}`}
                        className="flex items-center justify-between gap-2 py-2.5 text-xs"
                      >
                        <span className="font-medium text-[#F3F1EC]">{diff.label}</span>
                        <div className="flex items-center gap-3 font-mono-num text-[11px]">
                          <span className="text-[#8B9590]">GTO {diff.gtoFreqPct}%</span>
                          <span aria-hidden="true" className="text-white/25">→</span>
                          <span className="font-semibold text-[#E8CF96]">
                            剥削 {diff.exploitFreqPct}%
                          </span>
                          <span className={`w-12 text-right font-semibold ${deltaTone}`}>
                            {diff.deltaPct > 0
                              ? `+${diff.deltaPct}%`
                              : diff.deltaPct < 0
                                ? `${diff.deltaPct}%`
                                : '0%'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Counter-Strategy Explanation */}
              <div className="space-y-2 border-b border-white/[0.08] pb-4">
                <h4 className="text-xs font-semibold text-[#8CC9AA]">Node-Lock 剥削逻辑</h4>
                <p className="text-xs leading-relaxed text-[#C6D0CB]">
                  {workbench.exploit.counterStrategySummary}
                </p>
              </div>

              {/* Margin of Safety & Anti-Overfitting Guidance */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[#E8CF96]">
                  安全边际与防反剥削 (Margin of Safety)
                </h4>
                <p className="text-xs leading-relaxed text-[#9DA7A2]">
                  {workbench.exploit.marginOfSafetyWarning}
                </p>
                <div className="font-mono-num text-[10px] text-[#7D8782] pt-1">
                  {workbench.exploit.bayesianRead.shrinkageNote}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
