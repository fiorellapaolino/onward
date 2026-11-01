import { lazy, Suspense } from 'react'
import SymbolsApp from './simbolos/SymbolsApp'

// Prototipo nuevo: "el bosque que se dibuja".
// La versión anterior (la aldea) sigue disponible con ?aldea en la dirección; solo se carga si se pide.
const VillageApp = lazy(() => import('./VillageApp'))
const VILLAGE = new URLSearchParams(location.search).has('aldea')
// Zona de prueba del símbolo del tiempo: ?tiempo en la dirección.
const TimeApp = lazy(() => import('./tiempo/TimeApp'))
const TIEMPO = new URLSearchParams(location.search).has('tiempo')

export default function App() {
  if (TIEMPO)
    return (
      <Suspense fallback={null}>
        <TimeApp />
      </Suspense>
    )
  return VILLAGE ? (
    <Suspense fallback={null}>
      <VillageApp />
    </Suspense>
  ) : (
    <SymbolsApp />
  )
}
