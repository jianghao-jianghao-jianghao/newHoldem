# Velvet Hold'em 前端 UI 协同契约（Google AI Studio ↔ 本地仓库）

> **用途**：本文件是 **Google AI Studio（前端视觉孵化器）** 与 **本地 `main` 仓库（全栈唯一真相源）** 之间的单向接口契约。  
> 在 AI Studio 中设计/重构新页面、新 HUD、新弹窗、3D 材质或图表时，**直接复制本文件相关章节 + 末尾 Prompt 模板**作为上下文，产出纯 `props` 驱动的独立前端组件后，再合入本地仓库接入真实状态。

---

## 一、协同边界与 Git 规则

### 1. 目录所有权矩阵

| 目录 / 文件 | 维护方 | 规则 |
|---|---|---|
| `server.ts`、`server/*` | **仅本地 `main`** | 后端逻辑、房间管理、座位鉴权（`seatSecret`）、AI 策略、持久化；**严禁从 AI Studio 覆盖** |
| `src/shared/*` | **仅本地 `main`** | 牌局引擎、牌型评估、协议类型（`types.ts`）；作为只读契约提供给 AI Studio |
| `src/App.tsx`、`src/context/*` | **仅本地 `main`** | WebSocket 连接、指数退避重连、心跳、账号会话、云端同步 |
| `src/components/*`（纯展示子组件）、`src/three/*`、`src/utils/soundFx.ts` | **AI Studio 孵化 → 本地合入** | 必须保持 **纯 Props 驱动**，禁止在组件内直连 `WebSocket`、`fetch`、`localStorage` 或 `useAuth()` |

> **注**：当前 [TitleScreen.tsx](src/components/TitleScreen.tsx) 仍直接引用了 `useAuth()`；后续新增组件请严格通过 `props` 接收登录态与回调，不要耦合 `AuthContext`。

### 2. Git 单向同步命令（防覆盖后端）

建议让 Google AI Studio 仅推送到独立分支（如 `ai-studio`）或独立沙盒仓库，本地 `main` 永远只按文件精准提取：

```bash
git fetch origin

# 方式 A：直接提取 AI Studio 新孵化的独立组件文件（零冲突）
git checkout origin/ai-studio -- src/components/SidePotDisplay.tsx

# 方式 B：对比已有文件的样式改动，按需语义合入（避免覆盖本地修好的快捷键/鉴权/兜底逻辑）
git diff main..origin/ai-studio -- src/components/ActionDock.tsx
```

---

## 二、Velvet Hold'em 视觉规范（Design Tokens）

技术栈：**React 19 + TypeScript + Tailwind CSS v4 + `lucide-react` + Three.js**（不使用未安装的第三方 UI 库）。

- **背景与层次**：
  - 主画布黑曜石底：`#090B0C`
  - 浮层/卡片底：`#0B0D0E/92`、`#0D1012/94`、`#14181A`
  - 牌桌祖母绿绒面（2D/质感呼应）：`from-[#134230] to-[#0A251B]`
- **品牌强调色**：
  - 拉丝黄铜金（主按钮 / 当前行动高亮 / 赢家）：`#D4A853`（hover `#E1B968`、浅金文字 `#F0DFB3` / `#E8CF96`）
  - 象牙白主文字：`#F3F1EC`；次级灰绿文字：`#9BA5A0` / `#8A948F`
  - 筹码/盈利翡翠绿：`#8CC9AA` / `#6EE7B7`
  - 弃牌/警示/倒计时最后 5 秒红：`#E57373` / `#F87171`
  - 细描边：`border-white/[0.08]` ~ `border-white/[0.14]`，强调描边：`border-[#D4A853]/45`
- **字体与内置样式类**（已定义于 `src/index.css`）：
  - 展示衬线：`.font-display`（`Cormorant Garamond, Noto Sans SC`）
  - 正文无衬线：`Plus Jakarta Sans, Noto Sans SC`
  - 筹码/金额/倒计时等宽数字：`.font-mono-num`（`JetBrains Mono` + `tabular-nums`）
  - 滑动条：`input[type="range"].poker-slider`
  - 常用动效类：`.animate-deal`、`.animate-chip-impact`、`.animate-turn-glow`、`.chat-scroll`
- **交互硬性规范**：
  - 桌面端为主（1280px+ 搭配 3D 牌桌），同时兼容移动端（`<768px` 切换 2D 牌桌），可点击元素加 `touch-manipulation`。
  - 弹窗/抽屉必须支持 `Esc` 关闭与遮罩点击关闭，且打开时不得与全局快捷键（`F/C/Space/R/T/M`）冲突。
  - 中文术语统一使用：**「全下」「让牌」「跟注」「加注」「小盲 / 大盲」「庄家」**。

---

## 三、核心数据契约（同步自 `src/shared/types.ts`）

> 在 AI Studio 孵化任何牌桌组件时，直接复制以下类型到沙盒的 `types.ts` 中即可。

```ts
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A
export type StreetPhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type PlayerActionType = 'fold' | 'check' | 'call' | 'raise';

export interface Card {
  suit: Suit;
  rank: Rank;
  joker?: 'little' | 'big';
}

export interface HandEvaluation {
  category: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  categoryName: string; // 如 "高牌" | "一对" | "两对" | "三条" | "顺子" | "同花" | "葫芦" | "四条" | "同花顺" | "皇家同花顺"
  score: number;
  bestCards: Card[];
}

export interface PlayerAction {
  type: PlayerActionType;
  amount?: number; // 加注/下注时的本街目标总注额
}

export interface AvailableActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  isOpeningBet: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export interface WinnerInfo {
  playerId: string;
  playerName: string;
  amount: number;
  handName: string;
  bestCards: Card[];
  netChange: number;
}

export interface PotTimelinePoint {
  step: number;
  street: StreetPhase;
  actorId: string;
  actorName: string;
  actionType: string; // 'blind' | 'call' | 'raise' | 'bet' | 'allin' | 'refund'
  actionLabel: string;
  amountAdded: number;
  potAfter: number;
  timestamp: number;
}

export interface ClientPlayerView {
  id: string;
  name: string;
  avatar?: string;
  seatIndex: number;
  isBot: boolean;
  connected: boolean;
  chips: number;
  holeCards: Card[] | null; // null 表示对当前视角隐藏
  cardCount: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  revealed?: boolean;
  currentBet: number;
  totalContributed: number;
  lastActionLabel?: string;
  handEvaluation?: HandEvaluation | null;
  achievements?: string[];
  winStreak?: number;
}

export interface ClientTableView {
  roomId: string;
  hostId: string | null;
  phase: StreetPhase;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  dealerSeatIndex: number;
  smallBlindSeatIndex: number | null;
  bigBlindSeatIndex: number | null;
  manualBlindTarget: { role: 'dealer' | 'sb' | 'bb'; seatIndex: number } | null;
  pendingBlinds: { smallBlind: number; bigBlind: number } | null;
  previewNextBlinds: {
    dealerSeatIndex: number | null;
    smallBlindSeatIndex: number | null;
    bigBlindSeatIndex: number | null;
  };
  currentTurnPlayerId: string | null;
  turnDeadline: number | null;
  allInRunout: boolean;
  nextHandAt: number | null;
  autoNextHandEnabled: boolean;
  canRevealMyCards: boolean;
  pot: number;
  currentBet: number;
  minRaise: number;
  communityCards: Card[];
  players: ClientPlayerView[];
  winners: WinnerInfo[];
  actionLog: string[];
  analytics: {
    currentPotTimeline: PotTimelinePoint[];
    handHistory: unknown[];
    playerStats: Record<string, {
      playerId: string;
      playerName: string;
      handsPlayed: number;
      vpipHands: number;
      handsWon: number;
      showdownReached: number;
      showdownWon: number;
      sessionNetChips: number;
    }>;
  };
  myAvailableActions: AvailableActions | null;
  myHandEvaluation: HandEvaluation | null;
}

export interface RoomSummary {
  roomId: string;
  tableName: string;
  playerCount: number;
  phase: StreetPhase;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  text: string;
  createdAt: number;
}
```

---

## 四、关键前端组件 Props 速查

孵化新组件或局部升级以下组件时，保持原有 Props 签名向后兼容：

- **`ActionDock`**（`src/components/ActionDock.tsx`）
  ```ts
  interface ActionDockProps {
    available: AvailableActions | null;
    pot: number;
    bigBlind: number;
    myCurrentBet?: number;
    handEvaluationName?: string | null;
    statusMessage: string;
    hotkeysDisabled?: boolean;
    onAction: (action: PlayerAction) => void;
  }
  ```
- **`SeatNode`**（`src/components/SeatNode.tsx`）
  ```ts
  interface SeatNodeProps {
    player: ClientPlayerView;
    isSelf: boolean;
    isTurn: boolean;
    isDealer: boolean;
    isSmallBlind: boolean;
    isBigBlind: boolean;
    nextBlindRole?: 'SB' | 'BB' | 'D' | null;
    isWinner: boolean;
    winAmount?: number;
    highlightedCards: Card[];
    secondsRemaining: number | null;
    chatBubble?: ChatMessage | null;
    actionFx?: { id: string; text: string; tone: 'call' | 'raise' | 'fold' | 'allin' | 'check' | 'reveal' } | null;
    nudgeFx?: { id: string; message: string } | null;
    compact?: boolean;
    canRemoveBot?: boolean;
    onRemoveBot?: (botId: string) => void;
    onNudgePlayer?: (playerId: string) => void;
    onOpenAchievements?: () => void;
  }
  ```
- **新增独立模块推荐签名规范**：只接收精确的切片数据 + 回调函数（例如 `SidePotDisplayProps` 只收 `players: ClientPlayerView[]` 和 `pot: number`），不要把整个 `App` 状态塞进去。

---

## 五、可直接运行的 Mock 数据模板（粘贴进 AI Studio 即预览）

```ts
import type { ClientTableView } from './types';

export const MOCK_MY_PLAYER_ID = 'player_hero';

/** 场景 1：6 人桌转牌圈（轮到自己行动，面对加注） */
export const MOCK_TABLE_TURN_ACTIVE: ClientTableView = {
  roomId: 'CLUB01',
  hostId: 'player_hero',
  phase: 'turn',
  handNumber: 12,
  smallBlind: 10,
  bigBlind: 20,
  startingChips: 2000,
  dealerSeatIndex: 0,
  smallBlindSeatIndex: 1,
  bigBlindSeatIndex: 2,
  manualBlindTarget: null,
  pendingBlinds: null,
  previewNextBlinds: { dealerSeatIndex: 1, smallBlindSeatIndex: 2, bigBlindSeatIndex: 3 },
  currentTurnPlayerId: 'player_hero',
  turnDeadline: Date.now() + 21_000,
  allInRunout: false,
  nextHandAt: null,
  autoNextHandEnabled: true,
  canRevealMyCards: false,
  pot: 1460,
  currentBet: 420,
  minRaise: 220,
  communityCards: [
    { suit: 'spades', rank: 14 },
    { suit: 'hearts', rank: 12 },
    { suit: 'spades', rank: 9 },
    { suit: 'diamonds', rank: 4 },
  ],
  players: [
    {
      id: 'player_hero',
      name: '林深',
      seatIndex: 0,
      isBot: false,
      connected: true,
      chips: 1580,
      holeCards: [
        { suit: 'spades', rank: 13 },
        { suit: 'spades', rank: 10 },
      ],
      cardCount: 2,
      inHand: true,
      folded: false,
      allIn: false,
      currentBet: 200,
      totalContributed: 420,
      lastActionLabel: '下注 200',
    },
    {
      id: 'bot_1',
      name: '陈默',
      seatIndex: 1,
      isBot: true,
      connected: true,
      chips: 1740,
      holeCards: null,
      cardCount: 2,
      inHand: true,
      folded: true,
      allIn: false,
      currentBet: 0,
      totalContributed: 60,
      lastActionLabel: '弃牌',
    },
    {
      id: 'bot_2',
      name: '林澈',
      seatIndex: 2,
      isBot: true,
      connected: true,
      chips: 0,
      holeCards: null,
      cardCount: 2,
      inHand: true,
      folded: false,
      allIn: true,
      currentBet: 260,
      totalContributed: 360,
      lastActionLabel: '全下 260',
    },
    {
      id: 'bot_3',
      name: '周屿',
      seatIndex: 3,
      isBot: true,
      connected: true,
      chips: 2380,
      holeCards: null,
      cardCount: 2,
      inHand: true,
      folded: false,
      allIn: false,
      currentBet: 420,
      totalContributed: 620,
      lastActionLabel: '加注至 420',
    },
  ],
  winners: [],
  actionLog: ['周屿 加注至 420', '林澈 全下 260', '林深 下注 200'],
  analytics: {
    currentPotTimeline: [
      { step: 1, street: 'preflop', actorId: 'bot_1', actorName: '陈默', actionType: 'blind', actionLabel: '小盲 10', amountAdded: 10, potAfter: 10, timestamp: Date.now() - 35_000 },
      { step: 2, street: 'preflop', actorId: 'bot_2', actorName: '林澈', actionType: 'blind', actionLabel: '大盲 20', amountAdded: 20, potAfter: 30, timestamp: Date.now() - 34_000 },
      { step: 3, street: 'flop', actorId: 'player_hero', actorName: '林深', actionType: 'bet', actionLabel: '下注 200', amountAdded: 200, potAfter: 780, timestamp: Date.now() - 18_000 },
      { step: 4, street: 'turn', actorId: 'bot_3', actorName: '周屿', actionType: 'raise', actionLabel: '加注至 420', amountAdded: 420, potAfter: 1460, timestamp: Date.now() - 5_000 },
    ],
    handHistory: [],
    playerStats: {},
  },
  myAvailableActions: {
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 220,
    canRaise: true,
    isOpeningBet: false,
    minRaiseTo: 640,
    maxRaiseTo: 1780,
  },
  myHandEvaluation: {
    category: 0,
    categoryName: '高牌',
    score: 1413121009,
    bestCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'spades', rank: 13 },
      { suit: 'hearts', rank: 12 },
      { suit: 'spades', rank: 10 },
      { suit: 'spades', rank: 9 },
    ],
  },
};

/** 场景 2：摊牌结算态（高亮最佳 5 张牌与赢家） */
export const MOCK_TABLE_SHOWDOWN: ClientTableView = {
  ...MOCK_TABLE_TURN_ACTIVE,
  phase: 'showdown',
  currentTurnPlayerId: null,
  turnDeadline: null,
  nextHandAt: Date.now() + 8_000,
  pot: 1900,
  communityCards: [
    ...MOCK_TABLE_TURN_ACTIVE.communityCards,
    { suit: 'spades', rank: 2 },
  ],
  players: MOCK_TABLE_TURN_ACTIVE.players.map((p) =>
    p.id === 'bot_3'
      ? {
          ...p,
          holeCards: [
            { suit: 'hearts', rank: 14 },
            { suit: 'clubs', rank: 12 },
          ],
          revealed: true,
          handEvaluation: { category: 2, categoryName: '两对', score: 2141209, bestCards: [] },
        }
      : p
  ),
  winners: [
    {
      playerId: 'player_hero',
      playerName: '林深',
      amount: 1900,
      handName: '同花',
      bestCards: [
        { suit: 'spades', rank: 14 },
        { suit: 'spades', rank: 13 },
        { suit: 'spades', rank: 10 },
        { suit: 'spades', rank: 9 },
        { suit: 'spades', rank: 2 },
      ],
      netChange: 1260,
    },
  ],
  myAvailableActions: null,
  myHandEvaluation: {
    category: 5,
    categoryName: '同花',
    score: 51413100902,
    bestCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'spades', rank: 13 },
      { suit: 'spades', rank: 10 },
      { suit: 'spades', rank: 9 },
      { suit: 'spades', rank: 2 },
    ],
  },
};
```

---

## 六、Google AI Studio 专用 Prompt 模板（直接复制）

每次在 AI Studio 开新沙盒孵化前端模块时，把以下模板连同上面的「视觉规范 + 数据契约 + Mock 数据」一起发给它：

```text
你正在为高端暗色德州扑克应用「Velvet Hold'em」孵化一个独立的前端 React 组件。

【硬性架构约束】
1. 只编写独立、纯 Props 驱动的 React + TypeScript + Tailwind CSS 组件文件（如 `src/components/你的组件名.tsx`）。
2. 严禁在目标组件内使用 WebSocket、fetch、localStorage 或外部状态库；所有数据通过 Props 传入，所有操作通过回调函数向上抛出。
3. 请另外提供一个仅用于预览的 `DemoHarness.tsx`，使用我提供的 Mock 数据（包含“进行中”与“摊牌结算”状态切换按钮）展示该组件效果，方便我调优视觉后单独拷出目标组件文件。
4. 视觉风格严格遵循 Velvet Hold'em 设计规范：黑曜石底色 `#090B0C`、拉丝黄铜金 `#D4A853`、象牙白 `#F3F1EC`、等宽数字 `.font-mono-num`、细描边 `border-white/[0.1]`，支持桌面端和移动端自适应，图标仅使用 `lucide-react`。
5. 若包含弹窗/抽屉，必须支持 Esc 与点击遮罩关闭；全部中文术语使用「全下 / 让牌 / 跟注 / 加注 / 小盲 / 大盲」。

【本次要孵化的组件需求】
- 组件名：<例如 SidePotBreakdown.tsx>
- 展示位置：<例如 牌桌顶部底池栏下方>
- 功能与动效要求：<写清楚你要的视觉效果、交互细节>

【附：类型定义与 Mock 数据】
<粘贴本文件第三、五节代码>
```

---

## 七、从 AI Studio 搬回本地 `main` 的 4 步验收清单

1. **剥离预览外壳**：只复制目标组件文件（不拷 `DemoHarness.tsx` 或 AI Studio 自动生成的 `App.tsx`）。
2. **接入真实容器**：在本地 `PokerTable.tsx` 或 `App.tsx` 中挂载该组件并绑定真实的 `table` / 回调（确保弹窗状态接入 `externalModalOpen` / `hotkeysDisabled`）。
3. **检查两端兼容**：确认在 `<768px` 移动端（2D 牌桌）以及 `webglFailed` 降级模式下都不会遮挡操作区。
4. **本地自动化守门**：执行类型检查与单元测试：
   ```bash
   npm run lint
   node --test --import tsx "src/shared/*.test.ts" "src/three/*.test.ts" "server/*.test.ts"
   ```
