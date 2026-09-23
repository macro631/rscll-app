import { useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSesion } from '../auth';
import { api } from '../lib/backend';
import { useCola } from '../lib/cola';
import { ROLES } from '../lib/tipos';

const consulta = '(min-width: 1024px)';

export function useEsEscritorio() {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(consulta);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => matchMedia(consulta).matches,
  );
}

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const si = () => setEnLinea(true);
    const no = () => setEnLinea(false);
    window.addEventListener('online', si);
    window.addEventListener('offline', no);
    return () => {
      window.removeEventListener('online', si);
      window.removeEventListener('offline', no);
    };
  }, []);
  return enLinea;
}

export function EstadoSincronizacion() {
  const cola = useCola();
  const enLinea = useEnLinea();
  if (cola.length > 0) {
    return (
      <span className="sync sync-pendiente" title="Se enviará al recuperar conexión">
        ⟳ {cola.length} por sincronizar
      </span>
    );
  }
  if (!enLinea) return <span className="sync sync-sin-red">Sin conexión</span>;
  return null;
}

export function Layout() {
  const { perfil, salir } = useSesion();
  const escritorio = useEsEscritorio();
  const cola = useCola();
  const esAdmin = perfil?.rol === 'admin';

  const secciones = [
    { a: '/inicio', texto: 'Inicio', icono: '▦' },
    { a: '/revision', texto: 'Revisión', icono: '✎' },
    { a: '/informes', texto: 'Informes', icono: '▤' },
    ...(escritorio ? [{ a: '/base', texto: 'Base', icono: '☰' }] : []),
    ...(esAdmin ? [{ a: '/historial', texto: 'Historial', icono: '⏱' }] : []),
  ];

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera-titulo">
          <strong>RSCLL</strong>
          <span className="cabecera-proyecto">SubComisaría Llay Llay</span>
          {api().modo === 'demo' && <span className="etiqueta-demo">Demo</span>}
        </div>
        <EstadoSincronizacion />
        <div className="cabecera-usuario">
          <span>
            {perfil?.nombre}
            <span className="suave pequeño"> · {perfil && ROLES[perfil.rol]}</span>
          </span>
          <button
            className="boton-texto"
            onClick={() => void salir()}
            title={cola.length ? 'Hay cambios por sincronizar; se enviarán al volver a ingresar' : undefined}
          >
            Salir
          </button>
        </div>
      </header>
      <nav className="navegacion" aria-label="Secciones">
        {secciones.map((s) => (
          <NavLink key={s.a} to={s.a} className={({ isActive }) => `nav-item${isActive ? ' activo' : ''}`}>
            <span className="nav-icono" aria-hidden="true">{s.icono}</span>
            <span>{s.texto}</span>
          </NavLink>
        ))}
      </nav>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
