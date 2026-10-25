import { input, useUi } from '../game/state'

/*
 * Fila con los cuatro elementos del Mago, abajo en el centro.
 * Cada uno con su tecla (1-4). Al llegar a un obstáculo brillan para que elijas;
 * los que ya usaste se apagan. En móvil se pueden tocar.
 * Los nombres están en inglés (copa, espada, vara, moneda).
 */
const ELEMENTS = [
  { name: 'Cup', icon: <CupIcon /> },
  { name: 'Sword', icon: <SwordIcon /> },
  { name: 'Wand', icon: <WandIcon /> },
  { name: 'Coin', icon: <CoinIcon /> },
]

export function Elements() {
  const ui = useUi()
  return (
    <div className={`elements ${ui.inv ? 'show' : ''} ${ui.choosing ? 'choosing' : ''}`}>
      {ELEMENTS.map((el, i) => {
        const used = ui.used.includes(String(i))
        return (
          <button
            key={el.name}
            type="button"
            className={`element ${used ? 'used' : ''} ${ui.wrong === i ? 'wrong' : ''}`}
            disabled={used}
            aria-label={`${i + 1}: ${el.name}`}
            onPointerDown={(e) => {
              e.stopPropagation() // que no mueva la cámara ni camine
              if (!used) input.choose = i
            }}
          >
            <span className="key">{i + 1}</span>
            {el.icon}
            <span className="name">{el.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function CupIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 6h16v5a8 8 0 0 1-16 0z" />
      <path d="M16 19v6M11 26h10" />
    </svg>
  )
}
function SwordIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3l2.5 4v13h-5V7z" />
      <path d="M10 21h12M16 21v6M14 28h4" />
    </svg>
  )
}
function WandIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M9 27L22 8" />
      <circle cx="23.5" cy="6" r="2.5" />
      <path d="M27 11l1.5 1M26 3l2-1M19 4l-1-2" />
    </svg>
  )
}
function CoinIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" />
      <path d="M16 8.5l2.1 5.2 5.6.4-4.3 3.6 1.4 5.4L16 20.1l-4.8 3 1.4-5.4-4.3-3.6 5.6-.4z" />
    </svg>
  )
}
