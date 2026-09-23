import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../../auth';
import { PlantaViewer } from '../../components/PlantaViewer';
import { coincide, FilaRecinto } from '../../components/Recintos';
import { useCatalogo, useEstados, useMisRevisiones } from '../../lib/datos';
import { fecha } from '../../lib/formato';
import { SECTORES, type EstadoFila, type Recinto } from '../../lib/tipos';
import { ListaExteriores, SelectorSector, useSectorRecordado } from '../inicio/Inicio';

type Vista = 'nueva' | 'pendientes' | 'listos' | 'devueltos' | 'recepcionados' | 'todos';

const FILTROS: Record<Vista, { texto: string; cumple: (e: EstadoFila | undefined) => boolean }> = {
  nueva: { texto: 'Nueva revisión', cumple: (e) => !e || e.estado === 'sin_revisar' },
  pendientes: { texto: 'Con pendientes', cumple: (e) => e?.estado === 'pendiente' },
  listos: { texto: 'Listos para inspeccionar', cumple: (e) => e?.estado === 'listo' },
  devueltos: { texto: 'Devueltos pendientes', cumple: (e) => e?.estado === 'pendiente' && e.devueltas > 0 },
  recepcionados: { texto: 'Recepcionados', cumple: (e) => e?.estado === 'recepcionado' },
  todos: { texto: 'Todos', cumple: () => true },
};

export function Revision() {
  const { perfil } = useSesion();
  const navegar = useNavigate();
  const { recintos, porId } = useCatalogo();
  const { mapa } = useEstados();
  const mis = useMisRevisiones();
  const esInspeccion = perfil?.rol === 'inspeccion';
  const vistas: Vista[] = esInspeccion
    ? ['listos', 'devueltos', 'recepcionados', 'todos']
    : ['nueva', 'pendientes', 'listos', 'todos'];
  const [vista, setVista] = useState<Vista>(vistas[0]);
  const [sectorFiltro, setSectorFiltro] = useState('');
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<'lista' | 'planta'>('lista');
  const [sectorPlanta, setSectorPlanta] = useSectorRecordado();

  const abrir = (r: Recinto) => navegar(`/revision/recinto/${encodeURIComponent(r.codigo)}`);

  const lista = useMemo(
    () =>
      recintos.filter(
        (r) =>
          FILTROS[vista].cumple(mapa.get(r.id)) &&
          (!sectorFiltro || r.sectores.some((s) => s.sector === sectorFiltro)) &&
          coincide(r, texto),
      ),
    [recintos, mapa, vista, sectorFiltro, texto],
  );
  const conteo = (v: Vista) => recintos.filter((r) => FILTROS[v].cumple(mapa.get(r.id))).length;
  const sectorActual = SECTORES.find((s) => s.id === sectorPlanta) ?? SECTORES[0];

  return (
    <div className="revision">
      {!!mis.data?.length && (
        <section className="continuar">
          <h2>Continuar mi revisión</h2>
          <div className="tarjetas">
            {mis.data.map((m) => (
              <button key={m.id} className="tarjeta tarjeta-continuar" onClick={() => navegar(`/revision/ficha/${m.id}`)}>
                <span>
                  <strong>{m.codigo}</strong> · {m.nombre}
                </span>
                <span className="suave pequeño">
                  Desde {fecha(m.inicio)} · {m.observaciones} observación(es)
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="filtros-rapidos" role="tablist">
          {vistas.map((v) => (
            <button key={v} role="tab" aria-selected={vista === v} className={`chip${vista === v ? ' activo' : ''}`} onClick={() => setVista(v)}>
              {FILTROS[v].texto} <span className="chip-num">{conteo(v)}</span>
            </button>
          ))}
        </div>

        <div className="barra">
          <input
            type="search"
            placeholder="Buscar por código o nombre"
            aria-label="Buscar por código o nombre"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <select value={sectorFiltro} onChange={(e) => setSectorFiltro(e.target.value)} aria-label="Piso o sector">
            <option value="">Todos los sectores</option>
            {SECTORES.map((s) => (
              <option key={s.id} value={s.id}>{s.corto}</option>
            ))}
          </select>
          <div className="alternar">
            <button className={modo === 'lista' ? 'activo' : ''} onClick={() => setModo('lista')}>Lista</button>
            <button className={modo === 'planta' ? 'activo' : ''} onClick={() => setModo('planta')}>Planta</button>
          </div>
        </div>

        {modo === 'lista' ? (
          <div className="lista-recintos">
            {lista.length === 0 && <p className="vacio">No hay recintos con este filtro.</p>}
            {lista.map((r) => (
              <FilaRecinto key={r.id} recinto={r} estado={mapa.get(r.id)} onAbrir={() => abrir(r)} />
            ))}
          </div>
        ) : (
          <>
            <SelectorSector sector={sectorPlanta} onCambiar={setSectorPlanta} />
            {sectorActual.archivo ? (
              <PlantaViewer key={sectorActual.id} sector={sectorActual} estados={mapa} porId={porId} modo="seleccion" onAbrir={abrir} />
            ) : (
              <ListaExteriores recintos={recintos} estados={mapa} onAbrir={abrir} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
