/*
 * Su reflejo en el espejo de obsidiana (provisional, dibujado a mano en SVG).
 * Al principio es una silueta oscura sin rostro. Cada recuerdo que le devuelve
 * la naturaleza agrega un detalle (las clases m1…m4 las pone MirrorView):
 *   m1 = los ojos · m2 = la sonrisa · m3 = flores en el pelo · m4 = una luz cálida en el rostro
 */
export function Reflection() {
  return (
    <svg className="reflection" viewBox="0 0 200 240" aria-hidden="true">
      {/* el marco de piedra y el vidrio negro */}
      <ellipse cx="100" cy="120" rx="92" ry="112" fill="#3a332d" />
      <ellipse cx="100" cy="120" rx="82" ry="102" fill="#08070c" />
      <ellipse cx="78" cy="70" rx="22" ry="38" fill="#ffffff" opacity="0.05" transform="rotate(-20 78 70)" />
      {/* la silueta: hombros, cuello, cabeza y orejas de elfa */}
      <g fill="#17141f">
        <path d="M30 222 C40 170 70 160 100 160 C130 160 160 170 170 222 Z" />
        <rect x="88" y="138" width="24" height="30" rx="8" />
        <ellipse cx="100" cy="112" rx="34" ry="40" />
        <path d="M68 104 L44 84 L70 118 Z" />
        <path d="M132 104 L156 84 L130 118 Z" />
        <path d="M66 98 C64 60 136 60 134 98 C126 78 74 78 66 98 Z" />
      </g>
      {/* m4: una luz cálida en el rostro */}
      <ellipse className="rf m4" cx="100" cy="116" rx="30" ry="34" fill="#ffb466" opacity="0.18" />
      {/* m1: los ojos */}
      <g className="rf m1" fill="#ffe2a8">
        <ellipse cx="87" cy="110" rx="4" ry="5" />
        <ellipse cx="113" cy="110" rx="4" ry="5" />
      </g>
      {/* m2: la sonrisa */}
      <path className="rf m2" d="M88 130 Q100 140 112 130" stroke="#ffd59a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* m3: flores en el pelo */}
      <g className="rf m3">
        <circle cx="76" cy="80" r="5" fill="#f2a3c4" />
        <circle cx="88" cy="73" r="4" fill="#ffd27a" />
        <circle cx="120" cy="76" r="4.5" fill="#b9e3a0" />
      </g>
    </svg>
  )
}
