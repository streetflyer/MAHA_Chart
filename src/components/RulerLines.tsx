import { rulerSources, useRuler } from "../state/ruler";

/** The ruler: a red line at the ruler's KP in every panel that shows that KP, and its KP beside the pointer. */
export function RulerLines() {
  const on = useRuler((r) => r.on);
  const kp = useRuler((r) => r.kp);
  const pointer = useRuler((r) => r.at);
  if (!on || kp === null) return null;
  const lines = [...rulerSources.entries()].flatMap(([id, s]) => {
    const l = s.at(kp);
    return l ? [{ id, l, rect: s.rect }] : [];
  });
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
      {pointer && (
        <text
          data-ruler-kp
          x={pointer.x + (pointer.x > pointer.right - 24 ? -2 : 2)}
          y={pointer.y - 2}
          textAnchor={pointer.x > pointer.right - 24 ? "end" : "start"}
          fontSize={3}
          fontWeight={700}
          fill="#e00000"
          stroke="#fff"
          strokeWidth={0.8}
          paintOrder="stroke"
        >
          {`KP ${(kp / 1000).toFixed(3)}`}
        </text>
      )}
    </g>
  );
}
