import type { ClientTableView, StreetPhase } from './types';

export const PHASE_STAGE_LABELS: Record<StreetPhase, string> = {
  waiting: '等待开局',
  preflop: '翻牌前',
  flop: '翻牌后',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌结算',
};

export interface HandOverviewStats {
  pot: number;
  remainingPlayers: number;
  totalPlayers: number;
  phaseLabel: string;
  isActiveHand: boolean;
}

/**
 * Computes pure overview telemetry for the top translucent "本局概览" panel.
 */
export function getHandOverviewStats(
  table: Pick<ClientTableView, 'phase' | 'pot' | 'players'>
): HandOverviewStats {
  const totalPlayers = table.players.length;
  const isActiveHand =
    table.phase === 'preflop' ||
    table.phase === 'flop' ||
    table.phase === 'turn' ||
    table.phase === 'river';

  const remainingPlayers =
    table.phase === 'waiting'
      ? totalPlayers
      : table.players.filter((p) => p.inHand && !p.folded).length;

  return {
    pot: Math.max(0, table.pot),
    remainingPlayers,
    totalPlayers,
    phaseLabel: PHASE_STAGE_LABELS[table.phase],
    isActiveHand,
  };
}
