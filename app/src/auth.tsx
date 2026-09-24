import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './lib/backend';
import { detenerCola, iniciarCola } from './lib/cola';
import { refrescar } from './lib/datos';
import type { Perfil, Rol } from './lib/tipos';

// Último perfil confirmado por el servidor: permite abrir la app sin señal sin perder la sesión.
const CLAVE_PERFIL = 'rscll-perfil';

function recordarPerfil(p: Perfil) {
  try {
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify(p));
  } catch {
    /* sin almacenamiento local */
  }
}

function perfilRecordado(uid: string): Perfil | null {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE_PERFIL) ?? 'null') as Perfil | null;
    return p && p.id === uid && p.activo ? p : null;
  } catch {
    return null;
  }
}

function olvidarPerfil() {
  try {
    localStorage.removeItem(CLAVE_PERFIL);
  } catch {
    /* sin almacenamiento local */
  }
}

function esErrorDeRed(mensaje: string) {
  return !navigator.onLine || /fetch|network|timeout|conexi/i.test(mensaje);
}

interface Sesion {
  perfil: Perfil | null;
  cargando: boolean;
  error: string | null;
  salir: () => Promise<void>;
  puede: (...roles: Rol[]) => boolean;
}

const Contexto = createContext<Sesion>({
  perfil: null,
  cargando: true,
  error: null,
  salir: async () => {},
  puede: () => false,
});

export function useSesion() {
  return useContext(Contexto);
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const b = api();
    const uid = await b.usuarioId();
    if (!uid) {
      setPerfil(null);
      detenerCola();
      setCargando(false);
      return;
    }
    try {
      const p = await b.rpc<Perfil>('mi_perfil');
      recordarPerfil(p);
      setPerfil(p);
      setError(null);
      qc.clear();
      await iniciarCola(p.id, () => refrescar(qc));
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      const guardado = perfilRecordado(uid);
      // Sin señal no se cierra la sesión: se sigue con el último perfil confirmado y la cola local.
      if (esErrorDeRed(mensaje) && guardado) {
        setPerfil(guardado);
        setError(null);
        await iniciarCola(guardado.id, () => refrescar(qc));
      } else {
        setPerfil(null);
        setError(mensaje);
        await b.cerrarSesion();
      }
    } finally {
      setCargando(false);
    }
  }, [qc]);

  useEffect(() => {
    void cargar();
    const b = api();
    const fin1 = b.alCambiarSesion(() => void cargar());
    // Cambios de otros usuarios (Supabase Realtime) o locales (demo) refrescan las vistas.
    const fin2 = b.alCambiarDatos(() => refrescar(qc));
    return () => {
      fin1();
      fin2();
    };
  }, [cargar, qc]);

  const salir = useCallback(async () => {
    detenerCola();
    olvidarPerfil();
    await api().cerrarSesion();
    qc.clear();
  }, [qc]);

  const puede = useCallback((...roles: Rol[]) => !!perfil && roles.includes(perfil.rol), [perfil]);

  return <Contexto.Provider value={{ perfil, cargando, error, salir, puede }}>{children}</Contexto.Provider>;
}
