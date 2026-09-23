import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useSesion } from './auth';
import { Layout, useEsEscritorio } from './components/Layout';
import { Ingreso } from './features/Ingreso';
import { Inicio } from './features/inicio/Inicio';
import { Revision } from './features/revision/Revision';
import { RecintoFicha } from './features/revision/RecintoFicha';
import { RevisionFicha } from './features/revision/RevisionFicha';

const Informes = lazy(() => import('./features/informes/Informes'));
const Base = lazy(() => import('./features/base/Base'));
const Historial = lazy(() => import('./features/historial/Historial'));

function Cargando() {
  return <p className="cargando">Cargando…</p>;
}

function SoloEscritorio({ children }: { children: React.ReactNode }) {
  const escritorio = useEsEscritorio();
  if (!escritorio) {
    return (
      <div className="vacio">
        <p>La Base de observaciones se consulta en escritorio.</p>
        <p className="suave">En el teléfono use Revisión o Informes.</p>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const { perfil, cargando } = useSesion();
  if (cargando) return <Cargando />;
  if (!perfil) return <Ingreso />;
  return (
    <BrowserRouter>
      <Suspense fallback={<Cargando />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/inicio" element={<Inicio />} />
            <Route path="/revision" element={<Revision />} />
            <Route path="/revision/recinto/:codigo" element={<RecintoFicha />} />
            <Route path="/revision/ficha/:id" element={<RevisionFicha />} />
            <Route path="/informes" element={<Informes />} />
            <Route path="/base" element={<SoloEscritorio><Base /></SoloEscritorio>} />
            {perfil.rol === 'admin' && <Route path="/historial" element={<Historial />} />}
            <Route path="*" element={<Navigate to="/inicio" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
