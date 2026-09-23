import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { EstadoBadge } from './Estado';
import { Icono } from './Icono';
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

/** Ancho máximo de la planta a escala 1: en pantallas anchas las plantas largas no se agrandan de más. */
const ANCHO_MAX = 680;

/** Prepara el SVG oficial: quita su hoja de estilos (sería global al insertarlo) y agrega tramas. */
function prepararSvg(texto: string) {
  const doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
  const svg = doc.documentElement;
  svg.querySelectorAll('style').forEach((s) => s.remove());
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');
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
  claseMarco?: string;
}

export function PlantaViewer({ sector, estados, porId, resaltado, modo, onAbrir, claseMarco }: Props) {
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
  const [tam, setTam] = useState<{ w: number; h: number; ancho: number; alto: number } | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);

  // Escala 1 = planta al ancho del visor (con tope): se lee sin zoom y se desliza en vertical.
  useLayoutEffect(() => {
    if (!data || !marco.current) return;
    const medir = () => {
      const w = marco.current!.clientWidth;
      const h = marco.current!.clientHeight;
      // En pantallas anchas se limita también por la altura, para ver cerca de la mitad de una planta larga.
      const ancho = w > 600 ? Math.min(w, ANCHO_MAX, Math.max(h / data.proporcion, h * 0.55)) : w;
      setTam({ w, h, ancho, alto: ancho * data.proporcion });
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
      const texto = `${r?.codigo ?? el.dataset.code} · ${r?.nombre ?? el.dataset.name} · ${ESTADOS[e].nombre}`;
      el.setAttribute('aria-label', texto);
      el.querySelector('title')?.replaceChildren(texto);
    });
  }, [data, estados, porId, elegido, tam]);

  // Centrar y destacar el recinto buscado.
  useEffect(() => {
    if (!resaltado || !data || !tam) return;
    setElegido(resaltado);
    const el = contenido.current?.querySelector(`path[data-room-id="${CSS.escape(resaltado)}"]`);
    if (el) {
      const t = setTimeout(() => zoom.current?.zoomToElement(el as unknown as HTMLElement, { maxScale: 3 }), 60);
      return () => clearTimeout(t);
    }
  }, [resaltado, data, tam]);

  const escalaMin = tam ? Math.min(1, tam.h / tam.alto) : 1;
  const inicialY = tam && tam.alto < tam.h ? (tam.h - tam.alto) / 2 : 0;

  function idDesde(target: EventTarget | null) {
    const el = (target as Element | null)?.closest?.('[data-room-id]');
    return el ? ((el as SVGElement).dataset.roomId ?? null) : null;
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
    const r = porId.get(id);
    if (modo === 'seleccion' && r && elegido === id) onAbrir?.(r);
    setElegido(id);
  }

  const recintoElegido = elegido ? porId.get(elegido) : undefined;
  const estadoElegido = elegido ? estados.get(elegido) : undefined;
  const html = useMemo(() => ({ __html: data?.html ?? '' }), [data]);

  return (
    <div className="planta">
      <div className={`planta-marco ${claseMarco ?? ''}`} ref={marco}>
        {isLoading && <p className="planta-mensaje">Cargando planta…</p>}
        {error && <p className="planta-mensaje error-texto">No se pudo cargar la planta. La lista de recintos sigue disponible.</p>}
        {data && tam && (
          <TransformWrapper
            ref={zoom}
            initialScale={1}
            initialPositionX={0}
            initialPositionY={inicialY}
            minScale={escalaMin}
            maxScale={8}
            limitToBounds
            centerZoomedOut
            doubleClick={{ mode: 'zoomIn', step: 0.7 }}
            wheel={{ step: 0.12 }}
          >
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
              <div
                ref={contenido}
                className={`planta-contenido modo-${modo}`}
                style={{ width: tam.w, height: tam.alto, display: 'flex', justifyContent: 'center' }}
                onPointerDown={(e) => (inicioToque.current = { x: e.clientX, y: e.clientY })}
                onPointerUp={alSoltar}
                onKeyDown={alTeclear}
              >
                <div style={{ width: tam.ancho, height: tam.alto }} dangerouslySetInnerHTML={html} />
              </div>
            </TransformComponent>
          </TransformWrapper>
        )}
        <div className="planta-controles" role="group" aria-label="Zoom de la planta">
          <button onClick={() => zoom.current?.zoomIn(0.5)} aria-label="Acercar" title="Acercar">
            <Icono nombre="mas" tam={20} />
          </button>
          <button onClick={() => zoom.current?.zoomOut(0.5)} aria-label="Alejar" title="Alejar">
            <Icono nombre="menos" tam={20} />
          </button>
          <button onClick={() => zoom.current?.centerView(escalaMin, 250)} aria-label="Ver la planta completa" title="Ver la planta completa">
            <Icono nombre="ajustar" tam={20} />
          </button>
        </div>

        {recintoElegido ? (
          <div className="planta-ficha" aria-live="polite">
            <span className="codigo">{recintoElegido.codigo}</span>
            <div className="planta-ficha-texto">
              <strong>{recintoElegido.nombre}</strong>
              <div className="planta-ficha-estado">
                <EstadoBadge estado={estadoElegido?.estado} />
                {!!estadoElegido?.pendientes && (
                  <span className="mini">{estadoElegido.pendientes} pendiente{estadoElegido.pendientes > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            <button className="boton-icono boton boton-sutil" style={{ border: 'none' }} onClick={() => setElegido(null)} aria-label="Cerrar">
              <Icono nombre="cerrar" tam={20} />
            </button>
            {modo === 'seleccion' && (
              <div className="acciones">
                <button className="boton boton-primario boton-ancho" onClick={() => onAbrir?.(recintoElegido)}>
                  Abrir ficha de {recintoElegido.codigo}
                </button>
              </div>
            )}
          </div>
        ) : (
          data && <span className="planta-ayuda">Toque un recinto para ver su estado</span>
        )}
      </div>
    </div>
  );
}
