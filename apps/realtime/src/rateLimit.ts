const WINDOW_MS = 1_000;
const MAX_INPUTS_PER_WINDOW = 30;
const PENALTY_MS = 5_000;

/** 각 WebSocket 연결의 이동·전투 입력을 제한하는 1초 슬라이딩 윈도우입니다. */
export class InputRateLimiter {
  readonly #acceptedAt: number[] = [];
  #penaltyUntil = 0;

  allow(nowMs: number): boolean {
    if (nowMs < this.#penaltyUntil) return false;

    while (this.#acceptedAt[0] !== undefined && this.#acceptedAt[0] <= nowMs - WINDOW_MS) {
      this.#acceptedAt.shift();
    }

    if (this.#acceptedAt.length >= MAX_INPUTS_PER_WINDOW) {
      this.#penaltyUntil = nowMs + PENALTY_MS;
      this.#acceptedAt.length = 0;
      return false;
    }

    this.#acceptedAt.push(nowMs);
    return true;
  }
}
