const ZONA = 'America/Santiago';

const fechaHora = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const soloFecha = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });

export function fecha(valor: string | Date | null | undefined, conHora = true) {
  if (!valor) return '—';
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  return (conHora ? fechaHora : soloFecha).format(d);
}

export function nombreArchivo(base: string, ext: string) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${base}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
}

export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
