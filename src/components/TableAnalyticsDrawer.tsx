import { useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Bot,
  History,
  PieChart as PieChartIcon,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import { buildStreetPotTrend, type StreetPotTrendPoint } from '../shared/potTrendUtils';
import { PHASE_STAGE_LABELS } from '../shared/tableOverview';
import type { ClientTableView, HandReplayRecord } from '../shared/types';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayingCard } from './PlayingCard';

export type AnalyticsTab = 'standings' | 'trends' | 'pot_d3' | 'insights' | 'replay';

interface TableAnalyticsDrawerProps {
  open: boolean;
  table: ClientTableView;
  myPlayerId: string;
  requestedTab?: { tab: AnalyticsTab; nonce: number } | null;
  onClose: () => void;
}

const LINE_PALETTE = [
  '#D4A853',
  '#8CC9AA',
  '#E5DFD3',
  '#7B93A8',
  '#B87D52',
  '#B86B70',
  '#9CA7B2',
  '#5A928C',
];

function formatShortTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getPlayStyleLabel(vpipPct: number, winPct: number, hands: number): string {
  if (hands < 3) return '样本积累中';
  if (vpipPct >= 45 && winPct >= 35) return '松凶压迫型';
  if (vpipPct >= 45) return '松散娱乐型';
  if (vpipPct <= 28 && winPct >= 30) return '紧凶稳健型';
  if (vpipPct <= 28) return '谨慎保守型';
  return '均衡实战型';
}

function D3RoomPotHistoryChart({ hands }: { hands: HandReplayRecord[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 340;
  const height = 192;
  const margin = { top: 14, right: 14, bottom: 26, left: 44 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const points = useMemo(() => {
    return hands.map((h, i) => ({
      index: i,
      handNumber: h.handNumber,
      pot: h.pot,
      timeLabel: formatShortTime(h.timestamp),
      winnerLabel:
        h.winners.length > 0
          ? h.winners.map((w) => w.playerName).join('、')
          : '结算完成',
    }));
  }, [hands]);

  const { areaPath, linePath, xScale, yScale, yTicks } = useMemo(() => {
    if (points.length === 0) {
      return {
        areaPath: '',
        linePath: '',
        xScale: d3.scaleLinear().domain([0, 1]).range([0, innerW]),
        yScale: d3.scaleLinear().domain([0, 100]).range([innerH, 0]),
        yTicks: [0, 50, 100],
      };
    }

    const maxPot = Math.max(100, d3.max(points, (d) => d.pot) ?? 100);
    const x = d3
      .scaleLinear()
      .domain([0, Math.max(1, points.length - 1)])
      .range([0, innerW]);
    const y = d3
      .scaleLinear()
      .domain([0, Math.ceil(maxPot * 1.15)])
      .nice()
      .range([innerH, 0]);

    const areaGen = d3
      .area<(typeof points)[number]>()
      .x((d) => (points.length === 1 ? innerW / 2 : x(d.index)))
      .y0(innerH)
      .y1((d) => y(d.pot))
      .curve(d3.curveMonotoneX);

    const lineGen = d3
      .line<(typeof points)[number]>()
      .x((d) => (points.length === 1 ? innerW / 2 : x(d.index)))
      .y((d) => y(d.pot))
      .curve(d3.curveMonotoneX);

    return {
      areaPath: areaGen(points) ?? '',
      linePath: lineGen(points) ?? '',
      xScale: x,
      yScale: y,
      yTicks: y.ticks(4),
    };
  }, [points, innerW, innerH]);

  if (points.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center border-y border-white/[0.08] text-xs text-[#7E8984]">
        完成第 1 局后将绘制房间底池规模走势
      </div>
    );
  }

  const activePoint = hoverIdx !== null ? points[hoverIdx] : points[points.length - 1];
  const avgPot = Math.round(points.reduce((s, p) => s + p.pot, 0) / points.length);
  const maxPotVal = Math.max(...points.map((p) => p.pot));

  return (
    <div className="space-y-4" data-testid="d3-pot-history-chart">
      {/* Unboxed Ledger Metrics Strip */}
      <div className="grid grid-cols-3 divide-x divide-white/[0.08] border-y border-white/[0.08] py-2.5">
        <div className="px-2">
          <div className="text-[11px] text-[#7E8883]">统计局数</div>
          <div className="font-mono-num mt-0.5 text-sm font-semibold text-[#F3F1EC]">
            {points.length} 局
          </div>
        </div>
        <div className="px-3">
          <div className="text-[11px] text-[#7E8883]">平均底池</div>
          <div className="font-mono-num mt-0.5 text-sm font-semibold text-[#E8CF96]">
            {avgPot.toLocaleString()}
          </div>
        </div>
        <div className="px-3">
          <div className="text-[11px] text-[#7E8883]">最大底池</div>
          <div className="font-mono-num mt-0.5 text-sm font-semibold text-[#8CC9AA]">
            {maxPotVal.toLocaleString()}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-[11px]">
          <span className="text-[#9AA5A0] truncate pr-2">
            第 {activePoint.handNumber} 局 · {activePoint.timeLabel} · {activePoint.winnerLabel}
          </span>
          <span className="font-mono-num font-semibold text-[#D4A853] shrink-0">
            底池 {activePoint.pot.toLocaleString()}
          </span>
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          role="img"
          aria-label="房间历史底池规模趋势图"
        >
          <defs>
            <linearGradient id="d3PotFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4A853" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#D4A853" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          <g transform={`translate(${margin.left}, ${margin.top})`}>
            {yTicks.map((tick) => {
              const py = yScale(tick);
              return (
                <g key={tick}>
                  <line
                    x1={0}
                    x2={innerW}
                    y1={py}
                    y2={py}
                    stroke="rgba(255,255,255,0.06)"
                    strokeDasharray="2 3"
                  />
                  <text
                    x={-6}
                    y={py + 3}
                    textAnchor="end"
                    fill="#7D8782"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {points.length > 1 && (
              <>
                <path d={areaPath} fill="url(#d3PotFill)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="#D4A853"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                />
              </>
            )}

            {points.map((pt, idx) => {
              const cx = points.length === 1 ? innerW / 2 : xScale(pt.index);
              const cy = yScale(pt.pot);
              const isSelected = activePoint.index === idx;
              return (
                <g key={pt.handNumber}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 4 : 2.5}
                    fill={isSelected ? '#F5E4B8' : '#D4A853'}
                    stroke="#0B0D0F"
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={12}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverIdx(idx)}
                    onClick={() => setHoverIdx(idx)}
                  />
                  {(idx === 0 || idx === points.length - 1 || isSelected) && (
                    <text
                      x={cx}
                      y={innerH + 16}
                      textAnchor="middle"
                      fill={isSelected ? '#E8CF96' : '#7D8782'}
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      #{pt.handNumber}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

interface StreetPotTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: StreetPotTrendPoint }>;
}

function StreetPotTooltip({ active, payload }: StreetPotTooltipProps) {
  const pt = payload?.[0]?.payload;
  if (!active || !pt) return null;

  return (
    <div className="rounded-md border border-[#D4A853]/35 bg-[#0D1012]/96 px-3 py-2 text-[11px] text-[#F3F1EC] shadow-xl">
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-1 mb-1.5">
        <span className="font-semibold text-[#F5E4B8]">{pt.label}阶段</span>
        <span className="font-mono-num text-[10px] text-[#8A948F]">
          {pt.reached ? `${pt.actionCount} 次注额变动` : '尚未到达'}
        </span>
      </div>
      {pt.reached && pt.pot !== null ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#9AA5A0]">累计底池</span>
            <span className="font-mono-num font-bold text-[#E8CF96]">
              {pt.pot.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#9AA5A0]">本街新增</span>
            <span className="font-mono-num font-semibold text-[#8CC9AA]">
              +{pt.streetAdded.toLocaleString()}
            </span>
          </div>
          <div className="pt-1 text-[10px] text-[#A8B2AD] truncate max-w-[196px]">
            关键动作：{pt.highlightAction}
          </div>
        </div>
      ) : (
        <div className="text-[#7E8984]">本局尚未发至该阶段</div>
      )}
    </div>
  );
}

function StreetPotLineChart({ table }: { table: ClientTableView }) {
  const summary = useMemo(
    () =>
      buildStreetPotTrend({
        currentHandNumber: table.handNumber,
        currentPhase: table.phase,
        currentPot: table.pot,
        currentCommunityCardCount: table.communityCards.length,
        currentPotTimeline: table.analytics?.currentPotTimeline ?? [],
        handHistory: table.analytics?.handHistory ?? [],
      }),
    [
      table.handNumber,
      table.phase,
      table.pot,
      table.communityCards.length,
      table.analytics?.currentPotTimeline,
      table.analytics?.handHistory,
    ]
  );

  const hasData = summary.points.some((p) => p.reached && p.pot !== null);

  return (
    <section className="space-y-3" data-testid="street-pot-line-chart">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-[#EAE6DC]">
          各阶段底池积累趋势
        </h3>
        <span className="font-mono-num text-[11px] text-[#7E8984]">
          {summary.handNumber > 0
            ? `第 ${summary.handNumber} 局 · ${summary.isLiveHand ? '进行中' : '最近一手'}`
            : '翻牌前 / 翻牌 / 转牌 / 河牌'}
        </span>
      </div>

      {/* 4-Street Ledger Summary Strip */}
      <div className="grid grid-cols-4 divide-x divide-white/[0.08] border-y border-white/[0.08] py-2">
        {summary.points.map((pt) => (
          <div key={pt.street} className="px-2 first:pl-1 last:pr-1">
            <div
              className={`text-[10px] whitespace-nowrap ${
                pt.isCurrent
                  ? 'font-semibold text-[#E8CF96]'
                  : pt.reached
                    ? 'text-[#9AA5A0]'
                    : 'text-[#5E6763]'
              }`}
            >
              {pt.label}
            </div>
            <div
              className={`font-mono-num mt-0.5 text-xs font-bold ${
                pt.reached && pt.pot !== null
                  ? pt.isCurrent
                    ? 'text-[#F5E4B8]'
                    : 'text-[#F3F1EC]'
                  : 'text-[#4F5854]'
              }`}
            >
              {pt.reached && pt.pot !== null ? pt.pot.toLocaleString() : '—'}
            </div>
            <div className="font-mono-num text-[10px] text-[#8CC9AA]/90">
              {pt.reached ? (pt.streetAdded > 0 ? `+${pt.streetAdded}` : '+0') : ''}
            </div>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className="flex h-40 items-center justify-center border-b border-white/[0.08] text-xs text-[#7E8984]">
          开局发牌后，将实时绘制翻牌前、翻牌、转牌、河牌底池折线
        </div>
      ) : (
        <div className="h-48 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={summary.points}
              margin={{ top: 10, right: 14, left: -10, bottom: 2 }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="2 3" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#9AA5A0', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#7D8782', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<StreetPotTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }}
                iconType="plainline"
              />
              <Line
                type="monotone"
                dataKey="pot"
                name="累计底池"
                stroke="#D4A853"
                strokeWidth={2.25}
                dot={{ r: 3.5, fill: '#F5E4B8', stroke: '#0B0D0F', strokeWidth: 1.5 }}
                activeDot={{ r: 5.5, fill: '#D4A853', stroke: '#F5F2EB', strokeWidth: 1.5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="streetAddedPlot"
                name="本街新增"
                stroke="#8CC9AA"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={{ r: 2.5, fill: '#8CC9AA', stroke: '#0B0D0F', strokeWidth: 1 }}
                activeDot={{ r: 4.5, fill: '#8CC9AA', stroke: '#F5F2EB', strokeWidth: 1.5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function TableAnalyticsDrawer({
  open,
  table,
  myPlayerId,
  requestedTab = null,
  onClose,
}: TableAnalyticsDrawerProps) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('standings');
  const [selectedStatPlayerId, setSelectedStatPlayerId] = useState<string>(myPlayerId);
  const [expandedHandNumber, setExpandedHandNumber] = useState<number | null>(null);

  useEffect(() => {
    if (requestedTab?.tab) {
      setActiveTab(requestedTab.tab);
    }
  }, [requestedTab]);

  const handHistory = table.analytics?.handHistory ?? [];
  const playerStatsMap = table.analytics?.playerStats ?? {};

  const { chipTrendData, trackedPlayers } = useMemo(() => {
    const playerNames = new Map<string, string>();
    for (const p of table.players) {
      playerNames.set(p.id, p.name);
    }
    for (const h of handHistory) {
      for (const sp of h.players) {
        if (!playerNames.has(sp.id)) playerNames.set(sp.id, sp.name);
      }
    }
    const ids = Array.from(playerNames.keys()).slice(0, 8);
    const rows: Record<string, string | number>[] = [];

    if (handHistory.length === 0) {
      const initRow: Record<string, string | number> = { label: '开局' };
      for (const p of table.players) {
        initRow[p.id] = p.chips;
      }
      rows.push(initRow);
    } else {
      const baseline: Record<string, string | number> = { label: '初始' };
      ids.forEach((id) => {
        baseline[id] = table.startingChips;
      });
      rows.push(baseline);

      handHistory.forEach((h) => {
        const row: Record<string, string | number> = { label: `#${h.handNumber}` };
        h.players.forEach((sp) => {
          row[sp.id] = sp.chipsAfter;
        });
        rows.push(row);
      });
    }

    return {
      chipTrendData: rows,
      trackedPlayers: ids.map((id, idx) => ({
        id,
        name: playerNames.get(id) ?? id,
        color: LINE_PALETTE[idx % LINE_PALETTE.length],
      })),
    };
  }, [handHistory, table.players, table.startingChips]);

  const effectiveStatId = playerStatsMap[selectedStatPlayerId]
    ? selectedStatPlayerId
    : playerStatsMap[myPlayerId]
    ? myPlayerId
    : Object.keys(playerStatsMap)[0] ?? myPlayerId;
  const selectedStat = playerStatsMap[effectiveStatId] ?? {
    playerId: myPlayerId,
    playerName: table.players.find((p) => p.id === myPlayerId)?.name ?? '当前玩家',
    handsPlayed: 0,
    vpipHands: 0,
    handsWon: 0,
    showdownReached: 0,
    showdownWon: 0,
  };

  const winRatePct =
    selectedStat.handsPlayed > 0
      ? Math.round((selectedStat.handsWon / selectedStat.handsPlayed) * 100)
      : 0;
  const vpipPct =
    selectedStat.handsPlayed > 0
      ? Math.round((selectedStat.vpipHands / selectedStat.handsPlayed) * 100)
      : 0;
  const wtsdWinPct =
    selectedStat.showdownReached > 0
      ? Math.round((selectedStat.showdownWon / selectedStat.showdownReached) * 100)
      : 0;

  const donutMetrics = [
    {
      label: '胜率',
      sub: `${selectedStat.handsWon}/${selectedStat.handsPlayed}`,
      pct: winRatePct,
      color: '#D4A853',
    },
    {
      label: '入局率 VPIP',
      sub: `${selectedStat.vpipHands}/${selectedStat.handsPlayed}`,
      pct: vpipPct,
      color: '#7B93A8',
    },
    {
      label: '摊牌胜率',
      sub: `${selectedStat.showdownWon}/${selectedStat.showdownReached}`,
      pct: wtsdWinPct,
      color: '#8CC9AA',
    },
  ];

  const replayHandsDesc = useMemo(() => [...handHistory].reverse(), [handHistory]);

  const inTableStandings = useMemo(() => {
    const rows = table.players.map((p) => {
      const st = playerStatsMap[p.id];
      const handsPlayed = st?.handsPlayed ?? 0;
      const handsWon = st?.handsWon ?? 0;
      const winRate = handsPlayed > 0 ? Math.round((handsWon / handsPlayed) * 100) : 0;
      const netChips =
        st && typeof st.sessionNetChips === 'number'
          ? st.sessionNetChips
          : p.chips - table.startingChips;
      return {
        player: p,
        handsPlayed,
        handsWon,
        winRate,
        netChips,
      };
    });
    rows.sort(
      (a, b) =>
        b.player.chips - a.player.chips ||
        b.netChips - a.netChips ||
        b.handsWon - a.handsWon ||
        a.player.seatIndex - b.player.seatIndex
    );
    return rows;
  }, [table.players, table.startingChips, playerStatsMap]);

  const totalTableChips = useMemo(
    () => table.players.reduce((sum, p) => sum + p.chips, 0) + table.pot,
    [table.players, table.pot]
  );
  const myStandingRank = useMemo(() => {
    const idx = inTableStandings.findIndex((r) => r.player.id === myPlayerId);
    return idx >= 0 ? idx + 1 : null;
  }, [inTableStandings, myPlayerId]);

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label="牌局数据与回放"
      data-testid="analytics-drawer"
      className="pointer-events-auto fixed inset-y-0 right-0 z-40 flex w-full sm:w-[410px] flex-col border-l border-white/[0.1] bg-[#0B0D0F] text-[#F3F1EC] shadow-2xl"
    >
      {/* Editorial Drawer Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5">
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-display text-lg font-bold tracking-tight text-[#F5F2EB]">
            牌局账簿与复盘
          </h2>
          <span className="font-mono-num text-[11px] text-[#7E8883]">
            第 {table.handNumber} 局
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="收起牌局数据"
          className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.08] text-[#9AA5A0] hover:bg-white/[0.05] hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Restraint Tab Bar */}
      <div
        role="tablist"
        aria-label="牌局数据分页"
        className="grid grid-cols-5 border-b border-white/[0.08] bg-[#090B0C] text-[11px] sm:text-xs"
      >
        {[
          { id: 'standings' as const, label: '局内排行', icon: Trophy },
          { id: 'trends' as const, label: '筹码趋势', icon: TrendingUp },
          { id: 'pot_d3' as const, label: '底池统计', icon: Activity },
          { id: 'insights' as const, label: '风格洞察', icon: PieChartIcon },
          { id: 'replay' as const, label: '手牌回放', icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`analytics-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-1 py-2.5 px-1 border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? 'border-[#D4A853] font-semibold text-[#E8CF96]'
                  : 'border-transparent text-[#8B9590] hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {activeTab === 'standings' && (
          <div className="space-y-4" data-testid="in-table-standings-panel">
            <div className="grid grid-cols-3 divide-x divide-white/[0.08] border-y border-white/[0.08] py-2.5">
              <div className="px-2">
                <div className="text-[11px] text-[#7E8883]">在座人数</div>
                <div className="font-mono-num mt-0.5 text-sm font-semibold text-[#F3F1EC]">
                  {table.players.length} 人
                </div>
              </div>
              <div className="px-3">
                <div className="text-[11px] text-[#7E8883]">桌内总筹码</div>
                <div className="font-mono-num mt-0.5 text-sm font-semibold text-[#E8CF96]">
                  {totalTableChips.toLocaleString()}
                </div>
              </div>
              <div className="px-3">
                <div className="text-[11px] text-[#7E8883]">我的顺位</div>
                <div className="font-mono-num mt-0.5 text-sm font-semibold text-[#8CC9AA]">
                  {myStandingRank ? `#${myStandingRank}` : '—'}
                </div>
              </div>
            </div>

            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold text-[#EAE6DC]">本桌实时筹码排行</h3>
              <span className="text-[11px] text-[#7E8984]">按当前筹码与局内盈亏</span>
            </div>

            {inTableStandings.length === 0 ? (
              <div className="flex h-40 items-center justify-center border-y border-white/[0.08] text-xs text-[#7E8984]">
                当前牌桌暂无在座玩家
              </div>
            ) : (
              <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
                {inTableStandings.map((row, idx) => {
                  const rank = idx + 1;
                  const isSelf = row.player.id === myPlayerId;
                  const isFirst = rank === 1;
                  return (
                    <div
                      key={row.player.id}
                      data-testid={`in-table-rank-${row.player.id}`}
                      className={`flex items-center justify-between gap-3 py-3 px-1.5 ${
                        isSelf ? 'bg-[#D4A853]/[0.06]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`font-mono-num w-6 text-center text-xs font-bold shrink-0 ${
                            isFirst
                              ? 'text-[#D4A853]'
                              : rank <= 3
                              ? 'text-[#E5DFD3]'
                              : 'text-[#6F7873]'
                          }`}
                        >
                          #{rank}
                        </span>

                        <PlayerAvatar
                          avatar={row.player.avatar}
                          name={row.player.name}
                          size="sm"
                        />

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-[#F3F1EC] max-w-[110px]">
                              {row.player.name}
                            </span>
                            {isSelf && (
                              <span className="text-[10px] font-semibold text-[#D4A853] shrink-0">
                                你
                              </span>
                            )}
                            {row.player.isBot && (
                              <Bot
                                className="h-3 w-3 text-[#8E9893] shrink-0"
                                aria-label="陪练"
                              />
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 font-mono-num text-[10px] text-[#838D88]">
                            <span>
                              胜 {row.handsWon}/{row.handsPlayed} ({row.winRate}%)
                            </span>
                            {(row.player.winStreak ?? 0) >= 2 && (
                              <span className="text-[#E8CF96]">
                                {row.player.winStreak}连胜
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono-num text-sm font-bold text-[#E8CF96]">
                          {row.player.chips.toLocaleString()}
                        </div>
                        <div
                          className={`font-mono-num text-[11px] font-semibold ${
                            row.netChips > 0
                              ? 'text-[#8CC9AA]'
                              : row.netChips < 0
                              ? 'text-[#E07A7A]'
                              : 'text-[#7D8782]'
                          }`}
                        >
                          {row.netChips > 0
                            ? `+${row.netChips.toLocaleString()}`
                            : row.netChips.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="space-y-6" data-testid="recharts-trends-panel">
            {/* Multi-Player Chip Trend */}
            <section className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-semibold text-[#EAE6DC]">玩家筹码走势</h3>
                <span className="text-[11px] text-[#7E8984]">按手数记录</span>
              </div>
              <div className="h-48 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chipTrendData}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#7D8782', fontSize: 10 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    />
                    <YAxis
                      tick={{ fill: '#7D8782', fontSize: 10 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0E1113',
                        border: '1px solid rgba(212,168,83,0.35)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#F3F1EC',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    {trackedPlayers.map((tp) => (
                      <Line
                        key={tp.id}
                        type="monotone"
                        dataKey={tp.id}
                        name={tp.name}
                        stroke={tp.color}
                        strokeWidth={1.75}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Street-by-Street Pot Accumulation Recharts Line Chart */}
            <div className="border-t border-white/[0.08] pt-5">
              <StreetPotLineChart table={table} />
            </div>
          </div>
        )}

        {activeTab === 'pot_d3' && (
          <div className="space-y-6">
            <StreetPotLineChart table={table} />

            <div className="space-y-3 border-t border-white/[0.08] pt-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-semibold text-[#EAE6DC]">房间历史底池规模</h3>
                <span className="text-[11px] text-[#7E8984]">点击节点查看明细</span>
              </div>
              <D3RoomPotHistoryChart hands={handHistory} />
            </div>
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="space-y-5" data-testid="recharts-insights-panel">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-[#EAE6DC]">牌手风格与胜率分析</h3>
              {Object.keys(playerStatsMap).length > 1 && (
                <select
                  aria-label="选择洞察玩家"
                  value={effectiveStatId}
                  onChange={(e) => setSelectedStatPlayerId(e.target.value)}
                  className="rounded border border-white/[0.12] bg-[#121619] px-2 py-1 text-[11px] text-[#F3F1EC] focus:border-[#D4A853] focus:outline-none"
                >
                  {Object.values(playerStatsMap).map((st) => (
                    <option key={st.playerId} value={st.playerId}>
                      {st.playerName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Unboxed Header Strip */}
            <div className="flex items-center justify-between border-y border-white/[0.08] py-2.5 text-xs">
              <div>
                <div className="text-[11px] text-[#7E8883]">分析对象</div>
                <div className="mt-0.5 font-semibold text-[#F3F1EC]">
                  {selectedStat.playerName}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-[#7E8883]">牌风画像</div>
                <div className="mt-0.5 font-semibold text-[#E8CF96]">
                  {getPlayStyleLabel(vpipPct, winRatePct, selectedStat.handsPlayed)}
                </div>
              </div>
            </div>

            {/* Three Clean Donut Rings */}
            <div className="grid grid-cols-3 divide-x divide-white/[0.08] py-1">
              {donutMetrics.map((m) => {
                const pieData = [
                  { name: m.label, value: Math.max(0.01, m.pct) },
                  { name: '其余', value: Math.max(0.01, 100 - m.pct) },
                ];
                return (
                  <div key={m.label} className="flex flex-col items-center px-1.5">
                    <div className="relative h-20 w-20">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            innerRadius={25}
                            outerRadius={34}
                            startAngle={90}
                            endAngle={-270}
                            stroke="none"
                            isAnimationActive={false}
                          >
                            <Cell fill={m.color} />
                            <Cell fill="rgba(255,255,255,0.07)" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono-num text-xs font-bold text-[#F3F1EC]">
                        {m.pct}%
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-[#E5DFD3] text-center">
                      {m.label}
                    </div>
                    <div className="font-mono-num text-[10px] text-[#7D8782]">{m.sub} 局</div>
                  </div>
                );
              })}
            </div>

            {/* Hairline Summary Ledger */}
            <div className="border-t border-white/[0.08] pt-3 text-xs space-y-2 text-[#9DA7A2]">
              <div className="flex justify-between">
                <span>累计参与手数</span>
                <span className="font-mono-num font-semibold text-[#F3F1EC]">
                  {selectedStat.handsPlayed} 局
                </span>
              </div>
              <div className="flex justify-between">
                <span>主动入局 (VPIP)</span>
                <span className="font-mono-num font-semibold text-[#B4C4D2]">
                  {selectedStat.vpipHands} 局 ({vpipPct}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span>进入摊牌 / 摊牌夺冠</span>
                <span className="font-mono-num font-semibold text-[#8CC9AA]">
                  {selectedStat.showdownReached} / {selectedStat.showdownWon}
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'replay' && (
          <div className="space-y-3" data-testid="hand-replay-panel">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold text-[#EAE6DC]">
                最近手牌回放 ({replayHandsDesc.length} 手)
              </h3>
              <span className="text-[11px] text-[#7E8984]">点击展开逐街动作</span>
            </div>

            {replayHandsDesc.length === 0 ? (
              <div className="flex h-44 items-center justify-center border-y border-white/[0.08] text-xs text-[#7E8984]">
                当前尚无已结束手牌，完成 1 局后即可回放复盘
              </div>
            ) : (
              <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
                {replayHandsDesc.map((h) => {
                  const isExpanded =
                    expandedHandNumber === h.handNumber ||
                    (expandedHandNumber === null &&
                      h.handNumber === replayHandsDesc[0].handNumber);
                  return (
                    <div key={h.handNumber} className="py-1">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedHandNumber(isExpanded ? -1 : h.handNumber)
                        }
                        className="flex w-full items-center justify-between gap-2 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold text-[#F3F1EC]">
                            <span className="font-mono-num text-[#D4A853]">
                              第 {h.handNumber} 局
                            </span>
                            <span className="text-[#7E8883] font-normal">
                              {formatShortTime(h.timestamp)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#9AA5A0]">
                            {h.winners
                              .map((w) => `${w.playerName} (${w.handName})`)
                              .join('、') || '结算完成'}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono-num text-xs font-semibold text-[#E8CF96]">
                            底池 {h.pot.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-[#7D8782]">
                            {isExpanded ? '收起' : '展开'}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-white/[0.06] py-3 space-y-3.5 text-xs">
                          {h.communityCards.length > 0 && (
                            <div>
                              <div className="mb-1.5 text-[10px] text-[#7E8883]">公共牌</div>
                              <div className="flex items-center gap-1.5">
                                {h.communityCards.map((c, idx) => (
                                  <PlayingCard
                                    key={`${h.handNumber}-comm-${idx}`}
                                    card={c}
                                    size="sm"
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <div className="text-[10px] text-[#7E8883]">参与者与手牌</div>
                            <div className="divide-y divide-white/[0.05]">
                              {h.players.map((sp) => (
                                <div
                                  key={sp.id}
                                  className="flex items-center justify-between gap-2 py-1.5"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate font-medium text-[#F3F1EC]">
                                        {sp.name}
                                      </span>
                                      {sp.folded && (
                                        <span className="text-[10px] text-[#8A948F]">弃牌</span>
                                      )}
                                      {sp.revealed && (
                                        <span className="text-[10px] text-[#D4A853]">亮牌</span>
                                      )}
                                    </div>
                                    <span
                                      className={`font-mono-num text-[11px] font-semibold ${
                                        sp.netChange > 0
                                          ? 'text-[#8CC9AA]'
                                          : sp.netChange < 0
                                          ? 'text-[#E07A7A]'
                                          : 'text-[#8E9893]'
                                      }`}
                                    >
                                      {sp.netChange > 0 ? `+${sp.netChange}` : sp.netChange}
                                    </span>
                                  </div>

                                  {sp.holeCards && sp.holeCards.length === 2 ? (
                                    <div className="flex items-center gap-1 shrink-0">
                                      {sp.holeCards.map((hc, idx) => (
                                        <PlayingCard
                                          key={`${sp.id}-hc-${idx}`}
                                          card={hc}
                                          size="sm"
                                        />
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-[#6E7873]">未亮牌</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-[10px] text-[#7E8883]">动作时间线</div>
                            <div className="max-h-40 overflow-y-auto divide-y divide-white/[0.04] pr-1">
                              {h.actions.map((act, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between gap-2 py-1 text-[11px]"
                                >
                                  <div className="min-w-0 truncate">
                                    <span className="text-[#D4A853] mr-1.5">
                                      {PHASE_STAGE_LABELS[act.street] ?? act.street}
                                    </span>
                                    <span className="font-medium text-[#E5E2D9] mr-1">
                                      {act.playerName}
                                    </span>
                                    <span className="text-[#9AA5A0]">{act.actionLabel}</span>
                                  </div>
                                  <span className="font-mono-num text-[10px] text-[#7D8782] shrink-0">
                                    池 {act.potAfter}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
