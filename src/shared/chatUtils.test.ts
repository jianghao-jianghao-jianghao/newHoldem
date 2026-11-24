import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendChatHistory,
  CHAT_BUBBLE_TTL_MS,
  CHAT_EMOJIS,
  computeChatBubbleOffset,
  EMOJI_CATEGORIES,
  getActiveBubbleMap,
  isEmojiOnlyMessage,
  MAX_CHAT_LENGTH,
  sanitizeChatText,
} from './chatUtils';
import type { ChatMessage } from './types';

test('sanitizeChatText trims whitespace, collapses newlines, and preserves emojis', () => {
  assert.equal(sanitizeChatText('   '), null);
  assert.equal(sanitizeChatText('\n\t  '), null);
  assert.equal(sanitizeChatText('  好牌！\n👏🔥  '), '好牌！ 👏🔥');
});

test('sanitizeChatText truncates cleanly by Unicode code point without splitting emojis', () => {
  const longEmojiStr = '🔥'.repeat(MAX_CHAT_LENGTH + 10);
  const cleaned = sanitizeChatText(longEmojiStr);
  assert.ok(cleaned);
  assert.equal(Array.from(cleaned).length, MAX_CHAT_LENGTH);
  assert.equal(cleaned, '🔥'.repeat(MAX_CHAT_LENGTH));
});

test('isEmojiOnlyMessage distinguishes 1-3 pure emojis from text or long strings', () => {
  assert.equal(isEmojiOnlyMessage('🔥'), true);
  assert.equal(isEmojiOnlyMessage('👏🔥😎'), true);
  assert.equal(isEmojiOnlyMessage('♠️ 🃏'), true);
  assert.equal(isEmojiOnlyMessage('😮‍💨'), true);
  assert.equal(isEmojiOnlyMessage('🔥🔥🔥🔥'), false);
  assert.equal(isEmojiOnlyMessage('好牌 🔥'), false);
  assert.equal(isEmojiOnlyMessage('hello'), false);
  assert.equal(isEmojiOnlyMessage('   '), false);
});

test('emoji catalog provides rich categorized expressions without duplicates', () => {
  assert.ok(EMOJI_CATEGORIES.length >= 4);
  assert.ok(CHAT_EMOJIS.length >= 60);
  assert.equal(new Set(CHAT_EMOJIS).size, CHAT_EMOJIS.length);
});

test('appendChatHistory is idempotent and caps history at maxItems', () => {
  const base: ChatMessage[] = [];
  const msg1: ChatMessage = {
    id: 'm1',
    roomId: 'CLUB01',
    playerId: 'p1',
    playerName: '林深',
    text: '大家好',
    createdAt: 1000,
  };
  const h1 = appendChatHistory(base, msg1, 3);
  const h1Dup = appendChatHistory(h1, msg1, 3);
  assert.equal(h1Dup.length, 1);

  const h2 = appendChatHistory(h1Dup, { ...msg1, id: 'm2', createdAt: 2000 }, 3);
  const h3 = appendChatHistory(h2, { ...msg1, id: 'm3', createdAt: 3000 }, 3);
  const h4 = appendChatHistory(h3, { ...msg1, id: 'm4', createdAt: 4000 }, 3);

  assert.equal(h4.length, 3);
  assert.deepEqual(
    h4.map((m) => m.id),
    ['m2', 'm3', 'm4']
  );
});

test('getActiveBubbleMap returns only non-expired latest message per player', () => {
  const now = 10_000;
  const messages: ChatMessage[] = [
    {
      id: 'old',
      roomId: 'CLUB01',
      playerId: 'p1',
      playerName: '林深',
      text: '过期消息',
      createdAt: now - CHAT_BUBBLE_TTL_MS - 10,
    },
    {
      id: 'first',
      roomId: 'CLUB01',
      playerId: 'p1',
      playerName: '林深',
      text: '第一条',
      createdAt: now - 2000,
    },
    {
      id: 'latest',
      roomId: 'CLUB01',
      playerId: 'p1',
      playerName: '林深',
      text: '最新一条 😎',
      createdAt: now - 500,
    },
    {
      id: 'p2msg',
      roomId: 'CLUB01',
      playerId: 'p2',
      playerName: '阿杰',
      text: '跟注！',
      createdAt: now - 1200,
    },
  ];

  const active = getActiveBubbleMap(messages, now, CHAT_BUBBLE_TTL_MS);
  assert.equal(active.size, 2);
  assert.equal(active.get('p1')?.id, 'latest');
  assert.equal(active.get('p2')?.text, '跟注！');
});

test('computeChatBubbleOffset produces deterministic, bounded, and varied offsets across messages', () => {
  const first = computeChatBubbleOffset('msg-alpha-1', 0);
  const repeat = computeChatBubbleOffset('msg-alpha-1', 0);
  assert.deepEqual(first, repeat);

  const xs = new Set<number>();
  for (let i = 0; i < 20; i++) {
    const res = computeChatBubbleOffset(`msg-id-${i}`, i % 6);
    assert.ok(res.offsetX >= -22 && res.offsetX <= 22, `offsetX out of bounds: ${res.offsetX}`);
    assert.ok(res.tiltDeg >= -2.4 && res.tiltDeg <= 2.4, `tiltDeg out of bounds: ${res.tiltDeg}`);
    assert.ok(res.liftY >= 0 && res.liftY <= 8, `liftY out of bounds: ${res.liftY}`);
    xs.add(res.offsetX);
  }
  assert.ok(xs.size >= 8, `expected varied horizontal offsets, got only ${xs.size} distinct values`);
});

