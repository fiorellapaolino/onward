import { lazy, Suspense } from 'react'
import BrasaApp from './brasa/BrasaApp'

// El juego: Onward, la luz que se pasa de mano en mano (src/brasa/).
// La versión anterior (la aldea) sigue disponible con ?aldea en la dirección; solo se carga si se pide.
const VillageApp = lazy(() => import('./VillageApp'))
const VILLAGE = new URLSearchParams(location.search).has('aldea')
// El prototipo de los símbolos (el bosque que se dibuja) sigue disponible con ?simbolos.
const SymbolsApp = lazy(() => import('./simbolos/SymbolsApp'))
const SYMBOLS = new URLSearchParams(location.search).has('simbolos')

export default function App() {
  if (SYMBOLS)
    return (
      <Suspense fallback={null}>
        <SymbolsApp />
      </Suspense>
    )
  return VILLAGE ? (
    <Suspense fallback={null}>
      <VillageApp />
    </Suspense>
  ) : (
    <BrasaApp />
  )
}
