import Image from "next/image";
import type { ReactElement } from "react";
import { LobbyForm } from "../components/LobbyForm";

export default function HomePage(): ReactElement {
  return (
    <main className="lobby-shell">
      <div className="pixel-stars" aria-hidden="true" />
      <section className="lobby-card" aria-labelledby="game-title">
        <div className="hero-copy">
          <p className="eyebrow">10인 협동 수학 아케이드</p>
          <h1 id="game-title">Bubble Semble</h1>
          <p className="hero-kicker">버블을 모으고, 함께 생각하고, 같은 스테이지를 돌파하세요.</p>
          <ul className="feature-chips" aria-label="게임 특징">
            <li>같은 맵</li>
            <li>최대 10명</li>
            <li>태블릿 조작</li>
          </ul>
        </div>

        <div className="lumi-stage" aria-hidden="true">
          <span className="bubble bubble-one" />
          <span className="bubble bubble-two" />
          <Image
            src="/assets/characters/lumi/lumi-idle-seed.png"
            alt=""
            width={192}
            height={192}
            priority
            unoptimized
          />
        </div>

        <LobbyForm />
      </section>
    </main>
  );
}
