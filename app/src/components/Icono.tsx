// Íconos de trazo propios (24×24), dibujados en el lenguaje de un plano: líneas simples de grosor constante.
const TRAZOS = {
  planta: 'M3 4h18v16H3z M3 11h7v9 M10 4v4 M14 11h7 M14 11v3',
  revision: 'M6 4h12v17H6z M9 2.5h6v3H9z M9 13l2 2 4-4',
  informe: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6',
  base: 'M3 5h18v14H3z M3 10h18 M3 15h18 M9 5v14',
  historial: 'M12 4a8 8 0 1 1-7.4 5 M4 4v5h5 M12 8v4l3 2',
  camara: 'M4 8h3l2-2h6l2 2h3v11H4z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  galeria: 'M3 5h18v14H3z M8.5 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3 M21 16l-5-5-9 8',
  check: 'M5 12.5l4.5 4.5L19 7',
  mas: 'M12 5v14 M5 12h14',
  menos: 'M5 12h14',
  ajustar: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  buscar: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12 M20 20l-4.6-4.6',
  cerrar: 'M6 6l12 12 M18 6L6 18',
  salir: 'M14 4h5v16h-5 M10 8l-4 4 4 4 M6 12h10',
  sync: 'M19.5 13a7.5 7.5 0 0 1-13.4 3.6 M4.5 11A7.5 7.5 0 0 1 17.9 7.4 M18 3.5v4h-4 M6 20.5v-4h4',
  volver: 'M15 5l-7 7 7 7',
  filtro: 'M4 5h16l-6 7.5V19l-4-2v-4.5z',
  lista: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.5 M4.5 12h.5 M4.5 18h.5',
  descarga: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  abajo: 'M6 9l6 6 6-6',
  editar: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  papelera: 'M5 7h14 M10 7V4h4v3 M7 7l1 13h8l1-13',
  comentario: 'M4 5h16v11H9l-5 4z',
  usuarios: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M3 20c.8-3.5 3.2-5 6-5s5.2 1.5 6 5 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 15c1.6.6 2.6 2.2 3 5',
  respaldo: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3 M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tam = 22, className }: { nombre: NombreIcono; tam?: number; className?: string }) {
  return (
    <svg
      className={className ? `icono ${className}` : 'icono'}
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
