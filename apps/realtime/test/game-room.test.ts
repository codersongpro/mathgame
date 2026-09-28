import { env } from "cloudflare:workers";
import { ServerMessageSchema, type ServerMessage } from "@bubble-semble/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InputRateLimiter } from "../src/rateLimit";

const createdRooms = new Set<string>();
const testTeacherToken = "a".repeat(64);

async function createTestRoom(roomName: string): Promise<void> {
  if (createdRooms.has(roomName)) return;
  const id = env.GAME_ROOM.idFromName(roomName);
  const response = await env.GAME_ROOM.get(id).fetch("https://room.internal/internal/create", {
    method: "POST",
    headers: { "X-Teacher-Token": testTeacherToken },
  });
  expect(response.status).toBe(201);
  createdRooms.add(roomName);
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
  label = "WebSocket",
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`${label} 응답 시간이 초과됐습니다.`));
    }, 2_000);

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
  socket.send(
    JSON.stringify({
      type: "join",
      nickname,
      ...(reconnectToken ? { reconnectToken } : {}),
    }),
  );
  const joined = await joinedMessage;
  const question = await questionMessage;
  if (joined.type !== "joined") throw new Error("입장 응답이 아닙니다.");
  if (question.type !== "question") throw new Error("개인 문제가 아닙니다.");
  return { socket, joined, question };
}

function answerFromPrompt(prompt: string): number {
  const [left, operation, right] = prompt.split(" ");
  return operation === "+" ? Number(left) + Number(right) : Number(left) - Number(right);
}

afterEach(() => vi.restoreAllMocks());

describe("GameRoom", () => {
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
});
