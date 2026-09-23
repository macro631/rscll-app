import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSesion } from '../auth';
import { api } from '../lib/backend';
import { useCola } from '../lib/cola';
import { ROLES } from '../lib/tipos';
import { Icono, type NombreIcono } from './Icono';

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
      <span className="sync sync-pendiente" title="Se enviará al recuperar la conexión">
        <Icono nombre="sync" tam={15} />
        {cola.length} por enviar
      </span>
    );
  }
  if (!enLinea) return <span className="sync sync-sin-red">Sin conexión</span>;
  return null;
}

function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : (p[0]?.[1] ?? ''))).toUpperCase();
}

function MenuCuenta() {
  const { perfil, salir } = useSesion();
  const cola = useCola();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);
  if (!perfil) return null;
  return (
    <div className="cuenta" ref={caja}>
      <button className="cuenta-boton" aria-expanded={abierto} aria-label={`Cuenta de ${perfil.nombre}`} onClick={() => setAbierto((a) => !a)}>
        <span className="iniciales" aria-hidden="true">{iniciales(perfil.nombre)}</span>
      </button>
      {abierto && (
        <div className="cuenta-menu" role="menu">
          <p>
            <strong>{perfil.nombre}</strong>
            <br />
            <span className="suave chico">{ROLES[perfil.rol]}</span>
          </p>
          {cola.length > 0 && <p className="chico">Hay {cola.length} cambio(s) por enviar; se enviarán al volver a ingresar.</p>}
          <button role="menuitem" onClick={() => void salir()}>
            <Icono nombre="salir" tam={20} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { perfil, salir } = useSesion();
  const escritorio = useEsEscritorio();
  const demo = api().modo === 'demo';

  const secciones: { a: string; texto: string; icono: NombreIcono }[] = [
    { a: '/inicio', texto: 'Inicio', icono: 'planta' },
    { a: '/revision', texto: 'Revisión', icono: 'revision' },
    { a: '/informes', texto: 'Informes', icono: 'informe' },
    ...(escritorio ? [{ a: '/base', texto: 'Base', icono: 'base' as const }] : []),
    ...(perfil?.rol === 'admin' ? [{ a: '/historial', texto: 'Historial', icono: 'historial' as const }] : []),
  ];

  return (
    <div className="app">
      <header className="barra-sup">
        <div className="marca-app">
          <strong>RSCLL</strong>
          <span>SubComisaría Llay Llay</span>
        </div>
        {demo && <span className="etiqueta-demo">Demo</span>}
        <EstadoSincronizacion />
        <MenuCuenta />
      </header>

      <nav className="navegacion" aria-label="Secciones">
        <div className="nav-cajetin">
          <strong>RSCLL</strong>
          <span>Reposición SubComisaría Llay Llay</span>
          {demo && <span className="etiqueta-demo">Modo demostración</span>}
        </div>
        {secciones.map((s) => (
          <NavLink key={s.a} to={s.a} className={({ isActive }) => `nav-item${isActive ? ' activo' : ''}`}>
            <Icono nombre={s.icono} />
            <span>{s.texto}</span>
          </NavLink>
        ))}
        <div className="nav-pie">
          <EstadoSincronizacion />
          {perfil && (
            <div className="usuario">
              <span className="iniciales" aria-hidden="true">{iniciales(perfil.nombre)}</span>
              <span>
                <strong className="chico">{perfil.nombre}</strong>
                <br />
                <span className="suave mini">{ROLES[perfil.rol]}</span>
              </span>
            </div>
          )}
          <button className="boton boton-sutil boton-chico boton-ancho" onClick={() => void salir()}>
            <Icono nombre="salir" tam={18} />
            Cerrar sesión
          </button>
        </div>
      </nav>

      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
