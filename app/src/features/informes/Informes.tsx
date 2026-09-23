import { useMemo, useState } from 'react';
import { useAviso } from '../../components/Aviso';
import { EstadoObs } from '../../components/Observacion';
import { useBusqueda, useCatalogo, useNombresUsuarios } from '../../lib/datos';
import { descargar, nombreArchivo } from '../../lib/formato';
import { agrupar, generarPdf, type Agrupacion } from '../../lib/pdf';
import { ESPECIALIDADES, SECTORES, type FiltrosObservacion, type Recinto } from '../../lib/tipos';

export function describirFiltros(f: FiltrosObservacion, porId: Map<string, Recinto>, autores: Map<string, string>) {
  const r = f.recinto ? porId.get(f.recinto) : undefined;
  return [
    `Sector: ${f.sector ? SECTORES.find((s) => s.id === f.sector)?.id : 'Todos'}`,
    `Recinto: ${r ? `${r.codigo} ${r.nombre}` : 'Todos'}`,
    `Especialidad: ${f.especialidad ?? 'Todas'}`,
    `Estado: ${f.estado === 'pendiente' ? 'Pendiente' : f.estado === 'subsanada' ? 'Subsanada' : 'Todos'}`,
    ...(f.desde || f.hasta ? [`Fechas: ${f.desde ?? '…'} a ${f.hasta ?? '…'}`] : []),
    ...(f.autor ? [`Autor: ${autores.get(f.autor) ?? ''}`] : []),
    ...(f.texto ? [`Búsqueda: «${f.texto}»`] : []),
  ];
}

export function FiltrosObs({
  filtros,
  cambiar,
  recintos,
}: {
  filtros: FiltrosObservacion;
  cambiar: (c: Partial<FiltrosObservacion>) => void;
  recintos: Recinto[];
}) {
  const usuarios = useNombresUsuarios();
  const opcionesRecinto = recintos.filter((r) => !filtros.sector || r.sectores.some((s) => s.sector === filtros.sector));
  const v = (x: string) => (x === '' ? undefined : x);
  return (
    <div className="filtros">
      <label>
        Piso / sector
        <select value={filtros.sector ?? ''} onChange={(e) => cambiar({ sector: v(e.target.value), recinto: undefined })}>
          <option value="">Todos</option>
          {SECTORES.map((s) => <option key={s.id} value={s.id}>{s.corto}</option>)}
        </select>
      </label>
      <label>
        Recinto
        <select value={filtros.recinto ?? ''} onChange={(e) => cambiar({ recinto: v(e.target.value) })}>
          <option value="">Todos</option>
          {opcionesRecinto.map((r) => <option key={r.id} value={r.id}>{r.codigo} · {r.nombre}</option>)}
        </select>
      </label>
      <label>
        Especialidad
        <select value={filtros.especialidad ?? ''} onChange={(e) => cambiar({ especialidad: v(e.target.value) })}>
          <option value="">Todas</option>
          {ESPECIALIDADES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label>
        Estado
        <select value={filtros.estado ?? ''} onChange={(e) => cambiar({ estado: v(e.target.value) })}>
          <option value="">Todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="subsanada">Subsanada</option>
        </select>
      </label>
      <label>
        Desde
        <input type="date" value={filtros.desde ?? ''} onChange={(e) => cambiar({ desde: v(e.target.value) })} />
      </label>
      <label>
        Hasta
        <input type="date" value={filtros.hasta ?? ''} onChange={(e) => cambiar({ hasta: v(e.target.value) })} />
      </label>
      <label>
        Autor
        <select value={filtros.autor ?? ''} onChange={(e) => cambiar({ autor: v(e.target.value) })}>
          <option value="">Todos</option>
          {(usuarios.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      </label>
      <label>
        Código o texto
        <input type="search" value={filtros.texto ?? ''} placeholder="A-12, burlete…" onChange={(e) => cambiar({ texto: v(e.target.value) })} />
      </label>
    </div>
  );
}

export default function Informes() {
  const aviso = useAviso();
  const { recintos, porId } = useCatalogo();
  const usuarios = useNombresUsuarios();
  const [filtros, setFiltros] = useState<FiltrosObservacion>({});
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('recinto');
  const [conFotos, setConFotos] = useState(true);
  const [generando, setGenerando] = useState(false);
  const busqueda = useBusqueda(filtros);
  const filas = useMemo(() => busqueda.data?.filas ?? [], [busqueda.data]);
  const grupos = useMemo(() => agrupar(filas, agrupacion), [filas, agrupacion]);
  const autores = useMemo(() => new Map((usuarios.data ?? []).map((u) => [u.id, u.nombre])), [usuarios.data]);

  const cambiar = (c: Partial<FiltrosObservacion>) => setFiltros((f) => ({ ...f, ...c }));

  async function emitir() {
    setGenerando(true);
    try {
      const blob = await generarPdf(filas, { filtros: describirFiltros(filtros, porId, autores), agrupacion, conFotos });
      const r = filtros.recinto ? porId.get(filtros.recinto)?.codigo : null;
      descargar(blob, nombreArchivo(`RSCLL_Informe${r ? `_${r}` : ''}${filtros.especialidad ? `_${filtros.especialidad.replace(/\W+/g, '')}` : ''}`, 'pdf'));
    } catch (e) {
      aviso(`No se pudo generar el PDF: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="informes">
      <h1>Informes</h1>
      <div className="filtros-rapidos">
        <button className={`chip${filtros.estado === 'pendiente' ? ' activo' : ''}`} onClick={() => cambiar({ estado: filtros.estado === 'pendiente' ? undefined : 'pendiente' })}>
          Solo pendientes
        </button>
        <button className="chip" onClick={() => setFiltros({})}>Todos (quitar filtros)</button>
      </div>
      <FiltrosObs filtros={filtros} cambiar={cambiar} recintos={recintos} />

      <div className="barra informe-barra">
        <label className="en-linea">
          Agrupar por{' '}
          <select value={agrupacion} onChange={(e) => setAgrupacion(e.target.value as Agrupacion)}>
            <option value="recinto">Recinto</option>
            <option value="especialidad">Especialidad</option>
          </select>
        </label>
        <label className="en-linea casilla">
          <input type="checkbox" checked={conFotos} onChange={(e) => setConFotos(e.target.checked)} /> Incluir fotos
        </label>
        <strong className="informe-total">{busqueda.data?.total ?? '…'} resultado(s)</strong>
        <button className="boton boton-primario" onClick={() => void emitir()} disabled={generando || busqueda.isFetching}>
          {generando ? 'Generando PDF…' : 'Emitir PDF'}
        </button>
      </div>

      <section className="vista-previa" aria-label="Vista previa">
        {filas.length === 0 && !busqueda.isFetching && <p className="vacio">No hay observaciones con estos filtros.</p>}
        {[...grupos].map(([grupo, obs]) => (
          <div key={grupo} className="grupo">
            <h3>{grupo} <span className="suave pequeño">({obs.length})</span></h3>
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr><th>N°</th><th>Recinto</th><th>Especialidad</th><th>Observación</th><th>Estado</th><th>Fotos</th></tr>
                </thead>
                <tbody>
                  {obs.map((o) => (
                    <tr key={o.id}>
                      <td>{o.numero}</td>
                      <td><strong>{o.codigo}</strong> {o.recinto_nombre}</td>
                      <td>{o.especialidad}</td>
                      <td>
                        {o.descripcion}
                        {o.comentario_inspeccion && <div className="comentario-insp">Inspección: {o.comentario_inspeccion}</div>}
                      </td>
                      <td><EstadoObs estado={o.estado} /></td>
                      <td>{o.fotos.length || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
