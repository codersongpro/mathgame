"use client";

import type { ServerMessage } from "@bubble-semble/shared";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ConnectionBanner } from "./ConnectionBanner";
import { ReconnectOverlay } from "./ReconnectOverlay";
import { TouchControls, type TouchInput } from "./TouchControls";
import { useGameRoom } from "../realtime/useGameRoom";

type Snapshot = Extract<ServerMessage, { type: "snapshot" }>;

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

export function GameShell({ room, nickname }: { room: string; nickname: string }) {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);
  const { connectionState, snapshot, playerId, error, sendInput } = useGameRoom(
    realtimeRoomUrl(room),
    room,
    nickname,
  );

  snapshotRef.current = snapshot;
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
        getLocalPlayerId: () => playerIdRef.current,
      });
    });

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, []);

  function handleTouchInput(input: TouchInput) {
    sequenceRef.current += 1;
    sendInput({ type: "input", sequence: sequenceRef.current, ...input });
  }

  return (
    <main className="game-shell">
      <header className="game-hud">
        <div className="room-chip">
          <span>ROOM</span>
          <strong>{room}</strong>
        </div>
        <div className="roster-status" aria-live="polite">
          <strong data-testid="roster-count">{snapshot?.players.length ?? 0}/10</strong>
          <span>친구 연결</span>
        </div>
        <div className="map-status">
          <strong>{snapshot ? MAP_LABELS[snapshot.mapTier] : "맵 준비 중"}</strong>
          <span>{nickname}</span>
        </div>
        <ConnectionBanner state={connectionState} />
      </header>

      <section className="game-stage" aria-label="Bubble Semble 협동 게임 화면">
        <div ref={gameContainerRef} className="game-canvas" data-testid="game-canvas" />
        {error ? (
          <div className="game-error" role="alert">
            <p>{error}</p>
            <Link href="/">로비로 돌아가기</Link>
          </div>
        ) : null}
        <ReconnectOverlay state={connectionState} />
        <TouchControls onChange={handleTouchInput} />
      </section>
    </main>
  );
}
