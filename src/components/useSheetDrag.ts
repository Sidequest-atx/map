import { useEffect, type RefObject } from "react";

/**
 * Bottom-sheet drag for the mobile map detail.
 *
 * Apple-style: 1:1 tracking from the grab point, rubber-band above the rest
 * position, velocity projection on release to decide dismiss vs. settle, and
 * a critically damped spring (no bounce) back to rest. Interruptible: a new
 * pointerdown mid-spring takes over from the current transform.
 */
export function useSheetDrag(ref: RefObject<HTMLElement | null>, handleRef: RefObject<HTMLElement | null>, onDismiss: () => void, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    const handle = handleRef.current ?? el;
    if (!el || !handle || !enabled) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let y = 0; // current translateY (px)
    let startY = 0;
    let grabY = 0;
    let raf = 0;
    let dragging = false;
    const samples: { t: number; y: number }[] = [];

    const setY = (v: number) => {
      y = v;
      el.style.transform = v === 0 ? "" : `translate3d(0, ${v}px, 0)`;
    };

    const rubber = (over: number, dim: number, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

    const springTo = (target: number, v0: number, done?: () => void) => {
      cancelAnimationFrame(raf);
      if (reduce) {
        setY(target);
        done?.();
        return;
      }
      // critically damped spring, response ~0.32s
      const omega = 2 * Math.PI / 0.32;
      let pos = y;
      let vel = v0;
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(0.032, (now - last) / 1000);
        last = now;
        const x = pos - target;
        const acc = -omega * omega * x - 2 * omega * vel;
        vel += acc * dt;
        pos += vel * dt;
        setY(pos);
        if (Math.abs(pos - target) < 0.5 && Math.abs(vel) < 20) {
          setY(target);
          done?.();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Only drag from the handle, or from the body when it's scrolled to top.
      const scroller = el.querySelector<HTMLElement>(".detail-scroll");
      const fromHandle = handle.contains(e.target as Node);
      if (!fromHandle && scroller && scroller.scrollTop > 0) return;
      dragging = true;
      cancelAnimationFrame(raf);
      startY = y;
      grabY = e.clientY;
      samples.length = 0;
      samples.push({ t: e.timeStamp, y: e.clientY });
      handle.setPointerCapture(e.pointerId);
      el.style.transition = "none";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const h = el.getBoundingClientRect().height;
      let next = startY + (e.clientY - grabY);
      if (next < 0) next = rubber(next, h);
      setY(next);
      samples.push({ t: e.timeStamp, y: e.clientY });
      if (samples.length > 6) samples.shift();
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const h = el.getBoundingClientRect().height;
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = Math.max(1, b.t - a.t);
      const v = ((b.y - a.y) / dt) * 1000; // px/s
      // Project momentum (decelerationRate 0.998) and decide by the sign of velocity when fast.
      const projected = y + ((v / 1000) * 0.998) / (1 - 0.998);
      const dismiss = v > 600 || (Math.abs(v) < 600 && projected > h * 0.45);
      if (dismiss) {
        springTo(h + 24, Math.max(v, 400), () => {
          setY(0);
          onDismiss();
        });
      } else {
        springTo(0, v);
      }
    };

    handle.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(raf);
      handle.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.style.transform = "";
    };
  }, [ref, handleRef, onDismiss, enabled]);
}
