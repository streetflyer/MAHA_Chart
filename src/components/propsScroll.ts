import { useLayoutEffect, useRef, type RefObject } from "react";
import { useEditor } from "../state/store";

/**
 * The properties pane keeps the user's place. Each panel, text, image (or the template)
 * remembers how far its settings were scrolled; selecting it again, a click on the sheet,
 * a smooth or any other change of the chart leaves that place alone instead of going
 * back to the top. Only a new object, never seen before, starts at the top.
 */
export function usePropsScroll(ref: RefObject<HTMLElement | null>) {
  const selection = useEditor((s) => s.selection);
  const key =
    selection.length === 1
      ? `${selection[0].kind}:${selection[0].id}`
      : selection.length > 1
        ? "many"
        : "template";
  const saved = useRef(new Map<string, number>());
  const current = useRef(key);
  const settling = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      // A scroll the browser makes while the content swaps is not the user's.
      if (performance.now() < settling.current) return;
      saved.current.set(current.current, el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || current.current === key) return;
    current.current = key;
    settling.current = performance.now() + 250;
    const to = saved.current.get(key) ?? 0;
    el.scrollTop = to;
    // Sections that fill in a moment later (data, lists) can make room only then.
    requestAnimationFrame(() => {
      if (current.current === key && Math.abs(el.scrollTop - to) > 1)
        el.scrollTop = to;
    });
  }, [key, ref]);
}
