import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePlayerPersonaWithGemini,
  buildPersonaPromptPayload,
  PERSONA_GEMINI_MODEL,
  sanitizeAiPersonaAnalysis,
} from './personaAi';
import {
  buildPlayerPersonaReport,
  createEmptyBehaviorStats,
  mergeBehaviorStats,
} from '../src/shared/playerInsights';

const sampleStats = mergeBehaviorStats(createEmptyBehaviorStats(), {
  handsPlayed: 36,
  vpipHands: 10,
  pfrHands: 8,
  limpHands: 1,
  cbetOpps: 8,
  cbetCount: 6,
  postflopBetsRaises: 15,
  postflopCalls: 6,
  sawFlopHands: 12,
  wtsdHands: 5,
  wonAtShowdownHands: 3,
  earlyPosHands: 12,
  earlyPosVpip: 2,
  latePosHands: 12,
  latePosVpip: 5,
  totalNetBB: 24.5,
  reviewOptimalDecisions: 18,
  reviewAcceptableDecisions: 6,
  reviewMistakes: 2,
});

test('buildPersonaPromptPayload embeds VPIP, PFR, Agg%, and radar baseline accurately', () => {
  const report = buildPlayerPersonaReport(sampleStats);
  const prompt = buildPersonaPromptPayload('牌手A', sampleStats, report);

  assert.match(prompt, /"VPIP_pct": 28/);
  assert.match(prompt, /"PFR_pct": 22/);
  assert.match(prompt, /"Agg_pct": 71/);
  assert.match(prompt, /"handsPlayed": 36/);
  assert.match(prompt, /baselineRadarScores/);
});

test('analyzePlayerPersonaWithGemini guards empty hand history and missing API key honestly', async () => {
  const noDataRes = await analyzePlayerPersonaWithGemini({
    playerName: '新手',
    behaviorStats: createEmptyBehaviorStats(),
    apiKey: '',
  });
  assert.equal(noDataRes.ok, false);
  if (!noDataRes.ok) {
    assert.equal(noDataRes.code, 'NO_DATA');
  }

  const prevEnv = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const missingKeyRes = await analyzePlayerPersonaWithGemini({
      playerName: '牌手A',
      behaviorStats: sampleStats,
      apiKey: '',
    });
    assert.equal(missingKeyRes.ok, false);
    if (!missingKeyRes.ok) {
      assert.equal(missingKeyRes.code, 'MISSING_API_KEY');
      assert.equal(missingKeyRes.personaReport.radarAxes.length, 6);
    }
  } finally {
    if (prevEnv !== undefined) {
      process.env.GEMINI_API_KEY = prevEnv;
    }
  }
});

test('analyzePlayerPersonaWithGemini parses structured JSON response and clamps radar scores', async () => {
  let seenModel = '';
  const res = await analyzePlayerPersonaWithGemini({
    playerName: '牌手A',
    behaviorStats: sampleStats,
    generator: {
      async generateJson({ model }) {
        seenModel = model;
        return JSON.stringify({
          archetypeTitle: '紧凶掌控者',
          summary: '36 手样本显示 VPIP 28%、PFR 22%、Agg% 71%，攻守节奏清晰且位置区分良好。',
          radarInsight: '翻后进攻与决策纪律表现突出，整体形态接近 GTO 均衡轮廓。',
          radarScores: {
            vpip: 44,
            pfr: 50,
            aggPct: 72,
            cbet: 75,
            showdown: 60,
            discipline: 120, // should clamp to 100
          },
          strengths: [
            {
              title: '翻前起手牌结构严谨',
              evidence: 'VPIP 28% / PFR 22%',
              detail: '入池与加注间距紧凑，极少被动平跟。',
            },
          ],
          weaknesses: [
            {
              title: 'C-Bet 频率略偏高',
              evidence: 'C-Bet 75%',
              detail: '湿润牌面持续下注偏多，容易遭到过牌加注反击。',
            },
          ],
          habits: [
            {
              kind: 'good',
              title: '后位入池积极',
              evidence: '后位 42% vs 前位 17%',
              detail: '能有效利用位置信息差扩大盈利区间。',
            },
            {
              kind: 'bad',
              title: '翻牌高频率习惯性开火',
              evidence: 'C-Bet 75%',
              detail: '在连接紧密的低张面应更多过牌保护范围。',
            },
          ],
          improvements: [
            {
              focus: '按牌面纹理分层控制 C-Bet',
              targetMetric: 'C-Bet 调整至 55%-65%',
              actionPlan: '湿润低张面将中等对子与弱听牌纳入过牌范围，干燥高张面维持 1/3 池小额高频下注。',
            },
          ],
        });
      },
    },
  });

  assert.equal(seenModel, PERSONA_GEMINI_MODEL);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.analysis.archetypeTitle, '紧凶掌控者');
    assert.equal(res.analysis.radarScores?.discipline, 100);
    assert.equal(res.analysis.strengths.length, 1);
    assert.equal(res.analysis.weaknesses.length, 1);
    assert.equal(res.analysis.habits.length, 2);
    assert.equal(res.analysis.improvements.length, 1);
  }
});

test('sanitizeAiPersonaAnalysis rejects malformed payloads cleanly', () => {
  assert.equal(sanitizeAiPersonaAnalysis(null, 10, PERSONA_GEMINI_MODEL), null);
  assert.equal(
    sanitizeAiPersonaAnalysis({ archetypeTitle: '缺内容' }, 10, PERSONA_GEMINI_MODEL),
    null
  );
});
