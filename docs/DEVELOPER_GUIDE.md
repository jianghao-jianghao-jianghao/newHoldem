# Velvet Hold'em — Developer Handbook (For Engineers & AI Agents)

> Quick operational guide for navigating, modifying, testing, and deploying Velvet Hold'em on **standard CPU-only hardware** (no GPU required).

---

## 1. Repository Quick Map

| Path | Responsibility |
| :--- | :--- |
| `server.ts` | Express app bootstrap, WebSocket hub, room lifecycle, showdown settlement, graceful `SIGTERM`/`SIGINT` shutdown with SQLite WAL checkpoint. |
| `server/http/authRoutes.ts` | Pure email OTP login, profile patch, logout revocation, and `410` guard on legacy quick-login. |
| `server/http/gtoRoutes.ts` | `/api/gto/*`, `/api/persona/analyze`, `/api/bot/profiles`, and `/api/rooms/:roomId/opponent-profiles`. |
| `server/handPersistence.ts` | Exact-hand lookup (`resolveCompletedHandRecord`) & SQLite persistence helper (`persistCompletedHandRecord`). |
| `server/db.ts` | Native `node:sqlite` (`DatabaseSync`) schema, idempotent column migrations, WAL checkpointing, redacted `hand_history` upsert. |
| `server/authStore.ts` | Email OTP generation/lockout, SMTP (`nodemailer`) & Resend delivery, HMAC token signing/revocation. |
| `server/roomAuth.ts` | Constant-time `X-Seat-Secret` comparison & room deletion authorization. |
| `server/gtoRanges.ts` | 169-hand 6-max/HU preflop frequency matrices, `<=15BB` Nash push/fold, O(1) 7-card evaluator (`evaluateCardsFast`), Monte Carlo equity, MDF, blockers, geometric sizing. |
| `server/botAi.ts` | GTO v3 + range/nut advantage + RNR safe-exploitation decision engine. |
| `server/botAiAdvisor.ts` | Optional async DeepSeek tactical advisor (`AI_BOT_ENHANCEMENT=true`, 1.8s timeout, legal-action guardrails). |
| `server/opponentProfiler.ts` | Room-scoped Beta-Binomial Bayesian opponent profiler & RNR exploit planner. |
| `server/gtoIsomorphism.ts` | Suit isomorphism canonicalizer (`22,100 -> 1,755` flops), LRU cache, and safe external solver script/aggregator helpers. |
| `server/gtoSolver.ts` | 3-tier CPU GTO spot solver, Bayesian RNR Node-Lock service, and session EV leak auditor. |
| `server/personaAi.ts` | Dual-provider (Gemini / DeepSeek) 6-axis persona analyzer with lazy `@google/genai` loading. |
| `server/handReview.ts` | Street-by-street Hero decision grading and review report builder. |
| `src/shared/*` | Pure TypeScript domain logic shared by server & client (`pokerEngine.ts`, `handEvaluator.ts`, `gtoWorkbench.ts`, `playerInsights.ts`, `achievements.ts`). |
| `src/components/*` | React 19 UI components (3D/2D table, `HandReviewModal`, `GtoSpotInspector`, `RangeStrategyMatrix`, `PersonalCenterModal`, `EmailOtpModal`). |
| `UI_CONTRACT.md` | Stable REST & WebSocket contract for decoupled frontend/backend work. |
| `docs/GTO_EXPLOIT_ARCHITECTURE_SPEC.md` | Mathematical reference spec for EV Loss grading, MDF, geometric sizing, and Bayesian Node-Lock (flexible reference, not a rigid constraint). |

---

## 2. Prerequisites & Core Commands

- **Runtime**: Node.js `>= 22.5.0` (required for native `node:sqlite`) — **CPU only**.
- **Zero GPU Policy**: Never add GPU-only packages (CUDA, PyTorch, TensorRT) to `package.json`, `Dockerfile`, or CI workflows. Any external solver or model acceleration must be strictly optional and degrade cleanly to CPU Layer 1/2.

```bash
# Install dependencies
npm install

# Start unified dev server (Vite HMR + Express + WS on port 3000)
npm run dev

# TypeScript strict typecheck
npm run lint

# Run all 22 unit test suites (CPU-only, completes in ~2 seconds)
npm test

# Production build (Vite client + esbuild server -> dist/)
npm run build

# Run compiled production bundle
npm start
```

### Docker Compose (CPU-Only Production Build)

```bash
cp .env.example .env
docker compose up -d --build

# Optional fast mirror override for China networks:
NPM_REGISTRY=https://registry.npmmirror.com docker compose up -d --build

# Health probe
curl http://localhost:3000/api/health
```

> **Windows + WSL2 Note**: If Docker runs inside WSL2 and idle ports drop after commands exit, add `vmIdleTimeout=-1` under `[wsl2]` in `%USERPROFILE%\.wslconfig` or keep one WSL terminal window open.

---

## 3. Common Development Workflows

### Adding a New REST Endpoint
1. Prefer placing domain routes in a dedicated module under `server/http/` (`authRoutes.ts`, `gtoRoutes.ts`, or a new route register) rather than growing `server.ts`.
2. Protect every state-mutating or compute-heavy route with an appropriate `SlidingWindowRateLimiter` instance.
3. Never trust client-supplied win/loss/chip deltas for account persistence; derive authoritative changes from server-side `TableState`.
4. Document any public endpoint changes in `UI_CONTRACT.md` and add unit tests.

### Modifying Bot AI or Opponent Profiling
1. Keep `chooseBotAction` (`server/botAi.ts`) **pure, synchronous, and `< 5 ms` per decision** on CPU.
2. Always accept an injectable `rng: () => number` for deterministic testing.
3. Preserve RNR safety boundaries in `server/opponentProfiler.ts`: small samples must stay close to GTO via Beta-Binomial prior shrinkage rather than chasing noisy raw ratios.
4. Run `server/botAi.test.ts`, `server/opponentProfiler.test.ts`, and `server/gtoSolver.test.ts` after any strategy change.

### Modifying SQLite Persistence (`server/db.ts`)
1. Schema changes MUST be idempotent (`CREATE TABLE IF NOT EXISTS`, `ensureColumn(...)`) so existing `./data/velvet_holdem.sqlite` databases upgrade seamlessly on restart.
2. Never persist unrevealed opponent hole cards in `hand_history`.
3. Always use `persistCompletedHandRecord` / `resolveCompletedHandRecord` (`server/handPersistence.ts`) instead of indexing `handHistory[0]` directly.
4. Test with in-memory SQLite (`new HoldemDatabase({ dbPath: ':memory:' })`) for fast, isolated unit tests.

---

## 4. Security & Git Hygiene Rules

- **Never commit secrets or runtime artifacts**: `.env`, `data/`, `*.sqlite*`, `dist/`, `node_modules/`, and scratch/promo video build folders are excluded via `.gitignore`.
- **No Shell Interpolation**: Any optional subprocess invocation (e.g., `TEXASSOLVER_BIN`) must use `spawn(bin, args, { shell: false })` with strict regex validation on all inputs.
- **Lazy Optional SDK Imports**: Keep optional provider SDKs (such as `@google/genai` in `server/personaAi.ts`) dynamically imported inside the provider factory so unit tests and minimal runtimes stay decoupled.
- **Before Opening a PR or Cutting a Release**:
  1. `npm run lint` passes with zero errors.
  2. `npm test` passes 100% across all test suites.
  3. `npm run build` and Docker build succeed cleanly on CPU.
  4. Verify `GET /api/health` returns `{"ok":true,"persistence":"sqlite","botEngine":"gto-v3-rnr",...}`.
