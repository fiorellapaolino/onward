import { lazy, Suspense } from 'react'
import JardinApp from './jardin/JardinApp'

// El juego: el jardín que suena (src/jardin/).
// Onward (la luz que se pasa de mano en mano) sigue disponible con ?onward; solo se carga si se pide.
const q = new URLSearchParams(location.search)
const BrasaApp = lazy(() => import('./brasa/BrasaApp'))
const VillageApp = lazy(() => import('./VillageApp'))
const SymbolsApp = lazy(() => import('./simbolos/SymbolsApp'))
const ONWARD = ['onward', 'ember', 'fear', 'calm', 'mirror', 'grotto', 'dawn', 'intro', 'nointro', 'lit', 'out'].some((k) => q.has(k))

export default function App() {
  const Other = q.has('simbolos') ? SymbolsApp : q.has('aldea') ? VillageApp : ONWARD ? BrasaApp : null
  if (!Other) return <JardinApp />
  return (
    <Suspense fallback={null}>
      <Other />
    </Suspense>
  )
}
