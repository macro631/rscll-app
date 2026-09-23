import { useEffect, useState } from 'react';
import { api, type Bucket } from '../lib/backend';
import type { FotoRef } from '../lib/tipos';
import { Icono } from './Icono';

function useUrlFoto(bucket: Bucket, path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    if (!path) return;
    api()
      .urlFoto(bucket, path)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [bucket, path]);
  return { url, error };
}

/** Miniatura que carga la versión ligera solo al mostrarse; al tocarla abre la original. */
export function FotoMiniatura({ foto }: { foto: FotoRef }) {
  const { url, error } = useUrlFoto('fotos-ligera', foto.ligera);
  const [ampliada, setAmpliada] = useState(false);
  if (error) return <span className="foto-mini foto-error">Foto no disponible</span>;
  return (
    <>
      <button className="foto-mini" onClick={() => setAmpliada(true)} aria-label="Ver foto">
        {url ? <img src={url} alt="" loading="lazy" /> : <span className="foto-cargando" />}
      </button>
      {ampliada && <FotoAmpliada foto={foto} alCerrar={() => setAmpliada(false)} />}
    </>
  );
}

function FotoAmpliada({ foto, alCerrar }: { foto: FotoRef; alCerrar: () => void }) {
  const { url } = useUrlFoto('fotos-original', foto.original);
  const ligera = useUrlFoto('fotos-ligera', foto.ligera);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);
  return (
    <div className="foto-visor" role="dialog" aria-label="Foto" onClick={alCerrar}>
      {(url ?? ligera.url) && <img src={url ?? ligera.url!} alt="Foto de la observación" />}
      <button className="boton foto-cerrar" onClick={alCerrar}>
        <Icono nombre="cerrar" tam={20} />
        Cerrar
      </button>
    </div>
  );
}

export function FotoLocal({ blob, alQuitar }: { blob: Blob; alQuitar?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <span className="foto-mini foto-local">
      {url && <img src={url} alt="" />}
      {alQuitar && (
        <button type="button" className="foto-quitar" onClick={alQuitar} aria-label="Quitar foto">
          <Icono nombre="cerrar" tam={16} />
        </button>
      )}
    </span>
  );
}
