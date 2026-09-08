import type { AttributeKey, Attributes } from '../../engine/types';
import { ATTRIBUTE_LABELS } from '../lib/labels';

interface AttributeRadarProps {
  attributes: Attributes;
  keys: readonly AttributeKey[];
  size?: number;
}

// Couleurs reprises de tailwind.config.ts (le SVG maison n'a pas accès aux classes Tailwind sur les attributs stroke/fill).
const GRID_COLOR = '#33434f';
const AXIS_COLOR = '#1b2530';
const FILL_COLOR = '#f5c518';
const LABEL_COLOR = '#9aa7b2';

/** Radar SVG maison des attributs d'un groupe (§3, ProfileScreen). Échelle 0-99. */
export default function AttributeRadar({ attributes, keys, size = 280 }: AttributeRadarProps) {
  const center = size / 2;
  const radius = size / 2 - 44;
  const n = keys.length;
  if (n < 3) return null;

  const angleFor = (i: number): number => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointAt = (i: number, value: number): [number, number] => {
    const r = (Math.max(0, Math.min(99, value)) / 99) * radius;
    const a = angleFor(i);
    return [center + r * Math.cos(a), center + r * Math.sin(a)];
  };
  const toPolygon = (values: number[]): string => keys.map((_, i) => pointAt(i, values[i] ?? 0).join(',')).join(' ');

  const dataPolygon = toPolygon(keys.map((k) => attributes[k]));
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto max-w-sm mx-auto">
      {rings.map((r) => (
        <polygon key={r} points={toPolygon(keys.map(() => r * 99))} fill="none" stroke={GRID_COLOR} strokeWidth={1} />
      ))}
      {keys.map((_, i) => {
        const [x, y] = pointAt(i, 99);
        return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke={AXIS_COLOR} strokeWidth={1} />;
      })}
      <polygon points={dataPolygon} fill={FILL_COLOR} fillOpacity={0.28} stroke={FILL_COLOR} strokeWidth={2} />
      {keys.map((k, i) => {
        const [x, y] = pointAt(i, 99);
        const [lx, ly] = [center + (x - center) * 1.18, center + (y - center) * 1.18];
        return (
          <text
            key={k}
            x={lx}
            y={ly}
            fill={LABEL_COLOR}
            fontSize={10}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-body uppercase"
          >
            {ATTRIBUTE_LABELS[k]}
          </text>
        );
      })}
    </svg>
  );
}
