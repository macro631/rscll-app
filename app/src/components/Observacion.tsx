import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSesion } from '../auth';
import { useBorrador } from '../lib/borrador';
import { prepararFoto, type FotoCola, type ItemCola } from '../lib/cola';
import { useAccion } from '../lib/datos';
import { fecha } from '../lib/formato';
import { ESPECIALIDADES, type Observacion } from '../lib/tipos';
import { Camara } from './Camara';
import { FotoLocal, FotoMiniatura } from './Foto';
import { Icono } from './Icono';

export function EstadoObs({ estado }: { estado: 'pendiente' | 'subsanada' }) {
  return (
    <span className={`obs-estado obs-${estado}`}>
      {estado === 'pendiente' ? 'Pendiente' : (
        <>
          <Icono nombre="check" tam={14} /> Subsanada
        </>
      )}
    </span>
  );
}

interface AccionesObs {
  comprobar?: boolean;
  devolver?: boolean;
  editar?: boolean;
  mostrarRecinto?: boolean;
}

export function ObservacionItem({ obs, acciones = {} }: { obs: Observacion; acciones?: AccionesObs }) {
  const { puede } = useSesion();
  const accion = useAccion();
  const [modo, setModo] = useState<'ver' | 'devolver' | 'editar' | 'eliminar'>('ver');
  const [texto, setTexto] = useState('');
  const [edicion, setEdicion] = useState({ especialidad: obs.especialidad, descripcion: obs.descripcion });
  const finalizada = obs.revision_condicion === 'finalizada';

  const puedeComprobar = acciones.comprobar && finalizada && obs.estado === 'pendiente';
  const puedeDevolver = acciones.devolver && finalizada && puede('inspeccion', 'admin');

  function devolver(e: FormEvent) {
    e.preventDefault();
    accion.mutate(
      { fn: 'mantener_pendiente', args: { p_observacion: obs.id, p_texto: texto }, ok: 'Comentario guardado; la observación queda pendiente' },
      { onSuccess: () => { setModo('ver'); setTexto(''); } },
    );
  }

  function guardarEdicion(e: FormEvent) {
    e.preventDefault();
    accion.mutate(
      { fn: 'editar_observacion', args: { p_observacion: obs.id, p_especialidad: edicion.especialidad, p_descripcion: edicion.descripcion }, ok: 'Observación actualizada' },
      { onSuccess: () => setModo('ver') },
    );
  }

  return (
    <article className={`obs obs-borde-${obs.estado}`}>
      <header className="obs-cabecera">
        <span className="obs-titulo">
          <span className="obs-numero">N° {obs.numero}</span>
          <span className="obs-especialidad">{obs.especialidad}</span>
          {obs.origen === 'inspeccion' && <span className="etiqueta">Inspección</span>}
        </span>
        <EstadoObs estado={obs.estado} />
      </header>
      {acciones.mostrarRecinto && (
        <p className="obs-recinto">
          <span className="codigo">{obs.codigo}</span> {obs.recinto_nombre}
        </p>
      )}

      {modo === 'editar' ? (
        <form className="formulario" onSubmit={guardarEdicion} style={{ marginTop: '0.5rem' }}>
          <select value={edicion.especialidad} onChange={(e) => setEdicion({ ...edicion, especialidad: e.target.value })} aria-label="Especialidad">
            {ESPECIALIDADES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <textarea rows={3} required value={edicion.descripcion} onChange={(e) => setEdicion({ ...edicion, descripcion: e.target.value })} aria-label="Descripción" />
          <div className="acciones">
            <button className="boton boton-primario boton-chico" disabled={accion.isPending}>Guardar cambios</button>
            <button type="button" className="boton boton-sutil boton-chico" onClick={() => setModo('ver')}>Cancelar</button>
          </div>
        </form>
      ) : (
        <p className="obs-descripcion">{obs.descripcion}</p>
      )}

      {obs.fotos.length > 0 && (
        <div className="fotos">
          {obs.fotos.map((f) => <FotoMiniatura key={f.id} foto={f} />)}
        </div>
      )}

      <p className="obs-meta">
        {obs.autor}, {fecha(obs.creada)}
        {obs.comprobada_en && obs.estado === 'subsanada' && <> · comprobada por {obs.comprobador}, {fecha(obs.comprobada_en)}</>}
      </p>

      {obs.comentarios.length > 0 && (
        <ul className="hilo">
          {obs.comentarios.map((c) => (
            <li key={c.id} className={`hilo-${c.tipo}`}>
              <span className="hilo-autor">
                {c.tipo === 'devolucion' ? 'Inspección' : c.tipo === 'subsanacion' ? 'Comprobación' : 'Nota'} · {c.autor} · {fecha(c.creado)}
              </span>
              <span>{c.texto}</span>
            </li>
          ))}
        </ul>
      )}

      {modo === 'devolver' && (
        <form className="formulario" onSubmit={devolver} style={{ marginTop: '0.6rem' }}>
          <textarea
            rows={2}
            required
            autoFocus
            placeholder="Por qué sigue pendiente"
            aria-label="Comentario de Inspección"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="acciones">
            <button className="boton boton-primario boton-chico" disabled={accion.isPending}>Mantener pendiente</button>
            <button type="button" className="boton boton-sutil boton-chico" onClick={() => setModo('ver')}>Cancelar</button>
          </div>
        </form>
      )}

      {modo === 'eliminar' && (
        <div className="acciones confirmar-linea">
          <span className="chico">¿Eliminar la observación N° {obs.numero}?</span>
          <button
            className="boton boton-peligro lleno boton-chico"
            onClick={() => accion.mutate({ fn: 'eliminar_observacion', args: { p_observacion: obs.id }, ok: 'Observación eliminada' })}
          >
            Eliminar
          </button>
          <button className="boton boton-sutil boton-chico" onClick={() => setModo('ver')}>No</button>
        </div>
      )}

      {modo === 'ver' && (puedeComprobar || puedeDevolver || acciones.editar) && (
        <div className="acciones">
          {puedeComprobar && (
            <button
              className="boton boton-ok boton-chico"
              disabled={accion.isPending}
              onClick={() => accion.mutate({ fn: 'marcar_subsanada', args: { p_observacion: obs.id }, ok: `N° ${obs.numero} marcada subsanada` })}
            >
              <Icono nombre="check" tam={18} />
              Marcar subsanada
            </button>
          )}
          {puedeDevolver && (
            <button className="boton boton-sutil boton-chico" onClick={() => setModo('devolver')}>
              <Icono nombre="comentario" tam={18} />
              {obs.estado === 'subsanada' ? 'Devolver a pendiente' : 'Comentar'}
            </button>
          )}
          {acciones.editar && (
            <>
              <button className="boton boton-sutil boton-chico" onClick={() => setModo('editar')}>
                <Icono nombre="editar" tam={18} />
                Editar
              </button>
              <button className="boton-texto peligro" onClick={() => setModo('eliminar')}>
                Eliminar
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

/** Observación aún en el teléfono, esperando sincronizar. */
export function ObservacionEnCola({ item, alDescartar }: { item: ItemCola; alDescartar: () => void }) {
  return (
    <article className="obs obs-en-cola">
      <header className="obs-cabecera">
        <span className="obs-titulo">
          <span className="obs-especialidad">{item.especialidad}</span>
        </span>
        <span className="sync sync-pendiente">
          <Icono nombre="sync" tam={14} />
          {item.observacionId ? 'Enviando fotos' : 'Por enviar'}
        </span>
      </header>
      {item.descripcion && <p className="obs-descripcion">{item.descripcion}</p>}
      {item.fotos.length > 0 && (
        <div className="fotos">
          {item.fotos.map((f) => <FotoLocal key={f.id} blob={f.ligera} />)}
        </div>
      )}
      {item.error && (
        <p className="error-texto chico">
          Último intento: {item.error}{' '}
          <button className="boton-texto peligro" onClick={alDescartar}>Descartar</button>
        </p>
      )}
    </article>
  );
}

/** Panel sobre la página: pantalla completa en teléfono, lateral en escritorio. */
export function Hoja({ titulo, codigo, alCerrar, pie, children }: { titulo: string; codigo?: string; alCerrar: () => void; pie: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    document.addEventListener('keydown', tecla);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = previo;
    };
  }, [alCerrar]);
  return (
    <div className="hoja-fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="hoja-cabeza">
          {codigo && <span className="codigo">{codigo}</span>}
          <h2>{titulo}</h2>
          <button className="boton boton-icono boton-sutil" style={{ border: 'none' }} onClick={alCerrar} aria-label="Cerrar">
            <Icono nombre="cerrar" />
          </button>
        </div>
        <div className="hoja-cuerpo">{children}</div>
        <div className="hoja-pie">{pie}</div>
      </div>
    </div>
  );
}

export interface DatosObservacion {
  especialidad: string;
  descripcion: string;
  fotos: FotoCola[];
}

/** Ingreso rápido: especialidad, descripción (se puede dictar con el teclado) y fotos. */
/** Observaciones ya registradas en el recinto con la misma especialidad: evita duplicar lo que otro ya anotó. */
function YaRegistradas({ especialidad, existentes }: { especialidad: string; existentes: Observacion[] }) {
  const mismas = existentes.filter((o) => o.especialidad === especialidad);
  if (!especialidad || mismas.length === 0) return null;
  return (
    <div className="ya-registradas" role="status">
      <p className="ya-registradas-titulo">
        Ya registradas en este recinto · {especialidad} ({mismas.length})
      </p>
      <ul>
        {mismas.map((o) => (
          <li key={o.id}>
            <span className="obs-numero">N° {o.numero}</span> {o.descripcion}
            <span className="mini tenue">
              {' '}
              — {o.autor}, {o.estado === 'pendiente' ? 'pendiente' : 'subsanada'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ObservacionForm({
  clave,
  titulo,
  codigo,
  textoGuardar = 'Guardar',
  permitirOtra = true,
  existentes = [],
  alGuardar,
  alCerrar,
}: {
  clave: string;
  titulo: string;
  codigo?: string;
  textoGuardar?: string;
  permitirOtra?: boolean;
  /** Observaciones vigentes del recinto (de todas las fichas), actualizadas en tiempo real. */
  existentes?: Observacion[];
  alGuardar: (d: DatosObservacion) => Promise<void>;
  alCerrar: () => void;
}) {
  const [borrador, cambiar, limpiar] = useBorrador(clave, { especialidad: '', descripcion: '' });
  const [fotos, setFotos] = useState<FotoCola[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardadas, setGuardadas] = useState(0);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const descripcion = useRef<HTMLTextAreaElement>(null);

  async function agregarFotos(archivos: FileList | null) {
    if (!archivos?.length) return;
    setProcesando(true);
    try {
      const nuevas = await Promise.all([...archivos].map(prepararFoto));
      setFotos((f) => [...f, ...nuevas]);
    } catch {
      setError('No se pudo procesar la foto. Intente con otra imagen.');
    } finally {
      setProcesando(false);
      if (camara.current) camara.current.value = '';
      if (galeria.current) galeria.current.value = '';
    }
  }

  async function guardar(otra: boolean) {
    if (!borrador.especialidad) return setError('Elija la especialidad.');
    if (!borrador.descripcion.trim()) return setError('Escriba la descripción.');
    setError(null);
    setProcesando(true);
    try {
      await alGuardar({ especialidad: borrador.especialidad, descripcion: borrador.descripcion.trim(), fotos });
      const especialidad = borrador.especialidad;
      limpiar();
      cambiar({ especialidad }); // se mantiene la última especialidad para el siguiente ingreso
      setFotos([]);
      setGuardadas((n) => n + 1);
      if (otra) descripcion.current?.focus();
      else alCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Hoja
      titulo={titulo}
      codigo={codigo}
      alCerrar={alCerrar}
      pie={
        <>
          {permitirOtra && (
            <button type="button" className="boton boton-sutil" disabled={procesando} onClick={() => void guardar(true)}>
              Guardar y otra
            </button>
          )}
          <button type="button" className="boton boton-primario" disabled={procesando} onClick={() => void guardar(false)}>
            {procesando ? 'Procesando…' : textoGuardar}
          </button>
        </>
      }
    >
      <form className="formulario" onSubmit={(e) => { e.preventDefault(); void guardar(false); }}>
        {guardadas > 0 && (
          <p className="nota nota-ok chico" role="status">
            {guardadas === 1 ? '1 observación guardada' : `${guardadas} observaciones guardadas`} en esta ficha.
          </p>
        )}
        <label>
          Especialidad
          <select value={borrador.especialidad} onChange={(e) => cambiar({ especialidad: e.target.value })}>
            <option value="" disabled>
              Elija la especialidad
            </option>
            {ESPECIALIDADES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <YaRegistradas especialidad={borrador.especialidad} existentes={existentes} />
        <label>
          Descripción
          <textarea
            ref={descripcion}
            rows={4}
            value={borrador.descripcion}
            placeholder="Qué se observa y dónde. Puede dictar con el micrófono del teclado."
            onChange={(e) => cambiar({ descripcion: e.target.value })}
          />
        </label>
        <div className="campo">
          <span>Fotos {fotos.length > 0 && <span className="suave">({fotos.length})</span>}</span>
          {fotos.length > 0 && (
            <div className="fotos">
              {fotos.map((f) => (
                <FotoLocal key={f.id} blob={f.ligera} alQuitar={() => setFotos((x) => x.filter((y) => y.id !== f.id))} />
              ))}
            </div>
          )}
          <div className="fotos-botones">
            <button type="button" className="boton boton-sutil" onClick={() => setCamaraAbierta(true)} disabled={procesando}>
              <Icono nombre="camara" />
              Tomar foto
            </button>
            <button type="button" className="boton boton-sutil" onClick={() => galeria.current?.click()} disabled={procesando}>
              <Icono nombre="galeria" />
              Galería
            </button>
          </div>
          <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void agregarFotos(e.target.files)} />
          <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={(e) => void agregarFotos(e.target.files)} />
        </div>
        {error && <p className="error-texto" role="alert">{error}</p>}
      </form>
      {/* Fuera del <form>: ningún botón de la cámara debe enviar la observación. */}
      {camaraAbierta && (
        <Camara
          alCerrar={() => setCamaraAbierta(false)}
          alCapturar={async (archivo) => {
            const foto = await prepararFoto(archivo);
            setFotos((f) => [...f, foto]);
          }}
          alUsarSistema={() => {
            setCamaraAbierta(false);
            camara.current?.click(); // cámara del sistema, como alternativa
          }}
        />
      )}
    </Hoja>
  );
}
