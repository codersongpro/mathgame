import Phaser from "phaser";
import { BubbleSembleScene, type GameViewBridge } from "./BubbleSembleScene";

/** 브라우저 컨테이너에 한 개의 Phaser 렌더러를 만들고 정리 가능한 인스턴스를 반환합니다. */
export function createGame(parent: HTMLElement, bridge: GameViewBridge) {
  const scene = new BubbleSembleScene(bridge);
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || 960,
    height: parent.clientHeight || 480,
    backgroundColor: "#141126",
    pixelArt: true,
    antialias: false,
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [scene],
  });
}
