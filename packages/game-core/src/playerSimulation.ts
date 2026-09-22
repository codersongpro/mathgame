export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;
export const MOVE_ACCELERATION = 900;
export const MAX_MOVE_SPEED = 220;
export const GRAVITY = 1200;
export const JUMP_SPEED = 440;
export const FLOOR_Y = 480;
export const RECONNECT_GRACE_MS = 60_000;
export const ROOM_CAPACITY = 10;

export type MovementAxis = -1 | 0 | 1;

export type PlayerInput = {
  sequence: number;
  axis: MovementAxis;
  jump: boolean;
};

export type PlayerSimulationState = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  grounded: boolean;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * 클라이언트 좌표를 전혀 받지 않고, 직전 서버 상태와 검증된 입력만으로 다음 상태를 계산합니다.
 */
export function stepPlayer(
  state: Readonly<PlayerSimulationState>,
  input: Readonly<PlayerInput>,
  deltaSeconds: number,
): PlayerSimulationState {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    throw new RangeError("deltaSeconds must be a positive finite number");
  }

  const velocityX = clamp(
    state.velocityX + input.axis * MOVE_ACCELERATION * deltaSeconds,
    -MAX_MOVE_SPEED,
    MAX_MOVE_SPEED,
  );

  const jumpVelocity = input.jump && state.grounded ? -JUMP_SPEED : state.velocityY;
  let velocityY = jumpVelocity + GRAVITY * deltaSeconds;
  const x = state.x + velocityX * deltaSeconds;
  let y = state.y + velocityY * deltaSeconds;
  let grounded = false;

  if (y >= FLOOR_Y) {
    y = FLOOR_Y;
    velocityY = 0;
    grounded = true;
  }

  return { x, y, velocityX, velocityY, grounded };
}
