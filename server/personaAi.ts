import {
  buildPlayerPersonaReport,
  sanitizeBehaviorStats,
  type AiPersonaAnalysis,
  type AiPersonaHabit,
  type AiPersonaImprovement,
  type AiPersonaTrait,
  type PlayerBehaviorStats,
  type PlayerPersonaReport,
  type PokerRadarAxisKey,
} from '../src/shared/playerInsights';

const SchemaType = {
  OBJECT: 'OBJECT',
  STRING: 'STRING',
  INTEGER: 'INTEGER',
  ARRAY: 'ARRAY',
} as const;

export const PERSONA_GEMINI_MODEL = 'gemini-4-hydrogen';

export type PersonaAiErrorCode =
  | 'NO_DATA'
  | 'MISSING_API_KEY'
  | 'API_KEY_INVALID'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR';

export type PersonaAiResult =
  | {
      ok: true;
      analysis: AiPersonaAnalysis;
      personaReport: PlayerPersonaReport;
    }
  | {
      ok: false;
      code: PersonaAiErrorCode;
      error: string;
      personaReport: PlayerPersonaReport;
    };

export interface GeminiTextGenerator {
  generateJson(params: {
    model: string;
    systemInstruction: string;
    prompt: string;
    responseSchema: Record<string, unknown>;
  }): Promise<string>;
}

const VALID_RADAR_KEYS: PokerRadarAxisKey[] = [
  'vpip',
  'pfr',
  'aggPct',
  'cbet',
  'showdown',
  'discipline',
];

const PERSONA_SYSTEM_INSTRUCTION = `你是一位资深德州扑克 GTO 教练兼牌手行为分析师。
请严格根据提供的真实牌手统计数据（如 VPIP、PFR、Agg%、AF、C-Bet、WTSD、W$SD、BB/100、位置差值、复盘达标率、当局被对手识别的套路），生成精炼、专业、客观的中文牌手性格画像与数据改进建议。
要求：
1. 必须直接引用输入中的真实数值作为证据，不得编造不存在的牌局或指标。
2. 若样本量较小（如 <15 手），请在总评中客观提示样本尚浅但仍基于当前趋势给出有针对性的建议。
3. 语言克制专业，避免空泛口号，每条改进建议必须明确指出目标指标区间和牌桌执行动作。
4. 严格输出符合 JSON Schema 的结构化内容。`;

export const PERSONA_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: SchemaType.OBJECT,
  properties: {
    archetypeTitle: {
      type: SchemaType.STRING,
      description: '4-10字中文性格画像称号，如「紧凶掌控型」「松散粘滞型」',
    },
    summary: {
      type: SchemaType.STRING,
      description: '60-120字的核心打法性格总评，引用关键统计数据',
    },
    radarInsight: {
      type: SchemaType.STRING,
      description: '40-90字的六维雷达形态解读，指出突出轴与短板轴的平衡关系',
    },
    radarScores: {
      type: SchemaType.OBJECT,
      description: '基于数据校准的六维 0-100 得分（须忠实于原始统计趋势）',
      properties: {
        vpip: { type: SchemaType.INTEGER },
        pfr: { type: SchemaType.INTEGER },
        aggPct: { type: SchemaType.INTEGER },
        cbet: { type: SchemaType.INTEGER },
        showdown: { type: SchemaType.INTEGER },
        discipline: { type: SchemaType.INTEGER },
      },
      required: ['vpip', 'pfr', 'aggPct', 'cbet', 'showdown', 'discipline'],
    },
    strengths: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          evidence: { type: SchemaType.STRING },
          detail: { type: SchemaType.STRING },
        },
        required: ['title', 'evidence', 'detail'],
      },
    },
    weaknesses: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          evidence: { type: SchemaType.STRING },
          detail: { type: SchemaType.STRING },
        },
        required: ['title', 'evidence', 'detail'],
      },
    },
    habits: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          kind: { type: SchemaType.STRING, enum: ['good', 'bad'] },
          title: { type: SchemaType.STRING },
          evidence: { type: SchemaType.STRING },
          detail: { type: SchemaType.STRING },
        },
        required: ['kind', 'title', 'evidence', 'detail'],
      },
    },
    improvements: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          focus: { type: SchemaType.STRING },
          targetMetric: { type: SchemaType.STRING },
          actionPlan: { type: SchemaType.STRING },
        },
        required: ['focus', 'targetMetric', 'actionPlan'],
      },
    },
  },
  required: [
    'archetypeTitle',
    'summary',
    'radarInsight',
    'radarScores',
    'strengths',
    'weaknesses',
    'habits',
    'improvements',
  ],
};

function cleanStr(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function clampRadarScore(raw: unknown): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(5, Math.min(100, Math.round(n)));
}

export function buildPersonaPromptPayload(
  playerName: string,
  stats: PlayerBehaviorStats,
  report: PlayerPersonaReport
): string {
  const m = report.metrics;
  const payload = {
    playerName: cleanStr(playerName, 24) || '牌手',
    handsPlayed: stats.handsPlayed,
    maturity: report.maturityLabel,
    baselineArchetype: `${report.archetype.title} (${report.archetype.englishTag})`,
    coreMetrics: {
      VPIP_pct: m.vpipPct,
      PFR_pct: m.pfrPct,
      PFR_to_VPIP_pct: m.pfrToVpipPct,
      Limp_pct: m.limpPct,
      ThreeBet_pct: m.threeBetPct,
      Agg_pct: m.aggPct,
      AF: m.aggressionFactor,
      CBet_pct: m.cbetPct,
      FoldToBet_pct: m.foldToBetPct,
      WTSD_pct: m.wtsdPct,
      WSD_pct: m.wsdPct,
      PositionVpipDiff_pct: m.posAwarenessDiff,
      BB_per_100: m.bbPer100,
    },
    baselineRadarScores: Object.fromEntries(
      report.radarAxes.map((ax) => [ax.key, { label: ax.label, score: ax.score, raw: ax.rawLabel }])
    ),
    reviewLinkage: {
      totalReviewedDecisions: report.totalReviewedDecisions,
      reviewAccuracyPct: report.reviewAccuracyPct,
      reviewOptimal: stats.reviewOptimalDecisions,
      reviewMistakes: stats.reviewMistakes,
    },
    exposedSessionPatterns: report.exposedPatterns.map((ep) => ({
      pattern: ep.label,
      count: ep.count,
      counterRisk: ep.counterRisk,
    })),
    riverCallRecord:
      stats.riverCalls > 0
        ? `${stats.riverCallWins}/${stats.riverCalls} 胜`
        : '样本不足',
    bigPotRecord:
      stats.bigPotHands > 0
        ? `${stats.bigPotWins}/${stats.bigPotHands} 胜`
        : '样本不足',
  };

  return `请分析以下德州扑克玩家的累积对局数据，并输出结构化 JSON：\n${JSON.stringify(payload, null, 2)}\n\n约束：strengths 2-3 条，weaknesses 2-3 条，habits 2-4 条（同时包含好习惯 good 与坏习惯 bad，如适用），improvements 2-3 条具体可执行的数据改进计划。`;
}

export function sanitizeAiPersonaAnalysis(
  raw: unknown,
  analyzedHands: number,
  model: string,
  now = Date.now()
): AiPersonaAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const archetypeTitle = cleanStr(o.archetypeTitle ?? o.archetype ?? o.title, 28);
  const summary = cleanStr(o.summary ?? o.overview, 280);
  const radarInsight = cleanStr(o.radarInsight ?? o.radarSummary, 220);

  if (!archetypeTitle || !summary) return null;

  const parseTraits = (list: unknown): AiPersonaTrait[] => {
    if (!Array.isArray(list)) return [];
    const out: AiPersonaTrait[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      const title = cleanStr(it.title ?? it.name, 48);
      const evidence = cleanStr(it.evidence ?? it.metric ?? it.data, 96);
      const detail = cleanStr(it.detail ?? it.description ?? it.explanation, 220);
      if (title && detail) {
        out.push({ title, evidence, detail });
      }
      if (out.length >= 4) break;
    }
    return out;
  };

  const parseHabits = (list: unknown): AiPersonaHabit[] => {
    if (!Array.isArray(list)) return [];
    const out: AiPersonaHabit[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      const kind = it.kind === 'bad' || it.type === 'bad' ? 'bad' : 'good';
      const title = cleanStr(it.title ?? it.name, 48);
      const evidence = cleanStr(it.evidence ?? it.metric, 96);
      const detail = cleanStr(it.detail ?? it.description, 220);
      if (title && detail) {
        out.push({ kind, title, evidence, detail });
      }
      if (out.length >= 6) break;
    }
    return out;
  };

  const parseImprovements = (list: unknown): AiPersonaImprovement[] => {
    if (!Array.isArray(list)) return [];
    const out: AiPersonaImprovement[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      const focus = cleanStr(it.focus ?? it.title ?? it.area, 48);
      const targetMetric = cleanStr(it.targetMetric ?? it.target ?? it.metric, 84);
      const actionPlan = cleanStr(it.actionPlan ?? it.plan ?? it.action ?? it.detail, 220);
      if (focus && actionPlan) {
        out.push({ focus, targetMetric, actionPlan });
      }
      if (out.length >= 4) break;
    }
    return out;
  };

  const radarScores: Partial<Record<PokerRadarAxisKey, number>> = {};
  if (o.radarScores && typeof o.radarScores === 'object') {
    const rs = o.radarScores as Record<string, unknown>;
    for (const key of VALID_RADAR_KEYS) {
      const val = clampRadarScore(rs[key]);
      if (val !== undefined) {
        radarScores[key] = val;
      }
    }
  }

  const strengths = parseTraits(o.strengths);
  const weaknesses = parseTraits(o.weaknesses);
  const habits = parseHabits(o.habits);
  const improvements = parseImprovements(o.improvements);

  if (strengths.length === 0 && weaknesses.length === 0 && improvements.length === 0) {
    return null;
  }

  return {
    archetypeTitle,
    summary,
    radarInsight: radarInsight || '六维雷达已结合最新对局统计与 GTO 基准完成校准。',
    radarScores: Object.keys(radarScores).length > 0 ? radarScores : undefined,
    strengths,
    weaknesses,
    habits,
    improvements,
    analyzedHands,
    generatedAt: now,
    model,
  };
}

function createSdkGenerator(apiKey: string): GeminiTextGenerator {
  let aiInstance: { models: { generateContent: (args: unknown) => Promise<{ text?: string }> } } | null = null;
  let thinkingLow: unknown = 'LOW';

  return {
    async generateJson({ model, systemInstruction, prompt, responseSchema }) {
      if (!aiInstance) {
        const sdk = await import('@google/genai');
        aiInstance = new sdk.GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        }) as unknown as { models: { generateContent: (args: unknown) => Promise<{ text?: string }> } };
        thinkingLow = sdk.ThinkingLevel?.LOW ?? 'LOW';
      }
      const response = await aiInstance.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
          thinkingConfig: {
            thinkingLevel: thinkingLow,
          },
        },
      });
      return response.text ?? '';
    },
  };
}

function parseJsonResponse(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function classifyGeminiError(err: unknown): {
  code: PersonaAiErrorCode;
  error: string;
  retryable: boolean;
} {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  const status =
    typeof (err as { status?: unknown })?.status === 'number'
      ? ((err as { status: number }).status)
      : undefined;

  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('permission denied')
  ) {
    return {
      code: 'API_KEY_INVALID',
      error: 'AI 分析服务密钥无效或权限不足，请联系管理员检查服务端配置。',
      retryable: false,
    };
  }
  if (status === 429 || lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('rate limit')) {
    return {
      code: 'RATE_LIMITED',
      error: 'AI 分析服务当前请求繁忙，请稍后再试。',
      retryable: true,
    };
  }
  const transient =
    (status !== undefined && status >= 500) ||
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed') ||
    lower.includes('unavailable') ||
    lower.includes('503');
  return {
    code: 'UPSTREAM_ERROR',
    error: 'AI 性格分析服务暂时不可用，请稍后点击重新分析。',
    retryable: transient,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDeepSeekGenerator(params: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): GeminiTextGenerator {
  const baseUrl = (params.baseUrl?.trim() || 'https://api.deepseek.com').replace(/\/+$/, '');
  const resolvedModel = params.model?.trim() || 'deepseek-chat';

  return {
    async generateJson({ systemInstruction, prompt }) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: resolvedModel,
          temperature: 0.3,
          max_tokens: 1800,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `${systemInstruction}\n请只输出一个紧凑合法的 JSON 对象（每条描述控制在 40-60 字以内以确保完整输出），字段结构严格按以下模板：\n{"archetypeTitle":"紧凶掌控型","summary":"...","radarInsight":"...","radarScores":{"vpip":50,"pfr":50,"aggPct":60,"cbet":60,"showdown":55,"discipline":80},"strengths":[{"title":"...","evidence":"...","detail":"..."}],"weaknesses":[{"title":"...","evidence":"...","detail":"..."}],"habits":[{"kind":"good","title":"...","evidence":"...","detail":"..."}],"improvements":[{"focus":"...","targetMetric":"...","actionPlan":"..."}]}`,
            },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`DeepSeek persona API error (${res.status}): ${text}`) as Error & {
          status?: number;
        };
        err.status = res.status;
        throw err;
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}

export async function analyzePlayerPersonaWithGemini(params: {
  playerName?: string;
  behaviorStats: PlayerBehaviorStats | null | undefined;
  apiKey?: string;
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
  generator?: GeminiTextGenerator;
}): Promise<PersonaAiResult> {
  const cleanStats = sanitizeBehaviorStats(params.behaviorStats);
  const personaReport = buildPlayerPersonaReport(cleanStats);

  if (cleanStats.handsPlayed < 1) {
    return {
      ok: false,
      code: 'NO_DATA',
      error: '暂无对局数据，请先完成至少 1 局牌桌实战后再生成 AI 性格画像。',
      personaReport,
    };
  }

  const resolvedGeminiKey = (params.apiKey ?? process.env.GEMINI_API_KEY ?? '').trim();
  const resolvedDeepSeekKey = (params.deepseekApiKey ?? '').trim();
  if (!params.generator && !resolvedGeminiKey && !resolvedDeepSeekKey) {
    return {
      ok: false,
      code: 'MISSING_API_KEY',
      error: '服务端尚未配置 GEMINI_API_KEY 或 DEEPSEEK_API_KEY，当前已基于真实统计绘制六维雷达图与本地画像。',
      personaReport,
    };
  }

  const useDeepSeekFallback = !params.generator && !resolvedGeminiKey && Boolean(resolvedDeepSeekKey);
  const activeModel = useDeepSeekFallback
    ? params.deepseekModel?.trim() || process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat'
    : process.env.GEMINI_MODEL?.trim() || PERSONA_GEMINI_MODEL;

  const generator =
    params.generator ??
    (useDeepSeekFallback
      ? createDeepSeekGenerator({
          apiKey: resolvedDeepSeekKey,
          baseUrl: params.deepseekBaseUrl ?? process.env.DEEPSEEK_BASE_URL,
          model: activeModel,
        })
      : createSdkGenerator(resolvedGeminiKey));
  const prompt = buildPersonaPromptPayload(
    params.playerName ?? '牌手',
    cleanStats,
    personaReport
  );

  let lastError: { code: PersonaAiErrorCode; error: string } = {
    code: 'UPSTREAM_ERROR',
    error: 'AI 性格分析返回格式异常，请稍后重试。',
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rawText = await generator.generateJson({
        model: activeModel,
        systemInstruction: PERSONA_SYSTEM_INSTRUCTION,
        prompt,
        responseSchema: PERSONA_RESPONSE_SCHEMA,
      });
      const parsed = parseJsonResponse(rawText);
      const analysis = sanitizeAiPersonaAnalysis(
        parsed,
        cleanStats.handsPlayed,
        activeModel
      );
      if (analysis) {
        return {
          ok: true,
          analysis,
          personaReport,
        };
      }
      lastError = {
        code: 'UPSTREAM_ERROR',
        error: 'AI 返回的分析结果未能通过结构校验，请点击重试。',
      };
    } catch (err) {
      const classified = classifyGeminiError(err);
      lastError = { code: classified.code, error: classified.error };
      if (!classified.retryable || attempt >= 2) {
        break;
      }
      await sleep(350 * Math.pow(2, attempt));
    }
  }

  return {
    ok: false,
    code: lastError.code,
    error: lastError.error,
    personaReport,
  };
}
