import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../../auth';
import { Icono } from '../../components/Icono';
import { PlantaViewer } from '../../components/PlantaViewer';
import { RecepcionRapida } from '../../components/RecepcionRapida';
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

// La vista inicial es la planta. La elección se recuerda mientras la app está abierta
// (volver desde una ficha no la cambia) y vuelve a Planta al abrir la app de nuevo.
let vistaRecordada: 'lista' | 'planta' = 'planta';

export function Revision() {
  const { perfil } = useSesion();
  const navegar = useNavigate();
  const { recintos, porId } = useCatalogo();
  const { mapa } = useEstados();
  const mis = useMisRevisiones();
  const esInspeccion = perfil?.rol === 'inspeccion';
  // Inspección también revisa: parte en lo suyo (listos para inspeccionar) y tiene además los filtros de revisión.
  const vistas: Vista[] = esInspeccion
    ? ['listos', 'devueltos', 'nueva', 'pendientes', 'recepcionados', 'todos']
    : ['nueva', 'pendientes', 'listos', 'todos'];
  const [vista, setVista] = useState<Vista>(vistas[0]);
  const [texto, setTexto] = useState('');
  const [modo, setModoEstado] = useState<'lista' | 'planta'>(vistaRecordada);
  const setModo = (m: 'lista' | 'planta') => {
    vistaRecordada = m;
    setModoEstado(m);
  };
  const recepcionRapida = (r: Recinto) =>
    esInspeccion && mapa.get(r.id)?.estado === 'listo' ? <RecepcionRapida recinto={r} /> : undefined;
  const [sectorPlanta, setSectorPlanta] = useSectorRecordado();
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const abrir = (r: Recinto) => navegar(`/revision/recinto/${encodeURIComponent(r.codigo)}`);

  const lista = useMemo(
    () => recintos.filter((r) => FILTROS[vista].cumple(mapa.get(r.id)) && coincide(r, texto)),
    [recintos, mapa, vista, texto],
  );
  // Un grupo desplegable por piso o sector; E1/E2 aparecen en ambos pisos, C-06/C-13/C-14 en Casa y Exteriores.
  const grupos = useMemo(
    () => SECTORES.map((s) => ({ sector: s, recintos: lista.filter((r) => r.sectores.some((x) => x.sector === s.id)) })),
    [lista],
  );
  const buscando = texto.trim().length > 0;
  const alternar = (id: string) =>
    setAbiertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
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
              placeholder="Buscar por código o nombre"
              aria-label="Buscar recinto por código o nombre"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                // Buscar muestra los resultados en lista, aunque se esté viendo la planta.
                if (e.target.value.trim() && modo === 'planta') setModo('lista');
              }}
            />
          </div>
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

      {!!mis.data?.length && (
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
          <div className="grupos-sector">
            {grupos.map(({ sector, recintos: rs }) => {
              const abierto = rs.length > 0 && (buscando || abiertos.has(sector.id));
              const pendientes = rs.reduce((n, r) => n + (mapa.get(r.id)?.pendientes ?? 0), 0);
              return (
                <section key={sector.id} className={`grupo-sector${abierto ? ' abierto' : ''}`}>
                  <button
                    className="grupo-sector-cabeza"
                    aria-expanded={abierto}
                    disabled={rs.length === 0}
                    onClick={() => alternar(sector.id)}
                  >
                    <span className="grupo-sector-nombre">{sector.corto}</span>
                    <span className="grupo-sector-resumen">
                      {rs.length} recinto{rs.length === 1 ? '' : 's'}
                      {pendientes > 0 && <span className="mini"> · {pendientes} obs. pendiente{pendientes === 1 ? '' : 's'}</span>}
                    </span>
                    <Icono nombre="abajo" tam={20} className={abierto ? 'girar' : undefined} />
                  </button>
                  {abierto && (
                    <div className="lista-recintos">
                      {rs.map((r) => (
                        <FilaRecinto key={r.id} recinto={r} estado={mapa.get(r.id)} onAbrir={() => abrir(r)} accion={recepcionRapida(r)} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
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
          accionExtra={(r) => (esInspeccion && mapa.get(r.id)?.estado === 'listo' ? <RecepcionRapida recinto={r} ancho /> : null)}
          claseMarco="modo-seleccion-marco"
        />
      ) : (
        <ListaExteriores recintos={recintos} estados={mapa} onAbrir={abrir} accion={recepcionRapida} />
      )}
    </div>
  );
}
