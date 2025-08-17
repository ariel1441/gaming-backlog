export default function EllipsisTick({
  x,
  y,
  payload,
  angle = -18,
  maxChars = 22,
  color = "#9ca3af",
}) {
  const full = String(payload?.value ?? "");
  const text =
    full.length > maxChars ? `${full.slice(0, maxChars - 1)}…` : full;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        dy={8}
        textAnchor="end"
        transform={`rotate(${angle})`}
        fill={color}
        fontSize={12}
        title={full}
      >
        {text}
      </text>
    </g>
  );
}
