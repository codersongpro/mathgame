import type { PublicPlayerState } from "@bubble-semble/shared";
import Phaser from "phaser";

type RemoteView = {
  container: Phaser.GameObjects.Container;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  changedAt: number;
};

const PLAYER_COLORS = [0xff6fa8, 0xffe066, 0x7da9ff, 0xb58cff, 0x7fe07a, 0xff9c5a];

function colorForPlayer(playerId: string) {
  const hash = [...playerId].reduce((value, character) => value + character.codePointAt(0)!, 0);
  return PLAYER_COLORS[hash % PLAYER_COLORS.length] ?? 0xff6fa8;
}

/** 원격 플레이어를 최근 서버 위치 사이에서 부드럽게 보간하는 렌더링 전용 객체입니다. */
export class RemotePlayerView {
  readonly #scene: Phaser.Scene;
  readonly #views = new Map<string, RemoteView>();

  constructor(scene: Phaser.Scene) {
    this.#scene = scene;
  }

  receive(players: PublicPlayerState[], receivedAt: number) {
    const activeIds = new Set(players.map((player) => player.id));

    for (const player of players) {
      const existing = this.#views.get(player.id);
      if (existing) {
        existing.fromX = existing.container.x;
        existing.fromY = existing.container.y;
        existing.toX = player.x;
        existing.toY = player.y;
        existing.changedAt = receivedAt;
        existing.container.setAlpha(player.connected ? 1 : 0.45);
        continue;
      }

      const body = this.#scene.add.rectangle(0, -22, 34, 44, colorForPlayer(player.id));
      body.setStrokeStyle(4, 0x0c0920);
      const label = this.#scene.add
        .text(0, -58, player.nickname, {
          color: "#f6f4dd",
          fontFamily: "Courier New, monospace",
          fontSize: "14px",
          fontStyle: "bold",
          backgroundColor: "#211b42",
          padding: { x: 5, y: 3 },
        })
        .setOrigin(0.5, 1);
      const container = this.#scene.add
        .container(player.x, player.y, [body, label])
        .setDepth(4)
        .setAlpha(player.connected ? 1 : 0.45);

      this.#views.set(player.id, {
        container,
        fromX: player.x,
        fromY: player.y,
        toX: player.x,
        toY: player.y,
        changedAt: receivedAt,
      });
    }

    for (const [playerId, view] of this.#views) {
      if (activeIds.has(playerId)) continue;
      view.container.destroy(true);
      this.#views.delete(playerId);
    }
  }

  update(now: number) {
    for (const view of this.#views.values()) {
      const progress = Phaser.Math.Clamp((now - view.changedAt) / 100, 0, 1);
      view.container.setPosition(
        Phaser.Math.Linear(view.fromX, view.toX, progress),
        Phaser.Math.Linear(view.fromY, view.toY, progress),
      );
    }
  }

  destroy() {
    for (const view of this.#views.values()) view.container.destroy(true);
    this.#views.clear();
  }
}
