"use client";

import type { ServerMessage } from "@bubble-semble/shared";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ConnectionBanner } from "./ConnectionBanner";
import { BossPanel } from "./BossPanel";
import { ReconnectOverlay } from "./ReconnectOverlay";
import { QuizPanel } from "./QuizPanel";
import { PlaytestToolbar } from "./PlaytestToolbar";
import { StageClearOverlay, StageOnePanel } from "./StageOnePanel";
import { TeamGatePanel } from "./TeamGatePanel";
import { TouchControls, type TouchInput } from "./TouchControls";
import { useGameRoom } from "../realtime/useGameRoom";

type Snapshot = Extract<ServerMessage, { type: "snapshot" }>;
type Combat = Extract<ServerMessage, { type: "combat" }>;
type RescueState = Extract<ServerMessage, { type: "rescue-state" }>;
type BossState = Extract<ServerMessage, { type: "boss-state" }>;

function realtimeRoomUrl(room: string) {
  const baseUrl = process.env.NEXT_PUBLIC_REALTIME_URL || "ws://127.0.0.1:8787";
  return `${baseUrl.replace(/\/$/, "")}/room/${room}`;
}

const MAP_LABELS: Record<Snapshot["mapTier"], string> = {
  small: "작은 맵",
  medium: "중간 맵",
  large: "큰 맵",
  xlarge: "아주 큰 맵",
};

export function GameShell({ room, nickname, testMode = false }: { room: string; nickname: string; testMode?: boolean }) {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const combatRef = useRef<Combat | null>(null);
  const rescueStateRef = useRef<RescueState | null>(null);
  const bossRef = useRef<BossState | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);
  const directionRef = useRef<-1 | 1>(1);
  const { connectionState, snapshot, combat, question, quizFeedback, stage, rescueState, gate, gateQuestion, gateFeedback, boss, playerId, error, sendInput, sendAction, sendQuiz } = useGameRoom(
    realtimeRoomUrl(room),
    room,
    nickname,
  );

  snapshotRef.current = snapshot;
  combatRef.current = combat;
  rescueStateRef.current = rescueState;
  bossRef.current = boss;
  playerIdRef.current = playerId;

  useEffect(() => {
    const parent = gameContainerRef.current;
    if (!parent) return;
    let disposed = false;
    let game: { destroy: (removeCanvas: boolean, noReturn?: boolean) => void } | null = null;

    void import("../game/createGame").then(({ createGame }) => {
      if (disposed) return;
      game = createGame(parent, {
        getSnapshot: () => snapshotRef.current,
        getCombat: () => combatRef.current,
        getRescueState: () => rescueStateRef.current,
        getBossState: () => bossRef.current,
        getLocalPlayerId: () => playerIdRef.current,
      });
    });

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, []);

  function handleTouchInput(input: TouchInput) {
    if (input.axis !== 0) directionRef.current = input.axis;
    sequenceRef.current += 1;
    sendInput({ type: "input", sequence: sequenceRef.current, ...input });
  }

  function handleAction(kind: "fire" | "pop" | "rescue") {
    sequenceRef.current += 1;
    sendAction({ type: "action", sequence: sequenceRef.current, kind, direction: directionRef.current });
  }

  const downedIds = new Set(rescueState?.players.filter((player) => player.downed).map((player) => player.id));
  const isDowned = playerId ? downedIds.has(playerId) : false;
  const me = snapshot?.players.find((player) => player.id === playerId);
  const rescueEnabled = Boolean(connectionState === "online" && me && !isDowned && snapshot?.players.some((player) =>
    player.id !== playerId && player.connected && downedIds.has(player.id) &&
    Math.hypot(player.x - me.x, player.y - me.y) <= 80,
  ));

  return (
    <main className="game-shell">
      <header className="game-hud">
        <div className="room-chip">
          <span>ROOM</span>
          <strong>{room}</strong>
        </div>
        <div className="roster-status" aria-live="polite">
          <strong data-testid="roster-count">{snapshot?.players.length ?? 0}/10</strong>
          <span>친구 연결 · 구출 {rescueState?.rescueCount ?? 0}</span>
        </div>
        <div className="map-status">
          <strong>{snapshot ? MAP_LABELS[snapshot.mapTier] : "맵 준비 중"}</strong>
          <span>{nickname} · 포획 {combat?.capturedCount ?? 0}</span>
        </div>
        <ConnectionBanner state={connectionState} />
        {testMode && <PlaytestToolbar room={room} />}
        {stage?.stage === 4 ? <BossPanel boss={boss} /> : <StageOnePanel stage={stage} />}
        <ul className="sr-only" aria-label="연결된 친구 위치" data-testid="player-roster">
          {snapshot?.players.map((player) => (
            <li key={player.id} data-nickname={player.nickname} data-x={player.x}>
              {player.nickname}
            </li>
          ))}
        </ul>
      </header>

      <section className="game-stage" aria-label="Bubble Semble 협동 게임 화면">
        <div ref={gameContainerRef} className="game-canvas" data-testid="game-canvas" />
        {isDowned && stage?.status !== "cleared" && (
          <div className="downed-notice" role="status">쓰러졌어요! 가까운 친구가 구출할 수 있습니다. 8초 뒤 자동으로 일어납니다.</div>
        )}
        {stage?.status !== "cleared" && (
          <TeamGatePanel
            gate={stage?.stage === 3 || stage?.stage === 4 ? gate : null}
            question={gateQuestion}
            feedback={gateFeedback}
            online={connectionState === "online" && !isDowned}
            onAnswer={(questionId, choice) => sendQuiz({ type: "gate-answer", questionId, choice })}
            title={stage?.stage === 4 ? "큐브왕 방어막" : "팀 수학 관문"}
          />
        )}
        {stage?.status !== "cleared" && stage?.stage !== 4 && !(stage?.stage === 3 && gate?.status === "active") && (
          <QuizPanel
            question={question}
            feedback={quizFeedback}
            online={connectionState === "online" && !isDowned}
            onAnswer={(questionId, choice) => sendQuiz({ type: "answer", questionId, choice })}
            onNext={() => sendQuiz({ type: "next-question" })}
          />
        )}
        {error ? (
          <div className="game-error" role="alert">
            <p>{error}</p>
            <Link href="/">로비로 돌아가기</Link>
          </div>
        ) : null}
        <ReconnectOverlay state={connectionState} />
        {stage?.status !== "cleared" && (
          <TouchControls
            onChange={handleTouchInput}
            onAction={handleAction}
            actionsEnabled={connectionState === "online" && combat !== null && !isDowned}
            rescueEnabled={rescueEnabled}
            controlsEnabled={!isDowned}
          />
        )}
        <StageClearOverlay stage={stage} />
      </section>
    </main>
  );
}
