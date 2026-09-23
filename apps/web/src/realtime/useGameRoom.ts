"use client";

import type { ClientMessage, ServerMessage } from "@bubble-semble/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameSocket, type ConnectionState } from "./GameSocket";

type SnapshotMessage = Extract<ServerMessage, { type: "snapshot" }>;

/** React 화면이 연결 상태와 마지막 서버 스냅숏을 안전하게 구독하게 합니다. */
export function useGameRoom(url: string, room: string, nickname: string) {
  const socketRef = useRef<GameSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [snapshot, setSnapshot] = useState<SnapshotMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = new GameSocket({ url, room, nickname });
    socketRef.current = socket;

    const unsubscribeState = socket.subscribeState(setConnectionState);
    const unsubscribeMessage = socket.subscribe((message) => {
      if (message.type === "snapshot") setSnapshot(message);
      if (message.type === "error") setError(message.message);
    });

    socket.connect();
    return () => {
      unsubscribeState();
      unsubscribeMessage();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [nickname, room, url]);

  const sendInput = useCallback((message: Extract<ClientMessage, { type: "input" }>) => {
    return socketRef.current?.sendInput(message) ?? false;
  }, []);

  return { connectionState, snapshot, error, sendInput };
}
