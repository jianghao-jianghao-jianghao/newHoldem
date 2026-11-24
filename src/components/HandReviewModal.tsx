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
  optimal: 'text-[#88B99E]',
  acceptable: 'text-[#E4CB96]',
  inaccuracy: 'text-[#D5A164]',
  mistake: 'text-[#D97C72]',
};

const VERDICT_DOT_CLASS: Record<DecisionVerdict, string> = {
  optimal: 'bg-[#7BB598]',
  acceptable: 'bg-[#C9A25B]',
  inaccuracy: 'bg-[#C99D6B]',
  mistake: 'bg-[#D97C72]',
};

type StreetFilter = 'all' | 'preflop' | 'flop' | 'turn' | 'river';
type HandListMode = 'key' | 'all';

export function HandReviewModal({
  open,
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
  const detailAnchorRef = useRef<HTMLDivElement | null>(null);
  const bookmarkedRef = useRef<number[]>(bookmarkedHands);
  bookmarkedRef.current = bookmarkedHands;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHandListMode('key');
    setStreetFilter('all');

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
    if (scrollToDetail && detailAnchorRef.current) {
      detailAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const sessionNetTone =
    !summary || summary.netChips === 0
      ? 'text-[#E4CB96]'
      : summary.netChips > 0
        ? 'text-[#7BB598]'
        : 'text-[#D97C72]';

  const outcomeTone =
    report?.outcome === 'win'
      ? 'text-[#7BB598]'
      : report?.outcome === 'split'
        ? 'text-[#E4CB96]'
        : 'text-[#D97C72]';

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
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/78 backdrop-blur-md p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[91dvh] w-full max-w-[980px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#12110F] text-[#EFECE4] shadow-[0_36px_96px_rgba(0,0,0,0.88)] ring-1 ring-white/[0.04]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Masthead */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0F0E0C] px-6 py-4 sm:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="font-display text-base font-semibold tracking-tight text-[#F5F1E8]">
                {mode === 'leaving' ? '本场收官复盘' : '本场牌局复盘'}
              </h2>
              {summary && (
                <div className="flex flex-wrap items-baseline gap-2 text-xs text-[#8C857A]">
                  <span className="font-mono-num text-[#E4CB96]">
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
                  <span className="font-mono-num text-[#A39C91]">
                    胜率 {summary.winRatePct}%
                  </span>
                  {summary.bookmarkedCount > 0 && (
                    <>
                      <span aria-hidden="true" className="text-white/20">·</span>
                      <span className="font-mono-num text-[#E4CB96]">
                        已标记 {summary.bookmarkedCount} 手
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            data-testid="close-hand-review-btn"
            onClick={onClose}
            aria-label="关闭复盘"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#898277] hover:bg-white/[0.06] hover:text-[#F4F0E8] transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="chat-scroll flex-1 overflow-y-auto bg-[#141310] px-6 py-6 sm:px-7 sm:py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-[#9C958A]">
              <Loader2 className="h-5 w-5 animate-spin text-[#C9A25B]" aria-hidden="true" />
              <span>正在汇总本场手牌走势与关键决策…</span>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[#D97C72]/25 bg-[#1B1513] px-5 py-6 text-center text-sm text-[#E0A39B]">
              {error}
            </div>
          ) : summary ? (
            <div className="space-y-6">
              {/* Section 1: Session Overview Metrics */}
              <section aria-label="本场核心数据" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 px-4 py-3.5">
                  <div className="text-[11px] text-[#847D73]">本场净盈亏</div>
                  <div className={`mt-1.5 font-mono-num text-lg font-semibold leading-none ${sessionNetTone}`}>
                    {summary.netChips >= 0
                      ? `+${summary.netChips.toLocaleString()}`
                      : summary.netChips.toLocaleString()}
                  </div>
                  <div className="mt-1.5 font-mono-num text-[11px] text-[#7F786E]">
                    {summary.netBB >= 0 ? `+${summary.netBB}` : summary.netBB} BB
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 px-4 py-3.5">
                  <div className="text-[11px] text-[#847D73]">胜率与手数</div>
                  <div className="mt-1.5 font-mono-num text-lg font-semibold leading-none text-[#EFECE4]">
                    {summary.winRatePct}%
                  </div>
                  <div className="mt-1.5 font-mono-num text-[11px] text-[#7F786E]">
                    胜 {summary.handsWon} / 共 {summary.totalHands} 手
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 px-4 py-3.5">
                  <div className="text-[11px] text-[#847D73]">决策精准度</div>
                  <div className="mt-1.5 font-mono-num text-lg font-semibold leading-none text-[#E4CB96]">
                    {summary.decisionAccuracyPct !== null ? `${summary.decisionAccuracyPct}%` : '—'}
                  </div>
                  <div className="mt-1.5 font-mono-num text-[11px] text-[#7F786E]">
                    {summary.mistakeDecisions > 0
                      ? `关键失误 ${summary.mistakeDecisions} 次`
                      : `共 ${summary.totalDecisions} 处关键节点`}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 px-4 py-3.5">
                  <div className="text-[11px] text-[#847D73]">最大底池 · 频率</div>
                  <div className="mt-1.5 font-mono-num text-lg font-semibold leading-none text-[#EFECE4]">
                    {summary.biggestPot.toLocaleString()}
                  </div>
                  <div className="mt-1.5 font-mono-num text-[11px] text-[#7F786E]">
                    {summary.vpipPct !== null
                      ? `VPIP ${summary.vpipPct}%${summary.pfrPct !== null ? ` · PFR ${summary.pfrPct}%` : ''}`
                      : `已标记 ${summary.bookmarkedCount} 手`}
                  </div>
                </div>
              </section>

              {/* Section 2: Interactive Session P&L Curve */}
              <SessionPnlChart
                points={summary.pnlSeries}
                selectedHandNumber={activeHandNumber}
                onSelectHand={(hn) => handleSelectHand(hn, true)}
              />

              {/* Session-Wide Takeaways (2-column calm editorial cards) */}
              <section
                aria-label="本场习惯与改进点"
                className="grid grid-cols-1 gap-4 md:grid-cols-2"
              >
                <div className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5">
                  <h3 className="text-xs font-medium tracking-wide text-[#88B99E]">
                    本场做得好的方面
                  </h3>
                  <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[#CFC9BE]">
                    {summary.sessionStrengths.map((item, idx) => (
                      <li key={`sess-str-${idx}`}>· {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5">
                  <h3 className="text-xs font-medium tracking-wide text-[#D5A164]">
                    本场主要漏损与建议
                  </h3>
                  <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[#CFC9BE]">
                    {summary.sessionLeaks.map((item, idx) => (
                      <li key={`sess-leak-${idx}`}>· {item}</li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* Section 3: Curated Key Turning-Point Hands + All Hands Archive */}
              <section aria-label="关键手牌筛选与切换" className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
                  <div>
                    <h3 className="text-xs font-medium tracking-wide text-[#DDD6C9]">
                      关键转折手牌
                    </h3>
                    <p className="mt-0.5 text-[11px] text-[#847D73]">
                      优先置顶你标记的手牌，并自动精选本场核心失误、最大底池与关键盈亏节点
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-[#0F0E0C]/85 p-1 text-[11px] shrink-0">
                    <button
                      type="button"
                      data-testid="review-mode-key-hands"
                      onClick={() => setHandListMode('key')}
                      className={`rounded-lg px-3 py-1 transition-colors cursor-pointer whitespace-nowrap ${
                        handListMode === 'key'
                          ? 'bg-[#23201B] font-medium text-[#F4E7C8]'
                          : 'text-[#857E74] hover:text-[#DDD6C9]'
                      }`}
                    >
                      精选关键手牌 ({summary.keyHands.length})
                    </button>
                    <button
                      type="button"
                      data-testid="review-mode-all-hands"
                      onClick={() => setHandListMode('all')}
                      className={`rounded-lg px-3 py-1 transition-colors cursor-pointer whitespace-nowrap ${
                        handListMode === 'all'
                          ? 'bg-[#23201B] font-medium text-[#F4E7C8]'
                          : 'text-[#857E74] hover:text-[#DDD6C9]'
                      }`}
                    >
                      全部手牌 ({summary.allHands.length})
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {handCardsToDisplay.map((item) => {
                    const isSelected = item.handNumber === activeHandNumber;
                    const itemTone =
                      item.netChips > 0
                        ? 'text-[#7BB598]'
                        : item.netChips < 0
                          ? 'text-[#D97C72]'
                          : 'text-[#C8C1B6]';

                    return (
                      <button
                        key={item.handNumber}
                        type="button"
                        data-testid={`session-hand-card-${item.handNumber}`}
                        onClick={() => handleSelectHand(item.handNumber, false)}
                        className={`group flex flex-col justify-between rounded-xl border px-4 py-3 text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#C9A25B]/60 bg-[#1E1B16]'
                            : 'border-white/[0.06] bg-[#181613]/92 hover:border-white/[0.14] hover:bg-[#1C1A16]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs min-w-0">
                            <span className="font-mono-num font-semibold text-[#EFECE4]">
                              第 {item.handNumber} 局
                            </span>
                            <span className="font-mono-num text-[11px] text-[#8E877D]">
                              {item.heroPosition}
                            </span>
                            {item.canonicalHand && (
                              <span className="font-mono-num text-[11px] font-medium text-[#E4CB96]">
                                {item.canonicalHand}
                              </span>
                            )}
                          </div>
                          <span className={`font-mono-num text-xs font-semibold shrink-0 ${itemTone}`}>
                            {item.netChips >= 0 ? `+${item.netChips}` : item.netChips}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-1.5 text-[#9C958A] truncate">
                            {item.isBookmarked && (
                              <Bookmark
                                className="h-3 w-3 shrink-0 fill-[#C9A25B] text-[#C9A25B]"
                                aria-hidden="true"
                              />
                            )}
                            <span className="truncate">
                              {item.reasonLabels.length > 0
                                ? item.reasonLabels.join(' · ')
                                : item.heroFinalHandName ?? '常规对局'}
                            </span>
                          </div>
                          <span className="font-mono-num text-[#7B746A] shrink-0">
                            底池 {item.pot.toLocaleString()}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Section 4: Selected Hand Detailed Evidence Replay */}
              {report && (
                <div ref={detailAnchorRef} className="space-y-5 pt-2 border-t border-white/[0.07]">
                  {/* Hand Summary Header Card */}
                  <section className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5 sm:p-6 space-y-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#8E877D]">
                          <span className="font-mono-num font-semibold text-[#E4CB96]">
                            第 {report.handNumber} 局详情
                          </span>
                          <span aria-hidden="true" className="text-white/20">·</span>
                          <span className={`font-medium ${outcomeTone}`}>{outcomeLabel}</span>
                          <span className={`font-mono-num font-semibold ${outcomeTone}`}>
                            {report.netChips >= 0 ? `+${report.netChips}` : report.netChips}（
                            {report.netBB >= 0 ? `+${report.netBB}` : report.netBB} BB）
                          </span>
                          <span aria-hidden="true" className="text-white/20">·</span>
                          <span className="font-mono-num">
                            位置 {report.heroPosition}
                          </span>
                          <span aria-hidden="true" className="text-white/20">·</span>
                          <span className="font-mono-num">
                            底池 {report.pot.toLocaleString()}
                          </span>
                        </div>

                        <h3 className="font-display text-lg font-semibold leading-snug text-[#F5F1E8]">
                          {report.headline}
                        </h3>
                        <p className="text-xs leading-relaxed text-[#A39C91]">
                          {report.overallSummary}
                        </p>

                        {onToggleBookmark && (
                          <div className="pt-1">
                            <button
                              type="button"
                              data-testid="review-toggle-bookmark-btn"
                              onClick={() => onToggleBookmark(report.handNumber)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                                isSelectedBookmarked
                                  ? 'border-[#C9A25B]/50 bg-[#C9A25B]/[0.1] text-[#F0DFB3]'
                                  : 'border-white/[0.08] bg-white/[0.02] text-[#9A9388] hover:border-white/[0.16] hover:text-[#EFECE4]'
                              }`}
                            >
                              <Bookmark
                                className={`h-3 w-3 ${isSelectedBookmarked ? 'fill-[#C9A25B] text-[#C9A25B]' : ''}`}
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
                            <div className="text-[11px] text-[#847D73]">
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
                            <div className="text-[11px] text-[#847D73]">公共牌</div>
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
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-white/[0.06] pt-3.5">
                        <span className="text-[11px] font-medium text-[#847D73]">摊牌亮牌</span>
                        {report.showdownOpponents.map((opp) => (
                          <div key={opp.id} className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-[#EAE5DC]">{opp.name}</span>
                            <div className="flex items-center gap-1">
                              {opp.holeCards.map((c, idx) => (
                                <PlayingCard
                                  key={`opp-${opp.id}-${c.suit}-${c.rank}-${idx}`}
                                  card={c}
                                  size="sm"
                                />
                              ))}
                            </div>
                            <span className="text-[11px] text-[#E4CB96]">{opp.handName}</span>
                            <span
                              className={`font-mono-num text-[11px] ${
                                opp.netChange >= 0 ? 'text-[#7BB598]' : 'text-[#8E877D]'
                              }`}
                            >
                              {opp.netChange >= 0 ? `+${opp.netChange}` : opp.netChange}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Street-by-Street Replay & Decision Notes */}
                  <section aria-label="逐街过程与关键决策" className="space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
                      <h3 className="text-xs font-medium tracking-wide text-[#DDD6C9]">
                        逐街过程与决策回顾
                      </h3>

                      {report.streets.length > 1 && (
                        <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-[#0F0E0C]/85 p-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setStreetFilter('all')}
                            className={`rounded-lg px-2.5 py-1 transition-colors cursor-pointer ${
                              streetFilter === 'all'
                                ? 'bg-[#23201B] font-medium text-[#F4E7C8]'
                                : 'text-[#857E74] hover:text-[#DDD6C9]'
                            }`}
                          >
                            全部
                          </button>
                          {report.streets.map((st) => (
                            <button
                              key={st.street}
                              type="button"
                              onClick={() => setStreetFilter(st.street)}
                              className={`rounded-lg px-2.5 py-1 transition-colors cursor-pointer ${
                                streetFilter === st.street
                                  ? 'bg-[#23201B] font-medium text-[#F4E7C8]'
                                  : 'text-[#857E74] hover:text-[#DDD6C9]'
                              }`}
                            >
                              {st.streetLabel}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      {visibleStreets.map((st) => (
                        <div
                          key={st.street}
                          data-testid={`review-street-${st.street}`}
                          className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5 space-y-4"
                        >
                          {/* Street Header */}
                          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] pb-2.5">
                            <div className="flex flex-wrap items-baseline gap-2.5">
                              <span className="text-xs font-semibold text-[#E4CB96]">
                                {st.streetLabel}
                              </span>
                              <span className="text-[11px] text-[#8E877D]">{st.boardSummary}</span>
                            </div>
                            <div className="font-mono-num text-[11px] text-[#9A9388]">
                              底池 {st.potStart.toLocaleString()} → {st.potEnd.toLocaleString()}
                            </div>
                          </div>

                          {/* Action Timeline */}
                          {st.events.length > 0 && (
                            <div className="divide-y divide-white/[0.04]">
                              {st.events.map((ev) => (
                                <div
                                  key={`${st.street}-${ev.step}-${ev.actorId}`}
                                  className={`flex items-center justify-between gap-3 py-1.5 text-xs ${
                                    ev.isHero
                                      ? 'bg-white/[0.025] -mx-2 px-2 rounded-lg text-[#F4F0E8]'
                                      : 'text-[#9F988D]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="font-mono-num text-[11px] text-[#6B655C] w-5 shrink-0">
                                      #{ev.step}
                                    </span>
                                    <span
                                      className={`truncate ${
                                        ev.isHero ? 'font-medium text-[#F2E5C6]' : 'text-[#C8C2B7]'
                                      }`}
                                    >
                                      {ev.actorName}
                                      {ev.isHero ? '（你）' : ''}
                                    </span>
                                    <span className="font-medium text-[#EFECE4]">
                                      {ev.actionLabel}
                                    </span>
                                  </div>
                                  <span className="font-mono-num text-[11px] text-[#7F786E] shrink-0">
                                    底池 {ev.potAfter.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Hero Decision Notes */}
                          {st.heroDecisions.length > 0 && (
                            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06] pt-3">
                              {st.heroDecisions.map((dec) => (
                                <div
                                  key={`dec-${st.street}-${dec.step}`}
                                  data-testid={`review-decision-${st.street}-${dec.step}`}
                                  className="py-3 first:pt-1 last:pb-0 space-y-2"
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
                                      <span className="text-[#EAE5DC]">
                                        实际：{dec.actualActionLabel}
                                      </span>
                                      <span aria-hidden="true" className="text-white/25">→</span>
                                      <span className="text-[#B8B1A5]">
                                        参考：{dec.recommendedLabel}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Inline Math Metrics */}
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-num text-[11px] text-[#8E877D]">
                                    <span>
                                      前底池{' '}
                                      <strong className="font-medium text-[#D5CFC4]">
                                        {dec.evidence.potBefore.toLocaleString()}
                                      </strong>
                                    </span>
                                    {dec.evidence.toCall > 0 && (
                                      <span>
                                        赔率{' '}
                                        <strong className="font-medium text-[#D5CFC4]">
                                          {dec.evidence.potOddsPct}%
                                        </strong>
                                      </span>
                                    )}
                                    {dec.evidence.toCall > 0 && (
                                      <span>
                                        MDF{' '}
                                        <strong className="font-medium text-[#D5CFC4]">
                                          {dec.evidence.mdfPct}%
                                        </strong>
                                      </span>
                                    )}
                                    {dec.evidence.estimatedEquityPct !== null && (
                                      <span>
                                        估算胜率{' '}
                                        <strong className="font-medium text-[#E4CB96]">
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
                                      <strong className="font-medium text-[#D5CFC4]">
                                        {dec.evidence.spr}
                                      </strong>
                                    </span>
                                  </div>

                                  <p className="text-xs leading-relaxed text-[#D0CAC0]">
                                    {dec.analysis}
                                  </p>
                                  <p className="text-xs leading-relaxed text-[#E4CB96]/90">
                                    思路建议：{dec.suggestion}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Teaching Point (Clean subtle surface, no thick left border) */}
                  <section
                    data-testid="review-teaching-card"
                    aria-label="延伸要点"
                    className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs font-medium text-[#C9A25B]">延伸要点</span>
                      <span aria-hidden="true" className="text-white/20">·</span>
                      <h4 className="text-xs font-semibold text-[#F4F0E8]">
                        {report.teaching.topic}
                      </h4>
                    </div>
                    <p className="text-xs leading-relaxed text-[#C8C2B7]">
                      {report.teaching.principle}
                    </p>
                    <div className="rounded-xl border border-white/[0.05] bg-[#12110F] px-3.5 py-2.5 font-mono-num text-[11px] text-[#E4CB96]">
                      {report.teaching.formulaOrRule}
                    </div>
                    <p className="text-xs leading-relaxed text-[#9C958A]">
                      下局留意：{report.teaching.nextHandDrill}
                    </p>
                  </section>
                </div>
              )}

              {/* Section 5: Linked Session Image & Opponent Reads */}
              {summary.sessionProfileContext &&
                (summary.sessionProfileContext.heroTableImage ||
                  summary.sessionProfileContext.opponentReads.length > 0) && (
                  <section
                    data-testid="review-session-profile-section"
                    aria-label="当局打法画像与对手观察"
                    className="rounded-2xl border border-white/[0.06] bg-[#181613]/92 p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] pb-3">
                      <h3 className="text-xs font-medium tracking-wide text-[#DDD6C9]">
                        本场牌桌画像与对手观察
                      </h3>
                      <span className="text-[11px] text-[#7E776D]">
                        同步自本场行动统计
                      </span>
                    </div>

                    {summary.sessionProfileContext.heroTableImage && (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-baseline gap-2 text-xs">
                          <span className="text-[#8E877D]">对手眼中的你</span>
                          <span className="font-semibold text-[#E4CB96]">
                            {summary.sessionProfileContext.heroTableImage.archetypeLabel}
                          </span>
                          <span className="font-mono-num text-[11px] text-[#7E776D]">
                            样本 {summary.sessionProfileContext.heroTableImage.handsObserved} 局 ·
                            置信 {summary.sessionProfileContext.heroTableImage.confidencePct}%
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-[#C7C0B5]">
                          易被针对：{summary.sessionProfileContext.heroTableImage.botCounterSummary}
                        </p>
                        <p className="text-xs leading-relaxed text-[#88B99E]">
                          调整思路：{summary.sessionProfileContext.heroTableImage.antiExploitTip}
                        </p>
                      </div>
                    )}

                    {summary.sessionProfileContext.opponentReads.length > 0 && (
                      <div
                        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
                          summary.sessionProfileContext.heroTableImage
                            ? 'border-t border-white/[0.06] pt-4'
                            : ''
                        }`}
                      >
                        {summary.sessionProfileContext.opponentReads.map((opp) => (
                          <div key={opp.playerId} className="space-y-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                              <span className="font-medium text-[#EFECE4]">
                                {opp.playerName}
                                <span className="ml-1.5 font-normal text-[#8E877D]">
                                  · {opp.archetypeLabel}
                                </span>
                              </span>
                              <span className="font-mono-num text-[11px] text-[#7E776D]">
                                {opp.handsObserved} 局
                              </span>
                            </div>
                            <div className="font-mono-num text-[11px] text-[#9A9388]">
                              VPIP {opp.vpipPct}% · PFR {opp.pfrPct}% · 弃牌 {opp.foldToBetPct}% ·
                              AF {opp.aggressionFactor}
                            </div>
                            <p className="text-xs leading-relaxed text-[#B9B2A7]">
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

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] bg-[#0F0E0C] px-6 py-3.5 sm:px-7">
          <span className="text-[11px] text-[#7A7369]">
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
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 text-xs font-medium text-[#E4CB96] hover:border-[#C9A25B]/50 hover:bg-[#C9A25B]/[0.08] transition-colors cursor-pointer whitespace-nowrap"
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
                  className="h-8 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 text-xs text-[#C6C0B6] hover:border-white/[0.16] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
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
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#C9A25B] px-4 text-xs font-semibold text-[#12110F] hover:bg-[#D8B46D] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>确认离桌</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 text-xs text-[#D8D3C9] hover:border-white/[0.16] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
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
