import Link from "next/link";
import type { ReactElement } from "react";
import type { ConnectionState } from "../realtime/GameSocket";

export function ReconnectOverlay({ state }: { state: ConnectionState }): ReactElement | null {
  if (state === "reconnecting") {
    return (
      <div className="reconnect-overlay" role="status" aria-live="polite">
        <span className="reconnect-spinner" aria-hidden="true" />
        <p>연결을 다시 시도하고 있어요</p>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="reconnect-overlay reconnect-expired" role="alert">
        <p>방에 다시 참여해 주세요</p>
        <Link href="/">로비로 돌아가기</Link>
      </div>
    );
  }

  return null;
}
