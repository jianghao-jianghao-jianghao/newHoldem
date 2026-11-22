import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  KeyRound,
  MessageCircle,
  SendHorizontal,
  Smile,
  SmilePlus,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  CHAT_WHISPER_TTL_MS,
  EMOJI_CATEGORIES,
  isEmojiOnlyMessage,
  MAX_CHAT_LENGTH,
  QUICK_BAR_EMOJIS,
  QUICK_PHRASE_GROUPS,
  type EmojiCategory,
} from '../shared/chatUtils';
import type { BotChatStatus, ChatMessage } from '../shared/types';

export type ChatPickerTab = 'emoji' | 'phrases' | null;

export interface BotChatConfigRequest {
  enabled: boolean;
  apiKey?: string;
  clearKey?: boolean;
  testConnection?: boolean;
}

interface TableChatPanelProps {
  open: boolean;
  quickPickerOpen: boolean;
  messages: ChatMessage[];
  myPlayerId: string;
  unreadCount: number;
  nowMs: number;
  botChatStatus?: BotChatStatus;
  onOpenChange: (open: boolean) => void;
  onQuickPickerChange: (open: boolean) => void;
  onSendChat: (text: string) => void;
  onConfigureBotChat?: (
    params: BotChatConfigRequest
  ) => Promise<{ ok: boolean; error?: string; status?: BotChatStatus }>;
}

const RECENT_EMOJIS_KEY = 'velvet_recent_chat_emojis_v1';
const MAX_RECENT_EMOJIS = 8;

function loadRecentEmojis(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_EMOJIS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT_EMOJIS);
  } catch {
    return [];
  }
}

function saveRecentEmojis(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(list.slice(0, MAX_RECENT_EMOJIS)));
  } catch {
    // Ignore storage quota errors
  }
}

function formatMessageTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function TableChatPanel({
  open,
  quickPickerOpen,
  messages,
  myPlayerId,
  unreadCount,
  nowMs,
  botChatStatus = { enabled: false, configured: false, source: 'none' },
  onOpenChange,
  onQuickPickerChange,
  onSendChat,
  onConfigureBotChat,
}: TableChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [drawerPickerTab, setDrawerPickerTab] = useState<ChatPickerTab>(null);
  const [quickTrayTab, setQuickTrayTab] = useState<'emoji' | 'phrases'>('emoji');
  const [activeCategory, setActiveCategory] = useState<EmojiCategory['id']>('table');
  const [emojiMode, setEmojiMode] = useState<'instant' | 'insert'>('instant');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => loadRecentEmojis());
  const [botSettingsOpen, setBotSettingsOpen] = useState(false);
  const [botEnabledDraft, setBotEnabledDraft] = useState(botChatStatus.enabled);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [botSaving, setBotSaving] = useState(false);
  const [botFeedback, setBotFeedback] = useState<{
    tone: 'ok' | 'err';
    text: string;
  } | null>(null);

  useEffect(() => {
    setBotEnabledDraft(botChatStatus.enabled);
  }, [botChatStatus.enabled]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const recordRecentEmoji = (emoji: string) => {
    setRecentEmojis((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, MAX_RECENT_EMOJIS);
      saveRecentEmojis(next);
      return next;
    });
  };

  // Auto-scroll to bottom and focus input when drawer opens
  useEffect(() => {
    if (!open) return;
    listEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // Escape closes picker or drawer
  useEffect(() => {
    if (!open && !quickPickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawerPickerTab) {
          setDrawerPickerTab(null);
        } else if (quickPickerOpen) {
          onQuickPickerChange(false);
        } else if (open) {
          onOpenChange(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, quickPickerOpen, drawerPickerTab, onOpenChange, onQuickPickerChange]);

  // Click outside closes the standalone quick reaction popover
  useEffect(() => {
    if (!quickPickerOpen || open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      // Ignore clicks on the top-bar quick emote toggle button
      if (
        target instanceof Element &&
        target.closest('[data-testid="toggle-quick-emoji-btn"]')
      ) {
        return;
      }
      onQuickPickerChange(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [quickPickerOpen, open, onQuickPickerChange]);

  // Ephemeral whisper feed when chat drawer is closed (max 2 recent lines within 10s)
  const whisperMessages = useMemo(() => {
    if (open) return [];
    return messages
      .filter((m) => {
        const age = nowMs - m.createdAt;
        return age >= -5000 && age < CHAT_WHISPER_TTL_MS;
      })
      .slice(-2);
  }, [messages, nowMs, open]);

  const activeEmojiCategory = useMemo(
    () => EMOJI_CATEGORIES.find((c) => c.id === activeCategory) ?? EMOJI_CATEGORIES[0],
    [activeCategory]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setDraft('');
    setDrawerPickerTab(null);
  };

  const handleInstantSendEmoji = (emoji: string, closePopover = false) => {
    recordRecentEmoji(emoji);
    onSendChat(emoji);
    if (closePopover) {
      onQuickPickerChange(false);
    }
  };

  const handleDrawerEmojiClick = (emoji: string) => {
    recordRecentEmoji(emoji);
    if (emojiMode === 'instant') {
      onSendChat(emoji);
      return;
    }
    setDraft((prev) => {
      const combined = Array.from(prev + emoji);
      return combined.slice(0, MAX_CHAT_LENGTH).join('');
    });
    inputRef.current?.focus();
  };

  const handleQuickPhraseClick = (phrase: string, fromStandalone: boolean) => {
    onSendChat(phrase);
    if (fromStandalone) {
      onQuickPickerChange(false);
    } else {
      setDrawerPickerTab(null);
    }
  };

  const toggleDrawerPicker = (tab: 'emoji' | 'phrases') => {
    setDrawerPickerTab((prev) => {
      if (prev === tab) return null;
      if (tab === 'emoji') {
        setEmojiMode(draft.trim().length > 0 ? 'insert' : 'instant');
      }
      return tab;
    });
  };

  const handleSaveBotChat = async (testConnection: boolean) => {
    if (!onConfigureBotChat || botSaving) return;
    setBotSaving(true);
    setBotFeedback(null);
    const trimmedKey = apiKeyDraft.trim();
    const res = await onConfigureBotChat({
      enabled: botEnabledDraft,
      apiKey: trimmedKey || undefined,
      testConnection,
    });
    setBotSaving(false);
    if (!res.ok) {
      setBotFeedback({ tone: 'err', text: res.error ?? '保存失败，请检查配置' });
      return;
    }
    if (trimmedKey) setApiKeyDraft('');
    setBotFeedback({
      tone: 'ok',
      text: res.status?.enabled
        ? testConnection
          ? '连通成功，陪练已加入牌桌对话'
          : '已启用，陪练将在牌桌中搭话与发表情'
        : '已关闭陪练对话',
    });
  };

  const handleClearBotKey = async () => {
    if (!onConfigureBotChat || botSaving) return;
    setBotSaving(true);
    setBotFeedback(null);
    const res = await onConfigureBotChat({
      enabled: false,
      clearKey: true,
    });
    setBotSaving(false);
    if (!res.ok) {
      setBotFeedback({ tone: 'err', text: res.error ?? '清除失败' });
      return;
    }
    setApiKeyDraft('');
    setBotEnabledDraft(false);
    setBotFeedback({ tone: 'ok', text: '已清除本桌密钥并关闭陪练对话' });
  };

  const renderEmojiAndPhraseBody = (
    tab: 'emoji' | 'phrases',
    standalone: boolean
  ) => {
    if (tab === 'phrases') {
      return (
        <div
          aria-label="快捷牌桌短语"
          className="chat-scroll max-h-[212px] overflow-y-auto px-3 py-2.5 space-y-2.5"
        >
          {QUICK_PHRASE_GROUPS.map((group) => (
            <div key={group.id}>
              <div className="mb-1.5 text-[10px] font-medium tracking-wide text-[#7E8983]">
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {group.phrases.map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => handleQuickPhraseClick(phrase, standalone)}
                    className="touch-manipulation flex h-8 items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 text-left text-xs text-[#E8E4DA] hover:border-[#D4A853]/40 hover:bg-[#D4A853]/10 hover:text-[#FAF3E1] active:scale-[0.98] transition-all whitespace-nowrap truncate"
                  >
                    <span className="truncate">{phrase}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div aria-label="表情选择器" className="flex flex-col">
        {/* Category Switcher + Instant/Insert Mode */}
        <div className="flex items-center justify-between gap-1 border-b border-white/[0.07] px-2.5 py-1.5">
          <div className="flex items-center gap-0.5">
            {EMOJI_CATEGORIES.map((cat) => {
              const active = cat.id === activeCategory;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`touch-manipulation flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white/[0.11] text-[#F5E7C4]'
                      : 'text-[#8C9791] hover:bg-white/[0.05] hover:text-[#E5E2D9]'
                  }`}
                >
                  <span className="text-xs leading-none" aria-hidden="true">
                    {cat.icon}
                  </span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {!standalone && (
            <div className="flex items-center rounded-md bg-white/[0.05] p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setEmojiMode('instant')}
                className={`rounded px-1.5 py-0.5 font-medium transition-colors whitespace-nowrap ${
                  emojiMode === 'instant'
                    ? 'bg-[#D4A853]/25 text-[#F3DFAC]'
                    : 'text-[#848F89] hover:text-[#D9D6CE]'
                }`}
              >
                直发
              </button>
              <button
                type="button"
                onClick={() => setEmojiMode('insert')}
                className={`rounded px-1.5 py-0.5 font-medium transition-colors whitespace-nowrap ${
                  emojiMode === 'insert'
                    ? 'bg-[#D4A853]/25 text-[#F3DFAC]'
                    : 'text-[#848F89] hover:text-[#D9D6CE]'
                }`}
              >
                插入
              </button>
            </div>
          )}
        </div>

        {/* Emoji Grid */}
        <div className="chat-scroll max-h-[176px] overflow-y-auto px-2.5 py-2 space-y-2">
          {recentEmojis.length > 0 && (
            <div>
              <div className="mb-1 px-1 text-[10px] text-[#7A8580]">最近常用</div>
              <div className="grid grid-cols-8 gap-0.5">
                {recentEmojis.map((emoji) => (
                  <button
                    key={`recent-${emoji}`}
                    type="button"
                    onClick={() =>
                      standalone
                        ? handleInstantSendEmoji(emoji, false)
                        : handleDrawerEmojiClick(emoji)
                    }
                    aria-label={`发送表情 ${emoji}`}
                    className="touch-manipulation flex h-8 w-full items-center justify-center rounded-lg text-[19px] leading-none hover:scale-115 hover:bg-white/[0.09] active:scale-90 transition-transform duration-150"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            {recentEmojis.length > 0 && (
              <div className="mb-1 px-1 text-[10px] text-[#7A8580]">
                {activeEmojiCategory.label}
              </div>
            )}
            <div className="grid grid-cols-8 gap-0.5">
              {activeEmojiCategory.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() =>
                    standalone
                      ? handleInstantSendEmoji(emoji, false)
                      : handleDrawerEmojiClick(emoji)
                  }
                  aria-label={`表情 ${emoji}`}
                  className="touch-manipulation flex h-8 w-full items-center justify-center rounded-lg text-[19px] leading-none hover:scale-115 hover:bg-white/[0.09] active:scale-90 transition-transform duration-150"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none fixed inset-x-2.5 bottom-3 z-30 flex flex-col items-start sm:inset-x-auto sm:left-3 xl:left-4 ${
        open ? 'sm:bottom-[122px] 2xl:bottom-4' : 'sm:bottom-4'
      }`}
    >
      {/* Ephemeral Whisper Feed when drawer is closed */}
      {!open && whisperMessages.length > 0 && (
        <div
          aria-live="polite"
          data-testid="chat-whisper-feed"
          className="pointer-events-none mb-2 hidden xl:flex max-w-[244px] flex-col gap-1"
        >
          {whisperMessages.map((msg) => {
            const isMine = msg.playerId === myPlayerId;
            const emojiOnly = isEmojiOnlyMessage(msg.text);
            return (
              <div
                key={msg.id}
                className="animate-whisper-in inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-[#090C0D]/72 px-2.5 py-1 text-xs backdrop-blur-md shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
              >
                <span
                  className={`shrink-0 font-medium ${
                    isMine ? 'text-[#E5C989]' : 'text-[#9BA8A2]'
                  }`}
                >
                  {msg.playerName}
                </span>
                <span
                  className={
                    emojiOnly
                      ? 'text-base leading-none'
                      : 'truncate text-[#F2EFE8]'
                  }
                >
                  {msg.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Standalone Quick Emoji & Phrase Popover (works without opening full chat drawer!) */}
      {!open && quickPickerOpen && (
        <div
          role="dialog"
          aria-label="快捷表情与短语"
          data-testid="quick-emoji-popover"
          className="pointer-events-auto animate-chat-drawer mb-2 w-full sm:w-[324px] overflow-hidden rounded-2xl border border-white/[0.11] bg-[#0B0E10]/92 backdrop-blur-2xl shadow-[0_18px_46px_rgba(0,0,0,0.68)]"
        >
          <div className="flex items-center justify-between border-b border-white/[0.07] px-2.5 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setQuickTrayTab('emoji')}
                className={`touch-manipulation flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                  quickTrayTab === 'emoji'
                    ? 'bg-[#D4A853]/18 text-[#F4E1B2]'
                    : 'text-[#8E9993] hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Smile className="h-3.5 w-3.5" aria-hidden="true" />
                <span>表情</span>
              </button>
              <button
                type="button"
                onClick={() => setQuickTrayTab('phrases')}
                className={`touch-manipulation flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                  quickTrayTab === 'phrases'
                    ? 'bg-[#D4A853]/18 text-[#F4E1B2]'
                    : 'text-[#8E9993] hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                <span>短语</span>
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onQuickPickerChange(false);
                  onOpenChange(true);
                }}
                className="rounded-md px-2 py-1 text-[11px] text-[#9AA5A0] hover:bg-white/[0.06] hover:text-[#F3F1EC] transition-colors whitespace-nowrap"
              >
                完整聊天
              </button>
              <button
                type="button"
                onClick={() => onQuickPickerChange(false)}
                aria-label="收起快捷表情"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#8E9993] hover:bg-white/[0.07] hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {renderEmojiAndPhraseBody(quickTrayTab, true)}
        </div>
      )}

      {/* Collapsed Lightweight Floating Capsule Dock (Desktop xl+ with dedicated side space) */}
      {!open && (
        <div
          data-testid="chat-compact-dock"
          aria-label="快捷聊天与表情栏"
          className="pointer-events-auto hidden xl:inline-flex h-10 items-center gap-0.5 rounded-full border border-white/[0.1] bg-[#0B0E10]/82 px-1.5 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.48)]"
        >
          <button
            type="button"
            onClick={() => {
              onQuickPickerChange(false);
              onOpenChange(true);
            }}
            data-testid="dock-open-chat-btn"
            aria-label="展开牌桌闲聊 (快捷键 T)"
            title="展开牌桌闲聊 (T)"
            className="flex h-7.5 items-center gap-1 rounded-full px-2 text-xs font-medium text-[#D2D8D5] hover:bg-white/[0.08] hover:text-white transition-colors whitespace-nowrap"
          >
            <MessageCircle className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
            <span>聊</span>
            {unreadCount > 0 && (
              <span className="font-mono-num flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D4A853] px-1 text-[10px] font-bold text-[#0F1210]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-white/[0.1]" />

          <div className="flex items-center">
            {QUICK_BAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleInstantSendEmoji(emoji, false)}
                aria-label={`一键发送表情 ${emoji}`}
                title={`一键发送 ${emoji}`}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[16px] leading-none hover:scale-120 hover:bg-white/[0.08] active:scale-90 transition-transform duration-150"
              >
                {emoji}
              </button>
            ))}
          </div>

          <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-white/[0.1]" />

          <button
            type="button"
            onClick={() => onQuickPickerChange(!quickPickerOpen)}
            data-testid="dock-more-emojis-btn"
            aria-label={quickPickerOpen ? '收起更多表情与短语' : '更多表情与短语'}
            aria-expanded={quickPickerOpen}
            title="更多表情与短语"
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              quickPickerOpen
                ? 'bg-[#D4A853]/20 text-[#F3DFAC]'
                : 'text-[#A0ABA6] hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <SmilePlus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Expanded Frosted Salon Chat Drawer */}
      {open && (
        <aside
          role="dialog"
          aria-label="牌桌闲聊"
          data-testid="table-chat-panel"
          className="pointer-events-auto animate-chat-drawer flex w-full sm:w-[336px] flex-col overflow-hidden rounded-2xl border border-white/[0.11] bg-[#0B0E10]/90 text-[#F3F1EC] backdrop-blur-2xl shadow-[0_22px_54px_rgba(0,0,0,0.72)]"
        >
          {/* Minimal Salon Header */}
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-xs min-w-0">
              <h2 className="font-semibold tracking-wide text-[#F3F1EC] whitespace-nowrap">
                牌桌闲聊
              </h2>
              <span aria-hidden="true" className="text-white/20">·</span>
              <span className="font-mono-num text-[#87928C]">{messages.length}</span>
              {botChatStatus.enabled && (
                <>
                  <span aria-hidden="true" className="text-white/20">·</span>
                  <span className="text-[11px] text-[#D4A853] whitespace-nowrap">陪练可对话</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onConfigureBotChat && (
                <button
                  type="button"
                  data-testid="toggle-bot-chat-settings-btn"
                  onClick={() => {
                    setBotSettingsOpen((prev) => !prev);
                    setBotFeedback(null);
                  }}
                  aria-label="配置 DeepSeek 陪练对话"
                  aria-expanded={botSettingsOpen}
                  title="陪练对话设置（可选 DeepSeek API）"
                  className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    botSettingsOpen || botChatStatus.enabled
                      ? 'bg-[#D4A853]/16 text-[#F3DFAC]'
                      : 'text-[#8F9A95] hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>陪练对话</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setDrawerPickerTab(null);
                  setBotSettingsOpen(false);
                  onOpenChange(false);
                }}
                aria-label="收起牌桌闲聊"
                title="收起 (Esc)"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#96A19C] hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Optional DeepSeek Bot Chat Settings Sheet (non-mandatory, in-memory only) */}
          {botSettingsOpen && onConfigureBotChat && (
            <div
              data-testid="bot-chat-settings-panel"
              className="border-b border-white/[0.08] bg-[#080A0C]/95 px-3.5 py-3 space-y-2.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-[#F1EFE9]">陪练对话（可选 · DeepSeek）</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-[#7F8B85]">
                    不填不影响正常牌局；开启后陪练会在闲聊、被提醒或摊牌时搭话与发表情。
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={botEnabledDraft}
                data-testid="bot-chat-enable-toggle"
                onClick={() => setBotEnabledDraft((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-2 text-left hover:border-white/[0.14] transition-colors"
              >
                <span className="text-[#DCE2DF]">允许陪练参与对话和发表情</span>
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full border transition-colors ${
                    botEnabledDraft
                      ? 'border-[#D4A853]/70 bg-[#D4A853]/28'
                      : 'border-white/[0.12] bg-[#171C1E]'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 rounded-full transition-transform ${
                      botEnabledDraft
                        ? 'translate-x-[15px] bg-[#F3DFAC]'
                        : 'translate-x-[2px] bg-[#7A8680]'
                    }`}
                  />
                </span>
              </button>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-[#8E9993]">
                  <span className="inline-flex items-center gap-1">
                    <KeyRound className="h-3 w-3 text-[#C8A153]" aria-hidden="true" />
                    <span>DeepSeek API Key（可选）</span>
                  </span>
                  <span className="text-[10px] text-[#78847E]">
                    {botChatStatus.source === 'room'
                      ? '本桌已配置密钥'
                      : botChatStatus.source === 'server'
                        ? '已使用服务端默认密钥'
                        : '仅存于本桌内存'}
                  </span>
                </div>
                <input
                  type="password"
                  autoComplete="off"
                  data-testid="deepseek-apikey-input"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder={
                    botChatStatus.configured
                      ? '留空则沿用当前已配置密钥…'
                      : '输入 sk-... 以开启陪练对话'
                  }
                  className="w-full rounded-md border border-white/[0.1] bg-[#060809] px-2.5 py-1.5 font-mono-num text-xs text-[#F3F1EC] placeholder:text-[#5F6964] focus:border-[#D4A853]/60 focus:outline-none"
                />
              </div>

              {botFeedback && (
                <div
                  role="status"
                  className={`text-[11px] ${
                    botFeedback.tone === 'ok' ? 'text-[#6EE7B7]' : 'text-[#FCA5A5]'
                  }`}
                >
                  {botFeedback.text}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-0.5">
                {botChatStatus.source === 'room' ? (
                  <button
                    type="button"
                    disabled={botSaving}
                    onClick={() => void handleClearBotKey()}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[#B89595] hover:bg-white/[0.06] hover:text-[#FCA5A5] disabled:opacity-45 transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    <span>清除密钥</span>
                  </button>
                ) : (
                  <span className="text-[10.5px] text-[#6B7670]">离桌或删房自动清空</span>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={botSaving || (!apiKeyDraft.trim() && !botChatStatus.configured)}
                    onClick={() => void handleSaveBotChat(true)}
                    className="rounded border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-[#D6DDD9] hover:border-[#D4A853]/45 hover:text-white disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    测试并保存
                  </button>
                  <button
                    type="button"
                    data-testid="save-bot-chat-btn"
                    disabled={botSaving}
                    onClick={() => void handleSaveBotChat(false)}
                    className="rounded bg-[#D4A853] px-2.5 py-1 text-[11px] font-bold text-[#0F1210] hover:bg-[#E1B968] disabled:opacity-45 transition-colors whitespace-nowrap"
                  >
                    {botSaving ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Conversation Stream */}
          <div
            data-testid="chat-history-list"
            className={`chat-scroll overflow-y-auto px-3 py-3 space-y-2 text-xs transition-[height] duration-150 ${
              botSettingsOpen ? 'h-32 md:h-36' : 'h-48 md:h-56'
            }`}
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-[#77827D]">
                <span className="text-xs">牌桌安静，发个表情或短语开个场</span>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isMine = msg.playerId === myPlayerId;
                const emojiOnly = isEmojiOnlyMessage(msg.text);
                const prev = idx > 0 ? messages[idx - 1] : null;
                const sameSenderAsPrev =
                  prev !== null &&
                  prev.playerId === msg.playerId &&
                  msg.createdAt - prev.createdAt < 120_000;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${
                      sameSenderAsPrev ? 'mt-0.5' : 'mt-2 first:mt-0'
                    }`}
                  >
                    {!sameSenderAsPrev && (
                      <div
                        className={`mb-1 flex items-center gap-1.5 px-1 text-[10.5px] ${
                          isMine ? 'flex-row-reverse' : 'flex-row'
                        }`}
                      >
                        <span
                          className={
                            isMine
                              ? 'font-medium text-[#DEC386]'
                              : 'font-medium text-[#95A29C]'
                          }
                        >
                          {isMine ? '我' : msg.playerName}
                        </span>
                        {msg.isBot && !isMine && (
                          <span className="text-[10px] text-[#7A857F]">陪练</span>
                        )}
                        <span className="font-mono-num text-[10px] text-[#616B66]">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                      </div>
                    )}

                    {emojiOnly ? (
                      <div className="px-1 py-0.5 text-[26px] leading-none tracking-tight select-text">
                        {msg.text}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[84%] break-words px-3 py-1.5 text-[12.5px] leading-relaxed ${
                          isMine
                            ? 'rounded-2xl rounded-br-sm border border-[#D4A853]/26 bg-[#D4A853]/14 text-[#F8F2E4]'
                            : 'rounded-2xl rounded-bl-sm border border-white/[0.07] bg-white/[0.06] text-[#F1EFE9]'
                        }`}
                      >
                        {msg.text}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={listEndRef} />
          </div>

          {/* Collapsible Emoji / Quick-Phrase Tray */}
          {drawerPickerTab && (
            <div className="border-t border-white/[0.08] bg-[#080A0B]/92">
              {renderEmojiAndPhraseBody(drawerPickerTab, false)}
            </div>
          )}

          {/* Lightweight Capsule Composer */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-white/[0.07] bg-[#090B0D]/70 p-2"
          >
            <div className="flex items-center gap-1 rounded-full border border-white/[0.1] bg-[#07090A]/90 px-1.5 py-1 focus-within:border-[#D4A853]/55 transition-colors">
              <button
                type="button"
                onClick={() => toggleDrawerPicker('emoji')}
                aria-label={drawerPickerTab === 'emoji' ? '收起表情' : '打开表情'}
                aria-expanded={drawerPickerTab === 'emoji'}
                title="表情"
                className={`touch-manipulation flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                  drawerPickerTab === 'emoji'
                    ? 'bg-[#D4A853]/20 text-[#F3DFAC]'
                    : 'text-[#8F9A95] hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <Smile className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => toggleDrawerPicker('phrases')}
                aria-label={drawerPickerTab === 'phrases' ? '收起快捷短语' : '打开快捷短语'}
                aria-expanded={drawerPickerTab === 'phrases'}
                title="快捷短语"
                className={`touch-manipulation flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                  drawerPickerTab === 'phrases'
                    ? 'bg-[#D4A853]/20 text-[#F3DFAC]'
                    : 'text-[#8F9A95] hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <input
                ref={inputRef}
                type="text"
                maxLength={MAX_CHAT_LENGTH}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="聊聊这手牌…"
                aria-label="输入牌桌聊天内容"
                className="h-7 min-w-0 flex-1 bg-transparent px-1.5 text-xs text-[#F3F1EC] placeholder:text-[#636D68] focus:outline-none"
              />

              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="发送聊天"
                className="touch-manipulation flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4A853] text-[#0F1210] hover:bg-[#E3BB6C] disabled:bg-white/[0.08] disabled:text-[#626C67] transition-colors"
              >
                <SendHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </form>
        </aside>
      )}
    </div>
  );
}
