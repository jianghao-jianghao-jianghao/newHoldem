import type { ChatMessage } from './types';

export const MAX_CHAT_LENGTH = 60;
export const MAX_CHAT_HISTORY = 80;
export const CHAT_BUBBLE_TTL_MS = 4500;
export const CHAT_WHISPER_TTL_MS = 10000;

export const QUICK_CHAT_ITEMS = [
  '好牌 👏',
  '承让了',
  '容我想想 🤔',
  '这手稳了 😎',
  '有意思',
  '干杯 🥂',
] as const;

export interface QuickInteractionItem {
  id: string;
  emoji: string;
  label: string;
  text: string;
}

export const QUICK_INTERACTION_ITEMS: QuickInteractionItem[] = [
  { id: 'nice', emoji: '👏', label: '好牌', text: '好牌 👏' },
  { id: 'salute', emoji: '🫡', label: '承让', text: '承让了' },
  { id: 'think', emoji: '🤔', label: '容我想想', text: '容我想想 🤔' },
  { id: 'steady', emoji: '😎', label: '这手稳了', text: '这手稳了 😎' },
  { id: 'interesting', emoji: '🤨', label: '有意思', text: '这手有意思' },
  { id: 'river', emoji: '🃏', label: '河牌见', text: '河牌见分晓' },
  { id: 'cheers', emoji: '🥂', label: '干杯', text: '干杯 🥂' },
];

export interface QuickPhraseGroup {
  id: string;
  label: string;
  phrases: string[];
}

export const QUICK_PHRASE_GROUPS: QuickPhraseGroup[] = [
  {
    id: 'courtesy',
    label: '牌桌礼仪',
    phrases: ['好牌 👏', '承让了', '干杯 🥂', '手气不错 🍀'],
  },
  {
    id: 'mindgame',
    label: '心理博弈',
    phrases: ['容我想想 🤔', '这手有意思', '河牌见分晓', '你在演我 🤨'],
  },
  {
    id: 'highlight',
    label: '高光时刻',
    phrases: ['这手稳了 😎', '全下看牌 🔥', '漂亮偷鸡 🦈', '差点意思 😅'],
  },
];

export const NUDGE_PHRASES = [
  '轻敲桌面提醒了一下',
  '轮到你行动了',
  '牌桌在等你决策',
  '请看牌行动',
] as const;

export interface EmojiCategory {
  id: 'table' | 'mood' | 'gesture' | 'club';
  label: string;
  icon: string;
  emojis: readonly string[];
}

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: 'table',
    label: '牌桌',
    icon: '🃏',
    emojis: [
      '👏', '🔥', '😎', '🤣', '🤯', '🫡', '🍀', '💎',
      '👑', '🃏', '♠️', '♥️', '♦️', '♣️', '💰', '🥂',
    ],
  },
  {
    id: 'mood',
    label: '情绪',
    icon: '😏',
    emojis: [
      '😏', '😈', '🥶', '🥵', '😱', '🤔', '🤨', '🫣',
      '😮‍💨', '😭', '😤', '🥳', '🤩', '😇', '🫠', '🤡',
      '💀', '🤫', '😬', '🧐', '😅', '😂', '😍', '🥺',
    ],
  },
  {
    id: 'gesture',
    label: '手势',
    icon: '🙌',
    emojis: [
      '👍', '👎', '🙌', '🙏', '🤝', '👌', '✌️', '🤞',
      '🤙', '💪', '🫶', '🫰', '👋', '👀', '🧠', '⚡',
    ],
  },
  {
    id: 'club',
    label: '氛围',
    icon: '🥃',
    emojis: [
      '🏆', '🥇', '🎯', '🎲', '🎰', '💵', '🪙', '🍾',
      '🥃', '☕', '🦈', '🐟', '🐋', '💣', '🚀', '🎉',
    ],
  },
] as const;

export const QUICK_BAR_EMOJIS = ['👏', '🔥', '😎', '😂', '🤔'] as const;

export const CURATED_TABLE_EMOJIS = [
  '👏', '🔥', '😎', '😂', '🤔', '😱', '😅', '🫡',
  '♠️', '👑', '💰', '💎', '🙏', '💀', '👀', '🥂',
] as const;

export const CURATED_QUICK_PHRASES = [
  '好牌',
  '承让了',
  '容我想想',
  '这手有意思',
  '河牌见',
  '干杯 🥂',
] as const;

export const CHAT_EMOJIS: readonly string[] = EMOJI_CATEGORIES.flatMap(
  (category) => [...category.emojis]
);

const EMOJI_CHAR_RE = /\p{Extended_Pictographic}/u;
const NON_EMOJI_STRIP_RE = /[\s\u200D\uFE0E\uFE0F]/g;

/**
 * Splits text into visual grapheme clusters when Intl.Segmenter is available,
 * falling back cleanly to Array.from.
 */
function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/**
 * Returns true if the message contains ONLY 1–3 emojis (with optional spaces),
 * allowing seat bubbles and chat logs to render pure reactions cleanly without text boxes.
 */
export function isEmojiOnlyMessage(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const graphemes = splitGraphemes(trimmed).filter(
    (g) => g.replace(NON_EMOJI_STRIP_RE, '').length > 0
  );
  if (graphemes.length === 0 || graphemes.length > 3) return false;
  return graphemes.every((g) => EMOJI_CHAR_RE.test(g));
}

/**
 * Sanitizes and truncates raw chat text to a single-line bounded message.
 * Returns null if empty after trimming.
 */
export function sanitizeChatText(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const collapsed = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!collapsed) return null;
  // Slice by Unicode code points so multi-byte emojis are never split in half
  const chars = Array.from(collapsed);
  return chars.slice(0, MAX_CHAT_LENGTH).join('');
}

/**
 * Idempotently appends a ChatMessage to a bounded ring-buffer history list.
 */
export function appendChatHistory(
  history: ChatMessage[],
  msg: ChatMessage,
  maxItems: number = MAX_CHAT_HISTORY
): ChatMessage[] {
  if (history.some((m) => m.id === msg.id)) {
    return history;
  }
  const next = [...history, msg];
  if (next.length > maxItems) {
    return next.slice(next.length - maxItems);
  }
  return next;
}

/**
 * Returns the latest active (non-expired) chat message per playerId for floating bubbles.
 */
export function getActiveBubbleMap(
  messages: ChatMessage[],
  nowMs: number,
  ttlMs: number = CHAT_BUBBLE_TTL_MS
): Map<string, ChatMessage> {
  const map = new Map<string, ChatMessage>();
  for (const msg of messages) {
    const age = nowMs - msg.createdAt;
    if (age >= -5000 && age < ttlMs) {
      const prev = map.get(msg.playerId);
      if (!prev || msg.createdAt >= prev.createdAt) {
        map.set(msg.playerId, msg);
      }
    }
  }
  return map;
}
