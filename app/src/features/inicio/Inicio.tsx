import { useEffect, useState } from 'react';
import { Indicadores, Leyenda } from '../../components/Estado';
import { PlantaViewer } from '../../components/PlantaViewer';
import { FilaRecinto, RecintoBuscador } from '../../components/Recintos';
import { useCatalogo, useEstados } from '../../lib/datos';
import { SECTORES, type EstadoFila, type Recinto } from '../../lib/tipos';

const CLAVE_SECTOR = 'rscll-sector';

export function useSectorRecordado(): [string, (s: string) => void] {
  const [sector, setSector] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_SECTOR) ?? SECTORES[0].id;
    } catch {
      return SECTORES[0].id;
    }
  });
  const cambiar = (s: string) => {
    setSector(s);
    try {
      localStorage.setItem(CLAVE_SECTOR, s);
    } catch {
      /* sin almacenamiento local */
    }
  };
  return [sector, cambiar];
}

/** Sector donde mostrar un recinto: el actual si tiene figura allí; si no, el primero con figura; si no, Exteriores. */
export function sectorPara(r: Recinto, actual: string) {
  if (r.figuras.some((f) => f.plano === actual)) return actual;
  return r.figuras[0]?.plano ?? 'Exterior (D)';
}

export function SelectorSector({ sector, onCambiar }: { sector: string; onCambiar: (s: string) => void }) {
  return (
    <div className="pestañas" role="tablist" aria-label="Sector">
      {SECTORES.map((s) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={sector === s.id}
          className={`pestaña${sector === s.id ? ' activa' : ''}`}
          onClick={() => onCambiar(s.id)}
        >
          {s.corto}
        </button>
      ))}
    </div>
  );
}

export function ListaExteriores({
  recintos,
  estados,
  resaltado,
  onAbrir,
}: {
  recintos: Recinto[];
  estados: Map<string, EstadoFila>;
  resaltado?: string | null;
  onAbrir?: (r: Recinto) => void;
}) {
  const exteriores = recintos.filter((r) => r.sectores.some((s) => s.sector === 'Exterior (D)'));
  useEffect(() => {
    if (resaltado) document.getElementById(`ext-${resaltado}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [resaltado]);
  return (
    <div className="exteriores">
      {exteriores.map((r) => (
        <div key={r.id} id={`ext-${r.id}`} className={resaltado === r.id ? 'resaltado' : undefined}>
          <FilaRecinto
            recinto={r}
            estado={estados.get(r.id)}
            onAbrir={onAbrir ? () => onAbrir(r) : undefined}
            extra={r.figuras.length > 0 ? <span className="suave pequeño">También en planta</span> : undefined}
          />
        </div>
      ))}
    </div>
  );
}

export function Inicio() {
  const { recintos, porId, isLoading, error } = useCatalogo();
  const { mapa } = useEstados();
  const [sector, setSector] = useSectorRecordado();
  const [alcance, setAlcance] = useState<'sector' | 'global'>('sector');
  const [resaltado, setResaltado] = useState<string | null>(null);
  const sectorActual = SECTORES.find((s) => s.id === sector) ?? SECTORES[0];

  if (isLoading) return <p className="cargando">Cargando catálogo…</p>;
  if (error) return <p className="error-texto">No se pudo cargar el catálogo: {String(error.message)}</p>;

  function elegir(r: Recinto) {
    setSector(sectorPara(r, sector));
    setResaltado(null);
    requestAnimationFrame(() => setResaltado(r.id));
  }

  return (
    <div className="inicio">
      <div className="inicio-principal">
        <div className="barra">
          <SelectorSector
            sector={sector}
            onCambiar={(s) => {
              setSector(s);
              setResaltado(null);
            }}
          />
          <RecintoBuscador recintos={recintos} estados={mapa} onElegir={elegir} />
        </div>
        {sectorActual.archivo ? (
          <PlantaViewer key={sectorActual.id} sector={sectorActual} estados={mapa} porId={porId} resaltado={resaltado} modo="consulta" />
        ) : (
          <ListaExteriores recintos={recintos} estados={mapa} resaltado={resaltado} />
        )}
      </div>
      <aside className="inicio-lateral">
        <div className="alternar">
          <button className={alcance === 'sector' ? 'activo' : ''} onClick={() => setAlcance('sector')}>
            {sectorActual.corto}
          </button>
          <button className={alcance === 'global' ? 'activo' : ''} onClick={() => setAlcance('global')}>
            Total obra
          </button>
        </div>
        <Indicadores recintos={recintos} estados={mapa} sector={alcance === 'sector' ? sector : null} />
        <Leyenda />
      </aside>
    </div>
  );
}
