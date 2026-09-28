import { z } from "zod";

/** 앞의 0도 방 코드의 일부이므로 숫자로 변환하지 않고 정확히 여섯 자리 문자열로 검증합니다. */
export const RoomCodeSchema = z.string().regex(/^[0-9]{6}$/);

/** 임시 별명은 2~12자이며 제어 문자를 포함할 수 없습니다. */
export const NicknameSchema = z
  .string()
  .min(2)
  .max(12)
  .regex(/^[\p{L}\p{N} _-]+$/u);

const JoinMessageSchema = z
  .object({
    type: z.literal("join"),
    nickname: NicknameSchema,
    reconnectToken: z.string().min(1).max(128).optional(),
  })
  .strict();

const InputMessageSchema = z
  .object({
    type: z.literal("input"),
    sequence: z.number().int().nonnegative(),
    axis: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    jump: z.boolean(),
  })
  .strict();

/** 거품 행동은 요청만 전달하며 위치와 포획 결과는 서버가 정합니다. */
const ActionMessageSchema = z
  .object({
    type: z.literal("action"),
    sequence: z.number().int().nonnegative(),
    kind: z.enum(["fire", "pop"]),
    direction: z.union([z.literal(-1), z.literal(1)]),
  })
  .strict();

const PingMessageSchema = z
  .object({
    type: z.literal("ping"),
    sentAt: z.number().finite().nonnegative(),
  })
  .strict();

const AnswerMessageSchema = z.object({
  type: z.literal("answer"),
  questionId: z.string().uuid(),
  choice: z.number().int().min(0).max(20),
}).strict();

const NextQuestionMessageSchema = z.object({ type: z.literal("next-question") }).strict();

export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinMessageSchema,
  InputMessageSchema,
  ActionMessageSchema,
  AnswerMessageSchema,
  NextQuestionMessageSchema,
  PingMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const PublicPlayerStateSchema = z
  .object({
    id: z.string().min(1),
    nickname: NicknameSchema,
    x: z.number().finite(),
    y: z.number().finite(),
    velocityX: z.number().finite(),
    velocityY: z.number().finite(),
    connected: z.boolean(),
  })
  .strict();

export type PublicPlayerState = z.infer<typeof PublicPlayerStateSchema>;

export const MapTierSchema = z.enum(["small", "medium", "large", "xlarge"]);

const JoinedMessageSchema = z
  .object({
    type: z.literal("joined"),
    playerId: z.string().min(1),
    reconnectToken: z.string().min(1),
    tickRate: z.literal(20),
    snapshotRate: z.literal(10),
  })
  .strict();

const SnapshotMessageSchema = z
  .object({
    type: z.literal("snapshot"),
    serverTick: z.number().int().nonnegative(),
    mapTier: MapTierSchema,
    players: z.array(PublicPlayerStateSchema).max(10),
  })
  .strict();

const CombatMessageSchema = z
  .object({
    type: z.literal("combat"),
    serverTick: z.number().int().nonnegative(),
    monsters: z.array(
      z.object({
        id: z.string().min(1),
        x: z.number().finite(),
        y: z.number().finite(),
        trapped: z.boolean(),
      }).strict(),
    ).max(8),
    bubbles: z.array(
      z.object({
        id: z.string().min(1),
        x: z.number().finite(),
        y: z.number().finite(),
        trappedMonsterId: z.string().min(1).nullable(),
      }).strict(),
    ).max(80),
    capturedCount: z.number().int().nonnegative(),
  })
  .strict();

const PongMessageSchema = z
  .object({
    type: z.literal("pong"),
    sentAt: z.number().finite().nonnegative(),
    serverAt: z.number().finite().nonnegative(),
  })
  .strict();

/** 정답은 학생에게 보내지 않고 각자의 선택지만 전송합니다. */
const QuestionMessageSchema = z.object({
  type: z.literal("question"),
  questionId: z.string().uuid(),
  prompt: z.string().min(1).max(40),
  choices: z.array(z.number().int().min(0).max(20)).length(4),
  solvedCount: z.number().int().nonnegative(),
}).strict();

const QuizFeedbackMessageSchema = z.object({
  type: z.literal("quiz-feedback"),
  questionId: z.string().uuid(),
  correct: z.boolean(),
  completed: z.boolean(),
  solvedCount: z.number().int().nonnegative(),
  hint: z.string().max(100).optional(),
  wrongChoice: z.number().int().min(0).max(20).optional(),
  answer: z.number().int().min(0).max(20).optional(),
  boosted: z.boolean(),
}).strict();

const ErrorMessageSchema = z
  .object({
    type: z.literal("error"),
    code: z.enum(["INVALID_MESSAGE", "INVALID_ROOM", "ROOM_FULL", "RATE_LIMITED"]),
    message: z.string().min(1).max(200),
  })
  .strict();

export const ServerMessageSchema = z.discriminatedUnion("type", [
  JoinedMessageSchema,
  SnapshotMessageSchema,
  CombatMessageSchema,
  QuestionMessageSchema,
  QuizFeedbackMessageSchema,
  PongMessageSchema,
  ErrorMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
