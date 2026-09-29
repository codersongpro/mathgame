"use client";

import type { ClientMessage, ServerMessage } from "@bubble-semble/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameSocket, type ConnectionState } from "./GameSocket";

type SnapshotMessage = Extract<ServerMessage, { type: "snapshot" }>;
type CombatMessage = Extract<ServerMessage, { type: "combat" }>;
type QuestionMessage = Extract<ServerMessage, { type: "question" }>;
type QuizFeedbackMessage = Extract<ServerMessage, { type: "quiz-feedback" }>;
type StageMessage = Extract<ServerMessage, { type: "stage" }>;
type RescueStateMessage = Extract<ServerMessage, { type: "rescue-state" }>;
type GateStateMessage = Extract<ServerMessage, { type: "gate-state" }>;
type GateQuestionMessage = Extract<ServerMessage, { type: "gate-question" }>;
type GateFeedbackMessage = Extract<ServerMessage, { type: "gate-feedback" }>;
type BossStateMessage = Extract<ServerMessage, { type: "boss-state" }>;

/** React 화면이 연결 상태와 마지막 서버 스냅숏을 안전하게 구독하게 합니다. */
export function useGameRoom(url: string, room: string, nickname: string) {
  const socketRef = useRef<GameSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [snapshot, setSnapshot] = useState<SnapshotMessage | null>(null);
  const [combat, setCombat] = useState<CombatMessage | null>(null);
  const [question, setQuestion] = useState<QuestionMessage | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<QuizFeedbackMessage | null>(null);
  const [stage, setStage] = useState<StageMessage | null>(null);
  const [rescueState, setRescueState] = useState<RescueStateMessage | null>(null);
  const [gate, setGate] = useState<GateStateMessage | null>(null);
  const [gateQuestion, setGateQuestion] = useState<GateQuestionMessage | null>(null);
  const [gateFeedback, setGateFeedback] = useState<GateFeedbackMessage | null>(null);
  const [boss, setBoss] = useState<BossStateMessage | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = new GameSocket({ url, room, nickname });
    socketRef.current = socket;

    const unsubscribeState = socket.subscribeState((state) => {
      setConnectionState(state);
      // 재접속 뒤 새 서버가 전투 상태를 보내기 전까지 행동을 잠급니다.
      if (state !== "online") setCombat(null);
      if (state !== "online") {
        setQuestion(null);
        setQuizFeedback(null);
        setStage(null);
        setRescueState(null);
        setGate(null);
        setGateQuestion(null);
        setGateFeedback(null);
        setBoss(null);
      }
    });
    const unsubscribeMessage = socket.subscribe((message) => {
      if (message.type === "joined") setPlayerId(message.playerId);
      if (message.type === "snapshot") setSnapshot(message);
      if (message.type === "combat") setCombat(message);
      if (message.type === "question") {
        setQuestion(message);
        setQuizFeedback(null);
      }
      if (message.type === "quiz-feedback") setQuizFeedback(message);
      if (message.type === "stage") {
        setStage(message);
        if (message.stage !== 4) setBoss(null);
        if (message.stage < 3) {
          setGate(null);
          setGateQuestion(null);
          setGateFeedback(null);
        }
      }
      if (message.type === "gate-state") setGate(message);
      if (message.type === "gate-question") {
        setGateQuestion(message);
        setGateFeedback(null);
      }
      if (message.type === "gate-feedback") {
        setGateFeedback(message);
        if (message.correct) setGateQuestion(null);
      }
      if (message.type === "boss-state") setBoss(message);
      if (message.type === "rescue-state") setRescueState(message);
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

  const sendAction = useCallback((message: Extract<ClientMessage, { type: "action" }>) => {
    return socketRef.current?.sendAction(message) ?? false;
  }, []);

  const sendQuiz = useCallback((message: Extract<ClientMessage, { type: "answer" | "next-question" | "gate-answer" }>) => {
    return socketRef.current?.sendQuiz(message) ?? false;
  }, []);

  return { connectionState, snapshot, combat, question, quizFeedback, stage, rescueState, gate, gateQuestion, gateFeedback, boss, playerId, error, sendInput, sendAction, sendQuiz };
}
