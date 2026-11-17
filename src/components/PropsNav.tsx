import { useEffect, useRef, useState } from "react";
import { usePrefs } from "../state/prefs";

interface Head {
  el: HTMLElement;
  text: string;
}

/**
 * A strip at the top of the properties panel that lists its headings (Template, Data, Plan view,
 * Longitudinal profile, Engineering events...) so a click scrolls to one. It can be hidden; the choice is kept in the browser.
 */
export function PropsNav() {
  const me = useRef<HTMLDivElement>(null);
  const on = usePrefs((p) => p.propsNav);
  const [heads, setHeads] = useState<Head[]>([]);
  useEffect(() => {
    const wrap = me.current?.parentElement;
    if (!wrap) return;
    let raf = 0;
    const scan = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const list = [
          ...wrap.querySelectorAll<HTMLElement>(".props h3, .props h4"),
        ]
          .filter((h) => (h.textContent ?? "").trim())
          .map((el) => ({ el, text: (el.textContent ?? "").trim() }));
        setHeads((old) =>
          old.length === list.length && old.every((o, i) => o.el === list[i].el)
            ? old
            : list,
        );
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(wrap, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={me} className="props-nav" data-props-nav={on ? "on" : "off"}>
      <button
        type="button"
        className="props-nav-toggle"
        aria-pressed={on}
        onClick={() => usePrefs.getState().setPropsNav(!on)}
        title={on ? "Hide the section list" : "Show the section list"}
      >
        {on ? "Sections ▴" : "Sections ▾"}
      </button>
      {on && (
        <div className="props-nav-list">
          {heads.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                h.el.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
            >
              {h.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
