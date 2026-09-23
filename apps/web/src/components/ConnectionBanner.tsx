import type { ConnectionState } from "../realtime/GameSocket";
import type { ReactElement } from "react";

const LABELS: Record<ConnectionState, string> = {
  connecting: "게임방에 연결하는 중입니다.",
  online: "친구들과 연결됐습니다.",
  reconnecting: "연결을 다시 시도하고 있어요.",
  expired: "방에 다시 참여해 주세요.",
  offline: "현재 게임방과 연결되지 않았습니다.",
};

export function ConnectionBanner({ state }: { state: ConnectionState }): ReactElement {
  return (
    <div className={`connection-banner connection-${state}`} role="status" aria-live="polite">
      <span className="connection-dot" aria-hidden="true" />
      {LABELS[state]}
    </div>
  );
}
