import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bookmark, Loader2, LogOut, X } from 'lucide-react';
import {
  buildSessionReviewSummary,
  type SessionKeyHandItem,
  type SessionReviewSummary,
} from '../shared/sessionReview';
import type {
  DecisionVerdict,
  HandReviewReport,
  HandReviewStreetSection,
} from '../shared/types';
import { buildGtoSpotWorkbench, type GtoEvGrade } from '../shared/gtoWorkbench';
import { GtoSpotInspector } from './GtoSpotInspector';
import { PlayingCard } from './PlayingCard';
import { SessionPnlChart } from './SessionPnlChart';

export interface HandReviewFetchResult {
  ok: boolean;
  report?: HandReviewReport;
  availableHandNumbers?: number[];
  error?: string;
}

export interface SessionReviewFetchResult {
  ok: boolean;
  summary?: SessionReviewSummary;
  reportsByHand?: Record<number, HandReviewReport>;
  error?: string;
}

interface HandReviewModalProps {
  open: boolean;
  roomId?: string;
  mode?: 'browse' | 'leaving';
  initialHandNumber?: number | null;
  bookmarkedHands?: number[];
  onToggleBookmark?: (handNumber: number) => void;
  onFetchSessionReview: (bookmarkedHandNumbers: number[]) => Promise<SessionReviewFetchResult>;
  onOpenPersonalInsights?: () => void;
  onConfirmLeave?: () => void;
  onClose: () => void;
}

const VERDICT_TEXT_CLASS: Record<DecisionVerdict, string> = {
  optimal: 'text-[#8CC9AA]',
  acceptable: 'text-[#E8CF96]',
  inaccuracy: 'text-[#D4A853]',
  mistake: 'text-[#E07A7A]',
};

const VERDICT_DOT_CLASS: Record<DecisionVerdict, string> = {
  optimal: 'bg-[#8CC9AA]',
  acceptable: 'bg-[#D4A853]',
  inaccuracy: 'bg-[#D4A853]',
  mistake: 'bg-[#E07A7A]',
};

const EV_GRADE_TEXT_CLASS: Record<GtoEvGrade, string> = {
  best: 'text-[#8CC9AA]',
  good: 'text-[#8CC9AA]',
  inaccuracy: 'text-[#E8CF96]',
  mistake: 'text-[#D4A853]',
  blunder: 'text-[#E07A7A]',
};

type StreetFilter = 'all' | 'preflop' | 'flop' | 'turn' | 'river';
type HandListMode = 'key' | 'all';
type DetailViewTab = 'streets' | 'gto' | 'nodelock';

export function HandReviewModal({
  open,
  roomId,
  mode = 'browse',
  initialHandNumber = null,
  bookmarkedHands = [],
  onToggleBookmark,
  onFetchSessionReview,
  onOpenPersonalInsights,
  onConfirmLeave,
  onClose,
}: HandReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseSummary, setBaseSummary] = useState<SessionReviewSummary | null>(null);
  const [reportsByHand, setReportsByHand] = useState<Record<number, HandReviewReport>>({});
  const [selectedHandNumber, setSelectedHandNumber] = useState<number | null>(initialHandNumber);
  const [handListMode, setHandListMode] = useState<HandListMode>('key');
  const [streetFilter, setStreetFilter] = useState<StreetFilter>('all');
  const [detailTab, setDetailTab] = useState<DetailViewTab>('streets');
  const [selectedDecisionStep, setSelectedDecisionStep] = useState<number | null>(null);
  const detailAnchorRef = useRef<HTMLDivElement | null>(null);
  const workbenchTabsRef = useRef<HTMLDivElement | null>(null);
  const bookmarkedRef = useRef<number[]>(bookmarkedHands);
  bookmarkedRef.current = bookmarkedHands;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHandListMode('key');
    setStreetFilter('all');
    setDetailTab('streets');
    setSelectedDecisionStep(null);

    void onFetchSessionReview(bookmarkedRef.current).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok || !res.summary || !res.reportsByHand) {
        setError(res.error ?? '暂无法加载本场复盘记录');
        setBaseSummary(null);
        setReportsByHand({});
        return;
      }
      setBaseSummary(res.summary);
      setReportsByHand(res.reportsByHand);
      const targetHand =
        initialHandNumber && res.reportsByHand[initialHandNumber]
          ? initialHandNumber
          : res.summary.defaultSelectedHandNumber;
      setSelectedHandNumber(targetHand);
    });

    return () => {
      cancelled = true;
    };
  }, [open, initialHandNumber, onFetchSessionReview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Live-recompute summary when user toggles bookmarks inside the modal (0ms latency)
  const summary = useMemo<SessionReviewSummary | null>(() => {
    if (!baseSummary) return null;
    const allReports = Object.values(reportsByHand);
    if (allReports.length === 0) return baseSummary;
    return buildSessionReviewSummary({
      reports: allReports,
      bookmarkedHandNumbers: bookmarkedHands,
      vpipPct: baseSummary.vpipPct,
      pfrPct: baseSummary.pfrPct,
    });
  }, [baseSummary, reportsByHand, bookmarkedHands]);

  if (!open) return null;

  const activeHandNumber =
    selectedHandNumber !== null && reportsByHand[selectedHandNumber]
      ? selectedHandNumber
      : summary?.defaultSelectedHandNumber ?? null;
  const report: HandReviewReport | null =
    activeHandNumber !== null ? reportsByHand[activeHandNumber] ?? null : null;

  const isSelectedBookmarked =
    report !== null && bookmarkedHands.includes(report.handNumber);

  const visibleStreets: HandReviewStreetSection[] = report
    ? streetFilter === 'all'
      ? report.streets
      : report.streets.filter((s) => s.street === streetFilter)
    : [];

  const handCardsToDisplay: SessionKeyHandItem[] = summary
    ? handListMode === 'key'
      ? summary.keyHands
      : summary.allHands
    : [];

  const handleSelectHand = (handNumber: number, scrollToDetail = false) => {
    setSelectedHandNumber(handNumber);
    setStreetFilter('all');
    setSelectedDecisionStep(null);
    if (scrollToDetail && detailAnchorRef.current) {
      detailAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToWorkbenchTabs = () => {
    window.requestAnimationFrame(() => {
      workbenchTabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleSwitchDetailTab = (tab: DetailViewTab) => {
    setDetailTab(tab);
    if (tab !== 'streets') {
      scrollToWorkbenchTabs();
    }
  };

  const handleOpenDecisionInWorkbench = (step: number, tab: 'gto' | 'nodelock') => {
    setSelectedDecisionStep(step);
    setDetailTab(tab);
    scrollToWorkbenchTabs();
  };

  const sessionNetTone =
    !summary || summary.netChips === 0
      ? 'text-[#E8CF96]'
      : summary.netChips > 0
        ? 'text-[#8CC9AA]'
        : 'text-[#E07A7A]';

  const outcomeTone =
    report?.outcome === 'win'
      ? 'text-[#8CC9AA]'
      : report?.outcome === 'split'
        ? 'text-[#E8CF96]'
        : 'text-[#E07A7A]';

  const outcomeLabel =
    report?.outcome === 'win'
      ? report.wonByFold
        ? '逼弃获胜'
        : '摊牌获胜'
      : report?.outcome === 'split'
        ? '平分底池'
        : '本局失利';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="本场牌局复盘"
      data-testid="hand-review-modal"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/76 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[91dvh] w-full max-w-[1040px] flex-col overflow-hidden rounded-lg border border-white/[0.1] bg-[#0B0D0F] text-[#F3F1EC] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Editorial Masthead (matches TableAnalyticsDrawer) */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#090B0C] px-5 py-3.5 sm:px-6">
          <div className="min-w-0 flex flex-wrap items-baseline gap-2.5">
            <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-[#F5F2EB]">
              {mode === 'leaving' ? '本场收官复盘' : '本场牌局复盘'}
            </h2>
            {summary && (
              <div className="flex flex-wrap items-baseline gap-2 text-xs text-[#7E8883]">
                <span className="font-mono-num text-[#E8CF96]">
                  共 {summary.totalHands} 手
                </span>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span className={`font-mono-num font-semibold ${sessionNetTone}`}>
                  {summary.netChips >= 0
                    ? `+${summary.netChips.toLocaleString()}`
                    : summary.netChips.toLocaleString()}
                  （{summary.netBB >= 0 ? `+${summary.netBB}` : summary.netBB} BB）
                </span>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span className="font-mono-num text-[#9AA5A0]">
                  胜率 {summary.winRatePct}%
                </span>
                {summary.bookmarkedCount > 0 && (
                  <>
                    <span aria-hidden="true" className="text-white/20">·</span>
                    <span className="font-mono-num text-[#D4A853]">
                      已标记 {summary.bookmarkedCount} 手
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            data-testid="close-hand-review-btn"
            onClick={onClose}
            aria-label="关闭复盘"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/[0.08] text-[#9AA5A0] hover:bg-white/[0.05] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Scrollable Editorial Ledger Body */}
        <div className="chat-scroll flex-1 overflow-y-auto bg-[#0B0D0F] px-5 py-5 sm:px-6 sm:py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-xs text-[#9AA5A0]">
              <Loader2 className="h-5 w-5 animate-spin text-[#D4A853]" aria-hidden="true" />
              <span>正在汇总本场手牌走势与关键决策…</span>
            </div>
          ) : error ? (
            <div className="border-y border-[#E07A7A]/30 py-6 text-center text-xs text-[#E07A7A]">
              {error}
            </div>
          ) : summary ? (
            <div className="space-y-6">
              {/* Section 1: Unboxed 4-Column Hairline KPI Ledger Strip */}
              <section
                aria-label="本场核心数据"
                className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-y border-white/[0.08] py-3"
              >
                <div className="pb-2.5 sm:pb-0 sm:pr-4">
                  <div className="text-[11px] text-[#7E8883]">本场净盈亏</div>
                  <div className={`mt-1 font-mono-num text-base font-bold leading-none ${sessionNetTone}`}>
                    {summary.netChips >= 0
                      ? `+${summary.netChips.toLocaleString()}`
                      : summary.netChips.toLocaleString()}
                  </div>
                  <div className="mt-1 font-mono-num text-[11px] text-[#7D8782]">
                    {summary.netBB >= 0 ? `+${summary.netBB}` : summary.netBB} BB
                  </div>
                </div>

                <div className="pb-2.5 pl-4 sm:pb-0 sm:px-4">
                  <div className="text-[11px] text-[#7E8883]">胜率与手数</div>
                  <div className="mt-1 font-mono-num text-base font-bold leading-none text-[#F3F1EC]">
                    {summary.winRatePct}%
                  </div>
                  <div className="mt-1 font-mono-num text-[11px] text-[#7D8782]">
                    胜 {summary.handsWon} / 共 {summary.totalHands} 手
                  </div>
                </div>

                <div className="pt-2.5 sm:pt-0 sm:px-4">
                  <div className="text-[11px] text-[#7E8883]">决策精准度</div>
                  <div className="mt-1 font-mono-num text-base font-bold leading-none text-[#E8CF96]">
                    {summary.decisionAccuracyPct !== null ? `${summary.decisionAccuracyPct}%` : '—'}
                  </div>
                  <div className="mt-1 font-mono-num text-[11px] text-[#7D8782]">
                    {summary.mistakeDecisions > 0
                      ? `关键失误 ${summary.mistakeDecisions} 次`
                      : `共 ${summary.totalDecisions} 处关键节点`}
                  </div>
                </div>

                <div className="pt-2.5 pl-4 sm:pt-0 sm:pl-4">
                  <div className="text-[11px] text-[#7E8883]">最大底池 · 频率</div>
                  <div className="mt-1 font-mono-num text-base font-bold leading-none text-[#F3F1EC]">
                    {summary.biggestPot.toLocaleString()}
                  </div>
                  <div className="mt-1 font-mono-num text-[11px] text-[#7D8782]">
                    {summary.vpipPct !== null
                      ? `VPIP ${summary.vpipPct}%${summary.pfrPct !== null ? ` · PFR ${summary.pfrPct}%` : ''}`
                      : `已标记 ${summary.bookmarkedCount} 手`}
                  </div>
                </div>
              </section>

              {/* Section 2: Unboxed Interactive Session P&L Curve */}
              <SessionPnlChart
                points={summary.pnlSeries}
                selectedHandNumber={activeHandNumber}
                onSelectHand={(hn) => handleSelectHand(hn, true)}
              />

              {/* Unboxed 2-Column Session Takeaways */}
              <section
                aria-label="本场习惯与改进点"
                className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-0 md:divide-x divide-white/[0.08] border-y border-white/[0.08] py-4"
              >
                <div className="md:pr-6">
                  <h3 className="text-xs font-semibold text-[#8CC9AA]">本场做得好的方面</h3>
                  <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-[#C6D0CB]">
                    {summary.sessionStrengths.map((item, idx) => (
                      <li key={`sess-str-${idx}`}>· {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-white/[0.08] pt-4 md:border-t-0 md:pt-0 md:pl-6">
                  <h3 className="text-xs font-semibold text-[#E8CF96]">本场主要漏损与建议</h3>
                  <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-[#C6D0CB]">
                    {summary.sessionLeaks.map((item, idx) => (
                      <li key={`sess-leak-${idx}`}>· {item}</li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* Section 3: Curated Key Turning-Point Hands + All Hands Ledger */}
              <section aria-label="关键手牌筛选与切换" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.08]">
                  <div className="pb-2">
                    <h3 className="text-xs font-semibold text-[#EAE6DC]">关键转折手牌</h3>
                    <p className="mt-0.5 text-[11px] text-[#7E8883]">
                      优先置顶已标记手牌，并自动筛选失误节点、最大底池与核心盈亏局
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-xs shrink-0">
                    <button
                      type="button"
                      data-testid="review-mode-key-hands"
                      onClick={() => setHandListMode('key')}
                      className={`pb-2 border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
                        handListMode === 'key'
                          ? 'border-[#D4A853] font-semibold text-[#E8CF96]'
                          : 'border-transparent text-[#8B9590] hover:text-white'
                      }`}
                    >
                      精选关键手牌 ({summary.keyHands.length})
                    </button>
                    <button
                      type="button"
                      data-testid="review-mode-all-hands"
                      onClick={() => setHandListMode('all')}
                      className={`pb-2 border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
                        handListMode === 'all'
                          ? 'border-[#D4A853] font-semibold text-[#E8CF96]'
                          : 'border-transparent text-[#8B9590] hover:text-white'
                      }`}
                    >
                      全部手牌 ({summary.allHands.length})
                    </button>
                  </div>
                </div>

                {/* Hairline Hand Ledger Rows (2 columns on desktop, flat active tint) */}
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  {handCardsToDisplay.map((item, idx) => {
                    const isSelected = item.handNumber === activeHandNumber;
                    const itemTone =
                      item.netChips > 0
                        ? 'text-[#8CC9AA]'
                        : item.netChips < 0
                          ? 'text-[#E07A7A]'
                          : 'text-[#9AA5A0]';

                    return (
                      <button
                        key={item.handNumber}
                        type="button"
                        data-testid={`session-hand-card-${item.handNumber}`}
                        onClick={() => handleSelectHand(item.handNumber, false)}
                        className={`group flex items-center justify-between gap-3 border-b border-white/[0.08] px-3 py-2.5 text-left transition-colors cursor-pointer ${
                          idx % 2 === 1 ? 'sm:border-l sm:border-white/[0.08]' : ''
                        } ${
                          isSelected
                            ? 'bg-[#D4A853]/[0.08]'
                            : 'hover:bg-white/[0.025]'
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={`font-mono-num font-semibold ${
                                isSelected ? 'text-[#E8CF96]' : 'text-[#F3F1EC]'
                              }`}
                            >
                              第 {item.handNumber} 局
                            </span>
                            <span className="font-mono-num text-[11px] text-[#7E8883]">
                              {item.heroPosition}
                            </span>
                            {item.canonicalHand && (
                              <span className="font-mono-num text-[11px] font-medium text-[#D4A853]">
                                {item.canonicalHand}
                              </span>
                            )}
                            {item.isBookmarked && (
                              <Bookmark
                                className="h-3 w-3 shrink-0 fill-[#D4A853] text-[#D4A853]"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <div className="truncate text-[11px] text-[#9AA5A0]">
                            {item.reasonLabels.length > 0
                              ? item.reasonLabels.join(' · ')
                              : item.heroFinalHandName ?? '常规对局'}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className={`font-mono-num text-xs font-bold ${itemTone}`}>
                            {item.netChips >= 0 ? `+${item.netChips}` : item.netChips}
                          </div>
                          <div className="font-mono-num text-[10px] text-[#7D8782]">
                            底池 {item.pot.toLocaleString()}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Section 4: Selected Hand Detailed Evidence Replay (Unboxed Editorial Flow) */}
              {report && (
                <div ref={detailAnchorRef} className="space-y-6 pt-2">
                  {/* Hand Summary Header */}
                  <section className="space-y-4 border-b border-white/[0.08] pb-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#9AA5A0]">
                          <span className="font-mono-num font-semibold text-[#D4A853]">
                            第 {report.handNumber} 局详情
                          </span>
                          <span aria-hidden="true" className="text-white/20">·</span>
                          <span className={`font-semibold ${outcomeTone}`}>{outcomeLabel}</span>
                          <span className={`font-mono-num font-semibold ${outcomeTone}`}>
                            {report.netChips >= 0 ? `+${report.netChips}` : report.netChips}（
                            {report.netBB >= 0 ? `+${report.netBB}` : report.netBB} BB）
                          </span>
                          <span aria-hidden="true" className="text-white/20">·</span>
                          <span className="font-mono-num">位置 {report.heroPosition}</span>
                          <span aria-hidden="true" className="text-white/20">·</span>
                          <span className="font-mono-num">底池 {report.pot.toLocaleString()}</span>
                        </div>

                        <h3 className="font-display text-lg font-bold leading-snug text-[#F5F2EB]">
                          {report.headline}
                        </h3>
                        <p className="text-xs leading-relaxed text-[#9DA7A2]">
                          {report.overallSummary}
                        </p>

                        {onToggleBookmark && (
                          <div className="pt-1">
                            <button
                              type="button"
                              data-testid="review-toggle-bookmark-btn"
                              onClick={() => onToggleBookmark(report.handNumber)}
                              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                                isSelectedBookmarked
                                  ? 'border-[#D4A853]/60 bg-[#D4A853]/[0.1] text-[#E8CF96]'
                                  : 'border-white/[0.1] bg-transparent text-[#9AA5A0] hover:border-white/[0.2] hover:text-white'
                              }`}
                            >
                              <Bookmark
                                className={`h-3 w-3 ${isSelectedBookmarked ? 'fill-[#D4A853] text-[#D4A853]' : ''}`}
                                aria-hidden="true"
                              />
                              <span>{isSelectedBookmarked ? '已标记为重点手牌' : '标记为重点手牌'}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Hero & Board Cards */}
                      <div className="flex flex-wrap items-center gap-5 shrink-0">
                        {report.heroHoleCards && report.heroHoleCards.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[11px] text-[#7E8883]">
                              我的底牌
                              {report.canonicalHand ? ` · ${report.canonicalHand}` : ''}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {report.heroHoleCards.map((c, idx) => (
                                <PlayingCard
                                  key={`hero-${c.suit}-${c.rank}-${idx}`}
                                  card={c}
                                  size="md"
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {report.communityCards.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[11px] text-[#7E8883]">公共牌</div>
                            <div className="flex items-center gap-1.5">
                              {report.communityCards.map((c, idx) => (
                                <PlayingCard
                                  key={`board-${c.suit}-${c.rank}-${idx}`}
                                  card={c}
                                  size="md"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {report.showdownOpponents.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-white/[0.08] pt-3.5">
                        <span className="text-[11px] font-medium text-[#7E8883]">摊牌亮牌</span>
                        {report.showdownOpponents.map((opp) => (
                          <div key={opp.id} className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-[#F3F1EC]">{opp.name}</span>
                            <div className="flex items-center gap-1">
                              {opp.holeCards.map((c, idx) => (
                                <PlayingCard
                                  key={`opp-${opp.id}-${c.suit}-${c.rank}-${idx}`}
                                  card={c}
                                  size="sm"
                                />
                              ))}
                            </div>
                            <span className="text-[11px] text-[#E8CF96]">{opp.handName}</span>
                            <span
                              className={`font-mono-num text-[11px] ${
                                opp.netChange >= 0 ? 'text-[#8CC9AA]' : 'text-[#8E9893]'
                              }`}
                            >
                              {opp.netChange >= 0 ? `+${opp.netChange}` : opp.netChange}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Selected Hand Analysis Sub-Tabs: Street Evidence | GTO Matrix | Node-Lock Exploit */}
                  <div
                    ref={workbenchTabsRef}
                    className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.08] scroll-mt-2"
                  >
                    <div className="flex items-center gap-5 text-xs">
                      <button
                        type="button"
                        data-testid="review-detail-tab-streets"
                        onClick={() => handleSwitchDetailTab('streets')}
                        className={`pb-2.5 border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
                          detailTab === 'streets'
                            ? 'border-[#D4A853] font-semibold text-[#E8CF96]'
                            : 'border-transparent text-[#8B9590] hover:text-white'
                        }`}
                      >
                        逐街过程与证据
                      </button>
                      <button
                        type="button"
                        data-testid="review-detail-tab-gto"
                        onClick={() => handleSwitchDetailTab('gto')}
                        className={`pb-2.5 border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
                          detailTab === 'gto'
                            ? 'border-[#D4A853] font-semibold text-[#E8CF96]'
                            : 'border-transparent text-[#8B9590] hover:text-white'
                        }`}
                      >
                        GTO 策略矩阵 (13×13)
                      </button>
                      <button
                        type="button"
                        data-testid="review-detail-tab-nodelock"
                        onClick={() => handleSwitchDetailTab('nodelock')}
                        className={`pb-2.5 border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${
                          detailTab === 'nodelock'
                            ? 'border-[#D4A853] font-semibold text-[#E8CF96]'
                            : 'border-transparent text-[#8B9590] hover:text-white'
                        }`}
                      >
                        Node-Lock 剥削推演
                      </button>
                    </div>

                    {detailTab === 'streets' && report.streets.length > 1 && (
                      <div className="flex items-center gap-3 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setStreetFilter('all')}
                          className={`pb-2.5 border-b-2 -mb-px transition-colors cursor-pointer ${
                            streetFilter === 'all'
                              ? 'border-[#D4A853] font-semibold text-[#E8CF96]'
                              : 'border-transparent text-[#8B9590] hover:text-white'
                          }`}
                        >
                          全部
                        </button>
                        {report.streets.map((st) => (
                          <button
                            key={st.street}
                            type="button"
                            onClick={() => setStreetFilter(st.street)}
                            className={`pb-2.5 border-b-2 -mb-px transition-colors cursor-pointer ${
                              streetFilter === st.street
                                ? 'border-[#D4A853] font-semibold text-[#E8CF96]'
                                : 'border-transparent text-[#8B9590] hover:text-white'
                            }`}
                          >
                            {st.streetLabel}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tab 1: Street-by-Street Replay & Decision Notes */}
                  {detailTab === 'streets' && (
                    <section aria-label="逐街过程与关键决策" className="space-y-4">
                      <div className="divide-y divide-white/[0.08]">
                        {visibleStreets.map((st) => (
                          <div
                            key={st.street}
                            data-testid={`review-street-${st.street}`}
                            className="py-4 first:pt-1 last:pb-0 space-y-3.5"
                          >
                            {/* Street Header */}
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <div className="flex flex-wrap items-baseline gap-2.5">
                                <span className="text-xs font-semibold text-[#D4A853]">
                                  {st.streetLabel}
                                </span>
                                <span className="text-[11px] text-[#9AA5A0]">{st.boardSummary}</span>
                              </div>
                              <div className="font-mono-num text-[11px] text-[#7D8782]">
                                底池 {st.potStart.toLocaleString()} → {st.potEnd.toLocaleString()}
                              </div>
                            </div>

                            {/* Action Timeline */}
                            {st.events.length > 0 && (
                              <div className="divide-y divide-white/[0.05] border-y border-white/[0.06]">
                                {st.events.map((ev) => (
                                  <div
                                    key={`${st.street}-${ev.step}-${ev.actorId}`}
                                    className={`flex items-center justify-between gap-3 py-1.5 px-1.5 text-xs ${
                                      ev.isHero
                                        ? 'bg-[#D4A853]/[0.06] text-[#F3F1EC]'
                                        : 'text-[#9AA5A0]'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <span className="font-mono-num text-[11px] text-[#6F7873] w-5 shrink-0">
                                        #{ev.step}
                                      </span>
                                      <span
                                        className={`truncate ${
                                          ev.isHero ? 'font-semibold text-[#E8CF96]' : 'text-[#D2DCD7]'
                                        }`}
                                      >
                                        {ev.actorName}
                                        {ev.isHero ? '（你）' : ''}
                                      </span>
                                      <span className="font-medium text-[#F3F1EC]">
                                        {ev.actionLabel}
                                      </span>
                                    </div>
                                    <span className="font-mono-num text-[11px] text-[#7D8782] shrink-0">
                                      底池 {ev.potAfter.toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Hero Decision Notes + EV Loss & Quick Jump */}
                            {st.heroDecisions.length > 0 && (
                              <div className="divide-y divide-white/[0.06] pt-1">
                                {st.heroDecisions.map((dec) => {
                                  const quickWb = buildGtoSpotWorkbench({
                                    report,
                                    decision: dec,
                                    sessionProfileContext:
                                      report.sessionProfileContext ?? summary.sessionProfileContext,
                                  });
                                  return (
                                    <div
                                      key={`dec-${st.street}-${dec.step}`}
                                      data-testid={`review-decision-${st.street}-${dec.step}`}
                                      className="py-2.5 first:pt-0 last:pb-0 space-y-1.5"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span
                                            className={`h-1.5 w-1.5 rounded-full ${VERDICT_DOT_CLASS[dec.verdict]}`}
                                            aria-hidden="true"
                                          />
                                          <span className={`font-semibold ${VERDICT_TEXT_CLASS[dec.verdict]}`}>
                                            {dec.verdictLabel}
                                          </span>
                                          <span aria-hidden="true" className="text-white/20">·</span>
                                          <span className="text-[#F3F1EC]">
                                            实际：{dec.actualActionLabel}
                                          </span>
                                          <span aria-hidden="true" className="text-white/25">→</span>
                                          <span className="text-[#9AA5A0]">
                                            参考：{dec.recommendedLabel}
                                          </span>
                                          <span aria-hidden="true" className="text-white/20">·</span>
                                          <span
                                            className={`font-mono-num text-[11px] font-semibold ${EV_GRADE_TEXT_CLASS[quickWb.evGrade]}`}
                                          >
                                            EV {quickWb.evLossBB > 0 ? `-${quickWb.evLossBB.toFixed(2)}` : '0.00'} BB（{quickWb.evGradeLabel}）
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-2 text-[11px]">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenDecisionInWorkbench(dec.step, 'gto')}
                                            className="cursor-pointer text-[#E8CF96] hover:text-white transition-colors"
                                          >
                                            查看矩阵 →
                                          </button>
                                          <span aria-hidden="true" className="text-white/15">|</span>
                                          <button
                                            type="button"
                                            onClick={() => handleOpenDecisionInWorkbench(dec.step, 'nodelock')}
                                            className="cursor-pointer text-[#8CC9AA] hover:text-white transition-colors"
                                          >
                                            剥削推演 →
                                          </button>
                                        </div>
                                      </div>

                                      {/* Inline Math Metrics */}
                                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-num text-[11px] text-[#7E8883]">
                                        <span>
                                          前底池{' '}
                                          <strong className="font-medium text-[#D2DCD7]">
                                            {dec.evidence.potBefore.toLocaleString()}
                                          </strong>
                                        </span>
                                        {dec.evidence.toCall > 0 && (
                                          <span>
                                            赔率{' '}
                                            <strong className="font-medium text-[#D2DCD7]">
                                              {dec.evidence.potOddsPct}%
                                            </strong>
                                          </span>
                                        )}
                                        {dec.evidence.toCall > 0 && (
                                          <span>
                                            MDF{' '}
                                            <strong className="font-medium text-[#D2DCD7]">
                                              {dec.evidence.mdfPct}%
                                            </strong>
                                          </span>
                                        )}
                                        {dec.evidence.estimatedEquityPct !== null && (
                                          <span>
                                            估算胜率{' '}
                                            <strong className="font-medium text-[#E8CF96]">
                                              {dec.evidence.estimatedEquityPct}%
                                            </strong>
                                          </span>
                                        )}
                                        {dec.evidence.preflopMix && (
                                          <span>
                                            参考频次 加注 {dec.evidence.preflopMix.raise}% / 跟注{' '}
                                            {dec.evidence.preflopMix.call}% / 弃牌{' '}
                                            {dec.evidence.preflopMix.fold}%
                                          </span>
                                        )}
                                        <span>
                                          SPR{' '}
                                          <strong className="font-medium text-[#D2DCD7]">
                                            {dec.evidence.spr}
                                          </strong>
                                        </span>
                                      </div>

                                      <p className="text-xs leading-relaxed text-[#C6D0CB]">
                                        {dec.analysis}
                                      </p>
                                      <p className="text-xs leading-relaxed text-[#E8CF96]">
                                        思路建议：{dec.suggestion}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Tab 2 & 3: GTO Strategy Matrix & Bayesian Node-Lock Exploitative Lab */}
                  {(detailTab === 'gto' || detailTab === 'nodelock') && (
                    <GtoSpotInspector
                      report={report}
                      roomId={roomId}
                      sessionProfileContext={
                        report.sessionProfileContext ?? summary.sessionProfileContext
                      }
                      viewMode={detailTab}
                      selectedStep={selectedDecisionStep}
                      onSelectStep={setSelectedDecisionStep}
                    />
                  )}

                  {/* Teaching Point (Unboxed Editorial Section) */}
                  <section
                    data-testid="review-teaching-card"
                    aria-label="延伸要点"
                    className="border-t border-white/[0.08] pt-5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs font-semibold text-[#D4A853]">延伸要点</span>
                      <span aria-hidden="true" className="text-white/20">·</span>
                      <h4 className="text-xs font-semibold text-[#F3F1EC]">
                        {report.teaching.topic}
                      </h4>
                    </div>
                    <p className="text-xs leading-relaxed text-[#C6D0CB]">
                      {report.teaching.principle}
                    </p>
                    <div className="rounded border border-white/[0.08] bg-[#090B0C] px-3.5 py-2 font-mono-num text-[11px] text-[#E8CF96]">
                      {report.teaching.formulaOrRule}
                    </div>
                    <p className="text-xs leading-relaxed text-[#9AA5A0]">
                      下局留意：{report.teaching.nextHandDrill}
                    </p>
                  </section>
                </div>
              )}

              {/* Section 5: Linked Session Image & Opponent Reads (Unboxed Ledger) */}
              {summary.sessionProfileContext &&
                (summary.sessionProfileContext.heroTableImage ||
                  summary.sessionProfileContext.opponentReads.length > 0) && (
                  <section
                    data-testid="review-session-profile-section"
                    aria-label="当局打法画像与对手观察"
                    className="border-t border-white/[0.08] pt-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-xs font-semibold text-[#EAE6DC]">
                        本场牌桌画像与对手观察
                      </h3>
                      <span className="text-[11px] text-[#7E8883]">同步自本场行动统计</span>
                    </div>

                    {summary.sessionProfileContext.heroTableImage && (
                      <div className="space-y-1.5 border-y border-white/[0.08] py-3">
                        <div className="flex flex-wrap items-baseline gap-2 text-xs">
                          <span className="text-[#7E8883]">对手眼中的你</span>
                          <span className="font-semibold text-[#E8CF96]">
                            {summary.sessionProfileContext.heroTableImage.archetypeLabel}
                          </span>
                          <span className="font-mono-num text-[11px] text-[#7D8782]">
                            样本 {summary.sessionProfileContext.heroTableImage.handsObserved} 局 ·
                            置信 {summary.sessionProfileContext.heroTableImage.confidencePct}%
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-[#C6D0CB]">
                          易被针对：{summary.sessionProfileContext.heroTableImage.botCounterSummary}
                        </p>
                        <p className="text-xs leading-relaxed text-[#8CC9AA]">
                          调整思路：{summary.sessionProfileContext.heroTableImage.antiExploitTip}
                        </p>
                      </div>
                    )}

                    {summary.sessionProfileContext.opponentReads.length > 0 && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {summary.sessionProfileContext.opponentReads.map((opp) => (
                          <div
                            key={opp.playerId}
                            className="space-y-1 border-b border-white/[0.06] pb-3 last:border-b-0"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                              <span className="font-semibold text-[#F3F1EC]">
                                {opp.playerName}
                                <span className="ml-1.5 font-normal text-[#9AA5A0]">
                                  · {opp.archetypeLabel}
                                </span>
                              </span>
                              <span className="font-mono-num text-[11px] text-[#7D8782]">
                                {opp.handsObserved} 局
                              </span>
                            </div>
                            <div className="font-mono-num text-[11px] text-[#7E8883]">
                              VPIP {opp.vpipPct}% · PFR {opp.pfrPct}% · 弃牌 {opp.foldToBetPct}% ·
                              AF {opp.aggressionFactor}
                            </div>
                            <p className="text-xs leading-relaxed text-[#B4C4D2]">
                              {opp.exploitativeAdvice}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
            </div>
          ) : null}
        </div>

        {/* Editorial Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#090B0C] px-5 py-3 sm:px-6">
          <span className="text-[11px] text-[#7E8883]">
            本场记录已同步至个人中心长期打法画像
          </span>
          <div className="flex items-center gap-2.5">
            {onOpenPersonalInsights && (
              <button
                type="button"
                data-testid="review-goto-insights-btn"
                onClick={() => {
                  onClose();
                  onOpenPersonalInsights();
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-white/[0.12] bg-transparent px-3.5 text-xs font-medium text-[#E8CF96] hover:border-[#D4A853]/60 hover:bg-white/[0.05] transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>查看打法画像</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}

            {mode === 'leaving' && onConfirmLeave ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 rounded border border-white/[0.12] bg-transparent px-3.5 text-xs text-[#C6D0CB] hover:bg-white/[0.05] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  留在牌桌
                </button>
                <button
                  type="button"
                  data-testid="confirm-leave-after-review-btn"
                  onClick={() => {
                    onClose();
                    onConfirmLeave();
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded bg-[#D4A853] px-4 text-xs font-bold text-[#0F1210] hover:bg-[#E1B968] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>确认离桌</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded border border-white/[0.12] bg-transparent px-4 text-xs text-[#C6D0CB] hover:bg-white/[0.05] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                返回牌桌
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
