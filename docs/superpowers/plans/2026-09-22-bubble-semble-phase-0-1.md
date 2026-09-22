# Bubble Semble Phase 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빈 `codersongpro/mathgame` 저장소를 Bubble Semble의 실행 가능한 모노레포로 구성하고, Vercel 웹 앱과 Cloudflare Durable Object를 연결해 태블릿에서 최대 10명이 같은 회색 상자 맵을 이동·점프·재접속할 수 있는 페이즈 1 기반을 완성한다.

**Architecture:** Next.js 안에 Phaser 게임 화면과 DOM 기반 로비·터치 HUD를 배치하고 Vercel에 배포한다. 방 코드 하나당 Cloudflare Durable Object 하나를 사용해 최대 10명의 WebSocket 연결과 권한형 플레이어 상태를 관리한다. 웹과 실시간 서버는 공통 Zod 메시지 스키마와 순수 게임 규칙 패키지를 공유한다.

**Tech Stack:** Node.js 24.x, pnpm 11.19.0, TypeScript, Next.js, React, Phaser 3, Zod, Vitest, Cloudflare Workers, Durable Objects, Wrangler, Playwright, GitHub, Vercel

**Spec:** `docs/superpowers/specs/2026-09-22-bubble-semble-design.md`

## Global Constraints

- 앱 이름은 모든 사용자 화면, 문서, 패키지 설명에서 `Bubble Semble`로 표기한다.
- GitHub 원격 저장소는 `https://github.com/codersongpro/mathgame`을 사용한다.
- `main`은 Vercel 프로덕션 브랜치이고 그 외 브랜치는 미리보기 배포 대상이다.
- 웹 앱과 일반 API는 Vercel, 실시간 방 서버는 Cloudflare Workers와 Durable Objects에 배포한다.
- 한 방의 학생 정원은 10명이며 교사는 페이즈 1에서 게임 플레이어로 접속하지 않는다.
- 서버 게임 루프는 초당 20회, 상태 스냅샷은 초당 10회 처리한다.
- 연결이 끊긴 플레이어 자리는 60초 동안 유지하고 동일 재접속 토큰에만 복구한다.
- 태블릿 가로 화면을 기본으로 하며 모든 터치 목표는 최소 64 CSS 픽셀이다.
- 페이즈 1은 임시 별명만 메모리에 유지하고 학급·PIN·영구 학생 계정을 만들지 않는다.
- 클라이언트가 보낸 위치를 신뢰하지 않고 방향·점프 입력만 검증해 서버에서 이동을 계산한다.
- SQL이 필요해지는 후속 페이즈에서는 `database/migrations/001_설명.sql` 형식만 사용한다.
- 비밀키, 배포 토큰, 데이터베이스 URL, 개인 데이터는 Git에 커밋하지 않는다.
- 페이즈 1에서는 거품 전투, 수학 문제, 몬스터, 보스, 성장 기록을 구현하지 않는다.

## Review Focus

- 11번째 플레이어가 입장하면 기존 10명의 상태를 바꾸지 않고 `ROOM_FULL` 오류를 반환해야 한다. Task 4 통합 테스트로 고정한다.
- 형식이 잘못되거나 너무 잦은 입력은 서버 상태에 반영하지 않고 연결별 속도 제한을 적용해야 한다. Task 5 단위·통합 테스트로 고정한다.
- 동일 재접속 토큰이 60초 안에 돌아오면 새 플레이어를 만들지 않고 기존 슬롯을 복구해야 한다. Task 4 테스트로 고정한다.
- 태블릿 회전·좁은 높이·브라우저 UI 변화에도 이동과 점프 버튼이 화면 밖으로 밀리지 않아야 한다. Task 7 Playwright 테스트로 고정한다.
- 실시간 서버가 내려가거나 URL이 틀리면 빈 화면이 아니라 재접속 상태와 명확한 오류를 표시해야 한다. Task 8 테스트로 고정한다.

---

## Planned File Structure

```text
mathgame/
  .github/
    workflows/
      verify.yml
  apps/
    web/
      src/
        app/
          globals.css
          layout.tsx
          page.tsx
          play/page.tsx
        components/
          GameShell.tsx
          LobbyForm.tsx
          ConnectionBanner.tsx
          TouchControls.tsx
        game/
          BubbleSembleScene.ts
          createGame.ts
          RemotePlayerView.ts
        realtime/
          GameSocket.ts
          useGameRoom.ts
      public/
        assets/characters/lumi/
      tests/
        lobby.test.tsx
        touch-controls.test.tsx
        game-socket.test.ts
      e2e/
        ten-player-room.spec.ts
        tablet-controls.spec.ts
      package.json
      next.config.ts
      playwright.config.ts
      vitest.config.ts
    realtime/
      src/
        index.ts
        GameRoom.ts
        rateLimit.ts
      test/
        game-room.test.ts
        worker.test.ts
      package.json
      vitest.config.ts
      wrangler.jsonc
  packages/
    shared/
      src/index.ts
      src/protocol.ts
      test/protocol.test.ts
      package.json
    game-core/
      src/index.ts
      src/mapTier.ts
      src/playerSimulation.ts
      src/roomRoster.ts
      test/mapTier.test.ts
      test/playerSimulation.test.ts
      test/roomRoster.test.ts
      package.json
  tools/
    load/
      ten-clients.ts
  docs/
    superpowers/specs/2026-09-22-bubble-semble-design.md
    superpowers/plans/2026-09-22-bubble-semble-phase-0-1.md
    assets/bubble-semble-graphics-prompts.md
  .env.example
  .gitignore
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
```

### Boundary Rules

- `packages/shared`는 네트워크 메시지 타입과 검증만 담당한다. Phaser, React, Cloudflare API를 가져오지 않는다.
- `packages/game-core`는 순수한 맵 선택, 플레이어 이동, 방 인원 규칙만 담당한다. 네트워크와 렌더링을 가져오지 않는다.
- `apps/realtime`은 Durable Object 연결과 권한형 상태를 담당하고 화면 코드를 가져오지 않는다.
- `apps/web`은 입력과 화면을 담당하며 위치·입장 정원·재접속 성공 여부를 자체 판정하지 않는다.

---

### Task 1: Create the Repository and Verified Workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/realtime/package.json`
- Create: `apps/realtime/tsconfig.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/game-core/package.json`
- Create: `packages/game-core/tsconfig.json`
- Copy: approved spec, plan, and graphics prompt into `docs/`

**Interfaces:**
- Consumes: 빈 GitHub 저장소 `https://github.com/codersongpro/mathgame`
- Produces: `pnpm.cmd test`, `pnpm.cmd typecheck`, `pnpm.cmd build`가 실행되는 Node.js 24 모노레포

- [ ] **Step 1: Clone the empty repository and create `main`**

Run from `C:\Users\user\Documents\Codex\2026-09-22\new-chat\work`:

```powershell
git clone https://github.com/codersongpro/mathgame.git mathgame
Set-Location -LiteralPath 'C:\Users\user\Documents\Codex\2026-09-22\new-chat\work\mathgame'
git switch -c main
```

Expected: Git reports an empty repository and creates local branch `main`.

- [ ] **Step 2: Create the root workspace manifests**

Create `package.json` with this complete content:

```json
{
  "name": "bubble-semble",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.19.0",
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:e2e": "pnpm --filter @bubble-semble/web test:e2e",
    "dev:web": "pnpm --filter @bubble-semble/web dev",
    "dev:realtime": "pnpm --filter @bubble-semble/realtime dev"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 3: Create ignore and environment templates**

Create `.gitignore`:

```gitignore
node_modules/
.next/
dist/
coverage/
test-results/
playwright-report/
.wrangler/
.vercel/
.env
.env.local
.dev.vars
.superpowers/
```

Create `.env.example`:

```dotenv
NEXT_PUBLIC_REALTIME_URL=ws://127.0.0.1:8787
REALTIME_RESULT_SIGNING_PUBLIC_KEY=
```

The empty signing key is intentional in the example file; real values belong only in deployment secret stores.

- [ ] **Step 4: Create the four package manifests and install only declared dependencies**

Create `packages/shared/package.json`:

```json
{
  "name": "@bubble-semble/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Create `packages/game-core/package.json`:

```json
{
  "name": "@bubble-semble/game-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Create `apps/web/package.json`:

```json
{
  "name": "@bubble-semble/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --hostname 127.0.0.1 --port 3000",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

Create `apps/realtime/package.json`:

```json
{
  "name": "@bubble-semble/realtime",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --ip 127.0.0.1 --port 8787",
    "build": "wrangler deploy --dry-run --outdir dist",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Create `packages/shared/tsconfig.json`, `packages/game-core/tsconfig.json`, and `apps/realtime/tsconfig.json` with this complete content:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "tests/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Then run these commands once:

```powershell
pnpm.cmd --filter @bubble-semble/shared add zod
pnpm.cmd --filter @bubble-semble/shared add -D typescript vitest
pnpm.cmd --filter @bubble-semble/game-core add -D typescript vitest
pnpm.cmd --filter @bubble-semble/web add next react react-dom phaser zod @bubble-semble/shared@workspace:* @bubble-semble/game-core@workspace:*
pnpm.cmd --filter @bubble-semble/web add -D typescript vitest jsdom @testing-library/react @testing-library/jest-dom @playwright/test
pnpm.cmd --filter @bubble-semble/realtime add zod @bubble-semble/shared@workspace:* @bubble-semble/game-core@workspace:*
pnpm.cmd --filter @bubble-semble/realtime add -D typescript vitest wrangler @cloudflare/workers-types @cloudflare/vitest-pool-workers
```

Expected: one `pnpm-lock.yaml` is created at the repository root. Do not install an additional package manager or create nested lockfiles.

- [ ] **Step 5: Copy the approved documents into the repository**

Copy these exact source files:

```text
C:\Users\user\Documents\Codex\2026-09-22\new-chat\docs\superpowers\specs\2026-09-22-bubble-semble-design.md
C:\Users\user\Documents\Codex\2026-09-22\new-chat\docs\superpowers\plans\2026-09-22-bubble-semble-phase-0-1.md
C:\Users\user\Documents\Codex\2026-09-22\new-chat\outputs\bubble-semble-graphics-prompts.md
```

Destination paths:

```text
docs/superpowers/specs/2026-09-22-bubble-semble-design.md
docs/superpowers/plans/2026-09-22-bubble-semble-phase-0-1.md
docs/assets/bubble-semble-graphics-prompts.md
```

- [ ] **Step 6: Add one smoke test per package and verify workspace scripts**

Each package gets a `test/smoke.test.ts` asserting its exported package name. Run:

```powershell
pnpm.cmd test
pnpm.cmd typecheck
```

Expected: four package smoke tests pass and all TypeScript checks pass.

- [ ] **Step 7: Commit and push the workspace baseline**

```powershell
git add .
git commit -m "chore: initialize Bubble Semble workspace"
git push -u origin main
```

Expected: `main` exists on GitHub and contains no secrets or generated build folders.

---

### Task 2: Lock the Bubble Semble Visual Seed

**Files:**
- Create: `apps/web/public/assets/characters/lumi/lumi-idle-seed.png`
- Create: `apps/web/public/assets/characters/lumi/lumi-idle-preview.png`
- Create: `docs/assets/lumi-seed-review.md`
- Test: visual inspection at 1×, 2×, and 4× integer scale

**Interfaces:**
- Consumes: `docs/assets/bubble-semble-graphics-prompts.md` section 5.1
- Produces: the approved 48×48 bottom-center-anchored Lumi seed used by later animation tasks

- [ ] **Step 1: Generate one Lumi candidate sheet**

Use the installed `imagegen` skill with the complete prompt from section 5.1 and the shared style-lock text. Generate one candidate sheet only; do not generate the other nine characters.

- [ ] **Step 2: Select and normalize the right-facing seed**

Crop the approved right-facing pose, preserve transparency, and normalize it to a 48×48 canvas with a bottom-center anchor. Save it as `lumi-idle-seed.png`.

- [ ] **Step 3: Render the integer-scale preview**

Create a preview containing the same seed at 48×48, 96×96, and 192×192 with nearest-neighbor scaling. Save it as `lumi-idle-preview.png`.

- [ ] **Step 4: Record the visual quality gate**

Create `docs/assets/lumi-seed-review.md` with checked results for silhouette readability, transparent background, palette count, bottom-center anchor, and originality. The document must record the exact SHA-256 of `lumi-idle-seed.png` so later animation tasks cannot silently replace the seed.

- [ ] **Step 5: Commit the approved visual seed**

```powershell
git add apps/web/public/assets/characters/lumi docs/assets/lumi-seed-review.md
git commit -m "art: approve Lumi visual seed"
```

---

### Task 3: Define and Validate the Shared Protocol

**Files:**
- Create: `packages/shared/src/protocol.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/test/protocol.test.ts`
- Modify: `packages/shared/package.json`

**Interfaces:**
- Consumes: no earlier runtime interface
- Produces: `ClientMessageSchema`, `ServerMessageSchema`, `ClientMessage`, `ServerMessage`, `RoomCodeSchema`, `NicknameSchema`

- [ ] **Step 1: Write failing protocol tests**

Tests must prove all of the following:

```typescript
import { describe, expect, it } from "vitest";
import { ClientMessageSchema, NicknameSchema, RoomCodeSchema } from "../src/protocol";

describe("공통 프로토콜", () => {
  it("허용된 방 코드와 별명을 승인한다", () => {
    expect(RoomCodeSchema.parse("B7K9Q2")).toBe("B7K9Q2");
    expect(NicknameSchema.parse("별빛토끼")).toBe("별빛토끼");
  });

  it("11자리를 넘거나 제어 문자가 있는 별명을 거절한다", () => {
    expect(() => NicknameSchema.parse("아주아주긴학생별명이에요")).toThrow();
    expect(() => NicknameSchema.parse("학생\u0000")).toThrow();
  });

  it("클라이언트가 보낸 위치값을 입력 메시지로 인정하지 않는다", () => {
    expect(() => ClientMessageSchema.parse({ type: "input", sequence: 1, axis: 1, jump: false, x: 9999 })).toThrow();
  });

  it("축 범위 밖 입력을 거절한다", () => {
    expect(() => ClientMessageSchema.parse({ type: "input", sequence: 1, axis: 2, jump: false })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

```powershell
pnpm.cmd --filter @bubble-semble/shared test
```

Expected: FAIL because `src/protocol.ts` does not exist.

- [ ] **Step 3: Implement the exact message families**

`ClientMessageSchema` must be a strict discriminated union containing:

```typescript
type ClientMessage =
  | { type: "join"; nickname: string; reconnectToken?: string }
  | { type: "input"; sequence: number; axis: -1 | 0 | 1; jump: boolean }
  | { type: "ping"; sentAt: number };
```

`ServerMessageSchema` must contain:

```typescript
type PublicPlayerState = {
  id: string;
  nickname: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  connected: boolean;
};

type ServerMessage =
  | { type: "joined"; playerId: string; reconnectToken: string; tickRate: 20; snapshotRate: 10 }
  | { type: "snapshot"; serverTick: number; mapTier: "small" | "medium" | "large" | "xlarge"; players: PublicPlayerState[] }
  | { type: "pong"; sentAt: number; serverAt: number }
  | { type: "error"; code: "INVALID_MESSAGE" | "INVALID_ROOM" | "ROOM_FULL" | "RATE_LIMITED"; message: string };
```

All Zod objects must use `.strict()` so unknown fields fail validation.

- [ ] **Step 4: Run shared tests and type checks**

```powershell
pnpm.cmd --filter @bubble-semble/shared test
pnpm.cmd --filter @bubble-semble/shared typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the protocol**

```powershell
git add packages/shared
git commit -m "feat: define multiplayer protocol"
```

---

### Task 4: Implement Pure Room, Map, and Movement Rules

**Files:**
- Create: `packages/game-core/src/mapTier.ts`
- Create: `packages/game-core/src/playerSimulation.ts`
- Create: `packages/game-core/src/roomRoster.ts`
- Create: `packages/game-core/src/index.ts`
- Create: `packages/game-core/test/mapTier.test.ts`
- Create: `packages/game-core/test/playerSimulation.test.ts`
- Create: `packages/game-core/test/roomRoster.test.ts`

**Interfaces:**
- Consumes: no network or rendering types; this package defines its own pure `PlayerSimulationState`
- Produces: `selectMapTier(count)`, `stepPlayer(state, input, deltaSeconds)`, `RoomRoster.join()`, `RoomRoster.disconnect()`, `RoomRoster.pruneExpired()`

- [ ] **Step 1: Write map-tier tests**

```typescript
expect(selectMapTier(1)).toBe("small");
expect(selectMapTier(2)).toBe("small");
expect(selectMapTier(3)).toBe("medium");
expect(selectMapTier(5)).toBe("medium");
expect(selectMapTier(6)).toBe("large");
expect(selectMapTier(8)).toBe("large");
expect(selectMapTier(9)).toBe("xlarge");
expect(selectMapTier(10)).toBe("xlarge");
expect(() => selectMapTier(0)).toThrow("playerCount");
expect(() => selectMapTier(11)).toThrow("playerCount");
```

- [ ] **Step 2: Write movement tests**

Use a fixed 50ms tick. Assert acceleration, maximum horizontal speed, gravity, floor collision, jump only while grounded, and that the supplied client state cannot overwrite `x` or `y`.

- [ ] **Step 3: Write roster capacity and reconnection tests**

Tests must join ten unique players, reject the eleventh with `ROOM_FULL`, disconnect one player, restore the same player ID with the same token at 59 seconds, and create a new slot after `pruneExpired()` at 61 seconds.

- [ ] **Step 4: Run tests and confirm missing implementations**

```powershell
pnpm.cmd --filter @bubble-semble/game-core test
```

Expected: FAIL for the missing exports.

- [ ] **Step 5: Implement minimal deterministic rules**

Use these constants in `playerSimulation.ts`:

```typescript
export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;
export const MOVE_ACCELERATION = 900;
export const MAX_MOVE_SPEED = 220;
export const GRAVITY = 1200;
export const JUMP_SPEED = 440;
export const FLOOR_Y = 480;
export const RECONNECT_GRACE_MS = 60_000;
export const ROOM_CAPACITY = 10;
```

The pure simulation must accept only the previous authoritative state, validated input, and `deltaSeconds`. It must return a new state without mutating the input object.

- [ ] **Step 6: Run tests and type checks**

```powershell
pnpm.cmd --filter @bubble-semble/game-core test
pnpm.cmd --filter @bubble-semble/game-core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the core rules**

```powershell
git add packages/game-core
git commit -m "feat: add authoritative room rules"
```

---

### Task 5: Build the Cloudflare Durable Object Room

**Files:**
- Create: `apps/realtime/src/index.ts`
- Create: `apps/realtime/src/GameRoom.ts`
- Create: `apps/realtime/src/rateLimit.ts`
- Create: `apps/realtime/test/game-room.test.ts`
- Create: `apps/realtime/test/worker.test.ts`
- Create: `apps/realtime/vitest.config.ts`
- Create: `apps/realtime/wrangler.jsonc`

**Interfaces:**
- Consumes: shared protocol schemas and game-core rules
- Produces: `GET /room/:sixCharacterCode` WebSocket upgrade endpoint and one `GameRoom` Durable Object per normalized room code

- [ ] **Step 1: Write Worker routing tests**

Tests must verify:

- `/room/B7K9Q2` with WebSocket upgrade reaches a Durable Object.
- lowercase room codes normalize to uppercase.
- invalid codes such as `ABC`, `ABC-12`, and `OOOOOO` return HTTP 400 JSON with `INVALID_ROOM`.
- ordinary HTTP GET without WebSocket upgrade returns HTTP 426.

- [ ] **Step 2: Write room integration tests**

Open ten WebSockets, send ten valid `join` messages, and assert ten unique `joined` responses. Open an eleventh socket and assert `ROOM_FULL`. Send an input containing an unknown `x` field and assert `INVALID_MESSAGE` with no changed snapshot position.

- [ ] **Step 3: Implement connection-local rate limiting**

`rateLimit.ts` must export `InputRateLimiter` with a 1-second sliding window, 30 input messages per second, and a 5-second penalty after the threshold. Pings do not count as movement inputs. A rate-limited input returns `RATE_LIMITED` and does not enter the simulation queue.

- [ ] **Step 4: Implement the Worker router and GameRoom skeleton**

`index.ts` normalizes and validates the room code, derives `env.GAME_ROOM.idFromName(roomCode)`, and forwards the request. `GameRoom.fetch()` creates the WebSocket pair, accepts the server socket, stores connection metadata, and waits for a valid `join` before accepting input.

- [ ] **Step 5: Implement the authoritative loop**

- Run one 50ms simulation step while the room has connected players.
- Broadcast a snapshot every second simulation step.
- Sort public players by stable player ID before serializing snapshots.
- Stop the timer when no connected players remain.
- Persist checkpoint state when a player disconnects and before the room becomes empty.

- [ ] **Step 6: Configure Durable Objects**

`wrangler.jsonc` must name the worker `bubble-semble-realtime`, set `"compatibility_date": "2026-09-22"`, bind `GAME_ROOM`, and include a first migration creating the `GameRoom` class. Do not place account IDs or tokens in this file.

- [ ] **Step 7: Run targeted realtime tests**

```powershell
pnpm.cmd --filter @bubble-semble/realtime test
pnpm.cmd --filter @bubble-semble/realtime typecheck
```

Expected: all routing, ten-player, invalid-message, rate-limit, and reconnection tests pass.

- [ ] **Step 8: Commit the realtime room**

```powershell
git add apps/realtime
git commit -m "feat: add ten-player Durable Object room"
```

---

### Task 6: Build the Vercel Lobby and WebSocket Client

**Files:**
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/LobbyForm.tsx`
- Create: `apps/web/src/components/ConnectionBanner.tsx`
- Create: `apps/web/src/realtime/GameSocket.ts`
- Create: `apps/web/src/realtime/useGameRoom.ts`
- Create: `apps/web/tests/lobby.test.tsx`
- Create: `apps/web/tests/game-socket.test.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_REALTIME_URL`, shared client/server messages
- Produces: validated lobby navigation and `GameSocket` methods `connect()`, `sendInput()`, `disconnect()`, `subscribe()`

- [ ] **Step 1: Write failing lobby tests**

Tests must verify that the Bubble Semble title is visible, room code is uppercased, a 2–12 character nickname is required, invalid values show Korean inline errors, and valid submission navigates to `/play?room=B7K9Q2&nickname=별빛토끼`.

- [ ] **Step 2: Write failing GameSocket tests with a fake WebSocket**

Assert that `join` is the first message after open, only schema-valid server messages reach subscribers, reconnect uses exponential delays of 1s, 2s, 4s, 8s, and at most 30s, and `disconnect()` cancels reconnection.

- [ ] **Step 3: Implement the accessible lobby**

Use native labels, inputs, and a submit button. Do not store the nickname in localStorage. Put only the reconnect token in sessionStorage after the server returns `joined`.

- [ ] **Step 4: Implement GameSocket and connection banner states**

Supported states are `connecting`, `online`, `reconnecting`, and `offline`. The banner must announce changes through `aria-live="polite"` and retain the last visible snapshot while reconnecting.

- [ ] **Step 5: Run lobby and socket tests**

```powershell
pnpm.cmd --filter @bubble-semble/web test -- lobby.test.tsx game-socket.test.ts
pnpm.cmd --filter @bubble-semble/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the lobby and client**

```powershell
git add apps/web
git commit -m "feat: add room lobby and realtime client"
```

---

### Task 7: Add the Phaser Graybox, Touch Controls, and Camera

**Files:**
- Create: `apps/web/src/app/play/page.tsx`
- Create: `apps/web/src/components/GameShell.tsx`
- Create: `apps/web/src/components/TouchControls.tsx`
- Create: `apps/web/src/game/BubbleSembleScene.ts`
- Create: `apps/web/src/game/createGame.ts`
- Create: `apps/web/src/game/RemotePlayerView.ts`
- Create: `apps/web/tests/touch-controls.test.tsx`
- Create: `apps/web/e2e/tablet-controls.spec.ts`

**Interfaces:**
- Consumes: `GameSocket` snapshots and `sendInput({ sequence, axis, jump })`
- Produces: landscape Phaser scene with local camera, remote player interpolation, and DOM touch controls

- [ ] **Step 1: Write touch-control component tests**

Assert pointer-down and pointer-up produce axis `-1`, `0`, and `1`; simultaneous direction and jump are supported; controls have Korean accessible names; and every button computes to at least 64×64 CSS pixels.

- [ ] **Step 2: Implement TouchControls**

Use Pointer Events and pointer capture so sliding a finger off a button releases it. Prevent browser text selection and long-press context menus only inside the control surface, not globally.

- [ ] **Step 3: Implement one Phaser scene**

The scene must render:

- a dark navy 16:9 background,
- a floor at authoritative `FLOOR_Y`,
- simple colored rectangular platforms,
- Lumi using `lumi-idle-seed.png` for the local player,
- solid-color temporary sprites for the remaining players,
- no monsters, bubbles, quizzes, or boss objects.

- [ ] **Step 4: Implement local and remote state rendering**

The local player sends direction and jump input but uses server snapshots as the authority. Remote players interpolate between the two latest snapshots. The camera follows the local player and clamps to the selected map bounds.

- [ ] **Step 5: Write Playwright tablet tests**

Use a 1024×600 landscape viewport. Assert the game canvas, both direction buttons, and jump button are visible without page scrolling. Repeat at 800×600 and after swapping viewport width and height, then returning to landscape.

- [ ] **Step 6: Run targeted tests**

```powershell
pnpm.cmd --filter @bubble-semble/web test -- touch-controls.test.tsx
pnpm.cmd --filter @bubble-semble/web test:e2e -- tablet-controls.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the playable graybox**

```powershell
git add apps/web
git commit -m "feat: add tablet graybox controls"
```

---

### Task 8: Add Reconnection and Player-Count Map Tiers

**Files:**
- Modify: `apps/realtime/src/GameRoom.ts`
- Modify: `apps/web/src/realtime/useGameRoom.ts`
- Modify: `apps/web/src/game/BubbleSembleScene.ts`
- Modify: `apps/web/src/components/ConnectionBanner.tsx`
- Create: `apps/web/tests/reconnection.test.tsx`
- Modify: `apps/realtime/test/game-room.test.ts`

**Interfaces:**
- Consumes: `RoomRoster`, `selectMapTier()`, reconnect token, snapshot `mapTier`
- Produces: stable slot restoration and four map bounds selected before gameplay begins

- [ ] **Step 1: Add failing server reconnection tests**

Disconnect a joined client, advance fake time by 59 seconds, reconnect with the token, and assert the same player ID and last authoritative position. Repeat at 61 seconds after pruning and assert a new player ID.

- [ ] **Step 2: Add failing map-tier tests at the room boundary**

Assert room start selects small for 1–2, medium for 3–5, large for 6–8, and xlarge for 9–10 players. Assert the tier does not change after gameplay begins even if a player leaves.

- [ ] **Step 3: Implement reconnect and fixed map selection**

Store only the token, player ID, nickname, last state, disconnect time, and room phase needed for recovery. Never accept a nickname match as proof of identity.

- [ ] **Step 4: Implement client reconnect UX**

Show `연결을 다시 시도하고 있어요` while retaining the last frame. After 60 seconds, show `방에 다시 참여해 주세요` and return to the lobby only when the user presses the provided button.

- [ ] **Step 5: Run targeted tests**

```powershell
pnpm.cmd --filter @bubble-semble/realtime test -- game-room.test.ts
pnpm.cmd --filter @bubble-semble/web test -- reconnection.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit reconnection and map scaling**

```powershell
git add apps/realtime apps/web
git commit -m "feat: restore players and scale map tiers"
```

---

### Task 9: Verify Ten Players End to End

**Files:**
- Create: `tools/load/ten-clients.ts`
- Create: `apps/web/e2e/ten-player-room.spec.ts`
- Modify: root `package.json`

**Interfaces:**
- Consumes: local web URL and local realtime WebSocket URL
- Produces: repeatable ten-client capacity and browser acceptance checks

- [ ] **Step 1: Implement the ten-client load helper**

The script opens ten WebSockets, joins with deterministic nicknames `학생01` through `학생10`, waits for snapshots containing ten unique players, sends alternating left/right input for 20 seconds, and exits nonzero if any client misses snapshots for more than two seconds.

- [ ] **Step 2: Assert the eleventh client is rejected**

The same script opens an eleventh socket named `학생11`, expects `ROOM_FULL`, and confirms the next snapshot still contains exactly ten players.

- [ ] **Step 3: Implement the browser acceptance test**

Playwright opens two visible tablet contexts and eight background contexts in the same room. It verifies each context sees a roster count of 10 and that moving `학생01` changes that player on another context without moving the observer.

- [ ] **Step 4: Reuse local servers according to project rules**

Probe the configured localhost URLs before starting servers. If available, reuse them. Otherwise start the package-standard commands once and keep absolute log paths under `work/logs`.

- [ ] **Step 5: Run the smallest complete Phase 1 verification**

```powershell
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd --filter @bubble-semble/web build
pnpm.cmd --filter @bubble-semble/realtime build
pnpm.cmd test:e2e
```

Expected: all tests pass; ten players remain synchronized; the eleventh is rejected.

- [ ] **Step 6: Commit the acceptance harness**

```powershell
git add tools apps/web/e2e package.json
git commit -m "test: verify ten-player room"
```

---

### Task 10: Add CI and Preview Deployment Gates

**Files:**
- Create: `.github/workflows/verify.yml`
- Modify: `apps/realtime/wrangler.jsonc`
- Create: `docs/deployment.md`

**Interfaces:**
- Consumes: repository scripts and Vercel/Cloudflare project configuration
- Produces: pull-request verification, Vercel preview, Cloudflare preview, and documented rollback path

- [ ] **Step 1: Add GitHub verification workflow**

The workflow must use Node.js 24, enable the pnpm version declared in `package.json`, install with `--frozen-lockfile`, and run `pnpm test`, `pnpm typecheck`, and both builds. It must not contain deployment tokens in YAML.

- [ ] **Step 2: Connect `apps/web` to Vercel**

Import `codersongpro/mathgame`, set Root Directory to `apps/web`, use `main` as Production Branch, and set `NEXT_PUBLIC_REALTIME_URL` separately for Preview and Production. This is an account-changing step and must be performed only with the user's active authorization and authenticated Vercel session.

- [ ] **Step 3: Configure Cloudflare preview and production environments**

Use separate worker names and Durable Object namespaces for preview and production. Store account credentials only in GitHub or Cloudflare secrets. The preview URL must be written into the Vercel Preview environment variable.

- [ ] **Step 4: Document deployment and rollback**

`docs/deployment.md` must state:

- branch-to-environment mapping,
- required secret names without values,
- the order `test → build → realtime preview → web preview → browser verification → merge`,
- Vercel rollback to the previous deployment,
- Cloudflare rollback to the previous worker version,
- a warning not to mix preview web with production realtime rooms.

- [ ] **Step 5: Verify the first previews**

Push a feature branch, confirm the GitHub verification workflow succeeds, open the Vercel Preview URL, and run the 10-client test against the Cloudflare Preview endpoint.

- [ ] **Step 6: Commit deployment documentation**

```powershell
git add .github apps/realtime/wrangler.jsonc docs/deployment.md
git commit -m "ci: add preview deployment gates"
git push
```

---

## Final Phase 0–1 Acceptance

- [ ] `Bubble Semble` is the only product name in user-visible code and current docs.
- [ ] GitHub `main` contains the monorepo, lockfile, spec, plan, and approved Lumi seed.
- [ ] Vercel Preview renders the lobby and tablet game screen.
- [ ] Cloudflare Preview creates one Durable Object per room code.
- [ ] Ten clients join, move, jump, disconnect, and reconnect in one shared room.
- [ ] The eleventh client receives `ROOM_FULL` without affecting the room.
- [ ] Client position injection and malformed messages are rejected.
- [ ] Touch controls remain visible at the tested tablet viewports.
- [ ] No account, PIN, database, math problem, combat, or boss scope leaked into Phase 1.
- [ ] All targeted tests, type checks, builds, and representative browser checks pass.

## Phase 2 Entry Gate

Do not start bubble combat or math questions until every Phase 0–1 acceptance item passes and the user confirms the shared-room movement feels correct on an actual tablet.
