"use client";

import { NicknameSchema, RoomCodeSchema } from "@bubble-semble/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type FormErrors = {
  room?: string;
  nickname?: string;
};

export function LobbyForm() {
  const router = useRouter();
  const [room, setRoom] = useState("");
  const [nickname, setNickname] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedRoom = room.trim().toUpperCase();
    const normalizedNickname = nickname.trim();
    const nextErrors: FormErrors = {};

    if (!RoomCodeSchema.safeParse(normalizedRoom).success) {
      nextErrors.room = "방 코드는 혼동 문자를 제외한 6자리입니다.";
    }
    if (!NicknameSchema.safeParse(normalizedNickname).success) {
      nextErrors.nickname = "별명은 2~12자로 입력해 주세요.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    router.push(`/play?room=${normalizedRoom}&nickname=${normalizedNickname}`);
  }

  return (
    <form className="lobby-form" onSubmit={handleSubmit} noValidate>
      <div className="field-group">
        <label htmlFor="room-code">방 코드</label>
        <input
          id="room-code"
          name="room"
          value={room}
          onChange={(event) => setRoom(event.target.value.toUpperCase().slice(0, 6))}
          aria-describedby={errors.room ? "room-error" : "room-hint"}
          aria-invalid={Boolean(errors.room)}
          autoComplete="off"
          inputMode="text"
          maxLength={6}
          placeholder="B7K9Q2"
        />
        {errors.room ? (
          <p className="field-error" id="room-error">
            {errors.room}
          </p>
        ) : (
          <p className="field-hint" id="room-hint">
            선생님이 알려준 6자리 코드를 입력하세요.
          </p>
        )}
      </div>

      <div className="field-group">
        <label htmlFor="nickname">별명</label>
        <input
          id="nickname"
          name="nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value.slice(0, 12))}
          aria-describedby={errors.nickname ? "nickname-error" : "nickname-hint"}
          aria-invalid={Boolean(errors.nickname)}
          autoComplete="off"
          maxLength={12}
          placeholder="별빛토끼"
        />
        {errors.nickname ? (
          <p className="field-error" id="nickname-error">
            {errors.nickname}
          </p>
        ) : (
          <p className="field-hint" id="nickname-hint">
            2~12자의 기억하기 쉬운 별명을 사용하세요.
          </p>
        )}
      </div>

      <button type="submit">같이 시작하기</button>
      <p className="privacy-note">별명은 현재 게임방 입장과 플레이어 구분에만 사용합니다.</p>
    </form>
  );
}
