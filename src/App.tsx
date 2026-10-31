import { lazy, Suspense } from 'react'
import SymbolsApp from './simbolos/SymbolsApp'

// Prototipo nuevo: "el bosque que se dibuja".
// La versión anterior (la aldea) sigue disponible con ?aldea en la dirección; solo se carga si se pide.
const VillageApp = lazy(() => import('./VillageApp'))
const VILLAGE = new URLSearchParams(location.search).has('aldea')

export default function App() {
  return VILLAGE ? (
    <Suspense fallback={null}>
      <VillageApp />
    </Suspense>
  ) : (
    <SymbolsApp />
  )
}
