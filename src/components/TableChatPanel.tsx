import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, SendHorizontal, Smile, X } from 'lucide-react';
import {
  CHAT_WHISPER_TTL_MS,
  CURATED_QUICK_PHRASES,
  CURATED_TABLE_EMOJIS,
  isEmojiOnlyMessage,
  MAX_CHAT_LENGTH,
  QUICK_BAR_EMOJIS,
} from '../shared/chatUtils';
import type { ChatMessage } from '../shared/types';

export type { BotChatConfigRequest } from './BlindSettingsModal';

interface TableChatPanelProps {
  open: boolean;
  messages: ChatMessage[];
  myPlayerId: string;
  unreadCount: number;
  nowMs: number;
  onOpenChange: (open: boolean) => void;
  onSendChat: (text: string) => void;
}

function formatMessageTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function TableChatPanel({
  open,
  messages,
  myPlayerId,
  unreadCount,
  nowMs,
  onOpenChange,
  onSendChat,
}: TableChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [trayOpen, setTrayOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    listEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) {
      setTrayOpen(false);
      return;
    }
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (trayOpen) {
          setTrayOpen(false);
        } else {
          onOpenChange(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, trayOpen, onOpenChange]);

  const whisperMessages = useMemo(() => {
    if (open) return [];
    return messages
      .filter((m) => {
        const age = nowMs - m.createdAt;
        return age >= -5000 && age < CHAT_WHISPER_TTL_MS;
      })
      .slice(-2);
  }, [messages, nowMs, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setDraft('');
    setTrayOpen(false);
  };

  // Natural emoji interaction: empty draft sends immediately; composing text appends inline.
  const handleEmojiClick = (emoji: string) => {
    if (draft.trim().length === 0) {
      onSendChat(emoji);
      setTrayOpen(false);
      return;
    }
    setDraft((prev) => Array.from(prev + emoji).slice(0, MAX_CHAT_LENGTH).join(''));
    inputRef.current?.focus();
  };

  const handlePhraseClick = (phrase: string) => {
    onSendChat(phrase);
    setTrayOpen(false);
  };

  return (
    <div
      className={`pointer-events-none fixed inset-x-2.5 bottom-3 z-30 flex flex-col items-start sm:inset-x-auto sm:left-4 ${
        open ? 'sm:bottom-[120px] 2xl:bottom-4' : 'sm:bottom-4'
      }`}
    >
      {/* Whisper feed while collapsed */}
      {!open && whisperMessages.length > 0 && (
        <div
          aria-live="polite"
          data-testid="chat-whisper-feed"
          className="pointer-events-none mb-2 hidden lg:flex max-w-[248px] flex-col gap-1"
        >
          {whisperMessages.map((msg) => {
            const isMine = msg.playerId === myPlayerId;
            const emojiOnly = isEmojiOnlyMessage(msg.text);
            return (
              <div
                key={msg.id}
                className="animate-whisper-in inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-[#090C0D]/76 px-2.5 py-1 text-xs backdrop-blur-md shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
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

      {/* Single unified bottom-left dock (no duplicate header chat buttons) */}
      {!open && (
        <div
          data-testid="chat-compact-dock"
          aria-label="牌桌闲聊与快捷表情"
          className="pointer-events-auto inline-flex h-9 items-center gap-0.5 rounded-full border border-white/[0.09] bg-[#0B0E10]/82 px-1.5 backdrop-blur-xl shadow-[0_10px_28px_rgba(0,0,0,0.48)]"
        >
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            data-testid="dock-open-chat-btn"
            aria-label="打开牌桌闲聊 (快捷键 T)"
            title="牌桌闲聊 (T)"
            className="touch-manipulation flex h-7 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-[#DCE2DF] hover:bg-white/[0.07] hover:text-white transition-colors whitespace-nowrap"
          >
            <MessageCircle className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
            <span>闲聊</span>
            {unreadCount > 0 && (
              <span className="font-mono-num flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D4A853] px-1 text-[10px] font-bold text-[#0F1210]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <span
            aria-hidden="true"
            className="mx-0.5 hidden h-3 w-px bg-white/[0.1] sm:inline-block"
          />

          <div className="hidden items-center sm:flex">
            {QUICK_BAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSendChat(emoji)}
                aria-label={`发送表情 ${emoji}`}
                title={`发送 ${emoji}`}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] leading-none hover:scale-115 hover:bg-white/[0.07] active:scale-90 transition-transform duration-150"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Streamlined Salon Chat Drawer */}
      {open && (
        <aside
          role="dialog"
          aria-label="牌桌闲聊"
          data-testid="table-chat-panel"
          className="pointer-events-auto animate-chat-drawer flex w-full sm:w-[316px] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0B0E10]/92 text-[#F3F1EC] backdrop-blur-2xl shadow-[0_22px_54px_rgba(0,0,0,0.74)]"
        >
          {/* Minimal Editorial Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
            <h2 className="text-[13px] font-medium tracking-wide text-[#EFECE5]">
              牌桌闲聊
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="收起牌桌闲聊"
              title="收起 (Esc)"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#8B9691] hover:bg-white/[0.07] hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Airy Message Stream */}
          <div
            data-testid="chat-history-list"
            className="chat-scroll h-48 md:h-52 overflow-y-auto px-3.5 py-3 space-y-2 text-xs"
          >
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-xs text-[#6F7B75]">
                发个表情或短语，和牌友聊聊这手牌
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
                        className={`mb-1 flex items-center gap-1.5 px-0.5 text-[10.5px] ${
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
                        <span className="font-mono-num text-[10px] text-[#5D6762]">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                      </div>
                    )}

                    {emojiOnly ? (
                      <div className="px-1 py-0.5 text-[25px] leading-none select-text">
                        {msg.text}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[85%] break-words px-3 py-1.5 text-[12.5px] leading-relaxed ${
                          isMine
                            ? 'rounded-2xl rounded-br-sm bg-[#D4A853]/16 text-[#F8F2E4]'
                            : 'rounded-2xl rounded-bl-sm bg-white/[0.06] text-[#F1EFE9]'
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

          {/* Single Unified Reaction Tray (16 curated emojis + 6 quick phrases, zero tabs/modes) */}
          {trayOpen && (
            <div
              data-testid="chat-reaction-tray"
              className="border-t border-white/[0.07] bg-[#080A0B]/92 px-3 py-2.5 space-y-2.5"
            >
              <div className="grid grid-cols-8 gap-0.5" aria-label="快捷表情">
                {CURATED_TABLE_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleEmojiClick(emoji)}
                    aria-label={`表情 ${emoji}`}
                    className="touch-manipulation flex h-8 w-full items-center justify-center rounded-lg text-[18px] leading-none hover:scale-115 hover:bg-white/[0.08] active:scale-90 transition-transform duration-150"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1.5 border-t border-white/[0.06] pt-2.5" aria-label="快捷短语">
                {CURATED_QUICK_PHRASES.map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => handlePhraseClick(phrase)}
                    className="touch-manipulation flex h-7 items-center justify-center rounded-md bg-white/[0.04] px-2 text-[11px] text-[#DEDAD0] hover:bg-[#D4A853]/16 hover:text-[#FAF2DC] active:scale-[0.98] transition-colors whitespace-nowrap truncate"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clean Single-Row Composer */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-white/[0.06] bg-[#090B0D]/75 p-2"
          >
            <div className="flex items-center gap-1 rounded-full border border-white/[0.09] bg-[#060809]/92 px-1.5 py-1 focus-within:border-[#D4A853]/50 transition-colors">
              <button
                type="button"
                data-testid="chat-tray-toggle-btn"
                onClick={() => setTrayOpen((prev) => !prev)}
                aria-label={trayOpen ? '收起表情与短语' : '打开表情与短语'}
                aria-expanded={trayOpen}
                title="表情与快捷短语"
                className={`touch-manipulation flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                  trayOpen
                    ? 'bg-[#D4A853]/20 text-[#F3DFAC]'
                    : 'text-[#8F9A95] hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <Smile className="h-4 w-4" aria-hidden="true" />
              </button>

              <input
                ref={inputRef}
                data-testid="chat-input"
                type="text"
                maxLength={MAX_CHAT_LENGTH}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="说点什么…"
                aria-label="输入牌桌聊天内容"
                className="h-7 min-w-0 flex-1 bg-transparent px-1.5 text-xs text-[#F3F1EC] placeholder:text-[#5F6964] focus:outline-none"
              />

              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="发送聊天"
                className="touch-manipulation flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4A853] text-[#0F1210] hover:bg-[#E3BB6C] disabled:bg-white/[0.07] disabled:text-[#5D6762] transition-colors"
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
