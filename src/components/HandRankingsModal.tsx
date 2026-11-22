import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Card, Suit } from '../shared/types';
import { PlayingCard } from './PlayingCard';

export type RankingsModalTab = 'rankings' | 'gallery';

interface HandRankingsModalProps {
  open: boolean;
  initialTab?: RankingsModalTab;
  onClose: () => void;
}

const RANKINGS = [
  { rank: '1', name: '皇家同花顺', example: 'A♠ K♠ Q♠ J♠ 10♠', desc: '同花色的 A 到 10' },
  { rank: '2', name: '同花顺', example: '9♥ 8♥ 7♥ 6♥ 5♥', desc: '同花色的五张连续牌' },
  { rank: '3', name: '四条', example: 'K♠ K♥ K♦ K♣ 9♠', desc: '四张相同点数的牌' },
  { rank: '4', name: '葫芦', example: 'Q♠ Q♥ Q♦ 7♣ 7♠', desc: '三张相同点数加一对' },
  { rank: '5', name: '同花', example: 'A♦ J♦ 8♦ 6♦ 2♦', desc: '五张相同花色的牌' },
  { rank: '6', name: '顺子', example: '10♣ 9♠ 8♥ 7♦ 6♠', desc: '五张连续点数的牌' },
  { rank: '7', name: '三条', example: '8♠ 8♥ 8♦ A♣ 4♠', desc: '三张相同点数的牌' },
  { rank: '8', name: '两对', example: 'J♠ J♦ 5♣ 5♥ A♠', desc: '两组不同点数的对子' },
  { rank: '9', name: '一对', example: 'A♠ A♥ Q♦ 9♣ 3♠', desc: '两张相同点数的牌' },
  { rank: '10', name: '高牌', example: 'A♣ J♠ 9♦ 6♥ 2♣', desc: '按单张最大点数比大小' },
];

const SUIT_OPTIONS: Array<{ id: Suit; label: string; symbol: string; isRed: boolean }> = [
  { id: 'spades', label: '黑桃', symbol: '♠', isRed: false },
  { id: 'hearts', label: '红心', symbol: '♥', isRed: true },
  { id: 'diamonds', label: '方块', symbol: '♦', isRed: true },
  { id: 'clubs', label: '梅花', symbol: '♣', isRed: false },
];

export function HandRankingsModal({
  open,
  initialTab = 'rankings',
  onClose,
}: HandRankingsModalProps) {
  const [tab, setTab] = useState<RankingsModalTab>(initialTab);
  const [courtSuit, setCourtSuit] = useState<Suit>('spades');

  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const showcaseCards: Array<{ key: string; title: string; subtitle: string; card: Card }> = [
    {
      key: `J_${courtSuit}`,
      title: 'J · 侍卫骑士',
      subtitle: '羽帽与长戟',
      card: { rank: 11, suit: courtSuit },
    },
    {
      key: `Q_${courtSuit}`,
      title: 'Q · 皇家王后',
      subtitle: '珠冠与玫瑰',
      card: { rank: 12, suit: courtSuit },
    },
    {
      key: `K_${courtSuit}`,
      title: 'K · 尊爵国王',
      subtitle: '五拱冠与宝剑',
      card: { rank: 13, suit: courtSuit },
    },
    {
      key: 'joker_little',
      title: '小鬼 · 素银弄臣',
      subtitle: '黑白版画风三铃帽',
      card: { rank: 14, suit: 'spades', joker: 'little' },
    },
    {
      key: 'joker_big',
      title: '大鬼 · 彩绘皇丑',
      subtitle: '全彩红金五铃华服',
      card: { rank: 14, suit: 'hearts', joker: 'big' },
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rankings-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/[0.11] bg-[#0C0F11] shadow-[0_28px_72px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <h2 id="rankings-title" className="font-display text-lg font-medium tracking-wide text-[#F4EFE4]">
            {tab === 'rankings' ? '德州扑克牌型大小' : '宫廷人像与大小鬼牌面图鉴'}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭牌型说明"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#8B9691] hover:bg-white/[0.07] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-6 border-b border-white/[0.08] px-6 text-xs">
          <button
            type="button"
            data-testid="tab-rankings"
            onClick={() => setTab('rankings')}
            className={`relative pb-2.5 font-medium transition-colors ${
              tab === 'rankings'
                ? 'text-[#F0DFB3]'
                : 'text-[#87928C] hover:text-[#D5DDD8]'
            }`}
          >
            牌型大小
            {tab === 'rankings' && (
              <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#D4A853]" />
            )}
          </button>
          <button
            type="button"
            data-testid="tab-card-gallery"
            onClick={() => setTab('gallery')}
            className={`relative pb-2.5 font-medium transition-colors ${
              tab === 'gallery'
                ? 'text-[#F0DFB3]'
                : 'text-[#87928C] hover:text-[#D5DDD8]'
            }`}
          >
            牌面图鉴
            {tab === 'gallery' && (
              <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#D4A853]" />
            )}
          </button>
        </div>

        {tab === 'rankings' ? (
          <div className="overflow-y-auto px-6 py-4 divide-y divide-white/5">
            {RANKINGS.map((item) => (
              <div key={item.rank} className="flex items-center justify-between gap-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="font-mono-num w-5 text-xs font-semibold text-[#87948F]">
                    {item.rank}.
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-[#F4F3EE]">{item.name}</div>
                    <div className="text-xs text-[#94A39D]">{item.desc}</div>
                  </div>
                </div>
                <div className="font-mono-num text-xs font-medium text-[#E7D3A3] whitespace-nowrap">
                  {item.example}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#9AA6A1]">
                采用对称双头宫廷人像与传统弄臣大小鬼插画。注：标准德州扑克仅使用 52 张常规牌（不含大小鬼）。
              </p>

              <div className="flex items-center gap-1 rounded-md border border-white/10 bg-[#080A0B] p-1">
                {SUIT_OPTIONS.map((opt) => {
                  const active = courtSuit === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCourtSuit(opt.id)}
                      className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-[#D4A853]/20 text-[#F5E4B8] border border-[#D4A853]/50'
                          : 'text-[#8F9A95] hover:text-white border border-transparent'
                      }`}
                    >
                      <span className={opt.isRed ? 'text-[#E34D59]' : ''}>{opt.symbol}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {showcaseCards.map((item) => (
                <div
                  key={item.key}
                  className="flex flex-col items-center rounded-md border border-white/[0.08] bg-[#090B0C] p-3.5 text-center"
                >
                  <PlayingCard card={item.card} size="xl" animate={false} />
                  <div className="mt-3 text-xs font-semibold text-[#F4F3EE]">{item.title}</div>
                  <div className="mt-0.5 text-[11px] text-[#8E9893]">{item.subtitle}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
