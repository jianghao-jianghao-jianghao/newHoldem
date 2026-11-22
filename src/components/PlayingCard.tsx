import type { Card, Suit } from '../shared/types';
import { formatRank } from '../shared/handEvaluator';
import { CourtPortraitSvg } from './CourtPortraitSvg';

interface PlayingCardProps {
  card?: Card | null;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  highlighted?: boolean;
  dimmed?: boolean;
  animate?: boolean;
}

const SUIT_LABELS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'w-9 h-[52px] sm:w-11 sm:h-[62px] rounded-[5px] text-[10px] sm:text-xs',
  md: 'w-12 h-[68px] sm:w-16 sm:h-[90px] rounded-md sm:rounded-[7px] text-xs sm:text-sm',
  lg: 'w-14 h-20 sm:w-[74px] sm:h-[104px] rounded-[7px] sm:rounded-lg text-sm sm:text-base',
  xl: 'w-[104px] h-[148px] sm:w-[128px] sm:h-[182px] rounded-[10px] text-base sm:text-lg',
};

const JOKER_LETTERS = ['J', 'O', 'K', 'E', 'R'] as const;

function SuitSvg({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {suit === 'spades' && (
        <path d="M12 1.8C9.5 6.5 2.2 11 2.8 15.4C3.2 18.8 8.8 19.2 10.6 16.4C10.2 19.2 9.4 20.8 7.8 21.8H16.2C14.6 20.8 13.8 19.2 13.4 16.4C15.2 19.2 20.8 18.8 21.2 15.4C21.8 11 14.5 6.5 12 1.8Z" />
      )}
      {suit === 'hearts' && (
        <path d="M12 21.8C9.2 18.6 1.8 13.6 2.4 8.6C3 3.8 9.4 2.8 12 7.4C14.6 2.8 21 3.8 21.6 8.6C22.2 13.6 14.8 18.6 12 21.8Z" />
      )}
      {suit === 'diamonds' && (
        <path d="M12 1.8Q15.6 8.2 20.6 12Q15.6 15.8 12 22.2Q8.4 15.8 3.4 12Q8.4 8.2 12 1.8Z" />
      )}
      {suit === 'clubs' && (
        <path d="M12 2.4A4.2 4.2 0 1 0 12 10.8A4.2 4.2 0 1 0 12 2.4ZM7.4 9.6A4.2 4.2 0 1 0 7.4 18A4.2 4.2 0 1 0 7.4 9.6ZM16.6 9.6A4.2 4.2 0 1 0 16.6 18A4.2 4.2 0 1 0 16.6 9.6ZM10.6 14.2Q10 19.4 7.8 21.8H16.2Q14 19.4 13.4 14.2Z" />
      )}
    </svg>
  );
}

export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  highlighted = false,
  dimmed = false,
  animate = true,
}: PlayingCardProps) {
  const sizeClass = SIZE_CLASSES[size];

  if (faceDown || !card) {
    return (
      <div
        className={`${sizeClass} relative select-none overflow-hidden bg-[#FAF7EE] p-[2.5px] shadow-[0_2px_0_#C8BEA8,0_6px_14px_rgba(0,0,0,0.52)] border border-black/30 transition-transform duration-150 ${
          dimmed ? 'opacity-40' : ''
        }`}
        aria-label="暗牌"
      >
        <div
          className="relative h-full w-full overflow-hidden rounded-[3px] border border-[#D4A853]/70 bg-[#0D3325]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(212,168,83,0.16) 0px, rgba(212,168,83,0.16) 1.5px, transparent 1.5px, transparent 6px), repeating-linear-gradient(-45deg, rgba(212,168,83,0.12) 0px, rgba(212,168,83,0.12) 1.5px, transparent 1.5px, transparent 6px)',
          }}
        >
          <div className="absolute inset-[2px] rounded-[2px] border border-[#D4A853]/35" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-4 w-4 rotate-45 items-center justify-center rounded-[2px] border border-[#E7C679]/75 bg-[#09241A] shadow-inner">
              <div className="h-1.5 w-1.5 rounded-full bg-[#D4A853]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isJoker = Boolean(card.joker);
  const isBigJoker = card.joker === 'big';
  const isRed = isJoker ? isBigJoker : card.suit === 'hearts' || card.suit === 'diamonds';
  const colorClass = isRed ? 'text-[#C61D28]' : 'text-[#12151B]';
  const rankStr = isJoker ? (isBigJoker ? '大鬼' : '小鬼') : formatRank(card.rank);
  const suitStr = isJoker ? '' : SUIT_LABELS[card.suit];
  const isCourt = !isJoker && card.rank >= 11 && card.rank <= 13;
  const isAceOfSpades = !isJoker && card.rank === 14 && card.suit === 'spades';

  const cornerPipClass =
    size === 'sm'
      ? 'w-2 h-2'
      : size === 'md'
        ? 'w-2.5 h-2.5 sm:w-3 sm:h-3'
        : size === 'lg'
          ? 'w-3 h-3 sm:w-3.5 sm:h-3.5'
          : 'w-4 h-4';

  const centerPipClass =
    size === 'sm'
      ? 'w-4 h-4'
      : size === 'md'
        ? 'w-6 h-6 sm:w-8 sm:h-8'
        : size === 'lg'
          ? 'w-7 h-7 sm:w-9 sm:h-9'
          : 'w-12 h-12';

  const portraitInsetClass =
    size === 'sm'
      ? 'inset-x-[8px] inset-y-[5px]'
      : size === 'md'
        ? 'inset-x-[12px] sm:inset-x-[15px] inset-y-[6px] sm:inset-y-[8px]'
        : size === 'lg'
          ? 'inset-x-[14px] sm:inset-x-[17px] inset-y-[7px] sm:inset-y-[9px]'
          : 'inset-x-[23px] sm:inset-x-[26px] inset-y-[12px] sm:inset-y-[14px]';

  const jokerLetterSize =
    size === 'sm'
      ? 'text-[6px] leading-[6.5px]'
      : size === 'md'
        ? 'text-[7px] sm:text-[8px] leading-[7.5px] sm:leading-[8.5px]'
        : size === 'lg'
          ? 'text-[8px] sm:text-[9px] leading-[8.5px] sm:leading-[9.5px]'
          : 'text-[10px] sm:text-[11px] leading-[11px] sm:leading-[12px]';

  return (
    <div
      className={`${sizeClass} ${animate ? 'animate-deal' : ''} relative flex flex-col justify-between overflow-hidden select-none bg-[#FAF8F3] p-[3px] sm:p-1.5 transition-transform duration-150 ${
        highlighted
          ? 'ring-2 ring-[#D4A853] -translate-y-1.5 shadow-[0_2px_0_#C8A24A,0_10px_22px_rgba(0,0,0,0.62)]'
          : 'border border-[#B7AF9E] shadow-[0_2px_0_#D5CEC0,0_6px_15px_rgba(0,0,0,0.48)]'
      } ${dimmed ? 'opacity-45 grayscale-[35%]' : ''}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(17,20,24,0.016) 0px, rgba(17,20,24,0.016) 1px, transparent 1px, transparent 3px), repeating-linear-gradient(-45deg, rgba(17,20,24,0.016) 0px, rgba(17,20,24,0.016) 1px, transparent 1px, transparent 3px)',
      }}
      aria-label={`${rankStr}${suitStr}`}
    >
      {/* Classic illustrated court / joker portrait panel */}
      {(isCourt || isJoker) && (
        <div
          className={`pointer-events-none absolute z-[1] flex items-center justify-center ${portraitInsetClass}`}
        >
          <CourtPortraitSvg
            rank={card.rank}
            suit={card.suit}
            joker={card.joker}
            className="h-full w-full"
          />
        </div>
      )}

      {/* Subtle Ace of Spades frame */}
      {isAceOfSpades && (
        <div className="pointer-events-none absolute inset-[5px] sm:inset-[7px] rounded-[3px] border border-[#C59B43]/45" />
      )}

      {/* Top-left corner index */}
      {isJoker ? (
        <div
          className={`relative z-10 flex flex-col items-center self-start font-serif font-black ${colorClass} ${jokerLetterSize}`}
        >
          {JOKER_LETTERS.map((ch) => (
            <span key={ch}>{ch}</span>
          ))}
        </div>
      ) : (
        <div
          className={`relative z-10 flex flex-col items-center self-start leading-[0.9] font-extrabold ${colorClass}`}
        >
          <span className="font-mono-num tracking-[-0.04em]">{rankStr}</span>
          <SuitSvg suit={card.suit} className={`${cornerPipClass} mt-[1px]`} />
        </div>
      )}

      {/* Center pip (for non-court, non-joker cards) */}
      <div className={`pointer-events-none relative z-10 flex flex-1 items-center justify-center ${colorClass}`}>
        {isCourt || isJoker ? null : isAceOfSpades ? (
          <div className="relative flex items-center justify-center">
            <div className="absolute -inset-1.5 rounded-full border border-[#C59B43]/45" />
            <SuitSvg suit="spades" className={centerPipClass} />
          </div>
        ) : (
          <SuitSvg suit={card.suit} className={centerPipClass} />
        )}
      </div>

      {/* Bottom-right corner index (mirrored) */}
      {isJoker ? (
        <div
          className={`relative z-10 flex flex-col items-center self-end rotate-180 font-serif font-black ${colorClass} ${jokerLetterSize}`}
        >
          {JOKER_LETTERS.map((ch) => (
            <span key={ch}>{ch}</span>
          ))}
        </div>
      ) : (
        <div
          className={`relative z-10 flex flex-col items-center self-end rotate-180 leading-[0.9] font-extrabold ${colorClass}`}
        >
          <span className="font-mono-num tracking-[-0.04em]">{rankStr}</span>
          <SuitSvg suit={card.suit} className={`${cornerPipClass} mt-[1px]`} />
        </div>
      )}
    </div>
  );
}
