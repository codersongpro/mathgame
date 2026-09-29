import { env } from "cloudflare:workers";
import { ServerMessageSchema, type ServerMessage } from "@bubble-semble/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InputRateLimiter } from "../src/rateLimit";

const createdRooms = new Set<string>();
const testTeacherToken = "a".repeat(64);

async function createTestRoom(roomName: string, settings: unknown = {}): Promise<void> {
  if (createdRooms.has(roomName)) return;
  const id = env.GAME_ROOM.idFromName(roomName);
  const response = await env.GAME_ROOM.get(id).fetch("https://room.internal/internal/create", {
    method: "POST",
    headers: { "X-Teacher-Token": testTeacherToken },
    body: JSON.stringify({ settings }),
  });
  expect(response.status).toBe(201);
  createdRooms.add(roomName);
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
  label = "WebSocket",
  timeoutMs = 2_000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`${label} 응답 시간이 초과됐습니다.`));
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      const parsed = ServerMessageSchema.safeParse(JSON.parse(String(event.data)));
      if (!parsed.success || !predicate(parsed.data)) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(parsed.data);
    }

    socket.addEventListener("message", onMessage);
  });
}

async function openSocket(roomName: string): Promise<WebSocket> {
  await createTestRoom(roomName);
  const id = env.GAME_ROOM.idFromName(roomName);
  const response = await env.GAME_ROOM.get(id).fetch("https://room.internal", {
    headers: { Upgrade: "websocket" },
  });
  if (!response.webSocket) throw new Error("WebSocket 업그레이드에 실패했습니다.");
  response.webSocket.accept();
  return response.webSocket;
}

async function joinSocket(roomName: string, nickname: string, reconnectToken?: string) {
  const socket = await openSocket(roomName);
  const joinedMessage = waitForMessage(socket, (message) => message.type === "joined");
  const questionMessage = waitForMessage(socket, (message) => message.type === "question");
  const stageMessage = waitForMessage(socket, (message) => message.type === "stage");
  socket.send(
    JSON.stringify({
      type: "join",
      nickname,
      ...(reconnectToken ? { reconnectToken } : {}),
    }),
  );
  const joined = await joinedMessage;
  const question = await questionMessage;
  const stage = await stageMessage;
  if (joined.type !== "joined") throw new Error("입장 응답이 아닙니다.");
  if (question.type !== "question") throw new Error("개인 문제가 아닙니다.");
  if (stage.type !== "stage") throw new Error("스테이지 상태가 아닙니다.");
  return { socket, joined, question, stage };
}

function answerFromPrompt(prompt: string): number {
  // 기본 1학년 문제에는 계산식뿐 아니라 네 수의 크기 비교도 나옵니다.
  const comparison = prompt.match(/^(\d+), (\d+), (\d+), (\d+) 중 가장 (큰|작은) 수는\?$/);
  if (comparison) {
    const numbers = comparison.slice(1, 5).map(Number);
    return comparison[5] === "큰" ? Math.max(...numbers) : Math.min(...numbers);
  }
  const [left, operation, right] = prompt.split(" ");
  return operation === "+" ? Number(left) + Number(right) : Number(left) - Number(right);
}

afterEach(() => vi.restoreAllMocks());

describe("GameRoom", () => {
  it("교사의 2학년 선택을 학생 문제와 정답 판정에 적용한다", async () => {
    const roomName = `grade-two-${crypto.randomUUID()}`;
    await createTestRoom(roomName, { grade: 2 });
    const player = await joinSocket(roomName, "학생1");
    try {
      const [left, operation, right] = player.question.prompt.split(" ");
      expect(["+", "−"]).toContain(operation);
      const answer = answerFromPrompt(player.question.prompt);
      expect(answer).toBeGreaterThanOrEqual(0);
      expect(answer).toBeLessThanOrEqual(100);
      expect(player.question.choices).toContain(answer);
      expect(Number(left)).toBeLessThanOrEqual(100);
      expect(Number(right)).toBeLessThanOrEqual(100);
      const feedback = waitForMessage(player.socket, (message) =>
        message.type === "quiz-feedback" && message.questionId === player.question.questionId);
      player.socket.send(JSON.stringify({
        type: "answer", questionId: player.question.questionId, choice: answer,
      }));
      await expect(feedback).resolves.toMatchObject({ correct: true, solvedCount: 1 });

      const room = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomName));
      const monitor = await room.fetch("https://room.internal/internal/status", {
        headers: { Authorization: `Bearer ${testTeacherToken}` },
      });
      expect(await monitor.json()).toMatchObject({ settings: { grade: 2 } });
    } finally {
      player.socket.close(1000, "test complete");
    }
  });

  it.each([3, 4] as const)("교사의 %i학년 선택을 큰 수 문제와 서버 판정에 적용한다", async (grade) => {
    const roomName = `grade-${grade}-${crypto.randomUUID()}`;
    await createTestRoom(roomName, { grade });
    const player = await joinSocket(roomName, "학생1");
    try {
      const answer = answerFromPrompt(player.question.prompt);
      expect(player.question.choices).toContain(answer);
      expect(answer).toBeGreaterThanOrEqual(0);
      expect(answer).toBeLessThanOrEqual(grade === 3 ? 1_000 : 10_000);
      const feedback = waitForMessage(player.socket, (message) =>
        message.type === "quiz-feedback" && message.questionId === player.question.questionId);
      player.socket.send(JSON.stringify({
        type: "answer", questionId: player.question.questionId, choice: answer,
      }));
      await expect(feedback).resolves.toMatchObject({ correct: true, solvedCount: 1 });
    } finally {
      player.socket.close(1000, "test complete");
    }
  });

  it.each([5, 6] as const)("교사의 %i학년 선택으로 두 개념 문항을 풀 수 있다", async (grade) => {
    const roomName = `grade-${grade}-${crypto.randomUUID()}`;
    await createTestRoom(roomName, { grade });
    const player = await joinSocket(roomName, "학생1");
    try {
      const firstNumbers = Array.from(player.question.prompt.matchAll(/\d+/g), (match) => Number(match[0]));
      const firstAnswer = grade === 5
        ? (firstNumbers[0]! + firstNumbers[1]! + firstNumbers[2]!) / 3
        : firstNumbers[0]! * firstNumbers[1]! / 100;
      const rejected = waitForMessage(player.socket, (message) =>
        message.type === "error" && message.code === "INVALID_MESSAGE");
      player.socket.send(JSON.stringify({
        type: "answer", questionId: player.question.questionId, choice: 9_999,
      }));
      await expect(rejected).resolves.toMatchObject({ code: "INVALID_MESSAGE" });
      const firstFeedback = waitForMessage(player.socket, (message) =>
        message.type === "quiz-feedback" && message.questionId === player.question.questionId);
      player.socket.send(JSON.stringify({
        type: "answer", questionId: player.question.questionId, choice: firstAnswer,
      }));
      await expect(firstFeedback).resolves.toMatchObject({ correct: true, solvedCount: 1 });

      const nextQuestion = waitForMessage(player.socket, (message) =>
        message.type === "question" && message.questionId !== player.question.questionId);
      player.socket.send(JSON.stringify({ type: "next-question" }));
      const next = await nextQuestion;
      if (next.type !== "question") throw new Error("두 번째 문제가 아닙니다.");
      expect(next.prompt).toMatch(grade === 5 ? /직사각형 넓이\(cm²\)는\?$/ : /부피\(cm³\)는\?$/);
      const dimensions = Array.from(next.prompt.matchAll(/\d+/g), (match) => Number(match[0]))
        .slice(0, grade === 5 ? 2 : 3);
      const secondAnswer = dimensions.reduce((product, value) => product * value, 1);
      const secondFeedback = waitForMessage(player.socket, (message) =>
        message.type === "quiz-feedback" && message.questionId === next.questionId);
      player.socket.send(JSON.stringify({ type: "answer", questionId: next.questionId, choice: secondAnswer }));
      await expect(secondFeedback).resolves.toMatchObject({ correct: true, solvedCount: 2 });
    } finally {
      player.socket.close(1000, "test complete");
    }
  });

  it("교사가 선택한 단의 곱셈만 개인 문제로 내고 정답을 서버에서 판정한다", async () => {
    const roomName = `multiplication-${crypto.randomUUID()}`;
    await createTestRoom(roomName, { multiplicationTables: [7, 19] });
    const player = await joinSocket(roomName, "학생1");
    try {
      const [table, operation, factor] = player.question.prompt.split(" ");
      expect([7, 19]).toContain(Number(table));
      expect(operation).toBe("×");
      const answer = Number(table) * Number(factor);
      expect(player.question.choices).toContain(answer);
      const feedback = waitForMessage(player.socket, (message) =>
        message.type === "quiz-feedback" && message.questionId === player.question.questionId);
      player.socket.send(JSON.stringify({
        type: "answer", questionId: player.question.questionId, choice: answer,
      }));
      await expect(feedback).resolves.toMatchObject({ correct: true, solvedCount: 1 });

      const room = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomName));
      const monitor = await room.fetch("https://room.internal/internal/status", {
        headers: { Authorization: `Bearer ${testTeacherToken}` },
      });
      expect(await monitor.json()).toMatchObject({ settings: { multiplicationTables: [7, 19] } });
    } finally {
      player.socket.close(1000, "test complete");
    }
  });

  it("나눗셈 옵션을 켜면 두 번째 개인 문제는 나누어떨어지는 식이 된다", async () => {
    const roomName = `division-${crypto.randomUUID()}`;
    await createTestRoom(roomName, { multiplicationTables: [7], divisionEnabled: true });
    const first = await joinSocket(roomName, "학생1");
    const second = await joinSocket(roomName, "학생2");
    try {
      expect(first.question.prompt).toMatch(/^7 × \d+ = \?$/);
      const [dividend, operation, divisor] = second.question.prompt.split(" ");
      expect(operation).toBe("÷");
      expect(Number(divisor)).toBe(7);
      const answer = Number(dividend) / Number(divisor);
      expect(Number.isInteger(answer)).toBe(true);
      const feedback = waitForMessage(second.socket, (message) =>
        message.type === "quiz-feedback" && message.questionId === second.question.questionId);
      second.socket.send(JSON.stringify({
        type: "answer", questionId: second.question.questionId, choice: answer,
      }));
      await expect(feedback).resolves.toMatchObject({ correct: true, solvedCount: 1 });
    } finally {
      first.socket.close(1000, "test complete");
      second.socket.close(1000, "test complete");
    }
  });

  it("참가 인원으로 첫 스테이지 팀 목표를 고정하고 정답을 팀 진행도에 반영한다", async () => {
    const roomName = `stage-goals-${crypto.randomUUID()}`;
    const first = await joinSocket(roomName, "학생1");
    const second = await joinSocket(roomName, "학생2");
    const third = await joinSocket(roomName, "학생3");
    try {
      expect(third.stage).toMatchObject({ status: "waiting", captureGoal: 2, questionGoal: 4 });
      const active = waitForMessage(first.socket, (message) => message.type === "stage" && message.status === "active");
      first.socket.send(JSON.stringify({ type: "input", sequence: 1, axis: 0, jump: false }));
      await expect(active).resolves.toMatchObject({ captureGoal: 2, questionGoal: 4, targetSeconds: 120 });

      const progress = waitForMessage(first.socket, (message) => message.type === "stage" && message.solvedCount === 1);
      first.socket.send(JSON.stringify({
        type: "answer", questionId: first.question.questionId,
        choice: answerFromPrompt(first.question.prompt),
      }));
      await expect(progress).resolves.toMatchObject({ status: "active", solvedCount: 1, questionGoal: 4 });

      const room = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomName));
      const monitor = await room.fetch("https://room.internal/internal/status", {
        headers: { Authorization: `Bearer ${testTeacherToken}` },
      });
      expect(await monitor.json()).toMatchObject({
        stage: { status: "active", solvedCount: 1, captureGoal: 2, questionGoal: 4 },
      });
    } finally {
      first.socket.close(1000, "test complete");
      second.socket.close(1000, "test complete");
      third.socket.close(1000, "test complete");
    }
  });

  it("솔로 방도 거품 포획 1회와 정답 2개를 채우면 첫 스테이지를 클리어한다", async () => {
    const roomName = `stage-clear-${crypto.randomUUID()}`;
    await createTestRoom(roomName, { stage1: { targetScore: 40, clearMode: "either" } });
    const player = await joinSocket(roomName, "학생1");
    try {
      const nearMonster = waitForMessage(player.socket, (message) =>
        message.type === "snapshot" &&
        (message.players.find((item) => item.id === player.joined.playerId)?.x ?? 0) > 285,
      );
      player.socket.send(JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false }));
      await nearMonster;
      const stopped = waitForMessage(player.socket, (message) =>
        message.type === "snapshot" &&
        message.players.find((item) => item.id === player.joined.playerId)?.velocityX === 0,
      );
      player.socket.send(JSON.stringify({ type: "input", sequence: 2, axis: 0, jump: false }));
      await stopped;

      const trapped = waitForMessage(player.socket, (message) =>
        message.type === "combat" && message.bubbles.some((bubble) => bubble.trappedMonsterId !== null),
      );
      player.socket.send(JSON.stringify({ type: "action", sequence: 1, kind: "fire", direction: 1 }));
      const trappedState = await trapped;
      if (trappedState.type !== "combat") throw new Error("포획 상태가 아닙니다.");
      const bubbleX = trappedState.bubbles.find((bubble) => bubble.trappedMonsterId)?.x;
      if (bubbleX === undefined) throw new Error("포획 거품이 없습니다.");
      const current = await waitForMessage(player.socket, (message) => message.type === "snapshot");
      if (current.type !== "snapshot") throw new Error("위치 상태가 아닙니다.");
      const playerX = current.players.find((item) => item.id === player.joined.playerId)?.x ?? 0;
      if (Math.abs(playerX - bubbleX) > 50) {
        const direction = playerX < bubbleX ? 1 : -1;
        const close = waitForMessage(player.socket, (message) =>
          message.type === "snapshot" &&
          Math.abs((message.players.find((item) => item.id === player.joined.playerId)?.x ?? 0) - bubbleX) <= 50,
        );
        player.socket.send(JSON.stringify({ type: "input", sequence: 3, axis: direction, jump: false }));
        await close;
        player.socket.send(JSON.stringify({ type: "input", sequence: 4, axis: 0, jump: false }));
      }

      const captured = waitForMessage(player.socket, (message) => message.type === "stage" && message.capturedCount === 1);
      player.socket.send(JSON.stringify({ type: "action", sequence: 2, kind: "pop", direction: 1 }));
      await expect(captured).resolves.toMatchObject({ status: "active", captureGoal: 1 });

      const firstFeedback = waitForMessage(player.socket, (message) => message.type === "quiz-feedback" && message.correct);
      player.socket.send(JSON.stringify({ type: "answer", questionId: player.question.questionId, choice: answerFromPrompt(player.question.prompt) }));
      await firstFeedback;
      const secondQuestion = waitForMessage(player.socket, (message) => message.type === "question");
      player.socket.send(JSON.stringify({ type: "next-question" }));
      const next = await secondQuestion;
      if (next.type !== "question") throw new Error("다음 문제가 아닙니다.");
      const cleared = waitForMessage(player.socket, (message) => message.type === "stage" && message.status === "cleared");
      player.socket.send(JSON.stringify({ type: "answer", questionId: next.questionId, choice: answerFromPrompt(next.prompt) }));
      await expect(cleared).resolves.toMatchObject({
        stage: 1, capturedCount: 1, captureGoal: 1, solvedCount: 2, questionGoal: 2,
        score: 40, targetScore: 40, clearMode: "either",
      });
    } finally {
      player.socket.close(1000, "test complete");
    }
  });

  it("목표 점수를 채우면 두 학생에게 클리어와 다음 스테이지를 함께 전송한다", async () => {
    const roomName = `stage-two-${crypto.randomUUID()}`;
    await createTestRoom(roomName, {
      stage1: { targetScore: 10, clearMode: "either" },
      stage2: { targetSeconds: 180, targetScore: 200, clearMode: "both" },
    });
    const first = await joinSocket(roomName, "학생1");
    const second = await joinSocket(roomName, "학생2");
    try {
      const firstClear = waitForMessage(first.socket, (message) => message.type === "stage" && message.stage === 1 && message.status === "cleared");
      const secondClear = waitForMessage(second.socket, (message) => message.type === "stage" && message.stage === 1 && message.status === "cleared");
      const firstNext = waitForMessage(first.socket, (message) => message.type === "stage" && message.stage === 2, "첫 학생 2스테이지", 6_000);
      const secondNext = waitForMessage(second.socket, (message) => message.type === "stage" && message.stage === 2, "둘째 학생 2스테이지", 6_000);
      first.socket.send(JSON.stringify({
        type: "answer", questionId: first.question.questionId,
        choice: answerFromPrompt(first.question.prompt),
      }));
      await Promise.all([firstClear, secondClear]);
      const [one, two] = await Promise.all([firstNext, secondNext]);
      expect(one).toMatchObject({ status: "active", stage: 2, score: 0, targetSeconds: 180, targetScore: 200 });
      expect(two).toMatchObject({ status: "active", stage: 2, score: 0, targetSeconds: 180, targetScore: 200 });
    } finally {
      first.socket.close(1000, "test complete");
      second.socket.close(1000, "test complete");
    }
  }, 10_000);

  it("두 학생이 세 번째 관문을 클리어하면 같은 보스전에 입장한다", async () => {
    const roomName = `stage-three-${crypto.randomUUID()}`;
    await createTestRoom(roomName, {
      stage1: { targetScore: 10, clearMode: "either" },
      stage2: { targetScore: 10, clearMode: "either" },
      stage3: { targetScore: 10, clearMode: "either" },
    });
    const first = await joinSocket(roomName, "학생1");
    const second = await joinSocket(roomName, "학생2");
    try {
      const secondQuestion = waitForMessage(first.socket, (message) => message.type === "question", "2단계 문제", 6_000);
      const secondStage = waitForMessage(second.socket, (message) => message.type === "stage" && message.stage === 2, "2단계 전환", 6_000);
      first.socket.send(JSON.stringify({
        type: "answer", questionId: first.question.questionId,
        choice: answerFromPrompt(first.question.prompt),
      }));
      const question2 = await secondQuestion;
      await secondStage;
      if (question2.type !== "question") throw new Error("2단계 문제가 없습니다.");

      const thirdQuestion = waitForMessage(first.socket, (message) => message.type === "question" && message.questionId !== question2.questionId, "3단계 문제", 6_000);
      const firstThird = waitForMessage(first.socket, (message) => message.type === "stage" && message.stage === 3, "첫 학생 3단계", 6_000);
      const secondThird = waitForMessage(second.socket, (message) => message.type === "stage" && message.stage === 3, "둘째 학생 3단계", 6_000);
      first.socket.send(JSON.stringify({
        type: "answer", questionId: question2.questionId,
        choice: answerFromPrompt(question2.prompt),
      }));
      const question3 = await thirdQuestion;
      const [one, two] = await Promise.all([firstThird, secondThird]);
      expect(one).toMatchObject({ stage: 3, status: "active", targetSeconds: 90, targetScore: 10 });
      expect(two).toMatchObject({ stage: 3, status: "active" });
      expect(question3.type).toBe("question");
      if (question3.type !== "question") throw new Error("3단계 문제가 없습니다.");

      const monsters = await waitForMessage(first.socket, (message) =>
        message.type === "combat" && message.monsters.length === 4);
      expect(monsters.type).toBe("combat");
      const firstGateQuestion = waitForMessage(first.socket, (message) => message.type === "gate-question");
      const secondGateQuestion = waitForMessage(second.socket, (message) => message.type === "gate-question");
      const opened = waitForMessage(second.socket, (message) =>
        message.type === "gate-state" && message.status === "active");
      const cleared = waitForMessage(second.socket, (message) =>
        message.type === "stage" && message.stage === 3 && message.status === "cleared");
      first.socket.send(JSON.stringify({
        type: "answer", questionId: question3.questionId,
        choice: answerFromPrompt(question3.prompt),
      }));
      const [firstPiece, secondPiece] = await Promise.all([firstGateQuestion, secondGateQuestion]);
      await expect(opened).resolves.toMatchObject({ required: 2, solved: 0 });
      if (firstPiece.type !== "gate-question" || secondPiece.type !== "gate-question") {
        throw new Error("개인 관문 문제가 없습니다.");
      }
      expect(firstPiece.questionId).not.toBe(secondPiece.questionId);

      const spoof = waitForMessage(first.socket, (message) =>
        message.type === "error" && message.code === "INVALID_MESSAGE");
      first.socket.send(JSON.stringify({
        type: "gate-answer", questionId: firstPiece.questionId,
        choice: answerFromPrompt(firstPiece.prompt), playerId: second.joined.playerId,
      }));
      await spoof;

      const onePiece = waitForMessage(second.socket, (message) =>
        message.type === "gate-state" && message.solved === 1);
      first.socket.send(JSON.stringify({
        type: "gate-answer", questionId: firstPiece.questionId,
        choice: answerFromPrompt(firstPiece.prompt),
      }));
      await expect(onePiece).resolves.toMatchObject({ status: "active", required: 2 });
      const duplicate = waitForMessage(first.socket, (message) =>
        message.type === "error" && message.code === "INVALID_MESSAGE");
      first.socket.send(JSON.stringify({
        type: "gate-answer", questionId: firstPiece.questionId,
        choice: answerFromPrompt(firstPiece.prompt),
      }));
      await duplicate;
      second.socket.send(JSON.stringify({
        type: "gate-answer", questionId: secondPiece.questionId,
        choice: answerFromPrompt(secondPiece.prompt),
      }));
      await cleared;
      const status = await env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomName)).fetch(
        "https://room.internal/internal/status",
        { headers: { Authorization: `Bearer ${testTeacherToken}` } },
      );
      const monitor = await status.json();
      expect(monitor).toMatchObject({
        stage: { stage: 3, status: "cleared" },
        gate: { status: "cleared", solved: 2, required: 2 },
      });
      expect(JSON.stringify(monitor)).not.toContain(firstPiece.prompt);
      expect(JSON.stringify(monitor)).not.toContain(secondPiece.prompt);

      const firstBoss = waitForMessage(first.socket, (message) =>
        message.type === "boss-state" && message.status === "active", "첫 학생 보스", 6_000);
      const secondBoss = waitForMessage(second.socket, (message) =>
        message.type === "boss-state" && message.status === "active", "둘째 학생 보스", 6_000);
      const [bossOne, bossTwo] = await Promise.all([firstBoss, secondBoss]);
      expect(bossOne).toMatchObject({ health: 10, maxHealth: 10, shielded: true, playerCount: 2 });
      expect(bossTwo).toMatchObject({ health: 10, maxHealth: 10, shielded: true, playerCount: 2 });
    } finally {
      first.socket.close(1000, "test complete");
      second.socket.close(1000, "test complete");
    }
  }, 18_000);

  it("혼자 플레이해도 서로 다른 관문 조각 두 개를 풀고 종료할 수 있다", async () => {
    const roomName = `solo-gate-${crypto.randomUUID()}`;
    await createTestRoom(roomName, {
      stage1: { targetScore: 10, clearMode: "either" },
      stage2: { targetScore: 10, clearMode: "either" },
      stage3: { targetScore: 10, clearMode: "either" },
    });
    const player = await joinSocket(roomName, "학생1");
    try {
      let question = player.question;
      for (const stage of [2, 3] as const) {
        const nextQuestion = waitForMessage(player.socket, (message) => message.type === "question", `${stage}단계 문제`, 6_000);
        player.socket.send(JSON.stringify({
          type: "answer", questionId: question.questionId,
          choice: answerFromPrompt(question.prompt),
        }));
        const next = await nextQuestion;
        if (next.type !== "question") throw new Error("다음 단계 문제가 없습니다.");
        question = next;
      }
      const firstPiece = waitForMessage(player.socket, (message) => message.type === "gate-question");
      player.socket.send(JSON.stringify({
        type: "answer", questionId: question.questionId,
        choice: answerFromPrompt(question.prompt),
      }));
      const one = await firstPiece;
      if (one.type !== "gate-question") throw new Error("첫 관문 조각이 없습니다.");
      const secondPiece = waitForMessage(player.socket, (message) =>
        message.type === "gate-question" && message.questionId !== one.questionId);
      player.socket.send(JSON.stringify({
        type: "gate-answer", questionId: one.questionId,
        choice: answerFromPrompt(one.prompt),
      }));
      const two = await secondPiece;
      if (two.type !== "gate-question") throw new Error("두 번째 관문 조각이 없습니다.");
      const cleared = waitForMessage(player.socket, (message) =>
        message.type === "stage" && message.stage === 3 && message.status === "cleared");
      player.socket.send(JSON.stringify({
        type: "gate-answer", questionId: two.questionId,
        choice: answerFromPrompt(two.prompt),
      }));
      await expect(cleared).resolves.toMatchObject({ stage: 3, status: "cleared" });
    } finally {
      player.socket.close(1000, "test complete");
    }
  }, 15_000);

  it("보스 방어막을 풀고 서버 거품 공격으로 클리어 시간을 기록한다", async () => {
    const roomName = `boss-clear-${crypto.randomUUID()}`;
    await createTestRoom(roomName, {
      stage1: { targetScore: 10, clearMode: "either" },
      stage2: { targetScore: 10, clearMode: "either" },
      stage3: { targetScore: 10, clearMode: "either" },
    });
    const player = await joinSocket(roomName, "학생1");
    try {
      let question = player.question;
      for (const stage of [2, 3] as const) {
        const nextQuestion = waitForMessage(player.socket, (message) => message.type === "question", `${stage}단계 문제`, 6_000);
        player.socket.send(JSON.stringify({
          type: "answer", questionId: question.questionId,
          choice: answerFromPrompt(question.prompt),
        }));
        const next = await nextQuestion;
        if (next.type !== "question") throw new Error("다음 단계 문제가 없습니다.");
        question = next;
      }
      const stageGateOne = waitForMessage(player.socket, (message) => message.type === "gate-question");
      player.socket.send(JSON.stringify({ type: "answer", questionId: question.questionId, choice: answerFromPrompt(question.prompt) }));
      const pieceOne = await stageGateOne;
      if (pieceOne.type !== "gate-question") throw new Error("3단계 관문 문제가 없습니다.");
      const stageGateTwo = waitForMessage(player.socket, (message) =>
        message.type === "gate-question" && message.questionId !== pieceOne.questionId);
      player.socket.send(JSON.stringify({ type: "gate-answer", questionId: pieceOne.questionId, choice: answerFromPrompt(pieceOne.prompt) }));
      const pieceTwo = await stageGateTwo;
      if (pieceTwo.type !== "gate-question") throw new Error("3단계 두 번째 조각이 없습니다.");
      const bossEntry = waitForMessage(player.socket, (message) => message.type === "boss-state", "보스 진입", 6_000);
      const bossGateOne = waitForMessage(player.socket, (message) => message.type === "gate-question", "보스 방어막 문제", 6_000);
      player.socket.send(JSON.stringify({ type: "gate-answer", questionId: pieceTwo.questionId, choice: answerFromPrompt(pieceTwo.prompt) }));
      await expect(bossEntry).resolves.toMatchObject({ health: 6, maxHealth: 6, shielded: true });
      const bossPieceOne = await bossGateOne;
      if (bossPieceOne.type !== "gate-question") throw new Error("보스 방어막 문제가 없습니다.");
      const bossGateTwo = waitForMessage(player.socket, (message) =>
        message.type === "gate-question" && message.questionId !== bossPieceOne.questionId);
      player.socket.send(JSON.stringify({ type: "gate-answer", questionId: bossPieceOne.questionId, choice: answerFromPrompt(bossPieceOne.prompt) }));
      const bossPieceTwo = await bossGateTwo;
      if (bossPieceTwo.type !== "gate-question") throw new Error("보스 두 번째 조각이 없습니다.");
      const shieldOff = waitForMessage(player.socket, (message) =>
        message.type === "boss-state" && !message.shielded);
      player.socket.send(JSON.stringify({ type: "gate-answer", questionId: bossPieceTwo.questionId, choice: answerFromPrompt(bossPieceTwo.prompt) }));
      await shieldOff;

      const nearBoss = waitForMessage(player.socket, (message) =>
        message.type === "snapshot" &&
        (message.players.find((item) => item.id === player.joined.playerId)?.x ?? 0) >= 350);
      player.socket.send(JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false }));
      await nearBoss;
      player.socket.send(JSON.stringify({ type: "input", sequence: 2, axis: 0, jump: false }));

      for (let remaining = 5; remaining >= 0; remaining -= 1) {
        const nextHit = waitForMessage(player.socket, (message) =>
          message.type === "boss-state" && message.health === remaining,
          `보스 체력 ${remaining}`, 5_000);
        player.socket.send(JSON.stringify({ type: "action", sequence: 6 - remaining, kind: "fire", direction: 1 }));
        await nextHit;
      }
      const nextSet = waitForMessage(player.socket, (message) =>
        message.type === "stage" && message.setNumber === 2 && message.stage === 1,
        "다음 난이도 세트", 6_000);
      const nextMonsters = waitForMessage(player.socket, (message) =>
        message.type === "combat" && message.monsters.length === 3,
        "다음 세트 몬스터", 6_000);
      const room = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomName));
      const monitor = await room.fetch("https://room.internal/internal/status", {
        headers: { Authorization: `Bearer ${testTeacherToken}` },
      });
      const result = await monitor.json() as {
        boss: { status: string; elapsedSeconds: number; playerCount: number };
        bossRuns: Array<{ setNumber: number; elapsedSeconds: number }>;
      };
      expect(result.boss.status).toBe("cleared");
      expect(result.boss.elapsedSeconds).toBeGreaterThan(0);
      expect(result.boss.playerCount).toBe(1);
      expect(result.bossRuns).toMatchObject([{ setNumber: 1, elapsedSeconds: result.boss.elapsedSeconds }]);
      await expect(nextSet).resolves.toMatchObject({
        setNumber: 2, stage: 1, status: "waiting", targetSeconds: 120, targetScore: 12,
      });
      await expect(nextMonsters).resolves.toMatchObject({ type: "combat" });
    } finally {
      player.socket.close(1000, "test complete");
    }
  }, 35_000);

  it("학생마다 다른 문제를 보내고 정답은 서버에서 판정해 교사에게 정답 수만 공개한다", async () => {
    const roomName = `quiz-${crypto.randomUUID()}`;
    const first = await joinSocket(roomName, "학생1");
    const second = await joinSocket(roomName, "학생2");
    try {
      expect(first.question.questionId).not.toBe(second.question.questionId);
      expect(first.question).not.toHaveProperty("correctAnswer");
      expect(first.question).not.toHaveProperty("answer");

      const correct = answerFromPrompt(first.question.prompt);
      const feedback = waitForMessage(first.socket, (message) => message.type === "quiz-feedback");
      first.socket.send(JSON.stringify({ type: "answer", questionId: first.question.questionId, choice: correct }));
      await expect(feedback).resolves.toMatchObject({ correct: true, completed: true, solvedCount: 1, boosted: true });

      const room = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomName));
      const status = await room.fetch("https://room.internal/internal/status", {
        headers: { Authorization: `Bearer ${testTeacherToken}` },
      });
      const monitor = await status.json() as { players: Array<Record<string, unknown>> };
      expect(monitor.players.find((player) => player.id === first.joined.playerId)?.solvedCount).toBe(1);
      expect(monitor.players.find((player) => player.id === second.joined.playerId)?.solvedCount).toBe(0);
      expect(JSON.stringify(monitor)).not.toContain(first.question.prompt);

      const duplicate = waitForMessage(first.socket, (message) => message.type === "error");
      first.socket.send(JSON.stringify({ type: "answer", questionId: first.question.questionId, choice: correct }));
      await expect(duplicate).resolves.toMatchObject({ code: "INVALID_MESSAGE" });

      const next = waitForMessage(first.socket, (message) => message.type === "question");
      first.socket.send(JSON.stringify({ type: "next-question" }));
      const newQuestion = await next;
      expect(newQuestion.type === "question" && newQuestion.questionId).not.toBe(first.question.questionId);

      const firstBubble = waitForMessage(first.socket, (message) => message.type === "combat" && message.bubbles.length === 1);
      first.socket.send(JSON.stringify({ type: "action", sequence: 1, kind: "fire", direction: 1 }));
      const fired = await firstBubble;
      if (fired.type !== "combat") throw new Error("거품 상태가 아닙니다.");
      await waitForMessage(first.socket, (message) => message.type === "combat" && message.serverTick >= fired.serverTick + 6);
      const fastSecondBubble = waitForMessage(first.socket, (message) => message.type === "combat" && message.bubbles.length === 2);
      first.socket.send(JSON.stringify({ type: "action", sequence: 2, kind: "fire", direction: 1 }));
      await expect(fastSecondBubble).resolves.toMatchObject({ type: "combat" });
    } finally {
      first.socket.close(1000, "test complete");
      second.socket.close(1000, "test complete");
    }
  });

  it("첫 오답에 힌트를 주고 두 번째 오답에서만 정답을 알려준다", async () => {
    const player = await joinSocket(`wrong-quiz-${crypto.randomUUID()}`, "학생1");
    try {
      const [firstWrong, secondWrong] = player.question.choices.filter(
        (choice) => choice !== answerFromPrompt(player.question.prompt),
      );
      const firstFeedback = waitForMessage(player.socket, (message) => message.type === "quiz-feedback");
      player.socket.send(JSON.stringify({ type: "answer", questionId: player.question.questionId, choice: firstWrong }));
      const hint = await firstFeedback;
      expect(hint).toMatchObject({ correct: false, completed: false, wrongChoice: firstWrong });
      expect(hint.type === "quiz-feedback" && hint.hint).toBeTruthy();
      expect(hint).not.toHaveProperty("answer");

      const finalFeedback = waitForMessage(player.socket, (message) => message.type === "quiz-feedback" && message.completed);
      player.socket.send(JSON.stringify({ type: "answer", questionId: player.question.questionId, choice: secondWrong }));
      const completed = await finalFeedback;
      expect(completed).toMatchObject({ correct: false, completed: true, solvedCount: 0 });
      expect(completed.type === "quiz-feedback" && completed.answer).toBeTypeOf("number");
    } finally {
      player.socket.close(1000, "test complete");
    }
  });

  it("재접속하면 진행 중이던 개인 문제를 다시 보내고 다른 문제 ID 제출을 거절한다", async () => {
    const roomName = `quiz-reconnect-${crypto.randomUUID()}`;
    const first = await joinSocket(roomName, "학생1");
    const invalid = waitForMessage(first.socket, (message) => message.type === "error");
    first.socket.send(JSON.stringify({
      type: "answer", questionId: crypto.randomUUID(), choice: first.question.choices[0],
    }));
    await expect(invalid).resolves.toMatchObject({ code: "INVALID_MESSAGE" });
    first.socket.close(1000, "temporary disconnect");
    await new Promise((resolve) => setTimeout(resolve, 30));

    const restored = await joinSocket(roomName, "학생1", first.joined.reconnectToken);
    expect(restored.joined.playerId).toBe(first.joined.playerId);
    expect(restored.question.questionId).toBe(first.question.questionId);
    restored.socket.close(1000, "test complete");
  });
  it("교사가 만들지 않은 방의 WebSocket 입장을 거절한다", async () => {
    const id = env.GAME_ROOM.idFromName(`uncreated-${crypto.randomUUID()}`);
    const response = await env.GAME_ROOM.get(id).fetch("https://room.internal", {
      headers: { Upgrade: "websocket" },
    });
    expect(response.status).toBe(404);
  });

  it("방 번호 중복을 막고 교사 토큰 없이는 현황을 공개하지 않는다", async () => {
    const roomName = `teacher-${crypto.randomUUID()}`;
    await createTestRoom(roomName);
    const room = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomName));
    const duplicate = await room.fetch("https://room.internal/internal/create", {
      method: "POST",
      headers: { "X-Teacher-Token": "b".repeat(64) },
    });
    expect(duplicate.status).toBe(409);

    const withoutToken = await room.fetch("https://room.internal/internal/status");
    expect(withoutToken.status).toBe(401);
    const wrongToken = await room.fetch("https://room.internal/internal/status", {
      headers: { Authorization: `Bearer ${"b".repeat(64)}` },
    });
    expect(wrongToken.status).toBe(401);

    const player = await joinSocket(roomName, "별빛토끼");
    try {
      const status = await room.fetch("https://room.internal/internal/status", {
        headers: { Authorization: `Bearer ${testTeacherToken}` },
      });
      expect(status.status).toBe(200);
      expect(await status.json()).toMatchObject({
        capturedCount: 0,
        players: [{ nickname: "별빛토끼", connected: true }],
      });
    } finally {
      player.socket.close(1000, "test complete");
    }
  });

  it("발급 뒤 4시간이 지나면 새 학생 입장과 교사 조회를 중단한다", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(4_000_000);
    const roomName = `expired-room-${crypto.randomUUID()}`;
    await createTestRoom(roomName);
    const room = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomName));
    now.mockReturnValue(4_000_000 + 4 * 60 * 60 * 1_000 + 1);

    const join = await room.fetch("https://room.internal", {
      headers: { Upgrade: "websocket" },
    });
    const monitor = await room.fetch("https://room.internal/internal/status", {
      headers: { Authorization: `Bearer ${testTeacherToken}` },
    });
    expect(join.status).toBe(410);
    expect(monitor.status).toBe(410);
  });

  it("열 명을 입장시키고 열한 번째를 거절하며 위조 좌표를 반영하지 않는다", async () => {
    const roomName = `room-${crypto.randomUUID()}`;
    const sockets: WebSocket[] = [];
    const playerIds = new Set<string>();

    try {
      for (let index = 1; index <= 10; index += 1) {
        const socket = await openSocket(roomName);
        sockets.push(socket);
        const joinedMessage = waitForMessage(socket, (message) => message.type === "joined");
        socket.send(JSON.stringify({ type: "join", nickname: `학생${index}` }));
        const joined = await joinedMessage;
        if (joined.type !== "joined") throw new Error("입장 응답이 아닙니다.");
        playerIds.add(joined.playerId);
      }

      expect(playerIds.size).toBe(10);
      const tenPlayerCombat = await waitForMessage(
        sockets[0]!,
        (message) => message.type === "combat" && message.monsters.length === 6,
        "10인 몬스터 수",
      );
      expect(tenPlayerCombat.type).toBe("combat");

      const eleventh = await openSocket(roomName);
      sockets.push(eleventh);
      const fullMessage = waitForMessage(
        eleventh,
        (message) => message.type === "error" && message.code === "ROOM_FULL",
      );
      eleventh.send(JSON.stringify({ type: "join", nickname: "학생11" }));
      await expect(fullMessage).resolves.toMatchObject({ type: "error", code: "ROOM_FULL" });

      const firstSocket = sockets[0];
      if (!firstSocket) throw new Error("첫 번째 소켓이 없습니다.");
      const beforeMessage = await waitForMessage(firstSocket, (message) => message.type === "snapshot");
      if (beforeMessage.type !== "snapshot") throw new Error("스냅샷이 아닙니다.");
      const firstPlayerId = [...playerIds][0];
      const beforeX = beforeMessage.players.find((player) => player.id === firstPlayerId)?.x;

      const invalidMessage = waitForMessage(
        firstSocket,
        (message) => message.type === "error" && message.code === "INVALID_MESSAGE",
      );
      firstSocket.send(
        JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false, x: 9999 }),
      );
      await expect(invalidMessage).resolves.toMatchObject({
        type: "error",
        code: "INVALID_MESSAGE",
      });

      const afterMessage = await waitForMessage(firstSocket, (message) => message.type === "snapshot");
      if (afterMessage.type !== "snapshot") throw new Error("스냅샷이 아닙니다.");
      expect(afterMessage.players.find((player) => player.id === firstPlayerId)?.x).toBe(beforeX);
    } finally {
      for (const socket of sockets) socket.close(1000, "test complete");
    }
  });

  it("1초에 입력 30개만 허용하고 초과 시 5초 동안 차단한다", () => {
    const limiter = new InputRateLimiter();
    for (let index = 0; index < 30; index += 1) {
      expect(limiter.allow(index * 10)).toBe(true);
    }
    expect(limiter.allow(300)).toBe(false);
    expect(limiter.allow(5_299)).toBe(false);
    expect(limiter.allow(5_300)).toBe(true);
  });

  it("59초 안에는 같은 ID와 마지막 위치로 재접속한다", async () => {
    const roomName = `reconnect-${crypto.randomUUID()}`;
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const first = await joinSocket(roomName, "별빛토끼");
    const movingSnapshot = waitForMessage(
      first.socket,
      (message) =>
        message.type === "snapshot" &&
        (message.players.find((player) => player.id === first.joined.playerId)?.x ?? 0) > 80,
    );
    first.socket.send(JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false }));
    const before = await movingSnapshot;
    if (before.type !== "snapshot") throw new Error("이동 스냅샷이 아닙니다.");
    const beforeX = before.players.find((player) => player.id === first.joined.playerId)?.x;
    first.socket.close(1000, "temporary disconnect");
    await new Promise((resolve) => setTimeout(resolve, 30));

    now.mockReturnValue(1_059_000);
    const restored = await joinSocket(roomName, "별빛토끼", first.joined.reconnectToken);
    const restoredSnapshot = await waitForMessage(
      restored.socket,
      (message) => message.type === "snapshot",
    );

    expect(restored.joined.playerId).toBe(first.joined.playerId);
    const restoredX =
      restoredSnapshot.type === "snapshot"
        ? restoredSnapshot.players.find((player) => player.id === first.joined.playerId)?.x
        : null;
    expect(restoredX).toBeGreaterThanOrEqual(beforeX ?? 0);
    expect(restoredX).not.toBe(80);
    restored.socket.close(1000, "test complete");
  });

  it("61초가 지난 토큰은 새 ID를 발급한다", async () => {
    const roomName = `expired-${crypto.randomUUID()}`;
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const first = await joinSocket(roomName, "달빛여우");
    first.socket.close(1000, "expired disconnect");
    await new Promise((resolve) => setTimeout(resolve, 30));

    now.mockReturnValue(2_061_000);
    const replacement = await joinSocket(roomName, "달빛여우", first.joined.reconnectToken);

    expect(replacement.joined.playerId).not.toBe(first.joined.playerId);
    replacement.socket.close(1000, "test complete");
  });

  it.each([
    [2, "small"],
    [3, "medium"],
    [6, "large"],
    [9, "xlarge"],
  ] as const)("%i명으로 시작하면 %s 맵을 고정한다", async (playerCount, expectedTier) => {
    const roomName = `map-${playerCount}-${crypto.randomUUID()}`;
    const joined = [];
    try {
      for (let index = 1; index <= playerCount; index += 1) {
        joined.push(await joinSocket(roomName, `학생${index}`));
      }

      const observer = joined[0]?.socket;
      if (!observer) throw new Error("관찰 소켓이 없습니다.");
      observer.send(JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false }));
      const started = await waitForMessage(
        observer,
        (message) => message.type === "snapshot" && message.mapTier === expectedTier,
      );
      expect(started).toMatchObject({ type: "snapshot", mapTier: expectedTier });

      joined.at(-1)?.socket.close(1000, "leave after start");
      const afterLeave = await waitForMessage(observer, (message) => message.type === "snapshot");
      expect(afterLeave).toMatchObject({ type: "snapshot", mapTier: expectedTier });
    } finally {
      for (const player of joined) player.socket.close(1000, "test complete");
    }
  });

  it("만료된 슬롯을 제거해도 시작한 맵 크기는 바뀌지 않는다", async () => {
    const roomName = `fixed-map-${crypto.randomUUID()}`;
    const now = vi.spyOn(Date, "now").mockReturnValue(3_000_000);
    const first = await joinSocket(roomName, "학생1");
    const second = await joinSocket(roomName, "학생2");
    const third = await joinSocket(roomName, "학생3");

    first.socket.send(JSON.stringify({ type: "input", sequence: 1, axis: 0, jump: false }));
    await waitForMessage(
      first.socket,
      (message) => message.type === "snapshot" && message.mapTier === "medium",
    );
    second.socket.close(1000, "leave");
    third.socket.close(1000, "leave");
    await new Promise((resolve) => setTimeout(resolve, 30));

    now.mockReturnValue(3_061_000);
    const replacement = await joinSocket(roomName, "학생4");
    const snapshot = await waitForMessage(
      first.socket,
      (message) => message.type === "snapshot" && message.players.some((player) => player.id === replacement.joined.playerId),
    );
    if (snapshot.type !== "snapshot") throw new Error("스냅샷이 아닙니다.");

    expect(snapshot.mapTier).toBe("medium");
    expect(snapshot.players.map((player) => player.id)).not.toContain(second.joined.playerId);
    expect(snapshot.players.map((player) => player.id)).not.toContain(third.joined.playerId);
    first.socket.close(1000, "test complete");
    replacement.socket.close(1000, "test complete");
  });

  it("두 학생이 같은 거품 포획을 보고 다른 학생이 팡 버튼으로 터뜨린다", async () => {
    const roomName = `combat-${crypto.randomUUID()}`;
    const first = await joinSocket(roomName, "학생1");
    const second = await joinSocket(roomName, "학생2");

    try {
      const nearMonster = waitForMessage(
        second.socket,
        (message) =>
          message.type === "snapshot" &&
          (message.players.find((player) => player.id === second.joined.playerId)?.x ?? 0) > 285,
        "친구 이동",
      );
      second.socket.send(JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false }));
      await nearMonster;
      const stopped = waitForMessage(
        second.socket,
        (message) =>
          message.type === "snapshot" &&
          message.players.find((player) => player.id === second.joined.playerId)?.velocityX === 0,
        "친구 정지",
      );
      second.socket.send(JSON.stringify({ type: "input", sequence: 2, axis: 0, jump: false }));
      await stopped;

      const trappedForFirst = waitForMessage(
        first.socket,
        (message) =>
          message.type === "combat" &&
          message.bubbles.some((bubble) => bubble.trappedMonsterId !== null),
        "첫 학생 포획 표시",
      );
      first.socket.send(JSON.stringify({ type: "action", sequence: 3, kind: "fire", direction: 1 }));
      const trapped = await trappedForFirst;
      const trappedForSecond = await waitForMessage(
        second.socket,
        (message) =>
          message.type === "combat" &&
          message.bubbles.some((bubble) => bubble.trappedMonsterId !== null),
        "두 번째 학생 포획 표시",
      );
      expect(trappedForSecond.type).toBe("combat");
      if (trapped.type !== "combat") throw new Error("포획 상태가 아닙니다.");
      const trappedBubble = trapped.bubbles.find((bubble) => bubble.trappedMonsterId !== null);
      if (!trappedBubble) throw new Error("갇힌 거품이 없습니다.");
      const position = await waitForMessage(
        second.socket,
        (message) => message.type === "snapshot",
        "친구 위치",
      );
      if (position.type !== "snapshot") throw new Error("위치 상태가 아닙니다.");
      const friend = position.players.find((player) => player.id === second.joined.playerId);
      if (!friend) throw new Error("친구 위치가 없습니다.");
      if (Math.abs(friend.x - trappedBubble.x) > 50) {
        const direction = friend.x < trappedBubble.x ? 1 : -1;
        const nearBubble = waitForMessage(
          second.socket,
          (message) =>
            message.type === "snapshot" &&
            Math.abs((message.players.find((player) => player.id === second.joined.playerId)?.x ?? 0) - trappedBubble.x) <= 50,
          "거품 근접",
        );
        second.socket.send(JSON.stringify({ type: "input", sequence: 3, axis: direction, jump: false }));
        await nearBubble;
        second.socket.send(JSON.stringify({ type: "input", sequence: 4, axis: 0, jump: false }));
      }

      const capturedForFirst = waitForMessage(
        first.socket,
        (message) => message.type === "combat" && message.capturedCount === 1,
        "첫 학생 포획 결과",
      );
      second.socket.send(JSON.stringify({ type: "action", sequence: 3, kind: "pop", direction: 1 }));
      await capturedForFirst;
      const capturedForSecond = await waitForMessage(
        second.socket,
        (message) => message.type === "combat" && message.capturedCount === 1,
        "두 번째 학생 포획 결과",
      );
      expect(capturedForSecond).toMatchObject({ type: "combat", capturedCount: 1 });

      const room = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomName));
      const monitor = await room.fetch("https://room.internal/internal/status", {
        headers: { Authorization: `Bearer ${testTeacherToken}` },
      });
      expect(await monitor.json()).toMatchObject({ capturedCount: 1 });
    } finally {
      first.socket.close(1000, "test complete");
      second.socket.close(1000, "test complete");
    }
  });

  it("위조 위치를 담은 거품 행동을 거절한다", async () => {
    const player = await joinSocket(`invalid-combat-${crypto.randomUUID()}`, "학생1");
    try {
      const error = waitForMessage(
        player.socket,
        (message) => message.type === "error" && message.code === "INVALID_MESSAGE",
      );
      player.socket.send(
        JSON.stringify({ type: "action", sequence: 1, kind: "fire", direction: 1, x: 9999 }),
      );
      await expect(error).resolves.toMatchObject({ type: "error", code: "INVALID_MESSAGE" });
    } finally {
      player.socket.close(1000, "test complete");
    }
  });

  it("몬스터에 닿은 학생을 친구가 가까이서 구출하면 두 화면에 같은 상태를 보낸다", async () => {
    const roomName = `rescue-${crypto.randomUUID()}`;
    const first = await joinSocket(roomName, "학생1");
    const second = await joinSocket(roomName, "학생2");
    try {
      const nearMonster = waitForMessage(first.socket, (message) =>
        message.type === "snapshot" &&
        (message.players.find((player) => player.id === first.joined.playerId)?.x ?? 0) >= 265,
      );
      first.socket.send(JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false }));
      await nearMonster;
      first.socket.send(JSON.stringify({ type: "input", sequence: 2, axis: 0, jump: false }));

      const down = await waitForMessage(first.socket, (message) =>
        message.type === "rescue-state" &&
        message.players.some((player) => player.id === first.joined.playerId && player.downed),
        "몬스터 접촉", 8_000,
      );
      expect(down.type).toBe("rescue-state");

      const fallenSnapshot = await waitForMessage(first.socket, (message) => message.type === "snapshot");
      if (fallenSnapshot.type !== "snapshot") throw new Error("쓰러진 학생의 위치가 없습니다.");
      const fallenX = fallenSnapshot.players.find((player) => player.id === first.joined.playerId)?.x;
      if (fallenX === undefined) throw new Error("쓰러진 학생이 없습니다.");

      second.socket.send(JSON.stringify({ type: "action", sequence: 1, kind: "rescue", direction: 1 }));
      const invalidTarget = waitForMessage(second.socket, (message) =>
        message.type === "error" && message.code === "INVALID_MESSAGE");
      second.socket.send(JSON.stringify({
        type: "action", sequence: 2, kind: "rescue", direction: 1, targetId: first.joined.playerId,
      }));
      await invalidTarget;

      const nearFriend = waitForMessage(second.socket, (message) =>
        message.type === "snapshot" &&
        (message.players.find((player) => player.id === second.joined.playerId)?.x ?? 0) >= fallenX - 65,
      );
      second.socket.send(JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false }));
      await nearFriend;
      second.socket.send(JSON.stringify({ type: "input", sequence: 2, axis: 0, jump: false }));
      await waitForMessage(second.socket, (message) => message.type === "snapshot" &&
        message.players.find((player) => player.id === second.joined.playerId)?.velocityX === 0);

      const rescuedFirst = waitForMessage(first.socket, (message) =>
        message.type === "rescue-state" && message.rescueCount === 1);
      const rescuedSecond = waitForMessage(second.socket, (message) =>
        message.type === "rescue-state" && message.rescueCount === 1);
      second.socket.send(JSON.stringify({ type: "action", sequence: 3, kind: "rescue", direction: 1 }));
      const [one, two] = await Promise.all([rescuedFirst, rescuedSecond]);
      expect(one).toMatchObject({ rescueCount: 1 });
      expect(two).toMatchObject({ rescueCount: 1 });
      if (one.type !== "rescue-state") throw new Error("구출 상태가 아닙니다.");
      expect(one.players.find((player) => player.id === first.joined.playerId)?.downed).toBe(false);

      const monitor = await env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomName)).fetch(
        "https://room.internal/internal/status",
        { headers: { Authorization: `Bearer ${testTeacherToken}` } },
      );
      expect(await monitor.json()).toMatchObject({ rescueCount: 1, downedCount: 0 });
    } finally {
      first.socket.close(1000, "test complete");
      second.socket.close(1000, "test complete");
    }
  }, 15_000);
});
