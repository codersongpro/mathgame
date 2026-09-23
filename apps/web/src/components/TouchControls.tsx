"use client";

import { type PointerEvent, useRef, useState } from "react";

export type TouchInput = {
  axis: -1 | 0 | 1;
  jump: boolean;
};

type ControlName = "left" | "right" | "jump";

export function TouchControls({ onChange }: { onChange: (input: TouchInput) => void }) {
  const activePointers = useRef<Record<ControlName, Set<number>>>(
    {
      left: new Set(),
      right: new Set(),
      jump: new Set(),
    },
  );
  const [input, setInput] = useState<TouchInput>({ axis: 0, jump: false });

  function emitCurrentInput() {
    const left = activePointers.current.left.size > 0;
    const right = activePointers.current.right.size > 0;
    const nextInput: TouchInput = {
      axis: left === right ? 0 : left ? -1 : 1,
      jump: activePointers.current.jump.size > 0,
    };
    setInput(nextInput);
    onChange(nextInput);
  }

  function press(control: ControlName, event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointers.current[control].add(event.pointerId);
    emitCurrentInput();
  }

  function release(control: ControlName, event: PointerEvent<HTMLButtonElement>) {
    if (!activePointers.current[control].delete(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    emitCurrentInput();
  }

  function controlProps(control: ControlName) {
    return {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => press(control, event),
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => release(control, event),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => release(control, event),
      onPointerLeave: (event: PointerEvent<HTMLButtonElement>) => release(control, event),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => release(control, event),
    };
  }

  return (
    <div
      className="touch-controls"
      aria-label="게임 터치 조작"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="direction-controls">
        <button
          type="button"
          className="touch-button"
          style={{ minWidth: 64, minHeight: 64 }}
          aria-label="왼쪽으로 이동"
          aria-pressed={input.axis === -1}
          {...controlProps("left")}
        >
          <span aria-hidden="true">◀</span>
        </button>
        <button
          type="button"
          className="touch-button"
          style={{ minWidth: 64, minHeight: 64 }}
          aria-label="오른쪽으로 이동"
          aria-pressed={input.axis === 1}
          {...controlProps("right")}
        >
          <span aria-hidden="true">▶</span>
        </button>
      </div>
      <button
        type="button"
        className="touch-button jump-button"
        style={{ minWidth: 88, minHeight: 64 }}
        aria-label="점프"
        aria-pressed={input.jump}
        {...controlProps("jump")}
      >
        <span aria-hidden="true">점프</span>
      </button>
    </div>
  );
}
