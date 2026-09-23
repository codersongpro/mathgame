import { describe, expect, it } from "vitest";
import {
  FLOOR_Y,
  MAX_MOVE_SPEED,
  type PlayerInput,
  type PlayerSimulationState,
  stepPlayer,
} from "../src/playerSimulation";

const TICK_SECONDS = 0.05;

function groundedState(): PlayerSimulationState {
  return { x: 10, y: FLOOR_Y, velocityX: 0, velocityY: 0, grounded: true };
}

describe("권한형 플레이어 이동", () => {
  it("50ms 틱마다 가속하고 최고 속도를 넘지 않는다", () => {
    let state = groundedState();

    state = stepPlayer(state, { sequence: 1, axis: 1, jump: false }, TICK_SECONDS);
    expect(state.velocityX).toBe(45);

    for (let sequence = 2; sequence <= 20; sequence += 1) {
      state = stepPlayer(state, { sequence, axis: 1, jump: false }, TICK_SECONDS);
    }

    expect(state.velocityX).toBe(MAX_MOVE_SPEED);
  });

  it("이동 버튼을 놓으면 짧게 감속해 멈춘다", () => {
    let state = { ...groundedState(), velocityX: MAX_MOVE_SPEED };

    for (let sequence = 1; sequence <= 5; sequence += 1) {
      state = stepPlayer(state, { sequence, axis: 0, jump: false }, TICK_SECONDS);
    }

    expect(state.velocityX).toBe(0);
    expect(state.x).toBeLessThan(35);
  });

  it("공중에서는 중력을 적용하고 바닥 아래로 내려가지 않는다", () => {
    const falling = stepPlayer(
      { x: 0, y: FLOOR_Y - 1, velocityX: 0, velocityY: 100, grounded: false },
      { sequence: 1, axis: 0, jump: false },
      TICK_SECONDS,
    );

    expect(falling.y).toBe(FLOOR_Y);
    expect(falling.velocityY).toBe(0);
    expect(falling.grounded).toBe(true);
  });

  it("바닥에 있을 때만 점프를 시작한다", () => {
    const firstJump = stepPlayer(
      groundedState(),
      { sequence: 1, axis: 0, jump: true },
      TICK_SECONDS,
    );
    const secondJump = stepPlayer(
      firstJump,
      { sequence: 2, axis: 0, jump: true },
      TICK_SECONDS,
    );

    expect(firstJump.grounded).toBe(false);
    expect(firstJump.velocityY).toBe(-380);
    expect(secondJump.velocityY).toBe(-320);
  });

  it("입력에 섞인 클라이언트 좌표를 무시하고 이전 서버 상태를 복사해 계산한다", () => {
    const previous = groundedState();
    const forgedInput = {
      sequence: 1,
      axis: 1,
      jump: false,
      x: 9999,
      y: -9999,
    } as unknown as PlayerInput;

    const next = stepPlayer(previous, forgedInput, TICK_SECONDS);

    expect(next.x).toBe(12.25);
    expect(next.y).toBe(FLOOR_Y);
    expect(previous).toEqual(groundedState());
    expect(next).not.toBe(previous);
  });
});
