import { NicknameSchema, RoomCodeSchema } from "@bubble-semble/shared";
import Link from "next/link";
import type { ReactElement } from "react";
import { GameShell } from "../../components/GameShell";

type PlayPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlayPage({ searchParams }: PlayPageProps): Promise<ReactElement> {
  const params = await searchParams;
  const room = typeof params.room === "string" ? params.room.trim() : "";
  const nickname = typeof params.nickname === "string" ? params.nickname.trim() : "";

  if (!RoomCodeSchema.safeParse(room).success || !NicknameSchema.safeParse(nickname).success) {
    return (
      <main className="invalid-room-shell">
        <section className="invalid-room-card">
          <p className="eyebrow">입장 정보 확인</p>
          <h1>게임방을 찾지 못했어요.</h1>
          <p>방 코드와 별명을 다시 입력해 주세요.</p>
          <Link href="/">로비로 돌아가기</Link>
        </section>
      </main>
    );
  }

  return <GameShell room={room} nickname={nickname} />;
}
