import { z } from "zod";

/** 여섯 자리 영문 대문자·숫자 방 코드만 허용합니다. */
export const RoomCodeSchema = z.string().regex(/^[A-Z0-9]{6}$/);

/** 임시 별명은 2~11자이며 제어 문자를 포함할 수 없습니다. */
export const NicknameSchema = z
  .string()
  .min(2)
  .max(11)
  .regex(/^[^\p{Cc}\p{Cf}]+$/u);

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

const PingMessageSchema = z
  .object({
    type: z.literal("ping"),
    sentAt: z.number().finite().nonnegative(),
  })
  .strict();

export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinMessageSchema,
  InputMessageSchema,
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

const PongMessageSchema = z
  .object({
    type: z.literal("pong"),
    sentAt: z.number().finite().nonnegative(),
    serverAt: z.number().finite().nonnegative(),
  })
  .strict();

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
  PongMessageSchema,
  ErrorMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
