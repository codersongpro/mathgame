import { FLOOR_Y } from "@bubble-semble/game-core";
import type { ServerMessage } from "@bubble-semble/shared";
import Phaser from "phaser";
import { RemotePlayerView } from "./RemotePlayerView";

type Snapshot = Extract<ServerMessage, { type: "snapshot" }>;

export type GameViewBridge = {
  getSnapshot: () => Snapshot | null;
  getLocalPlayerId: () => string | null;
};

const LUMI_TEXTURE = "lumi-idle";
const MAP_HEIGHT = 576;
const MAP_WIDTHS: Record<Snapshot["mapTier"], number> = {
  small: 1_280,
  medium: 1_920,
  large: 2_560,
  xlarge: 3_200,
};

/** 서버 상태를 그리기만 하는 Phaser 장면입니다. 이동 판정은 서버가 담당합니다. */
export class BubbleSembleScene extends Phaser.Scene {
  readonly #bridge: GameViewBridge;
  #localPlayer: Phaser.GameObjects.Image | null = null;
  #remotePlayers: RemotePlayerView | null = null;
  #mapGraphics: Phaser.GameObjects.Graphics[] = [];
  #lastSnapshotTick = -1;
  #mapTier: Snapshot["mapTier"] = "small";

  constructor(bridge: GameViewBridge) {
    super("bubble-semble-graybox");
    this.#bridge = bridge;
  }

  preload() {
    this.load.image(LUMI_TEXTURE, "/assets/characters/lumi/lumi-idle-seed.png");
  }

  create() {
    this.cameras.main.setBackgroundColor("#141126");
    this.#drawMap(this.#mapTier);
    this.#localPlayer = this.add.image(80, FLOOR_Y, LUMI_TEXTURE).setOrigin(0.5, 1).setDepth(5);
    this.#localPlayer.setScale(1.5);
    this.#remotePlayers = new RemotePlayerView(this);
    this.cameras.main.startFollow(this.#localPlayer, true, 0.12, 0.12);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.#remotePlayers?.destroy());
  }

  update(time: number) {
    const snapshot = this.#bridge.getSnapshot();
    const localPlayerId = this.#bridge.getLocalPlayerId();
    if (!snapshot || !this.#localPlayer) return;

    if (snapshot.mapTier !== this.#mapTier) this.#drawMap(snapshot.mapTier);

    if (snapshot.serverTick !== this.#lastSnapshotTick) {
      this.#lastSnapshotTick = snapshot.serverTick;
      const local = snapshot.players.find((player) => player.id === localPlayerId);
      if (local) {
        this.#localPlayer.setPosition(local.x, local.y).setVisible(true).setAlpha(local.connected ? 1 : 0.45);
        this.#localPlayer.setFlipX(local.velocityX < 0);
      } else {
        this.#localPlayer.setVisible(false);
      }

      this.#remotePlayers?.receive(
        snapshot.players.filter((player) => player.id !== localPlayerId),
        time,
      );
    }

    this.#remotePlayers?.update(time);
  }

  #drawMap(tier: Snapshot["mapTier"]) {
    this.#mapTier = tier;
    const width = MAP_WIDTHS[tier];
    for (const graphic of this.#mapGraphics) graphic.destroy();
    this.#mapGraphics = [];

    const grid = this.add.graphics().setDepth(0);
    grid.lineStyle(1, 0x65ebdb, 0.1);
    for (let x = 0; x <= width; x += 64) grid.lineBetween(x, 0, x, MAP_HEIGHT);
    for (let y = 0; y <= MAP_HEIGHT; y += 64) grid.lineBetween(0, y, width, y);

    const platforms = this.add.graphics().setDepth(1);
    this.#mapGraphics.push(grid, platforms);
    platforms.fillStyle(0x31285a, 1);
    platforms.lineStyle(4, 0x65ebdb, 1);
    platforms.fillRect(0, FLOOR_Y, width, MAP_HEIGHT - FLOOR_Y);
    platforms.strokeRect(0, FLOOR_Y, width, MAP_HEIGHT - FLOOR_Y);

    const platformWidth = 180;
    for (let x = 280, index = 0; x < width - 120; x += 420, index += 1) {
      const y = index % 2 === 0 ? FLOOR_Y - 130 : FLOOR_Y - 220;
      platforms.fillStyle(index % 2 === 0 ? 0x168d91 : 0x6b4c9a, 1);
      platforms.fillRect(x, y, platformWidth, 24);
      platforms.strokeRect(x, y, platformWidth, 24);
    }

    this.cameras.main.setBounds(0, 0, width, MAP_HEIGHT);
    this.physics.world.setBounds(0, 0, width, MAP_HEIGHT);
  }
}
