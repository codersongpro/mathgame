import type { ServerMessage } from "@bubble-semble/shared";

type Boss = Extract<ServerMessage, { type: "boss-state" }>;

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** 보스 체력과 방어막, 팀 시간을 글자와 숫자로 함께 안내합니다. */
export function BossPanel({ boss }: { boss: Boss | null }) {
  if (!boss) return null;
  return (
    <div className="boss-progress" aria-live="polite">
      <strong>세트 {boss.setNumber} · 혼돈의 큐브왕</strong>
      <span>체력 {boss.health}/{boss.maxHealth}</span>
      <span>{boss.shielded ? "방어막 ON · 팀 문제를 먼저 풀어요" : "방어막 OFF · 거품을 맞혀요"}</span>
      <span>팀 타임어택 {clock(boss.elapsedSeconds)} · {boss.playerCount}명</span>
    </div>
  );
}
