import { rulerSources, useRuler } from "../state/ruler";

/** The ruler: a red line at the ruler's KP in every panel that shows that KP, and its KP above the first. */
export function RulerLines() {
  const on = useRuler((r) => r.on);
  const kp = useRuler((r) => r.kp);
  if (!on || kp === null) return null;
  const lines = [...rulerSources.entries()].flatMap(([id, s]) => {
    const l = s.at(kp);
    return l ? [{ id, l, rect: s.rect }] : [];
  });
  const top = lines.find((x) => Math.abs(x.l.x1 - x.l.x2) < 0.01) ?? lines[0];
  return (
    <g pointerEvents="none" data-ruler-lines={lines.length}>
      <defs>
        {lines.map(({ id, rect }) => (
          <clipPath key={id} id={`ruler-clip-${id}`}>
            <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
          </clipPath>
        ))}
      </defs>
      {lines.map(({ id, l }) => (
        <line
          key={id}
          clipPath={`url(#ruler-clip-${id})`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="#e00000"
          strokeWidth={0.5}
        />
      ))}
      <text
        x={top ? top.l.x1 + 1 : 0}
        y={top ? top.rect.y + 3 : 0}
        fontSize={2.4}
        fill="#e00000"
        fontWeight={700}
      >
        {`KP ${(kp / 1000).toFixed(3)}`}
      </text>
    </g>
  );
}
