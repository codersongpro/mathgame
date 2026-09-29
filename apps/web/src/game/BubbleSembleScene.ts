import { BOSS_X, BOSS_Y, FLOOR_Y } from "@bubble-semble/game-core";
import type { ServerMessage } from "@bubble-semble/shared";
import Phaser from "phaser";
import { RemotePlayerView } from "./RemotePlayerView";

type Snapshot = Extract<ServerMessage, { type: "snapshot" }>;
type Combat = Extract<ServerMessage, { type: "combat" }>;
type RescueState = Extract<ServerMessage, { type: "rescue-state" }>;
type BossState = Extract<ServerMessage, { type: "boss-state" }>;

export type GameViewBridge = {
  getSnapshot: () => Snapshot | null;
  getCombat: () => Combat | null;
  getRescueState: () => RescueState | null;
  getBossState: () => BossState | null;
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
  #combatGraphics: Phaser.GameObjects.Graphics | null = null;
  #bossGraphics: Phaser.GameObjects.Graphics | null = null;
  #mapGraphics: Phaser.GameObjects.Graphics[] = [];
  #lastSnapshotTick = -1;
  #lastCombatTick = -1;
  #lastBossKey = "";
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
    this.#combatGraphics = this.add.graphics().setDepth(3);
    this.#bossGraphics = this.add.graphics().setDepth(2);
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
      const downedIds = new Set(this.#bridge.getRescueState()?.players.filter((player) => player.downed).map((player) => player.id));
      if (local) {
        this.#localPlayer.setPosition(local.x, local.y).setVisible(true).setAlpha(local.connected ? 1 : 0.45);
        this.#localPlayer.setFlipX(local.velocityX < 0);
        this.#localPlayer.setTint(downedIds.has(local.id) ? 0xff6f8b : 0xffffff);
      } else {
        this.#localPlayer.setVisible(false);
      }

      this.#remotePlayers?.receive(
        snapshot.players.filter((player) => player.id !== localPlayerId),
        time,
        downedIds,
      );
    }

    const combat = this.#bridge.getCombat();
    if (combat && combat.serverTick !== this.#lastCombatTick) {
      this.#lastCombatTick = combat.serverTick;
      this.#drawCombat(combat);
    }

    const boss = this.#bridge.getBossState();
    const bossKey = boss ? `${boss.health}-${boss.shielded}-${boss.status}` : "";
    if (bossKey !== this.#lastBossKey) {
      this.#lastBossKey = bossKey;
      this.#drawBoss(boss);
    }

    this.#remotePlayers?.update(time);
  }

  /** 몬스터와 거품은 서버의 좌표만 사용해 레트로 도형으로 그립니다. */
  #drawCombat(combat: Combat) {
    const graphics = this.#combatGraphics;
    if (!graphics) return;
    graphics.clear();

    for (const monster of combat.monsters) {
      if (monster.trapped) continue;
      graphics.fillStyle(0xff8c82, 1);
      graphics.fillRect(monster.x - 15, monster.y - 19, 30, 30);
      graphics.fillStyle(0x0c0920, 1);
      graphics.fillRect(monster.x - 8, monster.y - 10, 5, 5);
      graphics.fillRect(monster.x + 4, monster.y - 10, 5, 5);
      graphics.lineStyle(3, 0x0c0920, 1);
      graphics.strokeRect(monster.x - 15, monster.y - 19, 30, 30);
    }

    for (const bubble of combat.bubbles) {
      const trapped = bubble.trappedMonsterId !== null;
      graphics.fillStyle(trapped ? 0xffe066 : 0x65ebdb, 0.22);
      graphics.fillCircle(bubble.x, bubble.y, trapped ? 23 : 16);
      graphics.lineStyle(4, trapped ? 0xffe066 : 0x65ebdb, 1);
      graphics.strokeCircle(bubble.x, bubble.y, trapped ? 23 : 16);
      if (trapped) {
        graphics.fillStyle(0xff8c82, 1);
        graphics.fillRect(bubble.x - 8, bubble.y - 8, 16, 16);
      }
    }
  }

  /** 큐브왕은 임시 픽셀 그래픽으로만 그리며 체력 판정에는 관여하지 않습니다. */
  #drawBoss(boss: BossState | null) {
    const graphics = this.#bossGraphics;
    if (!graphics) return;
    graphics.clear();
    if (!boss) return;
    graphics.fillStyle(boss.status === "cleared" ? 0x7fe07a : 0xb58cff, 1);
    graphics.fillRect(BOSS_X - 58, BOSS_Y - 48, 116, 96);
    graphics.lineStyle(6, 0x0c0920, 1);
    graphics.strokeRect(BOSS_X - 58, BOSS_Y - 48, 116, 96);
    graphics.fillStyle(0x0c0920, 1);
    graphics.fillRect(BOSS_X - 30, BOSS_Y - 14, 14, 14);
    graphics.fillRect(BOSS_X + 16, BOSS_Y - 14, 14, 14);
    graphics.fillRect(BOSS_X - 14, BOSS_Y + 20, 28, 7);
    if (boss.shielded) {
      graphics.lineStyle(5, 0xffe066, 1);
      graphics.strokeCircle(BOSS_X, BOSS_Y, 78);
    }
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
