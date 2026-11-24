# Velvet Hold'em — System Architecture (Agent & Engineer Reference)

> **Audience**: Software engineers and AI coding agents contributing to Velvet Hold'em.
> **Hardware Invariant**: The entire application — poker engine, GTO v3 + RNR bot AI, Bayesian opponent profiler, 3-tier solver, SQLite WAL persistence, test suite, and Docker image — is **CPU-only by default**. Zero GPU is required for development, CI, testing, or production deployment.

---

## 1. High-Level Topology

Velvet Hold'em runs as a **single-port Node.js 22 service** (`server.ts` compiled to `dist/server.mjs`) that serves:
1. **Static React 19 / Three.js SPA** (`dist/` built by Vite 8).
2. **REST APIs** (`/api/*`) partitioned into modular route registers (`server/http/authRoutes.ts`, `server/http/gtoRoutes.ts`, and room/review endpoints in `server.ts`).
3. **WebSocket Real-Time Table Hub** (`/ws`) handling room membership, betting actions, stepped all-in runouts, chat, nudges, and live broadcasts.
4. **Native SQLite Persistence** (`node:sqlite` `DatabaseSync` in WAL mode, stored under `DATA_DIR/velvet_holdem.sqlite`).

```text
Browser (React 19 + Three.js WebGL / 2D Fallback)
   │  REST (/api/*) + WebSocket (/ws)
   ▼
Express + ws Server (server.ts)
   ├── server/http/authRoutes.ts      Pure Email 6-Digit OTP Auth & Session Revocation
   ├── server/http/gtoRoutes.ts       GTO Workbench, Bayesian Node-Lock, Session Audit, Persona AI
   ├── server/handPersistence.ts      Idempotent Multi-Hand SQLite Replay Persistence
   ├── server/botAi.ts                GTO v3 + Range/Nut Advantage + RNR Safe Exploitation
   ├── server/botAiAdvisor.ts         Optional Async LLM Overlay (1.8s timeout + safety guardrails)
   ├── server/opponentProfiler.ts     Beta-Binomial Bayesian Profiler & RNR Counter-Strategy
   ├── server/gtoSolver.ts            3-Tier CPU Solver (Blueprint / MC / Optional External CPU Binary)
   ├── server/gtoIsomorphism.ts       Suit Isomorphism (22,100 -> 1,755 flops) & LRU Cache
   ├── server/personaAi.ts            Dual-Provider 6-Axis Persona Radar (Gemini / DeepSeek)
   ├── server/handReview.ts           Per-Street Decision Evidence & Review Report Generator
   └── server/db.ts                   Node 22 Native SQLite (WAL) + Idempotent Migrations
```

---

## 2. Shared Game Rules Engine (`src/shared/`)

The deterministic Texas Hold'em state machine lives in `src/shared/` and is shared verbatim by server authority and frontend UI helpers:

- **`src/shared/pokerEngine.ts`**:
  - Cryptographically secure shuffling (`crypto.randomInt` on server).
  - 2–10 seat NLHE betting rounds (`preflop`, `flop`, `turn`, `river`, `showdown`), blind posting, heads-up button rules, WSOP Rule 47 short all-in re-open checks, multi-tier side pot itemization (`computeSidePots`), uncalled bet refunds, dead-money conservation when players leave mid-hand, and stepped all-in runouts.
  - Appends each completed hand to `state.handHistory` via `.push()` (bounded to `MAX_HAND_HISTORY`).
  - `sanitizeTableForPlayer(state, viewerId)` guarantees unrevealed opponent hole cards are stripped before every WS broadcast.
- **`src/shared/handEvaluator.ts`**: Exact 5-of-7 poker hand evaluator used for authoritative showdown payouts.
- **`src/shared/gtoWorkbench.ts`**: Shared frontend-backend TypeScript contract for the 13×13 GTO strategy matrix, 5-tier EV Loss grading, blocker removal, range geometry, and Bayesian Node-Lock workbench.
- **`src/shared/playerInsights.ts`**: 6-axis player radar math (`vpip`, `pfr`, `aggPct`, `cbet`, `showdown`, `discipline`), behavior stat aggregation, and deterministic local persona generation.

---

## 3. Poker AI: GTO v3 + Bayesian Profiling + RNR Safe Exploitation

All core bot decisions execute in **< 5 ms on a single CPU core** with zero external network or GPU dependencies:

### 3.1 GTO v3 Baseline (`server/gtoRanges.ts`, `server/botAi.ts`)
- **Preflop**: 169-hand 6-max & Heads-Up mixed-frequency charts by position (`UTG`, `HJ`, `CO`, `BTN`, `SB`, `BB`) plus `<= 15 BB` Nash push/fold tables.
- **Postflop Evaluator**: Zero-allocation integer 7-card evaluator (`evaluateCardsFast`, verified 100% order-equivalent to `evaluateBestHand` across 1,500 random matchups) powering aggression-weighted Monte Carlo equity (`estimatePostflopEquity`).
- **Structural Heuristics**: Board range advantage & nut advantage (`computeBoardRangeAdvantage`), turn scare-card double barrelling, turn probes when flop checks through, MDF (`P / (P + B)`), river optimal bluff ratio (`B / (P + B)`), blocker scoring, and geometric bet sizing (`((1 + 2*SPR)^(1/k) - 1) / 2`).

### 3.2 Bayesian Opponent Profiling (`server/opponentProfiler.ts`)
- Tracks per-room live session metrics: `VPIP`, `PFR`, `Limp`, `3-Bet`, `Fold-to-3Bet`, `C-Bet`, `Fold-to-CBet`, `Fold-to-Bet`, `WTSD`, `W$SD`, `Turn Barrel`, `AF`, overbets, and showdown bluff evidence.
- Applies **Beta-Binomial / Dirichlet Prior Shrinkage** toward 6-max GTO population priors $\pi_{\text{GTO}}$ with pseudo-count $\kappa$:
  $$\hat{\theta}_{\text{post}} = \frac{\kappa \pi_{\text{GTO}} + c}{\kappa + n}$$
- Classifies 7 live archetypes (`balanced`, `overfolder_nit`, `calling_station`, `maniac_bluffer`, `cbet_spammer`, `fit_or_fold`, `limp_passive`) plus human-readable `leakTags`.
- Supports low-weight prior warm-start (`seedPriorFromBehaviorStats`, capped at 3 pseudo-hands) when known players sit down so live table dynamics always dominate.

### 3.3 Restricted Nash Response (RNR) Safe Exploitation
- Inspired by Johanson, Zinkevich & Bowling (NIPS 2007) and Bard et al. (2013):
  $$\sigma_{\text{RNR}} = (1 - \lambda w)\,\sigma_{\text{GTO}} + \lambda w\,\sigma_{\text{BR}}(\hat{\theta}_{\text{post}})$$
- Safety coefficient $\lambda \in [0.72, 0.95]$ scales smoothly with sample size $n$, keeping bots near GTO on sparse observations while punishing confirmed leaks (e.g., cutting air bluffs & sizing up thin value vs calling stations; widening steals & barrels vs over-folders; slowplaying monsters & hero-calling lighter vs maniacs).

### 3.4 Optional AI Enhancement (`server/botAiAdvisor.ts`, `server/personaAi.ts`, `server/gtoCoach.ts`)
- **Bot Tactical Overlay**: Disabled by default (`AI_BOT_ENHANCEMENT=false`). When enabled with `DEEPSEEK_API_KEY`, only high-leverage postflop pots (`>= 8 BB`) query DeepSeek under a strict `1,800 ms` timeout with legal-action and nuts-protection guardrails; any failure falls back silently to deterministic GTO+RNR.
- **Persona Radar AI**: `POST /api/persona/analyze` supports Google Gemini (`GEMINI_API_KEY`) with automatic fallback to DeepSeek (`DEEPSEEK_API_KEY`) and deterministic local 6-axis radar when no key is set.
- **3-Tier GTO Workbench Solver** (`server/gtoSolver.ts`, `server/gtoIsomorphism.ts`):
  - **Layer 1 (`blueprint`)**: Preflop 169-hand matrices (`< 5 ms`, CPU).
  - **Layer 2 (`heuristic`)**: Suit-isomorphic canonicalized (`22,100 -> 1,755` flops) Monte Carlo + Range/Nut/Blocker engine with 512-entry LRU cache (`< 80 ms`, CPU).
  - **Layer 3 (`texassolver`, optional)**: Spawns an external CPU `console_solver` binary if `TEXASSOLVER_BIN` is configured (`shell: false`, strict card token regex, 4.5s hard timeout). Never required.

---

## 4. Persistence, Auth & Security Boundaries

| Boundary | Enforcement Mechanism |
| :--- | :--- |
| **Guest Play & Room Hosting** | Zero login required to join rooms, create custom rooms (`POST /api/rooms`), or play against GTO bots. |
| **Authentication** | Pure 6-digit email OTP (`POST /api/auth/send-code` + `verify-code`) with 60s resend cooldown, 5-attempt lockout, and HMAC-signed session tokens. Passwordless `POST /api/auth/quick-login` returns HTTP `410`. |
| **Session Revocation** | `POST /api/auth/logout` increments `token_version` in SQLite, immediately invalidating prior tokens. |
| **Room & Seat Ownership** | `X-Player-Id` + `X-Seat-Secret` verified in constant time (`server/roomAuth.ts`) before deleting custom rooms or exposing private Hero hole cards in hand reviews. |
| **Hand Replay Redaction** | `server/db.ts` strips unrevealed hole cards before persisting to `hand_history`. `server/handPersistence.ts` resolves hands by exact `handNumber` and upserts `(room_id, hand_number)` so consecutive hands and post-showdown card reveals persist cleanly without skipping or duplication. |
| **Anti-Spoofing** | Account stats (`points`, `netChips`, `handsPlayed`, `achievements`) are updated authoritatively on server showdown; client `/api/auth/sync-outcome` only syncs avatar preferences. |
| **Rate Limiting** | Sliding-window per-IP limiters (`server/rateLimiter.ts`) guard OTP sends/verifications, room creation, GTO solver calls, Persona AI, and WebSocket message floods. |
