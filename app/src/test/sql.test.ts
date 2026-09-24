// Criterios de aceptación de Estructura.md §15 sobre las migraciones reales (PGlite).
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { cliente, crearBase, crearUsuario } from './db';

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const REV1 = '00000000-0000-0000-0000-000000000001';
const REV2 = '00000000-0000-0000-0000-000000000002';
const INSP = '00000000-0000-0000-0000-00000000000f';

type Estado = { recinto_id: string; estado: string; pendientes: number };
type Busqueda = { total: number; filas: { id: string; codigo: string }[] };

let db: PGlite;
let c: ReturnType<typeof cliente>;

async function estado(recinto: string) {
  c.como(ADMIN);
  const todos = await c.rpc<Estado[]>('estados');
  return todos.find((e) => e.recinto_id === recinto)!.estado;
}

async function revisar(uid: string, recinto: string, obs: [string, string][] = [], finalizar = true) {
  c.como(uid);
  const rev = await c.rpc<string>('abrir_revision', { p_recinto: recinto });
  const ids: string[] = [];
  for (const [esp, desc] of obs) {
    ids.push(await c.rpc<string>('agregar_observacion', { p_revision: rev, p_especialidad: esp, p_descripcion: desc }));
  }
  if (finalizar) await c.rpc('finalizar_revision', { p_revision: rev });
  return { rev, ids };
}

beforeAll(async () => {
  db = await crearBase();
  await crearUsuario(db, ADMIN, 'Calidad', 'admin');
  await crearUsuario(db, REV1, 'Revisor Uno', 'revisor');
  await crearUsuario(db, REV2, 'Revisor Dos', 'revisor');
  await crearUsuario(db, INSP, 'Inspección', 'inspeccion');
  c = cliente(db);
}, 60_000);

describe('catálogo', () => {
  it('tiene 100 unidades lógicas y no contiene códigos retirados (criterio 10)', async () => {
    c.como(REV1);
    const cat = await c.rpc<{ codigo: string }[]>('catalogo');
    expect(cat).toHaveLength(100);
    expect(cat.map((r) => r.codigo)).not.toContain('A-28');
    expect(cat.map((r) => r.codigo)).not.toContain('A-41');
    expect(cat.map((r) => r.codigo)).not.toContain('B-33');
  });

  it('E1 pertenece a ambos pisos con una sola ficha y un solo estado (criterio 1)', async () => {
    c.como(REV1);
    const cat = await c.rpc<{ codigo: string; sectores: { sector: string }[]; figuras: { plano: string }[] }[]>('catalogo');
    const e1 = cat.filter((r) => r.codigo === 'E1');
    expect(e1).toHaveLength(1);
    expect(e1[0].sectores.map((s) => s.sector).sort()).toEqual(['Piso 1 (A)', 'Piso 2 (B)']);
    expect(e1[0].figuras.map((f) => f.plano).sort()).toEqual(['Piso 1 (A)', 'Piso 2 (B)']);
    await revisar(REV1, 'RSCLL:E1', [], false);
    expect(await estado('RSCLL:E1')).toBe('en_revision');
  });
});

describe('estados y fichas personales', () => {
  it('sin revisión es gris', async () => {
    expect(await estado('RSCLL:A-02')).toBe('sin_revisar');
  });

  it('dos revisores con fichas distintas; el estado deriva de ambas (criterio 2)', async () => {
    c.como(REV1);
    const r1 = await c.rpc<string>('abrir_revision', { p_recinto: 'RSCLL:A-01' });
    c.como(REV2);
    const r2 = await c.rpc<string>('abrir_revision', { p_recinto: 'RSCLL:A-01' });
    expect(r1).not.toBe(r2);
    c.como(REV1);
    expect(await c.rpc('abrir_revision', { p_recinto: 'RSCLL:A-01' })).toBe(r1); // continúa la propia
    await c.rpc('agregar_observacion', { p_revision: r1, p_especialidad: 'Pintura', p_descripcion: 'Muro manchado' });
    await c.rpc('finalizar_revision', { p_revision: r1 });
    expect(await estado('RSCLL:A-01')).toBe('en_revision'); // la de REV2 sigue abierta
    c.como(REV2);
    await c.rpc('agregar_observacion', { p_revision: r2, p_especialidad: 'Puertas', p_descripcion: 'Bisagra suelta' });
    await c.rpc('finalizar_revision', { p_revision: r2 });
    expect(await estado('RSCLL:A-01')).toBe('pendiente');
    const ficha = await c.rpc<{ observaciones: { autor: string }[] }>('ficha_recinto', { p_recinto: 'RSCLL:A-01' });
    expect(ficha.observaciones.map((o) => o.autor).sort()).toEqual(['Revisor Dos', 'Revisor Uno']);
  });

  it('otro usuario no puede escribir en una ficha ajena', async () => {
    c.como(REV1);
    const { rev } = await revisar(REV1, 'RSCLL:A-03', [], false);
    c.como(REV2);
    await expect(
      c.rpc('agregar_observacion', { p_revision: rev, p_especialidad: 'Pintura', p_descripcion: 'x' }),
    ).rejects.toThrow(/autor/);
    c.como(REV1);
    await c.rpc('finalizar_revision', { p_revision: rev });
  });

  it('finalizada sin pendientes es verde claro; con pendientes ámbar; la última subsanación vuelve a verde claro (criterio 3)', async () => {
    await revisar(REV1, 'RSCLL:A-04');
    expect(await estado('RSCLL:A-04')).toBe('listo');
    const { ids } = await revisar(REV1, 'RSCLL:A-05', [['Sanitario', 'Fuga WC'], ['Pintura', 'Retoque']]);
    expect(await estado('RSCLL:A-05')).toBe('pendiente');
    c.como(REV2);
    await c.rpc('marcar_subsanada', { p_observacion: ids[0] });
    expect(await estado('RSCLL:A-05')).toBe('pendiente');
    c.como(INSP);
    await c.rpc('marcar_subsanada', { p_observacion: ids[1] });
    expect(await estado('RSCLL:A-05')).toBe('listo');
  });

  it('no se edita una ficha finalizada', async () => {
    const { rev } = await revisar(REV1, 'RSCLL:A-06');
    c.como(REV1);
    await expect(
      c.rpc('agregar_observacion', { p_revision: rev, p_especialidad: 'Pintura', p_descripcion: 'x' }),
    ).rejects.toThrow(/no está abierta/);
  });

  it('la cola sin conexión es idempotente por client_id', async () => {
    const { rev } = await revisar(REV1, 'RSCLL:A-07', [], false);
    c.como(REV1);
    const cid = '11111111-1111-1111-1111-111111111111';
    const a = await c.rpc('agregar_observacion', { p_revision: rev, p_especialidad: 'Pintura', p_descripcion: 'x', p_client_id: cid });
    const b = await c.rpc('agregar_observacion', { p_revision: rev, p_especialidad: 'Pintura', p_descripcion: 'x', p_client_id: cid });
    expect(a).toBe(b);
    await c.rpc('finalizar_revision', { p_revision: rev });
  });
});

describe('Inspección y recepción', () => {
  it('Inspección comenta y mantiene pendiente sin duplicar la observación (criterio 4)', async () => {
    const { ids } = await revisar(REV1, 'RSCLL:A-08', [['Ventanas', 'Burlete faltante']]);
    c.como(REV1);
    await c.rpc('marcar_subsanada', { p_observacion: ids[0] });
    expect(await estado('RSCLL:A-08')).toBe('listo');
    c.como(INSP);
    await c.rpc('mantener_pendiente', { p_observacion: ids[0], p_texto: 'Sigue sin burlete' });
    expect(await estado('RSCLL:A-08')).toBe('pendiente');
    const ficha = await c.rpc<{ observaciones: { comentario_inspeccion: string }[]; estado: { devueltas: number } }>(
      'ficha_recinto', { p_recinto: 'RSCLL:A-08' },
    );
    expect(ficha.observaciones).toHaveLength(1);
    expect(ficha.observaciones[0].comentario_inspeccion).toBe('Sigue sin burlete');
    expect(ficha.estado.devueltas).toBe(1);
  });

  it('Revisor no puede devolver a pendiente en nombre de Inspección', async () => {
    const { ids } = await revisar(REV1, 'RSCLL:A-09', [['Ventanas', 'x']]);
    c.como(REV2);
    await expect(c.rpc('mantener_pendiente', { p_observacion: ids[0], p_texto: 'x' })).rejects.toThrow(/rol/);
  });

  it('solo Inspección recepciona; una devolución posterior vuelve a ámbar y la recepción queda en Historial (criterio 5)', async () => {
    const { ids } = await revisar(REV1, 'RSCLL:A-10', [['Pintura', 'Retoque cielo']]);
    c.como(REV1);
    await c.rpc('marcar_subsanada', { p_observacion: ids[0] });
    await expect(c.rpc('recepcionar', { p_recinto: 'RSCLL:A-10' })).rejects.toThrow(/rol/);
    c.como(ADMIN);
    await expect(c.rpc('recepcionar', { p_recinto: 'RSCLL:A-10' })).rejects.toThrow(/rol/);
    c.como(INSP);
    await c.rpc('recepcionar', { p_recinto: 'RSCLL:A-10' });
    expect(await estado('RSCLL:A-10')).toBe('recepcionado');
    await c.rpc('mantener_pendiente', { p_observacion: ids[0], p_texto: 'Mancha reaparece' });
    expect(await estado('RSCLL:A-10')).toBe('pendiente');
    c.como(REV2);
    await c.rpc('marcar_subsanada', { p_observacion: ids[0] });
    expect(await estado('RSCLL:A-10')).toBe('listo'); // la recepción anterior ya no está vigente
    c.como(ADMIN);
    const h = await c.rpc<{ filas: { accion: string }[] }>('historial', { p_filtros: { recinto: 'RSCLL:A-10' } });
    const acciones = h.filas.map((f) => f.accion);
    expect(acciones).toContain('recepcion');
    expect(acciones).toContain('devolucion_recepcion');
  });

  it('no se recepciona un recinto con pendientes', async () => {
    await revisar(REV1, 'RSCLL:A-11', [['Pintura', 'x']]);
    c.como(INSP);
    await expect(c.rpc('recepcionar', { p_recinto: 'RSCLL:A-11' })).rejects.toThrow(/verde claro/);
  });

  it('Inspección registra un defecto sin observación previa en un recinto verde claro (§16.1)', async () => {
    c.como(INSP);
    await expect(
      c.rpc('observacion_inspeccion', { p_recinto: 'RSCLL:A-12', p_especialidad: 'Pintura', p_descripcion: 'x' }),
    ).rejects.toThrow(/listos/);
    await revisar(REV1, 'RSCLL:A-12');
    c.como(INSP);
    await c.rpc('observacion_inspeccion', { p_recinto: 'RSCLL:A-12', p_especialidad: 'Cerámico / Porcelanato', p_descripcion: 'Palmeta quebrada' });
    expect(await estado('RSCLL:A-12')).toBe('pendiente');
    c.como(REV1);
    await expect(
      c.rpc('observacion_inspeccion', { p_recinto: 'RSCLL:A-12', p_especialidad: 'Pintura', p_descripcion: 'x' }),
    ).rejects.toThrow(/rol/);
  });

  it('Inspección también revisa: abre su ficha, registra observaciones y finaliza (decisión 24-09-2026)', async () => {
    const { rev, ids } = await revisar(INSP, 'RSCLL:A-17', [['Climatización', 'Rejilla sin fijar']], false);
    expect(await estado('RSCLL:A-17')).toBe('en_revision');
    c.como(INSP);
    await c.rpc('editar_observacion', { p_observacion: ids[0], p_especialidad: 'Climatización', p_descripcion: 'Rejilla de retorno sin fijar' });
    await c.rpc('finalizar_revision', { p_revision: rev });
    expect(await estado('RSCLL:A-17')).toBe('pendiente');
    // Sus funciones propias se mantienen: subsana y recepciona.
    c.como(INSP);
    await c.rpc('marcar_subsanada', { p_observacion: ids[0] });
    await c.rpc('recepcionar', { p_recinto: 'RSCLL:A-17' });
    expect(await estado('RSCLL:A-17')).toBe('recepcionado');
    // Y sigue sin poder escribir en la ficha de otra persona.
    const otra = await revisar(REV1, 'RSCLL:A-18', [], false);
    c.como(INSP);
    await expect(
      c.rpc('agregar_observacion', { p_revision: otra.rev, p_especialidad: 'Pintura', p_descripcion: 'x' }),
    ).rejects.toThrow(/autor/);
    c.como(REV1);
    await c.rpc('finalizar_revision', { p_revision: otra.rev });
  });

  it('revisión de un área exterior sin polígono (criterio 6)', async () => {
    await revisar(REV1, 'RSCLL:D-01', [['Paisajismo', 'Faltan especies']]);
    expect(await estado('RSCLL:D-01')).toBe('pendiente');
  });
});

describe('informes', () => {
  it('Piso 1 y Piso 2 incluyen E1; Todos no la duplica (criterio 7)', async () => {
    c.como(REV1);
    const e1 = await c.rpc<string>('abrir_revision', { p_recinto: 'RSCLL:E1' });
    await c.rpc('agregar_observacion', { p_revision: e1, p_especialidad: 'Pintura', p_descripcion: 'Pasamanos' });
    await c.rpc('finalizar_revision', { p_revision: e1 });
    expect(await estado('RSCLL:E1')).toBe('pendiente');
    const p1 = await c.rpc<Busqueda>('buscar_observaciones', { p_filtros: { sector: 'Piso 1 (A)', recinto: 'RSCLL:E1' } });
    const p2 = await c.rpc<Busqueda>('buscar_observaciones', { p_filtros: { sector: 'Piso 2 (B)', recinto: 'RSCLL:E1' } });
    const todos = await c.rpc<Busqueda>('buscar_observaciones', { p_filtros: {} });
    expect(p1.total).toBe(1);
    expect(p2.total).toBe(1);
    expect(todos.filas.filter((f) => f.codigo === 'E1')).toHaveLength(1);
    expect(new Set(todos.filas.map((f) => f.id)).size).toBe(todos.total);
  });

  it('Pintura pendiente reúne exactamente las filas de ese oficio', async () => {
    c.como(REV1);
    const r = await c.rpc<{ total: number; filas: { especialidad: string; estado: string }[] }>(
      'buscar_observaciones', { p_filtros: { especialidad: 'Pintura', estado: 'pendiente' } },
    );
    expect(r.total).toBeGreaterThan(0);
    expect(r.filas.every((f) => f.especialidad === 'Pintura' && f.estado === 'pendiente')).toBe(true);
  });

  it('paginación de Base', async () => {
    c.como(REV1);
    const todas = await c.rpc<Busqueda>('buscar_observaciones', { p_filtros: {}, p_orden: 'numero' });
    const pag = await c.rpc<Busqueda>('buscar_observaciones', { p_filtros: {}, p_limite: 2, p_desplazamiento: 2, p_orden: 'numero' });
    expect(pag.total).toBe(todas.total);
    expect(pag.filas.map((f) => f.id)).toEqual(todas.filas.slice(2, 4).map((f) => f.id));
  });
});

describe('administración', () => {
  it('Historial y reapertura son exclusivos del Administrador (criterio 9)', async () => {
    c.como(REV1);
    await expect(c.rpc('historial')).rejects.toThrow(/rol/);
    c.como(INSP);
    await expect(c.rpc('historial')).rejects.toThrow(/rol/);
    const { rev } = await revisar(REV1, 'RSCLL:A-13');
    c.como(REV1);
    await expect(c.rpc('reabrir_revision', { p_revision: rev })).rejects.toThrow(/rol/);
    c.como(ADMIN);
    await c.rpc('reabrir_revision', { p_revision: rev });
    expect(await estado('RSCLL:A-13')).toBe('en_revision');
    c.como(REV1);
    await c.rpc('finalizar_revision', { p_revision: rev });
    expect(await estado('RSCLL:A-13')).toBe('listo');
  });

  it('anulación conserva el registro, recalcula el estado y se puede revertir', async () => {
    const { rev } = await revisar(REV1, 'RSCLL:A-14', [['Mobiliario', 'Cajón trabado']]);
    expect(await estado('RSCLL:A-14')).toBe('pendiente');
    c.como(ADMIN);
    await c.rpc('anular_revision', { p_revision: rev, p_motivo: 'Recinto equivocado' });
    expect(await estado('RSCLL:A-14')).toBe('sin_revisar');
    await c.rpc('revertir_anulacion', { p_revision: rev });
    expect(await estado('RSCLL:A-14')).toBe('pendiente');
    const h = await c.rpc<{ filas: { accion: string }[] }>('historial', { p_filtros: { recinto: 'RSCLL:A-14' } });
    expect(h.filas.map((f) => f.accion)).toEqual(expect.arrayContaining(['anulacion', 'reversion_anulacion']));
  });

  it('anular la única ficha de un recinto recepcionado lo invalida; revertir restituye la recepción', async () => {
    const { rev } = await revisar(REV1, 'RSCLL:A-15');
    c.como(INSP);
    await c.rpc('recepcionar', { p_recinto: 'RSCLL:A-15' });
    c.como(ADMIN);
    await c.rpc('anular_revision', { p_revision: rev, p_motivo: 'Prueba' });
    expect(await estado('RSCLL:A-15')).toBe('sin_revisar');
    await revisar(REV2, 'RSCLL:A-15', [], false);
    c.como(REV2);
    // mientras tanto no debe aparecer como recepcionado
    expect(await estado('RSCLL:A-15')).toBe('en_revision');
    c.como(ADMIN);
    await c.rpc('revertir_anulacion', { p_revision: rev });
    expect(await estado('RSCLL:A-15')).toBe('en_revision');
  });

  it('una cuenta desactivada no puede operar', async () => {
    const X = '00000000-0000-0000-0000-0000000000cc';
    await crearUsuario(db, X, 'Temporal', 'revisor');
    c.como(ADMIN);
    await c.rpc('admin_actualizar_perfil', { p_usuario: X, p_nombre: 'Temporal', p_rol: 'revisor', p_activo: false });
    c.como(X);
    await expect(c.rpc('abrir_revision', { p_recinto: 'RSCLL:A-16' })).rejects.toThrow(/desactivada/);
  });
});

describe('RLS', () => {
  it('el rol authenticated no escribe directamente y lee según cuenta activa', async () => {
    await db.exec(`set role authenticated`);
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [REV1]);
      const r = await db.query<{ n: number }>(`select count(*)::int as n from recinto`);
      expect(r.rows[0].n).toBe(100);
      await expect(
        db.query(`update observacion set estado = 'subsanada'`),
      ).rejects.toThrow(/permission denied/);
      await expect(db.query(`truncate evento`)).rejects.toThrow(/permission denied/);
      const vista = await db.query<{ escribe: boolean }>(
        `select has_table_privilege('authenticated', 'observacion_detalle', 'insert,update,delete,truncate') as escribe`,
      );
      expect(vista.rows[0].escribe).toBe(false);
      const ev = await db.query<{ n: number }>(`select count(*)::int as n from evento`);
      expect(ev.rows[0].n).toBe(0); // Historial solo para Administrador
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
      const anon = await db.query<{ n: number }>(`select count(*)::int as n from recinto`);
      expect(anon.rows[0].n).toBe(0);
    } finally {
      await db.exec(`reset role`);
    }
  });
});
