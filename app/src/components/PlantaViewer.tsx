import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MiniMap, TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { EstadoBadge } from './Estado';
import { Icono } from './Icono';
import { useEsEscritorio } from './Layout';
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

/** Una planta es «larga» si es más del doble de alta que ancha: se muestra girada, en horizontal. */
const PROPORCION_LARGA = 1.5;

/**
 * Prepara el SVG oficial: quita su hoja de estilos (sería global al insertarlo), agrega tramas y,
 * si la planta es larga, la gira 90° a la izquierda con los rótulos contragirados para seguir legibles.
 * Devuelve además una copia sin interacción para la miniatura.
 */
function prepararSvg(texto: string) {
  const doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
  const svg = doc.documentElement;
  const NS = 'http://www.w3.org/2000/svg';
  svg.querySelectorAll('style').forEach((s) => s.remove());
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  let [, , ancho, alto] = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number);

  const girada = alto / ancho > PROPORCION_LARGA;
  if (girada) {
    const grupo = doc.createElementNS(NS, 'g');
    grupo.setAttribute('transform', `translate(0 ${ancho}) rotate(-90)`);
    for (const hijo of [...svg.childNodes]) {
      const nombre = (hijo as Element).localName;
      if (nombre !== 'title' && nombre !== 'desc' && nombre !== 'defs') grupo.appendChild(hijo);
    }
    svg.appendChild(grupo);
    svg.querySelectorAll('text').forEach((t) => {
      const x = t.getAttribute('x') ?? t.querySelector('tspan')?.getAttribute('x') ?? '0';
      const y = t.getAttribute('y') ?? '0';
      t.setAttribute('transform', `rotate(90 ${x} ${y})`);
    });
    [ancho, alto] = [alto, ancho];
    svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  }
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'planta-svg');
  svg.insertAdjacentHTML('afterbegin', DEFS);
  const html = new XMLSerializer().serializeToString(svg);

  // Miniatura: sin rótulos, sin foco ni ids repetidos.
  svg.querySelectorAll('text, title').forEach((t) => t.remove());
  svg.querySelectorAll('[tabindex], [role], [aria-label], [id]').forEach((el) => {
    if (el.closest('defs')) return;
    el.removeAttribute('tabindex');
    el.removeAttribute('role');
    el.removeAttribute('aria-label');
    el.removeAttribute('id');
  });
  svg.setAttribute('aria-hidden', 'true');
  svg.removeAttribute('aria-labelledby');
  svg.removeAttribute('role');
  const htmlMini = new XMLSerializer().serializeToString(svg);

  return { html, htmlMini, proporcion: alto / ancho, girada };
}

interface Props {
  sector: Sector;
  estados: Map<string, EstadoFila>;
  porId: Map<string, Recinto>;
  resaltado?: string | null;
  modo: 'consulta' | 'seleccion';
  onAbrir?: (r: Recinto) => void;
  /** Acción adicional en la tarjeta del recinto tocado (p. ej. Recepcionar para Inspección). */
  accionExtra?: (r: Recinto, estado: EstadoFila | undefined) => ReactNode;
  claseMarco?: string;
}

export function PlantaViewer({ sector, estados, porId, resaltado, modo, onAbrir, accionExtra, claseMarco }: Props) {
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

  const escritorio = useEsEscritorio();
  const marco = useRef<HTMLDivElement>(null);
  const contenido = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLDivElement>(null);
  const zoom = useRef<ReactZoomPanPinchRef>(null);
  const inicioToque = useRef<{ x: number; y: number } | null>(null);
  const [tam, setTam] = useState<{ w: number; h: number; ancho: number; alto: number } | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [acercada, setAcercada] = useState(false);

  // Escala 1 = planta completa dentro del visor.
  useLayoutEffect(() => {
    if (!data || !marco.current) return;
    const medir = () => {
      const w = marco.current!.clientWidth;
      const h = marco.current!.clientHeight;
      const k = Math.min(w, h / data.proporcion);
      setTam({ w, h, ancho: k, alto: k * data.proporcion });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(marco.current);
    return () => ro.disconnect();
  }, [data]);

  // Zoom de entrada: una planta apaisada llena el alto del visor (se recorre de lado con la miniatura como guía).
  const ajuste = useMemo(() => {
    if (!tam) return null;
    const llenarAlto = tam.h / tam.alto;
    const inicial = Math.max(1, Math.min(llenarAlto, escritorio ? 2.4 : 8));
    const centro = (k: number) => ({
      x: tam.ancho * k < tam.w ? (tam.w - tam.ancho * k) / 2 : 0,
      y: tam.alto * k < tam.h ? (tam.h - tam.alto * k) / 2 : 0,
    });
    return { inicial, centro, max: Math.max(8, inicial * 4) };
  }, [tam, escritorio]);

  // Si la planta abre ampliada, la miniatura se muestra desde el inicio.
  useEffect(() => {
    if (ajuste) setAcercada(ajuste.inicial > 1.05);
  }, [ajuste]);

  // Color por estado calculado; el SVG nunca guarda estados (§2.2). Se aplica también a la miniatura.
  useEffect(() => {
    if (!data) return;
    contenido.current?.querySelectorAll<SVGElement>('path[data-room-id]').forEach((el) => {
      const id = el.dataset.roomId!;
      const e = estados.get(id)?.estado ?? 'sin_revisar';
      el.setAttribute('class', `figura estado-${e}${id === elegido ? ' elegida' : ''}`);
      const r = porId.get(id);
      const texto = `${r?.codigo ?? el.dataset.code} · ${r?.nombre ?? el.dataset.name} · ${ESTADOS[e].nombre}`;
      el.setAttribute('aria-label', texto);
      el.querySelector('title')?.replaceChildren(texto);
    });
    mini.current?.querySelectorAll<SVGElement>('path[data-room-id]').forEach((el) => {
      const id = el.dataset.roomId!;
      el.setAttribute('class', `figura estado-${estados.get(id)?.estado ?? 'sin_revisar'}${id === elegido ? ' elegida' : ''}`);
    });
  }, [data, estados, porId, elegido, tam, acercada]);

  // Centrar y destacar el recinto buscado.
  useEffect(() => {
    if (!resaltado || !data || !tam) return;
    setElegido(resaltado);
    const el = contenido.current?.querySelector(`path[data-room-id="${CSS.escape(resaltado)}"]`);
    if (el) {
      const t = setTimeout(() => zoom.current?.zoomToElement(el as unknown as HTMLElement, { maxScale: ajuste ? ajuste.inicial * 2 : 4 }), 60);
      return () => clearTimeout(t);
    }
  }, [resaltado, data, tam, ajuste]);

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

  function verCompleta() {
    if (!ajuste) return;
    const c = ajuste.centro(1);
    zoom.current?.setTransform(c.x, c.y, 1, 250);
  }

  const recintoElegido = elegido ? porId.get(elegido) : undefined;
  const estadoElegido = elegido ? estados.get(elegido) : undefined;
  const html = useMemo(() => ({ __html: data?.html ?? '' }), [data]);
  const htmlMini = useMemo(() => ({ __html: data?.htmlMini ?? '' }), [data]);
  const anchoMini = escritorio ? 240 : 170;
  const inicio = ajuste?.centro(ajuste.inicial);

  return (
    <div className="planta">
      <div className={`planta-marco ${claseMarco ?? ''}`} ref={marco}>
        {isLoading && <p className="planta-mensaje">Cargando planta…</p>}
        {error && <p className="planta-mensaje error-texto">No se pudo cargar la planta. La lista de recintos sigue disponible.</p>}
        {data && tam && ajuste && inicio && (
          <TransformWrapper
            ref={zoom}
            initialScale={ajuste.inicial}
            initialPositionX={inicio.x}
            initialPositionY={inicio.y}
            minScale={1}
            maxScale={ajuste.max}
            limitToBounds
            centerZoomedOut
            doubleClick={{ mode: 'zoomIn', step: 0.7 }}
            wheel={{ step: 0.12 }}
            onTransform={(_r, estado) => setAcercada(estado.scale > 1.05)}
          >
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
              <div
                ref={contenido}
                className={`planta-contenido modo-${modo}`}
                style={{ width: tam.ancho, height: tam.alto }}
                onPointerDown={(e) => (inicioToque.current = { x: e.clientX, y: e.clientY })}
                onPointerUp={alSoltar}
                onKeyDown={alTeclear}
                dangerouslySetInnerHTML={html}
              />
            </TransformComponent>
            {acercada && (
              <div className="planta-mini" ref={mini} aria-hidden="true">
                <MiniMap width={anchoMini} height={anchoMini * data.proporcion} borderColor="var(--correccion)">
                  <div className="planta-contenido" style={{ width: tam.ancho, height: tam.alto }} dangerouslySetInnerHTML={htmlMini} />
                </MiniMap>
              </div>
            )}
          </TransformWrapper>
        )}
        <div className="planta-controles" role="group" aria-label="Zoom de la planta">
          <button onClick={() => zoom.current?.zoomIn(0.5)} aria-label="Acercar" title="Acercar">
            <Icono nombre="mas" tam={20} />
          </button>
          <button onClick={() => zoom.current?.zoomOut(0.5)} aria-label="Alejar" title="Alejar">
            <Icono nombre="menos" tam={20} />
          </button>
          <button onClick={verCompleta} aria-label="Ver la planta completa" title="Ver la planta completa">
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
                {accionExtra?.(recintoElegido, estadoElegido)}
                <button className="boton boton-primario boton-ancho" onClick={() => onAbrir?.(recintoElegido)}>
                  Abrir ficha de {recintoElegido.codigo}
                </button>
              </div>
            )}
          </div>
        ) : (
          data && <span className="planta-ayuda">{data.girada ? 'Deslice de lado para recorrer la planta · ' : ''}Toque un recinto para ver su estado</span>
        )}
      </div>
    </div>
  );
}
