import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAviso } from '../../components/Aviso';
import { EstadoObs, ObservacionItem } from '../../components/Observacion';
import { buscarTodas, useBusqueda, useCatalogo, useEstados, useNombresUsuarios } from '../../lib/datos';
import { generarExcel } from '../../lib/excel';
import { descargar, fecha, nombreArchivo } from '../../lib/formato';
import type { FiltrosObservacion } from '../../lib/tipos';
import { describirFiltros, FiltrosObs } from '../informes/Informes';

const POR_PAGINA = 50;

const COLUMNAS: { campo?: string; texto: string }[] = [
  { campo: 'numero', texto: 'N°' },
  { texto: 'Sector(es)' },
  { campo: 'recinto', texto: 'Recinto' },
  { campo: 'especialidad', texto: 'Especialidad' },
  { texto: 'Descripción' },
  { campo: 'estado', texto: 'Estado' },
  { texto: 'Foto' },
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
      <div className="barra">
        <h1>Base de observaciones</h1>
        <div className="acciones">
          <button className="boton" onClick={() => void exportar(false)} disabled={exportando}>Excel · vista filtrada</button>
          <button className="boton" onClick={() => void exportar(true)} disabled={exportando}>Excel · todo</button>
        </div>
      </div>
      <FiltrosObs filtros={filtros} cambiar={(c) => setFiltros((f) => ({ ...f, ...c }))} recintos={recintos} />
      <p className="suave">
        {total} observación(es){datos.isFetching && ' · actualizando…'}
      </p>
      <div className="tabla-envoltura">
        <table className="tabla tabla-base">
          <thead>
            <tr>
              {COLUMNAS.map((c) => (
                <th key={c.texto}>
                  {c.campo ? (
                    <button className="th-orden" onClick={() => ordenar(c.campo!)}>
                      {c.texto}
                      {orden === c.campo ? ' ▲' : orden === `-${c.campo}` ? ' ▼' : ''}
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
                <tr className={`fila-clic${abierta === o.id ? ' abierta' : ''}`} onClick={() => setAbierta(abierta === o.id ? null : o.id)}>
                  <td>{o.numero}</td>
                  <td className="pequeño">{o.sectores.join(' · ')}</td>
                  <td><strong>{o.codigo}</strong> {o.recinto_nombre}</td>
                  <td>{o.especialidad}</td>
                  <td className="celda-texto">{o.descripcion}</td>
                  <td><EstadoObs estado={o.estado} /></td>
                  <td>{o.fotos.length || '—'}</td>
                  <td>{o.autor}</td>
                  <td className="pequeño">{fecha(o.creada)}</td>
                  <td className="pequeño">{o.comprobada_en ? `${fecha(o.comprobada_en)} · ${o.comprobador}` : '—'}</td>
                  <td className="celda-texto">{o.comentario_inspeccion ?? ''}</td>
                </tr>
                {abierta === o.id && (
                  <tr className="fila-detalle">
                    <td colSpan={COLUMNAS.length}>
                      <ObservacionItem obs={o} acciones={{ comprobar: true, devolver: true, mostrarRecinto: true }} />
                      <Link to={`/revision/recinto/${encodeURIComponent(o.codigo)}`}>Abrir ficha del recinto →</Link>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="paginacion">
        <button className="boton" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>← Anterior</button>
        <span>Página {pagina + 1} de {paginas}</span>
        <button className="boton" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente →</button>
      </div>
    </div>
  );
}
