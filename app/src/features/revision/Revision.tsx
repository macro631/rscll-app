import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../../auth';
import { Icono } from '../../components/Icono';
import { PlantaViewer } from '../../components/PlantaViewer';
import { coincide, FilaRecinto } from '../../components/Recintos';
import { useCatalogo, useEstados, useMisRevisiones } from '../../lib/datos';
import { fecha } from '../../lib/formato';
import { SECTORES, type EstadoFila, type Recinto } from '../../lib/tipos';
import { ListaExteriores, SelectorSector, useSectorRecordado } from '../inicio/Inicio';

type Vista = 'nueva' | 'pendientes' | 'listos' | 'devueltos' | 'recepcionados' | 'todos';

const FILTROS: Record<Vista, { texto: string; cumple: (e: EstadoFila | undefined) => boolean }> = {
  nueva: { texto: 'Sin revisar', cumple: (e) => !e || e.estado === 'sin_revisar' },
  pendientes: { texto: 'Con pendientes', cumple: (e) => e?.estado === 'pendiente' },
  listos: { texto: 'Listos para inspeccionar', cumple: (e) => e?.estado === 'listo' },
  devueltos: { texto: 'Devueltos', cumple: (e) => e?.estado === 'pendiente' && e.devueltas > 0 },
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
      <div className="herramientas">
        <div className="herramientas-fila">
          <div className="campo-icono">
            <Icono nombre="buscar" tam={20} />
            <input
              type="search"
              placeholder="Buscar"
              aria-label="Buscar recinto por código o nombre"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          {modo === 'lista' && (
            <select value={sectorFiltro} onChange={(e) => setSectorFiltro(e.target.value)} aria-label="Sector">
              <option value="">Todo</option>
              {SECTORES.map((s) => (
                <option key={s.id} value={s.id}>{s.corto}</option>
              ))}
            </select>
          )}
          <div className="segmentado" role="tablist" aria-label="Vista" style={{ flex: 'none' }}>
            <button role="tab" aria-selected={modo === 'lista'} aria-label="Lista" title="Lista" onClick={() => setModo('lista')}>
              <Icono nombre="lista" tam={20} />
            </button>
            <button role="tab" aria-selected={modo === 'planta'} aria-label="Planta" title="Planta" onClick={() => setModo('planta')}>
              <Icono nombre="planta" tam={20} />
            </button>
          </div>
        </div>
        {modo === 'lista' ? (
          <div className="chips" role="tablist" aria-label="Filtro">
            {vistas.map((v) => (
              <button key={v} role="tab" aria-selected={vista === v} className={`chip${vista === v ? ' activo' : ''}`} onClick={() => setVista(v)}>
                {FILTROS[v].texto} <span className="chip-num">{conteo(v)}</span>
              </button>
            ))}
          </div>
        ) : (
          <SelectorSector sector={sectorPlanta} onCambiar={setSectorPlanta} />
        )}
      </div>

      {!!mis.data?.length && modo === 'lista' && (
        <section className="continuar" aria-label="Mis revisiones abiertas">
          <h2>Continuar mi revisión</h2>
          {mis.data.map((m) => (
            <button key={m.id} className="tarjeta-continuar" onClick={() => navegar(`/revision/ficha/${m.id}`)}>
              <span className="codigo">{m.codigo}</span>
              <span>
                <strong className="fila-recinto-nombre">{m.nombre}</strong>
                <span className="fila-recinto-sub">
                  Desde {fecha(m.inicio)} · {m.observaciones} observación{m.observaciones === 1 ? '' : 'es'}
                </span>
              </span>
              <Icono nombre="volver" tam={20} className="girar" />
            </button>
          ))}
        </section>
      )}

      {modo === 'lista' ? (
        lista.length === 0 ? (
          <p className="vacio">No hay recintos con este filtro.</p>
        ) : (
          <div className="lista-recintos">
            {lista.map((r) => (
              <FilaRecinto key={r.id} recinto={r} estado={mapa.get(r.id)} onAbrir={() => abrir(r)} />
            ))}
          </div>
        )
      ) : sectorActual.archivo ? (
        <PlantaViewer
          key={sectorActual.id}
          sector={sectorActual}
          estados={mapa}
          porId={porId}
          modo="seleccion"
          onAbrir={abrir}
          claseMarco="modo-seleccion-marco"
        />
      ) : (
        <ListaExteriores recintos={recintos} estados={mapa} onAbrir={abrir} />
      )}
    </div>
  );
}
