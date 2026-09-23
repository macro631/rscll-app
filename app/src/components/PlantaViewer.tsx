import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { EstadoBadge } from './Estado';
import { ESTADOS, type EstadoFila, type Recinto, type Sector } from '../lib/tipos';

const DEFS = `
<defs>
  <pattern id="trama-pendiente" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)">
    <rect width="9" height="9" style="fill: var(--estado-pendiente)"/>
    <line x1="0" y1="0" x2="0" y2="9" style="stroke: var(--estado-pendiente-trama); stroke-width: 3"/>
  </pattern>
  <pattern id="trama-recepcionado" patternUnits="userSpaceOnUse" width="10" height="10">
    <rect width="10" height="10" style="fill: var(--estado-recepcionado)"/>
    <circle cx="5" cy="5" r="1.4" style="fill: var(--estado-recepcionado-trama)"/>
  </pattern>
</defs>`;

/** Prepara el SVG oficial: quita su hoja de estilos (sería global al insertarlo) y agrega tramas. */
function prepararSvg(texto: string) {
  const doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
  const svg = doc.documentElement;
  svg.querySelectorAll('style').forEach((s) => s.remove());
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'planta-svg');
  svg.insertAdjacentHTML('afterbegin', DEFS);
  const [, , ancho, alto] = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number);
  return { html: new XMLSerializer().serializeToString(svg), proporcion: alto / ancho };
}

interface Props {
  sector: Sector;
  estados: Map<string, EstadoFila>;
  porId: Map<string, Recinto>;
  resaltado?: string | null;
  modo: 'consulta' | 'seleccion';
  onAbrir?: (r: Recinto) => void;
}

export function PlantaViewer({ sector, estados, porId, resaltado, modo, onAbrir }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['svg', sector.archivo],
    queryFn: async () => {
      const r = await fetch(`/plantas/${sector.archivo}`);
      if (!r.ok) throw new Error('No se pudo cargar la planta');
      return prepararSvg(await r.text());
    },
    staleTime: Infinity,
    enabled: !!sector.archivo,
  });

  const marco = useRef<HTMLDivElement>(null);
  const contenido = useRef<HTMLDivElement>(null);
  const zoom = useRef<ReactZoomPanPinchRef>(null);
  const inicioToque = useRef<{ x: number; y: number } | null>(null);
  const [tam, setTam] = useState<{ w: number; h: number; cw: number; ch: number } | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);

  // Tamaño «contener»: la planta completa cabe en el marco; el zoom permite acercarse.
  useLayoutEffect(() => {
    if (!data || !marco.current) return;
    const medir = () => {
      const w = marco.current!.clientWidth;
      const h = marco.current!.clientHeight;
      const ch = Math.min(h, w * data.proporcion);
      setTam({ w, h, cw: ch / data.proporcion, ch });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(marco.current);
    return () => ro.disconnect();
  }, [data]);

  // Color por estado calculado; el SVG nunca guarda estados (§2.2).
  useEffect(() => {
    const raiz = contenido.current;
    if (!raiz || !data) return;
    raiz.querySelectorAll<SVGElement>('path[data-room-id]').forEach((el) => {
      const id = el.dataset.roomId!;
      const e = estados.get(id)?.estado ?? 'sin_revisar';
      el.setAttribute('class', `figura estado-${e}${id === elegido ? ' elegida' : ''}`);
      const r = porId.get(id);
      el.setAttribute('aria-label', `${r?.codigo ?? el.dataset.code} · ${r?.nombre ?? el.dataset.name} · ${ESTADOS[e].nombre}`);
      el.querySelector('title')?.replaceChildren(`${r?.codigo ?? ''} · ${r?.nombre ?? ''} · ${ESTADOS[e].nombre}`);
    });
  }, [data, estados, porId, elegido, tam]);

  // Centrar y destacar el recinto buscado.
  useEffect(() => {
    if (!resaltado || !data || !tam) return;
    setElegido(resaltado);
    const el = contenido.current?.querySelector(`path[data-room-id="${CSS.escape(resaltado)}"]`);
    if (el) {
      const t = setTimeout(() => zoom.current?.zoomToElement(el as unknown as HTMLElement, { maxScale: 5 }), 60);
      return () => clearTimeout(t);
    }
  }, [resaltado, data, tam]);

  const esLarga = (data?.proporcion ?? 0) > 1.8;

  function irZona(zona: 0 | 0.5 | 1) {
    if (!tam || !zoom.current) return;
    const s = Math.min(tam.w / tam.cw, 12);
    const alto = tam.ch * s;
    zoom.current.setTransform((tam.w - tam.cw * s) / 2, -(alto - tam.h) * zona, s, 300);
  }

  function idDesde(target: EventTarget | null) {
    const el = (target as Element | null)?.closest?.('[data-room-id]');
    return el ? (el as SVGElement).dataset.roomId ?? null : null;
  }

  function alSoltar(e: PointerEvent) {
    const ini = inicioToque.current;
    inicioToque.current = null;
    if (ini && Math.hypot(e.clientX - ini.x, e.clientY - ini.y) > 8) return; // fue arrastre
    const id = idDesde(e.target);
    if (id) setElegido(id);
  }

  function alTeclear(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const id = idDesde(e.target);
    if (!id) return;
    e.preventDefault();
    setElegido(id);
    const r = porId.get(id);
    if (modo === 'seleccion' && r && elegido === id) onAbrir?.(r);
  }

  const recintoElegido = elegido ? porId.get(elegido) : undefined;
  const estadoElegido = elegido ? estados.get(elegido) : undefined;
  const html = useMemo(() => ({ __html: data?.html ?? '' }), [data]);

  return (
    <div className="planta">
      <div className="planta-marco" ref={marco}>
        {isLoading && <p className="planta-mensaje">Cargando planta…</p>}
        {error && <p className="planta-mensaje error-texto">No se pudo cargar la planta. La lista de recintos sigue disponible.</p>}
        {data && tam && (
          <TransformWrapper
            ref={zoom}
            minScale={1}
            maxScale={14}
            centerOnInit
            limitToBounds
            doubleClick={{ mode: 'zoomIn', step: 0.7 }}
            wheel={{ step: 0.15 }}
          >
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
              <div
                ref={contenido}
                className={`planta-contenido modo-${modo}`}
                style={{ width: tam.cw, height: tam.ch }}
                onPointerDown={(e) => (inicioToque.current = { x: e.clientX, y: e.clientY })}
                onPointerUp={alSoltar}
                onKeyDown={alTeclear}
                dangerouslySetInnerHTML={html}
              />
            </TransformComponent>
          </TransformWrapper>
        )}
        <div className="planta-controles">
          <button className="boton boton-icono" onClick={() => zoom.current?.zoomIn(0.6)} aria-label="Acercar">+</button>
          <button className="boton boton-icono" onClick={() => zoom.current?.zoomOut(0.6)} aria-label="Alejar">−</button>
          <button className="boton boton-icono" onClick={() => zoom.current?.centerView(1, 300)} aria-label="Ver planta completa" title="Ver planta completa">⤢</button>
          {esLarga && (
            <>
              <button className="boton boton-icono" onClick={() => irZona(0)} title="Zona superior" aria-label="Zona superior">↑</button>
              <button className="boton boton-icono" onClick={() => irZona(0.5)} title="Zona central" aria-label="Zona central">•</button>
              <button className="boton boton-icono" onClick={() => irZona(1)} title="Zona inferior" aria-label="Zona inferior">↓</button>
            </>
          )}
        </div>
      </div>
      <div className="planta-detalle" aria-live="polite">
        {recintoElegido ? (
          <>
            <div>
              <strong>{recintoElegido.codigo}</strong> · {recintoElegido.nombre}
              <div className="planta-detalle-estado">
                <EstadoBadge estado={estadoElegido?.estado} />
                {!!estadoElegido?.pendientes && <span className="suave">{estadoElegido.pendientes} pendiente(s)</span>}
              </div>
            </div>
            {modo === 'seleccion' && (
              <button className="boton boton-primario" onClick={() => onAbrir?.(recintoElegido)}>Abrir ficha</button>
            )}
          </>
        ) : (
          <span className="suave">
            {modo === 'seleccion' ? 'Toque un recinto para seleccionarlo.' : 'Toque un recinto para ver su nombre y estado.'}
          </span>
        )}
      </div>
    </div>
  );
}
