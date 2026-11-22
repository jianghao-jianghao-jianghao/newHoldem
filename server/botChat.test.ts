import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBotChatMessages,
  DEEPSEEK_CHAT_ENDPOINT,
  sanitizeBotReply,
  selectRespondingBot,
} from './botChat';
import { addPlayerToTable, createTableState, startNewHand } from '../src/shared/pokerEngine';

test('selectRespondingBot targets nudged or mentioned bot and rotates speakers', () => {
  const table = createTableState('CHAT01', 10, 20, 2000);
  addPlayerToTable(table, { id: 'human', name: 'Hero', chips: 2000 });
  addPlayerToTable(table, { id: 'bot_a', name: '陈默', chips: 2000, isBot: true });
  addPlayerToTable(table, { id: 'bot_b', name: '林澈', chips: 2000, isBot: true });
  startNewHand(table, () => 0.4, 1000);

  const nudged = selectRespondingBot(
    table.players,
    { kind: 'nudge', fromName: 'Hero', targetBotId: 'bot_b' },
    'bot_b'
  );
  assert.equal(nudged?.id, 'bot_b');

  const mentioned = selectRespondingBot(
    table.players,
    { kind: 'player_chat', senderName: 'Hero', text: '陈默这手牌稳啊' },
    'bot_a'
  );
  assert.equal(mentioned?.id, 'bot_a');

  const rotated = selectRespondingBot(
    table.players,
    { kind: 'player_chat', senderName: 'Hero', text: '大家晚上好' },
    'bot_a',
    () => 0.1
  );
  assert.equal(rotated?.id, 'bot_b');
});

test('buildBotChatMessages excludes secret hole cards and formats table context cleanly', () => {
  const table = createTableState('CHAT02', 10, 20, 2000);
  addPlayerToTable(table, { id: 'human', name: 'Hero', chips: 2000 });
  addPlayerToTable(table, { id: 'bot_a', name: '陈默', chips: 2000, isBot: true });
  startNewHand(table, () => 0.5, 1000);

  const bot = table.players.find((p) => p.id === 'bot_a')!;
  bot.holeCards = [
    { suit: 'spades', rank: 14 },
    { suit: 'hearts', rank: 13 },
  ];

  const messages = buildBotChatMessages({
    bot,
    table,
    recentChat: [
      {
        id: 'c1',
        roomId: 'CHAT02',
        playerId: 'human',
        playerName: 'Hero',
        text: '敢不敢跟？',
        createdAt: 1000,
      },
    ],
    trigger: { kind: 'player_chat', senderName: 'Hero', text: '敢不敢跟？' },
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  const combined = messages.map((m) => m.content).join('\n');
  assert.ok(combined.includes('陈默'));
  assert.ok(combined.includes('敢不敢跟'));
  assert.ok(!combined.includes('spades'), 'Prompt must never include raw hidden hole card suits');
  assert.equal(DEEPSEEK_CHAT_ENDPOINT, 'https://api.deepseek.com/chat/completions');
});

test('sanitizeBotReply strips quotes, speaker prefixes, code fences, and preserves emoji replies', () => {
  assert.equal(sanitizeBotReply('「这波不慌 😎」', '陈默'), '这波不慌 😎');
  assert.equal(sanitizeBotReply('陈默：稳住，看转牌', '陈默'), '稳住，看转牌');
  assert.equal(sanitizeBotReply('🔥👏', '林澈'), '🔥👏');
  assert.equal(sanitizeBotReply('```txt\n忽略\n```  ', '林澈'), null);
});
