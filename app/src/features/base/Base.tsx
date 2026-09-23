import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAviso } from '../../components/Aviso';
import { Icono } from '../../components/Icono';
import { EstadoObs, ObservacionItem } from '../../components/Observacion';
import { buscarTodas, useBusqueda, useCatalogo, useEstados, useNombresUsuarios } from '../../lib/datos';
import { generarExcel } from '../../lib/excel';
import { descargar, fecha, nombreArchivo } from '../../lib/formato';
import { SECTORES, type FiltrosObservacion } from '../../lib/tipos';
import { describirFiltros, FiltrosObs, PanelFiltros } from '../informes/Informes';

const POR_PAGINA = 50;

const COLUMNAS: { campo?: string; texto: string }[] = [
  { campo: 'numero', texto: 'N°' },
  { campo: 'recinto', texto: 'Recinto' },
  { texto: 'Sector' },
  { campo: 'especialidad', texto: 'Especialidad' },
  { texto: 'Descripción' },
  { campo: 'estado', texto: 'Estado' },
  { texto: 'Fotos' },
  { campo: 'autor', texto: 'Autor' },
  { campo: 'fecha', texto: 'Registro' },
  { texto: 'Última comprobación' },
  { texto: 'Comentario de Inspección' },
];

function useDiferido<T>(valor: T, ms = 350) {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

const corto = (sector: string) => SECTORES.find((s) => s.id === sector)?.corto ?? sector;

export default function Base() {
  const aviso = useAviso();
  const { recintos, porId } = useCatalogo();
  const { mapa } = useEstados();
  const usuarios = useNombresUsuarios();
  const [filtros, setFiltros] = useState<FiltrosObservacion>({});
  const filtrosDiferidos = useDiferido(filtros);
  const [orden, setOrden] = useState('recinto');
  const [pagina, setPagina] = useState(0);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const datos = useBusqueda(filtrosDiferidos, { limite: POR_PAGINA, desde: pagina * POR_PAGINA, orden });
  const total = datos.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const autores = useMemo(() => new Map((usuarios.data ?? []).map((u) => [u.id, u.nombre])), [usuarios.data]);

  useEffect(() => setPagina(0), [filtrosDiferidos, orden]);

  function ordenar(campo: string) {
    setOrden((o) => (o === campo ? `-${campo}` : campo));
  }

  async function exportar(completa: boolean) {
    setExportando(true);
    try {
      const f = completa ? {} : filtros;
      const { filas } = await buscarTodas(f, orden.replace('-', '') || 'recinto');
      const blob = await generarExcel(filas, recintos, mapa, completa ? ['Exportación completa'] : describirFiltros(f, porId, autores));
      descargar(blob, nombreArchivo(completa ? 'RSCLL_Base_completa' : 'RSCLL_Base_filtrada', 'xlsx'));
    } catch (e) {
      aviso(`No se pudo exportar: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="base">
      <div className="pagina-cabeza">
        <h1>Base de observaciones</h1>
        <span className="informe-total">
          {total} observación{total === 1 ? '' : 'es'}
          {datos.isFetching && <span className="suave chico"> · actualizando</span>}
        </span>
        <button className="boton boton-sutil" onClick={() => void exportar(false)} disabled={exportando}>
          <Icono nombre="descarga" tam={20} />
          Excel de esta vista
        </button>
        <button className="boton boton-primario" onClick={() => void exportar(true)} disabled={exportando}>
          <Icono nombre="descarga" tam={20} />
          Excel completo
        </button>
      </div>
      <PanelFiltros resumen="">
        <FiltrosObs filtros={filtros} cambiar={(c) => setFiltros((f) => ({ ...f, ...c }))} recintos={recintos} />
      </PanelFiltros>
      <div className="tabla-envoltura">
        <table className="tabla tabla-base">
          <thead>
            <tr>
              {COLUMNAS.map((c) => (
                <th key={c.texto} aria-sort={c.campo && orden.replace('-', '') === c.campo ? (orden.startsWith('-') ? 'descending' : 'ascending') : undefined}>
                  {c.campo ? (
                    <button className="th-orden" onClick={() => ordenar(c.campo!)}>
                      {c.texto}
                      {orden === c.campo ? ' ↑' : orden === `-${c.campo}` ? ' ↓' : ''}
                    </button>
                  ) : (
                    c.texto
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(datos.data?.filas ?? []).map((o) => (
              <Fragment key={o.id}>
                <tr
                  className={`fila-clic${abierta === o.id ? ' abierta' : ''}`}
                  tabIndex={0}
                  onClick={() => setAbierta(abierta === o.id ? null : o.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setAbierta(abierta === o.id ? null : o.id)}
                >
                  <td className="codigo">{o.numero}</td>
                  <td><span className="codigo">{o.codigo}</span> {o.recinto_nombre}</td>
                  <td className="chico">{o.sectores.map(corto).join(' y ')}</td>
                  <td>{o.especialidad}</td>
                  <td className="celda-texto">{o.descripcion}</td>
                  <td><EstadoObs estado={o.estado} /></td>
                  <td>{o.fotos.length || '—'}</td>
                  <td>{o.autor}</td>
                  <td className="celda-fecha">{fecha(o.creada)}</td>
                  <td className="celda-fecha">{o.comprobada_en ? <>{fecha(o.comprobada_en)}<br /><span className="suave">{o.comprobador}</span></> : '—'}</td>
                  <td className="celda-texto">{o.comentario_inspeccion ?? ''}</td>
                </tr>
                {abierta === o.id && (
                  <tr className="fila-detalle">
                    <td colSpan={COLUMNAS.length}>
                      <div style={{ maxWidth: 760 }}>
                        <ObservacionItem obs={o} acciones={{ comprobar: true, devolver: true, mostrarRecinto: true }} />
                        <Link to={`/revision/recinto/${encodeURIComponent(o.codigo)}`} className="volver" style={{ marginTop: '0.4rem' }}>
                          Abrir la ficha de {o.codigo}
                        </Link>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {total === 0 && !datos.isFetching && <p className="vacio">No hay observaciones con estos filtros.</p>}
      </div>
      <div className="paginacion">
        <button className="boton boton-sutil boton-chico" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {paginas}</span>
        <button className="boton boton-sutil boton-chico" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
