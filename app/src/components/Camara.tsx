// Cámara dentro de la app: pide permiso desde el sitio (getUserMedia), muestra la imagen en vivo y
// captura fotos sin abrir la cámara del sistema. Si el permiso falla, explica cómo habilitarlo.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icono } from './Icono';

type Estado = 'pidiendo' | 'lista' | 'denegada' | 'sin-camara' | 'no-soportada' | 'error';

const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function ayudaPermiso() {
  const ua = navigator.userAgent;
  if (esIOS()) {
    const navegador = /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS/.test(ua) ? 'Edge' : 'Safari';
    return [
      navegador === 'Safari'
        ? 'En Safari, toque «aA» en la barra de dirección → Configuración del sitio web → Cámara → Permitir.'
        : `En Ajustes del iPhone → Apps → ${navegador} → active Cámara.`,
      'Revise también Ajustes → Apps → Safari → Cámara: debe estar en «Preguntar» o «Permitir».',
      'Luego vuelva a tocar «Intentar de nuevo».',
    ];
  }
  return [
    'Toque el candado o el ícono de ajustes junto a la dirección del sitio → Permisos → Cámara → Permitir.',
    'Si no aparece, revise Ajustes del teléfono → Apps → Chrome → Permisos → Cámara → Permitir.',
    'Luego vuelva a tocar «Intentar de nuevo».',
  ];
}

export function Camara({
  alCapturar,
  alCerrar,
  alUsarSistema,
}: {
  /** Recibe cada foto tomada; la cámara sigue abierta para tomar otra. */
  alCapturar: (archivo: File) => Promise<void> | void;
  alCerrar: () => void;
  /** Alternativa: abrir la cámara del teléfono con el selector de archivos. */
  alUsarSistema: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<Estado>('pidiendo');
  const [frontal, setFrontal] = useState(false);
  const [tomadas, setTomadas] = useState(0);
  const [destello, setDestello] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const detener = useCallback(() => {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
  }, []);

  const iniciar = useCallback(async () => {
    detener();
    if (!navigator.mediaDevices?.getUserMedia) {
      setEstado('no-soportada');
      return;
    }
    setEstado('pidiendo');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: frontal ? 'user' : 'environment' },
          width: { ideal: 2560 },
          height: { ideal: 1920 },
        },
      });
      flujo.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
      }
      setEstado('lista');
    } catch (e) {
      const nombre = e instanceof DOMException ? e.name : '';
      if (nombre === 'NotAllowedError' || nombre === 'SecurityError') setEstado('denegada');
      else if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') setEstado('sin-camara');
      else setEstado('error');
    }
  }, [frontal, detener]);

  useEffect(() => {
    void iniciar();
    return detener;
  }, [iniciar, detener]);

  // Escape cierra solo la cámara (no el formulario de abajo); al cerrar siempre se apaga.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      alCerrar();
    };
    document.addEventListener('keydown', tecla, true);
    return () => document.removeEventListener('keydown', tecla, true);
  }, [alCerrar]);

  async function disparar() {
    const v = video.current;
    if (!v || estado !== 'lista' || !v.videoWidth) return;
    const lienzo = document.createElement('canvas');
    lienzo.width = v.videoWidth;
    lienzo.height = v.videoHeight;
    lienzo.getContext('2d')!.drawImage(v, 0, 0);
    setDestello(true);
    setTimeout(() => setDestello(false), 180);
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.9));
    if (!blob) return;
    setGuardando(true);
    try {
      await alCapturar(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      setTomadas((n) => n + 1);
    } finally {
      setGuardando(false);
    }
  }

  const cerrar = () => {
    detener();
    alCerrar();
  };

  return (
    <div className="camara" role="dialog" aria-modal="true" aria-label="Cámara">
      <video ref={video} className={`camara-video${frontal ? ' espejo' : ''}`} playsInline muted autoPlay />
      {destello && <div className="camara-destello" aria-hidden="true" />}

      <div className="camara-sup">
        <button type="button" className="camara-boton" onClick={cerrar} aria-label="Cerrar cámara">
          <Icono nombre="cerrar" />
        </button>
        {tomadas > 0 && (
          <span className="camara-contador" role="status">
            {tomadas === 1 ? '1 foto tomada' : `${tomadas} fotos tomadas`}
          </span>
        )}
      </div>

      {estado !== 'lista' && (
        <div className="camara-mensaje">
          {estado === 'pidiendo' && (
            <>
              <Icono nombre="camara" tam={40} />
              <p>
                <strong>Permita el uso de la cámara</strong>
              </p>
              <p className="suave">El teléfono le preguntará si este sitio puede usar la cámara. Toque «Permitir».</p>
            </>
          )}
          {estado === 'denegada' && (
            <>
              <p>
                <strong>La cámara está bloqueada para este sitio</strong>
              </p>
              <ol className="camara-pasos">
                {ayudaPermiso().map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </>
          )}
          {estado === 'sin-camara' && (
            <p>
              <strong>No se encontró una cámara disponible.</strong> Cierre otras apps que puedan estar usándola y vuelva a
              intentar.
            </p>
          )}
          {estado === 'no-soportada' && (
            <p>
              <strong>Este navegador no permite usar la cámara dentro de la app.</strong> Use la cámara del teléfono.
            </p>
          )}
          {estado === 'error' && (
            <p>
              <strong>No se pudo iniciar la cámara.</strong> Cierre otras apps que la estén usando y vuelva a intentar.
            </p>
          )}
          {estado !== 'pidiendo' && (
            <div className="camara-alternativas">
              {estado !== 'no-soportada' && (
                <button type="button" className="boton boton-alto" onClick={() => void iniciar()}>
                  Intentar de nuevo
                </button>
              )}
              <button type="button" className="boton boton-alto camara-sutil" onClick={alUsarSistema}>
                Usar la cámara del teléfono
              </button>
            </div>
          )}
        </div>
      )}

      <div className="camara-inf">
        <button type="button" className="camara-texto" onClick={cerrar}>
          {tomadas > 0 ? 'Listo' : 'Cancelar'}
        </button>
        <button
          type="button"
          className="camara-disparador"
          onClick={() => void disparar()}
          disabled={estado !== 'lista' || guardando}
          aria-label="Tomar foto"
        >
          <span />
        </button>
        <button
          type="button"
          className="camara-boton"
          onClick={() => setFrontal((f) => !f)}
          disabled={estado !== 'lista'}
          aria-label={frontal ? 'Usar cámara trasera' : 'Usar cámara frontal'}
          title="Cambiar cámara"
        >
          <Icono nombre="sync" />
        </button>
      </div>
    </div>
  );
}
