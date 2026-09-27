import type { MiniMapNodeProps } from "@xyflow/react";

export default function EditorMiniMapNode({ id, x, y, width, height, color, selected, onClick }: MiniMapNodeProps) {
  const size = Math.max(24, Math.min(width, height));
  const cx = x + width / 2;
  const cy = y + height / 2;
  const arm = size * 0.36;
  return (
    <g onClick={onClick ? (event) => onClick(event, id) : undefined}>
      {selected && <circle cx={cx} cy={cy} r={size * 0.65} fill="none" stroke="#fbbf24" strokeWidth={size * 0.08} />}
      <path d={`M${cx-arm},${cy-arm} L${cx+arm},${cy+arm} M${cx+arm},${cy-arm} L${cx-arm},${cy+arm}`} fill="none" stroke={color} strokeWidth={size * 0.2} strokeLinecap="square" />
    </g>
  );
}
