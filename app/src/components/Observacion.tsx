import { useRef, useState, type FormEvent } from 'react';
import { useSesion } from '../auth';
import { useBorrador } from '../lib/borrador';
import { prepararFoto, type FotoCola, type ItemCola } from '../lib/cola';
import { useAccion } from '../lib/datos';
import { fecha } from '../lib/formato';
import { ESPECIALIDADES, type Observacion } from '../lib/tipos';
import { FotoLocal, FotoMiniatura } from './Foto';

export function EstadoObs({ estado }: { estado: 'pendiente' | 'subsanada' }) {
  return (
    <span className={`obs-estado obs-${estado}`}>
      <span aria-hidden="true">{estado === 'pendiente' ? '!' : '✓'} </span>
      {estado === 'pendiente' ? 'Pendiente' : 'Subsanada'}
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
        <span>
          <span className="obs-numero">N° {obs.numero}</span>
          {acciones.mostrarRecinto && (
            <span className="obs-recinto"> · <strong>{obs.codigo}</strong> {obs.recinto_nombre}</span>
          )}
        </span>
        <EstadoObs estado={obs.estado} />
      </header>
      <p className="obs-especialidad">
        {obs.especialidad}
        {obs.origen === 'inspeccion' && <span className="etiqueta">Observación de Inspección</span>}
      </p>

      {modo === 'editar' ? (
        <form className="formulario" onSubmit={guardarEdicion}>
          <select value={edicion.especialidad} onChange={(e) => setEdicion({ ...edicion, especialidad: e.target.value })} aria-label="Especialidad">
            {ESPECIALIDADES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <textarea rows={3} required value={edicion.descripcion} onChange={(e) => setEdicion({ ...edicion, descripcion: e.target.value })} aria-label="Descripción" />
          <div className="acciones">
            <button className="boton boton-primario" disabled={accion.isPending}>Guardar</button>
            <button type="button" className="boton" onClick={() => setModo('ver')}>Cancelar</button>
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
        {obs.autor} · {fecha(obs.creada)}
        {obs.comprobada_en && obs.estado === 'subsanada' && <> · Comprobada por {obs.comprobador} el {fecha(obs.comprobada_en)}</>}
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
        <form className="formulario" onSubmit={devolver}>
          <textarea
            rows={2}
            required
            autoFocus
            placeholder="Comentario de Inspección (por qué sigue pendiente)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="acciones">
            <button className="boton boton-aviso" disabled={accion.isPending}>Mantener pendiente</button>
            <button type="button" className="boton" onClick={() => setModo('ver')}>Cancelar</button>
          </div>
        </form>
      )}

      {modo === 'eliminar' && (
        <div className="acciones confirmar-linea">
          <span>¿Eliminar esta observación?</span>
          <button
            className="boton boton-peligro"
            onClick={() => accion.mutate({ fn: 'eliminar_observacion', args: { p_observacion: obs.id }, ok: 'Observación eliminada' })}
          >
            Eliminar
          </button>
          <button className="boton" onClick={() => setModo('ver')}>No</button>
        </div>
      )}

      {modo === 'ver' && (puedeComprobar || puedeDevolver || acciones.editar) && (
        <div className="acciones">
          {puedeComprobar && (
            <button
              className="boton boton-exito"
              disabled={accion.isPending}
              onClick={() => accion.mutate({ fn: 'marcar_subsanada', args: { p_observacion: obs.id }, ok: `N° ${obs.numero} marcada subsanada` })}
            >
              ✓ Marcar subsanada
            </button>
          )}
          {puedeDevolver && (
            <button className="boton" onClick={() => setModo('devolver')}>
              {obs.estado === 'subsanada' ? 'Devolver a pendiente' : 'Comentar y mantener pendiente'}
            </button>
          )}
          {acciones.editar && (
            <>
              <button className="boton" onClick={() => setModo('editar')}>Editar</button>
              <button className="boton-texto peligro" onClick={() => setModo('eliminar')}>Eliminar</button>
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
        <span className="obs-numero">{item.observacionId ? 'Enviando fotos…' : 'Por sincronizar'}</span>
        <span className="sync sync-pendiente">⟳ Pendiente de sincronizar</span>
      </header>
      {item.especialidad && <p className="obs-especialidad">{item.especialidad}</p>}
      {item.descripcion && <p className="obs-descripcion">{item.descripcion}</p>}
      {item.fotos.length > 0 && (
        <div className="fotos">
          {item.fotos.map((f) => <FotoLocal key={f.id} blob={f.ligera} />)}
        </div>
      )}
      {item.error && (
        <p className="error-texto pequeño">
          Último intento: {item.error}{' '}
          <button className="boton-texto peligro" onClick={alDescartar}>Descartar</button>
        </p>
      )}
    </article>
  );
}

export interface DatosObservacion {
  especialidad: string;
  descripcion: string;
  fotos: FotoCola[];
}

/** Ingreso rápido en teléfono: especialidad, descripción (se puede dictar con el teclado) y fotos. */
export function ObservacionForm({
  clave,
  textoBoton = 'Guardar observación',
  alGuardar,
  alCancelar,
}: {
  clave: string;
  textoBoton?: string;
  alGuardar: (d: DatosObservacion) => Promise<void>;
  alCancelar?: () => void;
}) {
  const [borrador, cambiar, limpiar] = useBorrador(clave, { especialidad: '', descripcion: '' });
  const [fotos, setFotos] = useState<FotoCola[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  async function agregarFotos(archivos: FileList | null) {
    if (!archivos?.length) return;
    setProcesando(true);
    try {
      const nuevas = await Promise.all([...archivos].map(prepararFoto));
      setFotos((f) => [...f, ...nuevas]);
    } catch {
      setError('No se pudo procesar la foto');
    } finally {
      setProcesando(false);
      if (camara.current) camara.current.value = '';
      if (galeria.current) galeria.current.value = '';
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!borrador.especialidad) return setError('Elija la especialidad');
    if (!borrador.descripcion.trim()) return setError('Escriba la descripción');
    setError(null);
    setProcesando(true);
    try {
      await alGuardar({ especialidad: borrador.especialidad, descripcion: borrador.descripcion.trim(), fotos });
      const especialidad = borrador.especialidad;
      limpiar();
      cambiar({ especialidad }); // se mantiene la última especialidad para el siguiente ingreso
      setFotos([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcesando(false);
    }
  }

  return (
    <form className="formulario obs-form" onSubmit={guardar}>
      <fieldset>
        <legend>Especialidad</legend>
        <div className="especialidades">
          {ESPECIALIDADES.map((s) => (
            <button
              type="button"
              key={s}
              className={`chip${borrador.especialidad === s ? ' activo' : ''}`}
              aria-pressed={borrador.especialidad === s}
              onClick={() => cambiar({ especialidad: s })}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>
      <label>
        Descripción
        <textarea
          rows={3}
          value={borrador.descripcion}
          placeholder="Describa la observación (puede dictar con el micrófono del teclado)"
          onChange={(e) => cambiar({ descripcion: e.target.value })}
        />
      </label>
      <div className="fotos">
        {fotos.map((f) => (
          <FotoLocal key={f.id} blob={f.ligera} alQuitar={() => setFotos((x) => x.filter((y) => y.id !== f.id))} />
        ))}
      </div>
      <div className="acciones">
        <button type="button" className="boton" onClick={() => camara.current?.click()} disabled={procesando}>📷 Cámara</button>
        <button type="button" className="boton" onClick={() => galeria.current?.click()} disabled={procesando}>🖼 Galería</button>
        <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void agregarFotos(e.target.files)} />
        <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={(e) => void agregarFotos(e.target.files)} />
      </div>
      {error && <p className="error-texto" role="alert">{error}</p>}
      <div className="acciones">
        <button className="boton boton-primario boton-grande" disabled={procesando}>
          {procesando ? 'Procesando…' : textoBoton}
        </button>
        {alCancelar && <button type="button" className="boton" onClick={alCancelar}>Cerrar</button>}
      </div>
    </form>
  );
}
