import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAviso } from '../../components/Aviso';
import { Icono } from '../../components/Icono';
import { useEsEscritorio } from '../../components/Layout';
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

/** Texto corto de los filtros activos para el resumen del panel plegado. */
function resumenFiltros(f: FiltrosObservacion, porId: Map<string, Recinto>) {
  const partes = [
    f.sector && SECTORES.find((s) => s.id === f.sector)?.corto,
    f.recinto && porId.get(f.recinto)?.codigo,
    f.especialidad,
    f.estado === 'pendiente' ? 'Pendientes' : f.estado === 'subsanada' ? 'Subsanadas' : null,
    (f.desde || f.hasta) && 'Fechas',
    f.autor && 'Autor',
    f.texto && `«${f.texto}»`,
  ].filter(Boolean);
  return partes.length ? partes.join(', ') : 'Todos';
}

export function PanelFiltros({ resumen, children }: { resumen: string; children: ReactNode }) {
  const escritorio = useEsEscritorio();
  const [abierto, setAbierto] = useState(false);
  return (
    <details
      className="panel-filtros plegable"
      open={escritorio || abierto}
      onToggle={(e) => !escritorio && setAbierto((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <Icono nombre="filtro" tam={18} />
        <span>Filtros</span>
        <span className="filtros-activos">{resumen}</span>
        <Icono nombre="abajo" tam={18} />
      </summary>
      {children}
    </details>
  );
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
        Piso o sector
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
  const escritorio = useEsEscritorio();
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
  const total = busqueda.data?.total;

  useEffect(() => {
    if (escritorio) return;
    document.body.classList.add('con-barra-acciones');
    return () => document.body.classList.remove('con-barra-acciones');
  }, [escritorio]);

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

  const botonEmitir = (
    <button className="boton boton-primario boton-alto" onClick={() => void emitir()} disabled={generando || busqueda.isFetching || !filas.length}>
      <Icono nombre="descarga" />
      {generando ? 'Generando PDF…' : `Emitir PDF${total != null ? ` (${total})` : ''}`}
    </button>
  );

  return (
    <div className="informes">
      <div className="pagina-cabeza">
        <h1>Informes</h1>
        {escritorio && botonEmitir}
      </div>

      <div className="chips" style={{ marginBottom: '0.75rem' }}>
        <button className={`chip${!filtros.estado && Object.keys(filtros).length === 0 ? ' activo' : ''}`} onClick={() => setFiltros({})}>
          Todas
        </button>
        <button className={`chip${filtros.estado === 'pendiente' ? ' activo' : ''}`} onClick={() => cambiar({ estado: filtros.estado === 'pendiente' ? undefined : 'pendiente' })}>
          Solo pendientes
        </button>
        {ESPECIALIDADES.slice(0, 5).map((s) => (
          <button key={s} className={`chip${filtros.especialidad === s ? ' activo' : ''}`} onClick={() => cambiar({ especialidad: filtros.especialidad === s ? undefined : s })}>
            {s}
          </button>
        ))}
      </div>

      <PanelFiltros resumen={resumenFiltros(filtros, porId)}>
        <FiltrosObs filtros={filtros} cambiar={cambiar} recintos={recintos} />
      </PanelFiltros>

      <div className="informe-opciones">
        <span className="informe-total">
          {total ?? '…'} observación{total === 1 ? '' : 'es'}
        </span>
        <div className="segmentado" role="tablist" aria-label="Agrupar por">
          <button role="tab" aria-selected={agrupacion === 'recinto'} onClick={() => setAgrupacion('recinto')}>Por recinto</button>
          <button role="tab" aria-selected={agrupacion === 'especialidad'} onClick={() => setAgrupacion('especialidad')}>Por especialidad</button>
        </div>
        <label className="casilla">
          <input type="checkbox" checked={conFotos} onChange={(e) => setConFotos(e.target.checked)} /> Incluir fotos
        </label>
      </div>

      <section aria-label="Vista previa del informe">
        {filas.length === 0 && !busqueda.isFetching && <p className="vacio">No hay observaciones con estos filtros. Pruebe con «Todas».</p>}
        {[...grupos].map(([grupo, obs]) => (
          <div key={grupo} className="grupo">
            <h3>
              {grupo} <span className="suave chico">{obs.length}</span>
            </h3>
            {escritorio ? (
              <div className="tabla-envoltura">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>N°</th>
                      {agrupacion !== 'recinto' && <th>Recinto</th>}
                      {agrupacion !== 'especialidad' && <th>Especialidad</th>}
                      <th>Observación</th>
                      <th>Estado</th>
                      <th>Fotos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obs.map((o) => (
                      <tr key={o.id}>
                        <td className="codigo">{o.numero}</td>
                        {agrupacion !== 'recinto' && <td><span className="codigo">{o.codigo}</span> {o.recinto_nombre}</td>}
                        {agrupacion !== 'especialidad' && <td>{o.especialidad}</td>}
                        <td className="celda-texto">
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
            ) : (
              <div className="tarjetas-obs">
                {obs.map((o) => (
                  <div key={o.id} className={`tarjeta-obs${o.estado === 'subsanada' ? ' subsanada' : ''}`}>
                    <div className="tarjeta-obs-cabeza">
                      <span>
                        <span className="obs-numero">N° {o.numero}</span>{' '}
                        {agrupacion === 'recinto' ? <strong>{o.especialidad}</strong> : <span className="codigo">{o.codigo}</span>}
                      </span>
                      <EstadoObs estado={o.estado} />
                    </div>
                    <p>{o.descripcion}</p>
                    {o.comentario_inspeccion && <p className="comentario-insp">Inspección: {o.comentario_inspeccion}</p>}
                    {o.fotos.length > 0 && <p className="mini tenue">{o.fotos.length} foto{o.fotos.length > 1 ? 's' : ''}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {!escritorio && (
        <>
          <div className="espaciador-acciones" />
          <div className="barra-acciones">{botonEmitir}</div>
        </>
      )}
    </div>
  );
}
