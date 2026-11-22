import { getBotPersonality, type BotPersonality } from './botAi';
import { sanitizeChatText } from '../src/shared/chatUtils';
import type { ChatMessage, TablePlayer, TableState } from '../src/shared/types';

export const DEEPSEEK_CHAT_ENDPOINT = 'https://api.deepseek.com/chat/completions';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

export type BotChatTrigger =
  | { kind: 'player_chat'; senderName: string; text: string }
  | { kind: 'nudge'; fromName: string; targetBotId: string }
  | { kind: 'showdown'; winnerNames: string[]; pot: number };

export interface DeepSeekChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const PERSONALITY_TONES: Record<BotPersonality['name'], string> = {
  gto_pro: '精准理性、深谙博弈平衡，说话简短冷静带点大局观',
  tag: '冷静克制、言简意赅，偶尔带一点礼貌的冷幽默',
  lag: '自信爱挑衅、机灵风趣，喜欢给牌桌添点气势',
  balanced: '随和健谈、牌风稳重，懂得捧场和打趣',
  calling_station: '乐观佛系、爱看翻牌，心态极好爱发表情',
};

const PHASE_CN: Record<TableState['phase'], string> = {
  waiting: '等待开局',
  preflop: '翻前',
  flop: '翻牌圈',
  turn: '转牌圈',
  river: '河牌圈',
  showdown: '摊牌结算',
};

/**
 * Selects which seated AI bot should reply to a table event.
 * Prioritizes nudged or explicitly mentioned bots, and avoids repeating the same speaker back-to-back.
 */
export function selectRespondingBot(
  players: TablePlayer[],
  trigger: BotChatTrigger,
  lastSpeakerId: string | null,
  rng: () => number = Math.random
): TablePlayer | null {
  const bots = players.filter((p) => p.isBot);
  if (bots.length === 0) return null;

  if (trigger.kind === 'nudge') {
    const exact = bots.find((b) => b.id === trigger.targetBotId);
    if (exact) return exact;
  }

  if (trigger.kind === 'player_chat') {
    const mentioned = bots.find((b) => trigger.text.includes(b.name));
    if (mentioned) return mentioned;
  }

  // Prefer bots still active in the hand (or any bot during waiting/showdown)
  const activeBots = bots.filter((b) => b.inHand && !b.folded);
  const pool = activeBots.length > 0 ? activeBots : bots;
  const varied =
    pool.length > 1 && lastSpeakerId ? pool.filter((b) => b.id !== lastSpeakerId) : pool;
  const finalPool = varied.length > 0 ? varied : pool;
  const idx = Math.floor(Math.max(0, Math.min(0.999999, rng())) * finalPool.length);
  return finalPool[idx] ?? finalPool[0] ?? null;
}

/**
 * Builds concise, character-authentic Chinese table chat messages for DeepSeek.
 * Strictly excludes hidden hole cards so bots never leak secret state.
 */
export function buildBotChatMessages(params: {
  bot: TablePlayer;
  table: Pick<TableState, 'phase' | 'pot' | 'bigBlind' | 'handNumber' | 'winners'>;
  recentChat: ChatMessage[];
  trigger: BotChatTrigger;
}): DeepSeekChatMessage[] {
  const { bot, table, recentChat, trigger } = params;
  const personality = getBotPersonality(bot.id);
  const tone = PERSONALITY_TONES[personality.name];
  const phaseLabel = PHASE_CN[table.phase] ?? '牌局中';

  const systemPrompt = [
    `你是德州扑克俱乐部牌桌上的牌友「${bot.name}」，性格：${tone}。`,
    '任务：在牌桌聊天里自然搭一句短话，或者只回 1~2 个贴合气氛的 emoji 表情（如 😎 🔥 🤔 😏 👏 😂 🃏 🫡 💸 😮‍💨）。',
    '硬性要求：',
    '1. 只输出回复内容本身，不要加引号、名字前缀、括号旁白或任何解释；',
    '2. 字数控制在 1~18 个字以内，口语自然像真人牌友，绝不自称AI或助手；',
    '3. 绝对不要透露或编造任何未公开的底牌点数。',
  ].join('\n');

  const recentLines = recentChat
    .slice(-4)
    .map((m) => `${m.playerName}: ${m.text}`)
    .join('\n');

  let eventLine = '';
  if (trigger.kind === 'player_chat') {
    eventLine = `玩家「${trigger.senderName}」刚在牌桌说：「${trigger.text}」。请自然回应（可以简短接梗、聊牌局氛围，或直接回 1~2 个贴切表情）。`;
  } else if (trigger.kind === 'nudge') {
    eventLine = `玩家「${trigger.fromName}」刚双击头像轻敲桌面提醒了你。请幽默或从容地回应一句短话或表情。`;
  } else {
    const botWon = table.winners.some((w) => w.playerId === bot.id);
    const winnersText = trigger.winnerNames.join('、') || '赢家';
    eventLine = botWon
      ? `第 ${table.handNumber} 局刚摊牌结束，你赢下了 ${trigger.pot} 底池！请克制又带点牌桌味道地发一句短感言或 1~2 个表情。`
      : `第 ${table.handNumber} 局刚摊牌结束，${winnersText} 收下了 ${trigger.pot} 底池。请顺手捧个场、调侃一句或发个表情。`;
  }

  const userPrompt = [
    `当前牌桌：第 ${table.handNumber} 局 · ${phaseLabel} · 底池 ${table.pot}（大盲 ${table.bigBlind}）· 你的筹码 ${bot.chips}。`,
    recentLines ? `最近聊天：\n${recentLines}` : '',
    eventLine,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * Cleans model output into a single crisp table-chat line or emoji burst.
 */
export function sanitizeBotReply(raw: string, botName?: string): string | null {
  if (typeof raw !== 'string') return null;
  let text = raw
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\r?\n+/g, ' ')
    .trim();

  // Strip surrounding quotation marks / brackets
  text = text.replace(/^[「『"“'‘]+|[」』"”'’]+$/g, '').trim();

  // Strip accidental speaker prefix like "陈默：" or "陈默:"
  if (botName) {
    const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`^${escaped}\\s*[:：]\\s*`), '').trim();
  }

  const cleaned = sanitizeChatText(text);
  if (!cleaned) return null;
  return cleaned;
}

/**
 * Calls DeepSeek's fixed OpenAI-compatible chat completions endpoint with a strict timeout.
 * Never logs or echoes the API key in error messages.
 */
export async function requestDeepSeekReply(params: {
  apiKey: string;
  model?: string;
  messages: DeepSeekChatMessage[];
  timeoutMs?: number;
  botName?: string;
}): Promise<string> {
  const key = params.apiKey.trim();
  if (!key) {
    throw new Error('未配置 DeepSeek API Key');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 9000);

  try {
    const response = await fetch(DEEPSEEK_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: params.model?.trim() || process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL,
        messages: params.messages,
        max_tokens: 48,
        temperature: 0.9,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('DeepSeek API Key 无效或无权限');
      }
      if (response.status === 402) {
        throw new Error('DeepSeek 账户余额不足');
      }
      if (response.status === 429) {
        throw new Error('DeepSeek 请求过于频繁，请稍后再试');
      }
      throw new Error(`DeepSeek 接口暂时不可用 (${response.status})`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = payload.choices?.[0]?.message?.content ?? '';
    const cleaned = sanitizeBotReply(rawContent, params.botName);
    if (!cleaned) {
      throw new Error('DeepSeek 未返回有效回复');
    }
    return cleaned;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('DeepSeek 响应超时');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
