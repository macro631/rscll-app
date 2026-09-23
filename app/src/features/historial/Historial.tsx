import { useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSesion } from '../../auth';
import { useAviso } from '../../components/Aviso';
import { api } from '../../lib/backend';
import { Icono } from '../../components/Icono';
import { PanelFiltros } from '../informes/Informes';
import { useAccion, useCatalogo, useNombresUsuarios } from '../../lib/datos';
import { descargar, fecha, nombreArchivo } from '../../lib/formato';
import { ACCIONES, ESTADOS, ROLES, type EstadoRecinto, type Evento, type Pagina, type Perfil, type Rol } from '../../lib/tipos';

const POR_PAGINA = 100;

export default function Historial() {
  const [pestaña, setPestaña] = useState<'historial' | 'usuarios' | 'respaldo'>('historial');
  return (
    <div className="historial">
      <div className="pagina-cabeza">
        <h1>Historial</h1>
        <div className="segmentado" role="tablist" aria-label="Sección">
          {([
            ['historial', 'Movimientos', 'historial'],
            ['usuarios', 'Usuarios', 'usuarios'],
            ['respaldo', 'Respaldo', 'respaldo'],
          ] as const).map(([p, texto, icono]) => (
            <button key={p} role="tab" aria-selected={pestaña === p} onClick={() => setPestaña(p)}>
              <Icono nombre={icono} tam={18} />
              {texto}
            </button>
          ))}
        </div>
      </div>
      {pestaña === 'historial' && <Movimientos />}
      {pestaña === 'usuarios' && <Usuarios />}
      {pestaña === 'respaldo' && <Respaldo />}
    </div>
  );
}

function estadoTexto(v: Record<string, unknown> | null) {
  const e = v?.estado_recinto as EstadoRecinto | undefined;
  return e && ESTADOS[e] ? ESTADOS[e].corto : '';
}

function Movimientos() {
  const { recintos } = useCatalogo();
  const usuarios = useNombresUsuarios();
  const [f, setF] = useState<{ actor?: string; recinto?: string; accion?: string; desde?: string; hasta?: string }>({});
  const [pagina, setPagina] = useState(0);
  const datos = useQuery({
    queryKey: ['historial', f, pagina],
    queryFn: () =>
      api().rpc<Pagina<Evento>>('historial', {
        p_filtros: Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
        p_limite: POR_PAGINA,
        p_desplazamiento: pagina * POR_PAGINA,
      }),
    placeholderData: keepPreviousData,
  });
  const cambiar = (c: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...c }));
    setPagina(0);
  };
  const total = datos.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <PanelFiltros resumen="">
      <div className="filtros">
        <label>
          Persona
          <select value={f.actor ?? ''} onChange={(e) => cambiar({ actor: e.target.value || undefined })}>
            <option value="">Todas</option>
            {(usuarios.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
        <label>
          Recinto
          <select value={f.recinto ?? ''} onChange={(e) => cambiar({ recinto: e.target.value || undefined })}>
            <option value="">Todos</option>
            {recintos.map((r) => <option key={r.id} value={r.id}>{r.codigo} · {r.nombre}</option>)}
          </select>
        </label>
        <label>
          Acción
          <select value={f.accion ?? ''} onChange={(e) => cambiar({ accion: e.target.value || undefined })}>
            <option value="">Todas</option>
            {Object.entries(ACCIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={f.desde ?? ''} onChange={(e) => cambiar({ desde: e.target.value || undefined })} />
        </label>
        <label>
          Hasta
          <input type="date" value={f.hasta ?? ''} onChange={(e) => cambiar({ hasta: e.target.value || undefined })} />
        </label>
      </div>
      </PanelFiltros>
      <p className="informe-total">{total} movimiento{total === 1 ? '' : 's'}</p>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr><th>Fecha</th><th>Persona</th><th>Acción</th><th>Recinto</th><th>Estado recinto</th><th>Detalle</th></tr>
          </thead>
          <tbody>
            {(datos.data?.filas ?? []).map((ev) => (
              <tr key={ev.id}>
                <td className="celda-fecha">{fecha(ev.fecha)}</td>
                <td>{ev.actor_nombre ?? '—'}</td>
                <td>{ACCIONES[ev.accion] ?? ev.accion}</td>
                <td>{ev.codigo ? <><span className="codigo">{ev.codigo}</span> {ev.recinto_nombre}</> : '—'}</td>
                <td className="chico">
                  {estadoTexto(ev.antes)}
                  {estadoTexto(ev.antes) || estadoTexto(ev.despues) ? ' → ' : ''}
                  {estadoTexto(ev.despues)}
                </td>
                <td className="celda-texto chico">
                  {ev.comentario ?? ''}
                  {typeof ev.despues?.descripcion === 'string' && <div>{String(ev.despues.especialidad ?? '')}: {ev.despues.descripcion}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="paginacion">
        <button className="boton boton-sutil boton-chico" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Más recientes</button>
        <span>Página {pagina + 1} de {paginas}</span>
        <button className="boton boton-sutil boton-chico" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Más antiguos</button>
      </div>
    </>
  );
}

function Usuarios() {
  const { perfil } = useSesion();
  const aviso = useAviso();
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ['usuarios'], queryFn: () => api().rpc<Perfil[]>('usuarios') });
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', clave: '', rol: 'revisor' as Rol });
  const [creando, setCreando] = useState(false);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setCreando(true);
    try {
      await api().crearUsuario(nuevo);
      aviso(`Cuenta creada para ${nuevo.nombre}`);
      setNuevo({ nombre: '', email: '', clave: '', rol: 'revisor' });
      void qc.invalidateQueries();
    } catch (err) {
      aviso(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setCreando(false);
    }
  }

  return (
    <>
      <section className="tarjeta">
        <h2>Nueva cuenta</h2>
        <form className="formulario formulario-linea" onSubmit={crear}>
          <input required placeholder="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <input required type="email" placeholder="Correo" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
          {api().modo === 'supabase' && (
            <input required minLength={8} placeholder="Clave inicial (mín. 8)" value={nuevo.clave} onChange={(e) => setNuevo({ ...nuevo, clave: e.target.value })} />
          )}
          <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value as Rol })}>
            {(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
          </select>
          <button className="boton boton-primario" disabled={creando}>Crear cuenta</button>
        </form>
      </section>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Activa</th><th></th></tr>
          </thead>
          <tbody>
            {(lista.data ?? []).map((u) => (
              <FilaUsuario key={u.id} u={u} esYo={u.id === perfil?.id} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FilaUsuario({ u, esYo }: { u: Perfil; esYo: boolean }) {
  const accion = useAccion();
  const aviso = useAviso();
  const [nombre, setNombre] = useState(u.nombre);
  const [clave, setClave] = useState('');
  const guardar = (cambios: Partial<Perfil>) =>
    accion.mutate({
      fn: 'admin_actualizar_perfil',
      args: { p_usuario: u.id, p_nombre: cambios.nombre ?? u.nombre, p_rol: cambios.rol ?? u.rol, p_activo: cambios.activo ?? u.activo },
      ok: 'Usuario actualizado',
    });

  return (
    <tr className={u.activo ? '' : 'inactiva'}>
      <td>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={() => nombre.trim() && nombre !== u.nombre && guardar({ nombre })} aria-label="Nombre" />
      </td>
      <td className="chico">{u.email}</td>
      <td>
        <select value={u.rol} disabled={esYo} onChange={(e) => guardar({ rol: e.target.value as Rol })} aria-label="Rol">
          {(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
        </select>
      </td>
      <td>
        <label className="casilla">
          <input type="checkbox" checked={u.activo} disabled={esYo} onChange={(e) => guardar({ activo: e.target.checked })} />
          {u.activo ? 'Activa' : 'Desactivada'}
        </label>
      </td>
      <td>
        {api().modo === 'supabase' && (
          <form
            className="en-linea"
            onSubmit={(e) => {
              e.preventDefault();
              api()
                .cambiarClave(u.id, clave)
                .then(() => {
                  aviso('Clave actualizada');
                  setClave('');
                })
                .catch((err) => aviso(err instanceof Error ? err.message : String(err), 'error'));
            }}
          >
            <input type="text" minLength={8} required placeholder="Nueva clave" value={clave} onChange={(e) => setClave(e.target.value)} />
            <button className="boton boton-chico">Cambiar</button>
          </form>
        )}
      </td>
    </tr>
  );
}

function Respaldo() {
  const aviso = useAviso();
  const [generando, setGenerando] = useState(false);
  async function exportar() {
    setGenerando(true);
    try {
      const datos = await api().rpc<unknown>('exportar_datos');
      descargar(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }), nombreArchivo('RSCLL_respaldo', 'json'));
    } catch (e) {
      aviso(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setGenerando(false);
    }
  }
  return (
    <section className="tarjeta">
      <h2>Respaldo de datos</h2>
      <p>
        Descarga todos los registros del proyecto (recintos, fichas, observaciones, comentarios, recepciones e historial) en un archivo JSON.
        Las fotos originales se respaldan aparte desde el almacenamiento de Supabase (ver README).
      </p>
      <button className="boton boton-primario" onClick={() => void exportar()} disabled={generando}>
        {generando ? 'Generando…' : 'Descargar respaldo completo'}
      </button>
    </section>
  );
}
