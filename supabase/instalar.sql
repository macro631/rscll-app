-- RSCLL · Instalación completa (generado por scripts/unir_sql.mjs). Ejecutar una sola vez en un proyecto nuevo.
begin;

-- ═══════════ migrations/001_schema.sql ═══════════
-- RSCLL · Esquema base (Estructura.md §12)
-- Todas las escrituras pasan por funciones RPC (004_rpc.sql); las tablas solo se leen vía RLS.


create type rol_usuario as enum ('admin', 'revisor', 'inspeccion');
create type condicion_revision as enum ('abierta', 'finalizada', 'anulada');
create type origen_registro as enum ('ordinaria', 'inspeccion');
create type estado_observacion as enum ('pendiente', 'subsanada');
create type especialidad as enum (
  'Sanitario',
  'Electricidad y CCDD',
  'Climatización',
  'Terminaciones',
  'Pintura',
  'Cerámico / Porcelanato',
  'Ventanas',
  'Puertas',
  'Mobiliario',
  'Paisajismo',
  'Cubierta'
);

create table proyecto (
  id     text primary key,
  codigo text not null unique,
  nombre text not null
);

create table recinto (
  id          text primary key,              -- 'RSCLL:A-01'
  proyecto_id text not null references proyecto (id),
  codigo      text not null unique,
  nombre      text not null,
  tipo        text not null,
  orden       int  not null default 0,
  activo      boolean not null default true
);

-- Una unidad puede pertenecer a varios sectores (E1/E2 en ambos pisos; C-06, C-13, C-14 en Casa y Exterior).
create table recinto_sector (
  recinto_id text not null references recinto (id) on delete cascade,
  sector     text not null check (sector in ('Piso 1 (A)', 'Piso 2 (B)', 'Casa (C)', 'Exterior (D)')),
  superficie numeric,
  primary key (recinto_id, sector)
);

-- Cero, una o varias figuras SVG por unidad.
create table figura (
  recinto_id text not null references recinto (id) on delete cascade,
  plano      text not null,
  element_id text not null,
  primary key (plano, element_id)
);

create table perfil (
  id     uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  email  text,
  rol    rol_usuario not null default 'revisor',
  activo boolean not null default true,
  creado timestamptz not null default now()
);

create table revision (
  id               uuid primary key default gen_random_uuid(),
  recinto_id       text not null references recinto (id),
  autor            uuid not null references perfil (id),
  origen           origen_registro not null default 'ordinaria',
  condicion        condicion_revision not null default 'abierta',
  condicion_previa condicion_revision,          -- para revertir una anulación
  inicio           timestamptz not null default now(),
  fin              timestamptz,
  anulada_por      uuid references perfil (id),
  anulada_en       timestamptz,
  motivo_anulacion text,
  recepcion_invalidada uuid                     -- recepción que la anulación dejó sin vigencia
);
-- Una persona continúa su ficha abierta en vez de crear otra igual (§7.2).
create unique index revision_una_abierta on revision (recinto_id, autor) where condicion = 'abierta';
create index revision_recinto on revision (recinto_id);

create table observacion (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint generated always as identity unique,
  revision_id    uuid not null references revision (id),
  recinto_id     text not null references recinto (id),
  especialidad   especialidad not null,
  descripcion    text not null check (length(trim(descripcion)) > 0),
  estado         estado_observacion not null default 'pendiente',
  origen         origen_registro not null default 'ordinaria',
  autor          uuid not null references perfil (id),
  creada         timestamptz not null default now(),
  actualizada    timestamptz not null default now(),
  comprobada_por uuid references perfil (id),
  comprobada_en  timestamptz,
  client_id      uuid unique                    -- idempotencia de la cola sin conexión
);
create index observacion_recinto on observacion (recinto_id, estado);
create index observacion_revision on observacion (revision_id);
create index observacion_especialidad on observacion (especialidad, estado);
create index observacion_creada on observacion (creada);

create table foto (
  id             uuid primary key default gen_random_uuid(),
  observacion_id uuid not null references observacion (id) on delete cascade,
  path_original  text not null,
  path_ligera    text not null,
  autor          uuid not null references perfil (id),
  creada         timestamptz not null default now(),
  client_id      uuid unique
);
create index foto_observacion on foto (observacion_id);

create table comentario (
  id             uuid primary key default gen_random_uuid(),
  observacion_id uuid not null references observacion (id) on delete cascade,
  autor          uuid not null references perfil (id),
  tipo           text not null default 'nota' check (tipo in ('nota', 'devolucion', 'subsanacion')),
  texto          text not null check (length(trim(texto)) > 0),
  creado         timestamptz not null default now()
);
create index comentario_observacion on comentario (observacion_id, creado);

create table recepcion (
  id            uuid primary key default gen_random_uuid(),
  recinto_id    text not null references recinto (id),
  inspector     uuid not null references perfil (id),
  fecha         timestamptz not null default now(),
  vigente       boolean not null default true,
  invalidada_en timestamptz,
  motivo_fin    text
);
create unique index recepcion_una_vigente on recepcion (recinto_id) where vigente;

create table evento (
  id         bigint generated always as identity primary key,
  actor      uuid references perfil (id),
  fecha      timestamptz not null default now(),
  entidad    text not null,
  entidad_id text,
  recinto_id text references recinto (id),
  accion     text not null,
  antes      jsonb,
  despues    jsonb,
  comentario text
);
create index evento_fecha on evento (fecha desc);
create index evento_recinto on evento (recinto_id, fecha desc);
create index evento_actor on evento (actor, fecha desc);

-- Perfil automático al crear la cuenta. El rol viene de app_metadata (solo lo fija el servidor).
create function crear_perfil_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfil (id, nombre, email, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(coalesce(new.email, 'usuario'), '@', 1)),
    new.email,
    coalesce((new.raw_app_meta_data ->> 'rol')::rol_usuario, 'revisor')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function crear_perfil_usuario();


-- ═══════════ migrations/002_estado.sql ═══════════
-- RSCLL · Estado calculado del recinto (Estructura.md §5)
--
-- Prioridad:
--   1. alguna ficha abierta                          -> en_revision   (azul)
--   2. alguna observación pendiente                  -> pendiente     (ámbar)
--   3. ninguna ficha finalizada                      -> sin_revisar   (gris)
--   4. recepción vigente                             -> recepcionado  (verde oscuro)
--   5. resto                                         -> listo         (verde claro)
-- Las fichas anuladas y sus observaciones no cuentan. El color nunca se guarda: se deriva.

create view recinto_estado with (security_invoker = true) as
select
  r.id                         as recinto_id,
  r.codigo,
  r.nombre,
  coalesce(rv.abiertas, 0)     as abiertas,
  coalesce(rv.finalizadas, 0)  as finalizadas,
  coalesce(ob.pendientes, 0)   as pendientes,
  coalesce(ob.subsanadas, 0)   as subsanadas,
  coalesce(ob.devueltas, 0)    as devueltas,
  rc.fecha                     as recepcion_fecha,
  case
    when coalesce(rv.abiertas, 0) > 0    then 'en_revision'
    when coalesce(ob.pendientes, 0) > 0  then 'pendiente'
    when coalesce(rv.finalizadas, 0) = 0 then 'sin_revisar'
    when rc.id is not null               then 'recepcionado'
    else 'listo'
  end                          as estado
from recinto r
left join lateral (
  select
    count(*) filter (where v.condicion = 'abierta')    as abiertas,
    count(*) filter (where v.condicion = 'finalizada') as finalizadas
  from revision v
  where v.recinto_id = r.id
) rv on true
left join lateral (
  select
    count(*) filter (where o.estado = 'pendiente') as pendientes,
    count(*) filter (where o.estado = 'subsanada') as subsanadas,
    -- pendientes devueltas por Inspección (comentario de devolución u observación de Inspección)
    count(*) filter (
      where o.estado = 'pendiente'
        and (o.origen = 'inspeccion'
             or exists (select 1 from comentario c where c.observacion_id = o.id and c.tipo = 'devolucion'))
    ) as devueltas
  from observacion o
  join revision v on v.id = o.revision_id
  where o.recinto_id = r.id and v.condicion <> 'anulada'
) ob on true
left join lateral (
  select p.id, p.fecha from recepcion p where p.recinto_id = r.id and p.vigente
) rc on true
where r.activo;

-- Perfil del usuario actual si está activo.
create function perfil_actual() returns perfil
language sql stable security definer set search_path = public as $$
  select * from perfil where id = auth.uid() and activo
$$;

create function usuario_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfil where id = auth.uid() and activo)
$$;

create function tiene_rol(variadic roles rol_usuario[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfil where id = auth.uid() and activo and rol = any (roles))
$$;

create function estado_de(p_recinto text) returns text
language sql stable security definer set search_path = public as $$
  select estado from recinto_estado where recinto_id = p_recinto
$$;


-- ═══════════ migrations/003_rls.sql ═══════════
-- RSCLL · Seguridad a nivel de fila (Estructura.md §3, §13)
-- Lectura: usuarios autenticados con cuenta activa. Evento: solo Administrador.
-- No hay políticas de escritura: insert/update/delete solo ocurren dentro de las funciones RPC
-- (security definer), que validan rol y estado antes de modificar.

alter table proyecto        enable row level security;
alter table recinto         enable row level security;
alter table recinto_sector  enable row level security;
alter table figura          enable row level security;
alter table perfil          enable row level security;
alter table revision        enable row level security;
alter table observacion     enable row level security;
alter table foto            enable row level security;
alter table comentario      enable row level security;
alter table recepcion       enable row level security;
alter table evento          enable row level security;

create policy lectura on proyecto       for select to authenticated using (usuario_activo());
create policy lectura on recinto        for select to authenticated using (usuario_activo());
create policy lectura on recinto_sector for select to authenticated using (usuario_activo());
create policy lectura on figura         for select to authenticated using (usuario_activo());
create policy lectura on revision       for select to authenticated using (usuario_activo());
create policy lectura on observacion    for select to authenticated using (usuario_activo());
create policy lectura on foto           for select to authenticated using (usuario_activo());
create policy lectura on comentario     for select to authenticated using (usuario_activo());
create policy lectura on recepcion      for select to authenticated using (usuario_activo());
create policy lectura on evento         for select to authenticated using (tiene_rol('admin'));
-- Cada persona ve su propio perfil; los nombres de otros se exponen a través de las funciones de consulta.
create policy lectura on perfil         for select to authenticated using (id = auth.uid() or tiene_rol('admin'));

revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;


-- ═══════════ migrations/004_rpc.sql ═══════════
-- RSCLL · Acciones (RPC). Cada función valida rol y estado en el servidor y deja un evento (§3, §11).

-- ───────────────────────── auxiliares internas ─────────────────────────

create function _exigir(roles rol_usuario[]) returns perfil
language plpgsql stable security definer set search_path = public as $$
declare
  p perfil;
begin
  select * into p from perfil where id = auth.uid();
  if p.id is null or not p.activo then
    raise exception 'Sesión no válida o cuenta desactivada' using errcode = '42501';
  end if;
  if roles is not null and not (p.rol = any (roles)) then
    raise exception 'Tu rol no permite esta acción' using errcode = '42501';
  end if;
  return p;
end $$;

create function _evento(
  p_actor uuid, p_entidad text, p_entidad_id text, p_recinto text, p_accion text,
  p_antes jsonb, p_despues jsonb, p_comentario text default null
) returns void
language sql security definer set search_path = public as $$
  insert into evento (actor, entidad, entidad_id, recinto_id, accion, antes, despues, comentario)
  values (p_actor, p_entidad, p_entidad_id, p_recinto, p_accion, p_antes, p_despues, p_comentario)
$$;

-- Deja sin vigencia la recepción del recinto, si existe. Devuelve su id.
create function _invalidar_recepcion(p_recinto text, p_actor uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update recepcion
     set vigente = false, invalidada_en = now(), motivo_fin = p_motivo
   where recinto_id = p_recinto and vigente
  returning id into v_id;
  if v_id is not null then
    perform _evento(p_actor, 'recepcion', v_id::text, p_recinto, 'devolucion_recepcion',
      jsonb_build_object('estado_recinto', 'recepcionado'), null, p_motivo);
  end if;
  return v_id;
end $$;

-- Ficha abierta del usuario actual, bloqueada para escritura.
create function _ficha_editable(p_revision uuid, p_yo perfil) returns revision
language plpgsql security definer set search_path = public as $$
declare
  v revision;
begin
  select * into v from revision where id = p_revision for update;
  if v.id is null then
    raise exception 'Ficha de revisión no encontrada';
  end if;
  if v.autor <> p_yo.id then
    raise exception 'Solo el autor puede modificar esta ficha' using errcode = '42501';
  end if;
  if v.condicion <> 'abierta' then
    raise exception 'La ficha ya no está abierta';
  end if;
  return v;
end $$;

create function _estado_json(p_recinto text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('estado_recinto', estado_de(p_recinto))
$$;

-- ───────────────────────── fichas de revisión ─────────────────────────

create function abrir_revision(p_recinto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor']::rol_usuario[]);
  v_id uuid;
  v_antes jsonb;
begin
  if not exists (select 1 from recinto where id = p_recinto and activo) then
    raise exception 'Recinto no encontrado';
  end if;
  select id into v_id from revision
   where recinto_id = p_recinto and autor = yo.id and condicion = 'abierta';
  if v_id is not null then
    return v_id;
  end if;
  v_antes := _estado_json(p_recinto);
  begin
    insert into revision (recinto_id, autor) values (p_recinto, yo.id) returning id into v_id;
  exception when unique_violation then
    select id into v_id from revision
     where recinto_id = p_recinto and autor = yo.id and condicion = 'abierta';
    return v_id;
  end;
  perform _evento(yo.id, 'revision', v_id::text, p_recinto, 'inicio_revision', v_antes, _estado_json(p_recinto));
  return v_id;
end $$;

create function finalizar_revision(p_revision uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
  v revision := _ficha_editable(p_revision, yo);
  v_antes jsonb := _estado_json(v.recinto_id);
  v_total int;
begin
  update revision set condicion = 'finalizada', fin = now() where id = v.id;
  select count(*) into v_total from observacion where revision_id = v.id;
  perform _evento(yo.id, 'revision', v.id::text, v.recinto_id, 'fin_revision',
    v_antes, _estado_json(v.recinto_id) || jsonb_build_object('observaciones', v_total));
end $$;

-- ───────────────────────── observaciones ─────────────────────────

create function agregar_observacion(
  p_revision uuid, p_especialidad especialidad, p_descripcion text, p_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor']::rol_usuario[]);
  v revision;
  v_id uuid;
begin
  if p_client_id is not null then
    select id into v_id from observacion where client_id = p_client_id;
    if v_id is not null then
      return v_id;       -- reenvío desde la cola sin conexión
    end if;
  end if;
  v := _ficha_editable(p_revision, yo);
  insert into observacion (revision_id, recinto_id, especialidad, descripcion, autor, client_id)
  values (v.id, v.recinto_id, p_especialidad, trim(p_descripcion), yo.id, p_client_id)
  returning id into v_id;
  perform _invalidar_recepcion(v.recinto_id, yo.id, 'Nueva observación registrada');
  perform _evento(yo.id, 'observacion', v_id::text, v.recinto_id, 'alta_observacion', null,
    jsonb_build_object('especialidad', p_especialidad, 'descripcion', trim(p_descripcion), 'estado', 'pendiente'));
  return v_id;
end $$;

create function editar_observacion(p_observacion uuid, p_especialidad especialidad, p_descripcion text) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor']::rol_usuario[]);
  o observacion;
begin
  select * into o from observacion where id = p_observacion for update;
  if o.id is null then
    raise exception 'Observación no encontrada';
  end if;
  perform _ficha_editable(o.revision_id, yo);
  update observacion
     set especialidad = p_especialidad, descripcion = trim(p_descripcion), actualizada = now()
   where id = o.id;
  perform _evento(yo.id, 'observacion', o.id::text, o.recinto_id, 'edicion_observacion',
    jsonb_build_object('especialidad', o.especialidad, 'descripcion', o.descripcion),
    jsonb_build_object('especialidad', p_especialidad, 'descripcion', trim(p_descripcion)));
end $$;

create function eliminar_observacion(p_observacion uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor']::rol_usuario[]);
  o observacion;
begin
  select * into o from observacion where id = p_observacion for update;
  if o.id is null then
    raise exception 'Observación no encontrada';
  end if;
  perform _ficha_editable(o.revision_id, yo);
  delete from observacion where id = o.id;
  perform _evento(yo.id, 'observacion', o.id::text, o.recinto_id, 'eliminacion_observacion',
    jsonb_build_object('especialidad', o.especialidad, 'descripcion', o.descripcion, 'numero', o.numero), null);
end $$;

create function agregar_foto(
  p_observacion uuid, p_path_original text, p_path_ligera text, p_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
  o observacion;
  v_cond condicion_revision;
  v_id uuid;
begin
  if p_client_id is not null then
    select id into v_id from foto where client_id = p_client_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  select * into o from observacion where id = p_observacion;
  if o.id is null then
    raise exception 'Observación no encontrada';
  end if;
  select condicion into v_cond from revision where id = o.revision_id;
  -- El autor adjunta fotos a su observación; puede llegar después del cierre si estaba en la cola.
  if o.autor <> yo.id or v_cond = 'anulada' then
    raise exception 'Solo el autor de la observación puede adjuntar fotos' using errcode = '42501';
  end if;
  insert into foto (observacion_id, path_original, path_ligera, autor, client_id)
  values (o.id, p_path_original, p_path_ligera, yo.id, p_client_id)
  returning id into v_id;
  perform _evento(yo.id, 'foto', v_id::text, o.recinto_id, 'alta_foto', null,
    jsonb_build_object('observacion', o.numero));
  return v_id;
end $$;

create function eliminar_foto(p_foto uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
  f foto;
  o observacion;
begin
  select * into f from foto where id = p_foto;
  if f.id is null then
    raise exception 'Foto no encontrada';
  end if;
  select * into o from observacion where id = f.observacion_id;
  perform _ficha_editable(o.revision_id, yo);
  delete from foto where id = f.id;
  perform _evento(yo.id, 'foto', f.id::text, o.recinto_id, 'eliminacion_foto',
    jsonb_build_object('observacion', o.numero, 'path', f.path_original), null);
end $$;

-- Comprobación en terreno por Revisor, Inspección o Administrador (§7.4).
create function marcar_subsanada(p_observacion uuid, p_comentario text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
  o observacion;
  v_cond condicion_revision;
  v_antes jsonb;
begin
  select * into o from observacion where id = p_observacion for update;
  if o.id is null then
    raise exception 'Observación no encontrada';
  end if;
  select condicion into v_cond from revision where id = o.revision_id;
  if v_cond <> 'finalizada' then
    raise exception 'Solo se comprueban observaciones de fichas finalizadas';
  end if;
  if o.estado = 'subsanada' then
    return;
  end if;
  v_antes := _estado_json(o.recinto_id) || jsonb_build_object('estado', o.estado);
  update observacion
     set estado = 'subsanada', comprobada_por = yo.id, comprobada_en = now(), actualizada = now()
   where id = o.id;
  if nullif(trim(p_comentario), '') is not null then
    insert into comentario (observacion_id, autor, tipo, texto) values (o.id, yo.id, 'subsanacion', trim(p_comentario));
  end if;
  perform _evento(yo.id, 'observacion', o.id::text, o.recinto_id, 'subsanacion', v_antes,
    _estado_json(o.recinto_id) || jsonb_build_object('estado', 'subsanada'), nullif(trim(p_comentario), ''));
end $$;

-- Inspección comenta y mantiene o devuelve a pendiente una observación existente (§8).
create function mantener_pendiente(p_observacion uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['inspeccion', 'admin']::rol_usuario[]);
  o observacion;
  v_cond condicion_revision;
  v_antes jsonb;
begin
  if nullif(trim(p_texto), '') is null then
    raise exception 'El comentario es obligatorio';
  end if;
  select * into o from observacion where id = p_observacion for update;
  if o.id is null then
    raise exception 'Observación no encontrada';
  end if;
  select condicion into v_cond from revision where id = o.revision_id;
  if v_cond <> 'finalizada' then
    raise exception 'Solo se devuelven observaciones de fichas finalizadas';
  end if;
  v_antes := _estado_json(o.recinto_id) || jsonb_build_object('estado', o.estado);
  insert into comentario (observacion_id, autor, tipo, texto) values (o.id, yo.id, 'devolucion', trim(p_texto));
  update observacion set estado = 'pendiente', actualizada = now() where id = o.id;
  perform _invalidar_recepcion(o.recinto_id, yo.id, 'Observación devuelta a pendiente por Inspección');
  perform _evento(yo.id, 'observacion', o.id::text, o.recinto_id, 'devolucion', v_antes,
    _estado_json(o.recinto_id) || jsonb_build_object('estado', 'pendiente'), trim(p_texto));
end $$;

-- Defecto sin observación previa detectado por Inspección (§16.1, resuelto):
-- crea una ficha de Inspección ya finalizada con una observación pendiente clasificada por especialidad.
create function observacion_inspeccion(
  p_recinto text, p_especialidad especialidad, p_descripcion text, p_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['inspeccion']::rol_usuario[]);
  v_estado text := estado_de(p_recinto);
  v_rev uuid;
  v_id uuid;
begin
  if p_client_id is not null then
    select id into v_id from observacion where client_id = p_client_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  if v_estado not in ('listo', 'recepcionado') then
    raise exception 'Solo se registra en recintos listos para Inspección o recepcionados';
  end if;
  insert into revision (recinto_id, autor, origen, condicion, fin)
  values (p_recinto, yo.id, 'inspeccion', 'finalizada', now())
  returning id into v_rev;
  insert into observacion (revision_id, recinto_id, especialidad, descripcion, origen, autor, client_id)
  values (v_rev, p_recinto, p_especialidad, trim(p_descripcion), 'inspeccion', yo.id, p_client_id)
  returning id into v_id;
  perform _invalidar_recepcion(p_recinto, yo.id, 'Observación de Inspección');
  perform _evento(yo.id, 'observacion', v_id::text, p_recinto, 'observacion_inspeccion',
    jsonb_build_object('estado_recinto', v_estado),
    _estado_json(p_recinto) || jsonb_build_object('especialidad', p_especialidad, 'descripcion', trim(p_descripcion)));
  return v_id;
end $$;

-- ───────────────────────── recepción ─────────────────────────

create function recepcionar(p_recinto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['inspeccion']::rol_usuario[]);
  v_id uuid;
begin
  perform 1 from recinto where id = p_recinto for update;
  if estado_de(p_recinto) <> 'listo' then
    raise exception 'Solo se recepciona un recinto listo para Inspección (verde claro)';
  end if;
  insert into recepcion (recinto_id, inspector) values (p_recinto, yo.id) returning id into v_id;
  perform _evento(yo.id, 'recepcion', v_id::text, p_recinto, 'recepcion',
    jsonb_build_object('estado_recinto', 'listo'), _estado_json(p_recinto));
  return v_id;
end $$;

-- ───────────────────────── administración ─────────────────────────

create function reabrir_revision(p_revision uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin']::rol_usuario[]);
  v revision;
  v_antes jsonb;
begin
  select * into v from revision where id = p_revision for update;
  if v.id is null or v.condicion <> 'finalizada' then
    raise exception 'Solo se reabre una ficha finalizada';
  end if;
  if v.origen <> 'ordinaria' then
    raise exception 'Las fichas de Inspección no se reabren; anúlela si fue un error';
  end if;
  if exists (select 1 from revision where recinto_id = v.recinto_id and autor = v.autor and condicion = 'abierta') then
    raise exception 'El autor ya tiene otra ficha abierta en este recinto';
  end if;
  v_antes := _estado_json(v.recinto_id);
  update revision set condicion = 'abierta', fin = null where id = v.id;
  perform _evento(yo.id, 'revision', v.id::text, v.recinto_id, 'reapertura', v_antes, _estado_json(v.recinto_id));
end $$;

create function anular_revision(p_revision uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin']::rol_usuario[]);
  v revision;
  v_antes jsonb;
  v_rec uuid;
begin
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Indique el motivo de la anulación';
  end if;
  select * into v from revision where id = p_revision for update;
  if v.id is null or v.condicion = 'anulada' then
    raise exception 'La ficha no existe o ya está anulada';
  end if;
  v_antes := _estado_json(v.recinto_id);
  update revision
     set condicion_previa = condicion, condicion = 'anulada',
         anulada_por = yo.id, anulada_en = now(), motivo_anulacion = trim(p_motivo)
   where id = v.id;
  -- Sin fichas finalizadas vigentes, una recepción anterior deja de sostenerse.
  if not exists (select 1 from revision where recinto_id = v.recinto_id and condicion = 'finalizada') then
    v_rec := _invalidar_recepcion(v.recinto_id, yo.id, 'Anulación de ficha');
    update revision set recepcion_invalidada = v_rec where id = v.id;
  end if;
  perform _evento(yo.id, 'revision', v.id::text, v.recinto_id, 'anulacion',
    v_antes || jsonb_build_object('condicion', v.condicion),
    _estado_json(v.recinto_id) || jsonb_build_object('condicion', 'anulada'), trim(p_motivo));
end $$;

create function revertir_anulacion(p_revision uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin']::rol_usuario[]);
  v revision;
  v_antes jsonb;
  v_pend int;
begin
  select * into v from revision where id = p_revision for update;
  if v.id is null or v.condicion <> 'anulada' then
    raise exception 'La ficha no está anulada';
  end if;
  if v.condicion_previa = 'abierta' and exists (
    select 1 from revision where recinto_id = v.recinto_id and autor = v.autor and condicion = 'abierta'
  ) then
    raise exception 'El autor ya tiene otra ficha abierta en este recinto';
  end if;
  v_antes := _estado_json(v.recinto_id);
  update revision
     set condicion = coalesce(condicion_previa, 'finalizada'), condicion_previa = null,
         anulada_por = null, anulada_en = null, motivo_anulacion = null, recepcion_invalidada = null
   where id = v.id;
  select count(*) into v_pend from observacion where revision_id = v.id and estado = 'pendiente';
  if v_pend > 0 then
    perform _invalidar_recepcion(v.recinto_id, yo.id, 'Reversión de anulación con pendientes');
  elsif v.recepcion_invalidada is not null
        and not exists (select 1 from recepcion where recinto_id = v.recinto_id and vigente)
        and estado_de(v.recinto_id) = 'listo' then
    update recepcion set vigente = true, invalidada_en = null, motivo_fin = null where id = v.recepcion_invalidada;
    perform _evento(yo.id, 'recepcion', v.recepcion_invalidada::text, v.recinto_id, 'restitucion_recepcion',
      jsonb_build_object('estado_recinto', 'listo'), jsonb_build_object('estado_recinto', 'recepcionado'));
  end if;
  perform _evento(yo.id, 'revision', v.id::text, v.recinto_id, 'reversion_anulacion',
    v_antes || jsonb_build_object('condicion', 'anulada'),
    _estado_json(v.recinto_id) || jsonb_build_object('condicion', coalesce(v.condicion_previa, 'finalizada')));
end $$;

create function admin_actualizar_perfil(p_usuario uuid, p_nombre text, p_rol rol_usuario, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin']::rol_usuario[]);
  p perfil;
begin
  select * into p from perfil where id = p_usuario for update;
  if p.id is null then
    raise exception 'Usuario no encontrado';
  end if;
  if p.id = yo.id and (p_rol <> 'admin' or not p_activo) then
    raise exception 'No puede quitarse a sí mismo el rol de Administrador ni desactivar su cuenta';
  end if;
  update perfil set nombre = trim(p_nombre), rol = p_rol, activo = p_activo where id = p.id;
  perform _evento(yo.id, 'perfil', p.id::text, null, 'perfil',
    jsonb_build_object('nombre', p.nombre, 'rol', p.rol, 'activo', p.activo),
    jsonb_build_object('nombre', trim(p_nombre), 'rol', p_rol, 'activo', p_activo));
end $$;


-- ═══════════ migrations/005_consultas.sql ═══════════
-- RSCLL · Consultas para la interfaz. Todas devuelven jsonb para que el cliente Supabase
-- y el modo demostración (PGlite) las llamen del mismo modo.

create view observacion_detalle with (security_invoker = true) as
select
  o.id,
  o.numero,
  o.revision_id,
  v.condicion                         as revision_condicion,
  v.origen                            as revision_origen,
  o.recinto_id,
  r.codigo,
  r.nombre                            as recinto_nombre,
  r.orden                             as recinto_orden,
  (select array_agg(s.sector order by s.sector) from recinto_sector s where s.recinto_id = r.id) as sectores,
  o.especialidad,
  o.descripcion,
  o.estado,
  o.origen,
  o.autor                             as autor_id,
  pa.nombre                           as autor,
  o.creada,
  o.actualizada,
  o.comprobada_en,
  pc.nombre                           as comprobador,
  ci.texto                            as comentario_inspeccion,
  ci.creado                           as comentario_inspeccion_fecha,
  ci.autor_nombre                     as comentario_inspeccion_autor,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'original', f.path_original, 'ligera', f.path_ligera) order by f.creada)
    from foto f where f.observacion_id = o.id
  ), '[]'::jsonb)                     as fotos,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'texto', c.texto, 'creado', c.creado,
                                        'autor', pp.nombre, 'rol', pp.rol) order by c.creado)
    from comentario c join perfil pp on pp.id = c.autor where c.observacion_id = o.id
  ), '[]'::jsonb)                     as comentarios
from observacion o
join revision v on v.id = o.revision_id
join recinto r on r.id = o.recinto_id
join perfil pa on pa.id = o.autor
left join perfil pc on pc.id = o.comprobada_por
left join lateral (
  select c.texto, c.creado, p.nombre as autor_nombre
  from comentario c join perfil p on p.id = c.autor
  where c.observacion_id = o.id and c.tipo = 'devolucion'
  order by c.creado desc limit 1
) ci on true;

-- ───────────────────────── catálogo y estados ─────────────────────────

create function mi_perfil() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
begin
  return to_jsonb(yo);
end $$;

create function catalogo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(null);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'codigo', r.codigo, 'nombre', r.nombre, 'tipo', r.tipo, 'orden', r.orden,
      'sectores', (select coalesce(jsonb_agg(jsonb_build_object('sector', s.sector, 'superficie', s.superficie) order by s.sector), '[]')
                   from recinto_sector s where s.recinto_id = r.id),
      'figuras', (select coalesce(jsonb_agg(jsonb_build_object('plano', f.plano, 'elementId', f.element_id)), '[]')
                  from figura f where f.recinto_id = r.id)
    ) order by r.orden)
    from recinto r where r.activo
  ), '[]'::jsonb);
end $$;

create function estados() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(null);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'recinto_id', e.recinto_id, 'estado', e.estado, 'abiertas', e.abiertas, 'finalizadas', e.finalizadas,
      'pendientes', e.pendientes, 'subsanadas', e.subsanadas, 'devueltas', e.devueltas,
      'recepcion_fecha', e.recepcion_fecha,
      'mis_abiertas', (select coalesce(jsonb_agg(v.id), '[]') from revision v
                       where v.recinto_id = e.recinto_id and v.condicion = 'abierta' and v.autor = auth.uid())
    ))
    from recinto_estado e
  ), '[]'::jsonb);
end $$;

create function mis_revisiones() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'recinto_id', v.recinto_id, 'codigo', r.codigo, 'nombre', r.nombre, 'inicio', v.inicio,
      'observaciones', (select count(*) from observacion o where o.revision_id = v.id)
    ) order by v.inicio desc)
    from revision v join recinto r on r.id = v.recinto_id
    where v.autor = yo.id and v.condicion = 'abierta'
  ), '[]'::jsonb);
end $$;

-- ───────────────────────── fichas ─────────────────────────

create function _revision_json(v revision) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', v.id, 'recinto_id', v.recinto_id, 'autor_id', v.autor,
    'autor', (select nombre from perfil where id = v.autor),
    'origen', v.origen, 'condicion', v.condicion, 'inicio', v.inicio, 'fin', v.fin,
    'motivo_anulacion', v.motivo_anulacion, 'anulada_en', v.anulada_en,
    'observaciones', (select count(*) from observacion o where o.revision_id = v.id),
    'pendientes', (select count(*) from observacion o where o.revision_id = v.id and o.estado = 'pendiente')
  )
$$;

create function ficha_recinto(p_recinto text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
begin
  if not exists (select 1 from recinto where id = p_recinto) then
    raise exception 'Recinto no encontrado';
  end if;
  return jsonb_build_object(
    'estado', (select to_jsonb(e) from recinto_estado e where e.recinto_id = p_recinto),
    'recepcion', (select jsonb_build_object('fecha', p.fecha, 'inspector', pp.nombre)
                  from recepcion p join perfil pp on pp.id = p.inspector
                  where p.recinto_id = p_recinto and p.vigente),
    'revisiones', coalesce((
      select jsonb_agg(_revision_json(v) order by v.inicio desc)
      from revision v
      where v.recinto_id = p_recinto and (v.condicion <> 'anulada' or yo.rol = 'admin')
    ), '[]'::jsonb),
    'observaciones', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.estado, d.numero)
      from observacion_detalle d
      where d.recinto_id = p_recinto and d.revision_condicion <> 'anulada'
    ), '[]'::jsonb),
    'movimientos', coalesce((
      select jsonb_agg(m order by (m ->> 'fecha') desc)
      from (
        select jsonb_build_object('fecha', ev.fecha, 'accion', ev.accion, 'actor', pp.nombre, 'comentario', ev.comentario) as m
        from evento ev left join perfil pp on pp.id = ev.actor
        where ev.recinto_id = p_recinto and ev.accion not in ('alta_foto', 'eliminacion_foto')
        order by ev.fecha desc limit 40
      ) x
    ), '[]'::jsonb)
  );
end $$;

create function ficha_revision(p_revision uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
  v revision;
begin
  select * into v from revision where id = p_revision;
  if v.id is null or (v.condicion = 'anulada' and yo.rol <> 'admin' and v.autor <> yo.id) then
    raise exception 'Ficha de revisión no encontrada';
  end if;
  return jsonb_build_object(
    'revision', _revision_json(v),
    'estado', (select to_jsonb(e) from recinto_estado e where e.recinto_id = v.recinto_id),
    'observaciones', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.numero)
      from observacion_detalle d where d.revision_id = v.id
    ), '[]'::jsonb)
  );
end $$;

-- ───────────────────────── búsqueda (Informes y Base) ─────────────────────────
-- p_filtros: { sector, recinto, especialidad, estado, desde, hasta, autor, texto }  (ausente = Todos)
-- p_orden:   'recinto' | 'numero' | 'fecha' | 'especialidad' | 'estado' | 'autor'; prefijo '-' = descendente
create function buscar_observaciones(
  p_filtros jsonb default '{}', p_limite int default null, p_desplazamiento int default 0, p_orden text default 'recinto'
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f_sector text := nullif(p_filtros ->> 'sector', '');
  f_recinto text := nullif(p_filtros ->> 'recinto', '');
  f_esp text := nullif(p_filtros ->> 'especialidad', '');
  f_estado text := nullif(p_filtros ->> 'estado', '');
  f_desde date := nullif(p_filtros ->> 'desde', '')::date;
  f_hasta date := nullif(p_filtros ->> 'hasta', '')::date;
  f_autor uuid := nullif(p_filtros ->> 'autor', '')::uuid;
  f_texto text := nullif(trim(p_filtros ->> 'texto'), '');
  v_desc boolean := left(coalesce(p_orden, ''), 1) = '-';
  v_campo text := ltrim(coalesce(p_orden, 'recinto'), '-');
  v_desde int := coalesce(p_desplazamiento, 0);
begin
  perform _exigir(null);
  return (
    with f as (
      select d.* from observacion_detalle d
      where d.revision_condicion <> 'anulada'
        and (f_sector is null or f_sector = any (d.sectores))
        and (f_recinto is null or d.recinto_id = f_recinto)
        and (f_esp is null or d.especialidad::text = f_esp)
        and (f_estado is null or d.estado::text = f_estado)
        and (f_desde is null or (d.creada at time zone 'America/Santiago')::date >= f_desde)
        and (f_hasta is null or (d.creada at time zone 'America/Santiago')::date <= f_hasta)
        and (f_autor is null or d.autor_id = f_autor)
        and (f_texto is null or d.codigo ilike '%' || f_texto || '%' or d.recinto_nombre ilike '%' || f_texto || '%'
             or d.descripcion ilike '%' || f_texto || '%' or d.numero::text = f_texto)
    ),
    o as (
      select to_jsonb(d) as j, row_number() over (order by
        case when not v_desc and v_campo = 'recinto' then d.recinto_orden end,
        case when v_desc and v_campo = 'recinto' then d.recinto_orden end desc,
        case when not v_desc and v_campo = 'especialidad' then d.especialidad end,
        case when v_desc and v_campo = 'especialidad' then d.especialidad end desc,
        case when not v_desc and v_campo = 'estado' then d.estado end,
        case when v_desc and v_campo = 'estado' then d.estado end desc,
        case when not v_desc and v_campo = 'autor' then d.autor end,
        case when v_desc and v_campo = 'autor' then d.autor end desc,
        case when not v_desc and v_campo = 'fecha' then d.creada end,
        case when v_desc and v_campo = 'fecha' then d.creada end desc,
        case when v_desc and v_campo = 'numero' then d.numero end desc,
        d.recinto_orden, d.especialidad, d.numero
      ) as rn
      from f d
    )
    select jsonb_build_object(
      'total', (select count(*) from f),
      'filas', coalesce((
        select jsonb_agg(o.j order by o.rn) from o
        where o.rn > v_desde and (p_limite is null or o.rn <= v_desde + p_limite)
      ), '[]'::jsonb)
    )
  );
end $$;

-- Nombres de usuarios para filtros por autor.
create function usuarios_nombres() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(null);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'rol', rol) order by nombre) from perfil), '[]'::jsonb);
end $$;

-- ───────────────────────── Administrador ─────────────────────────

create function usuarios() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(array['admin']::rol_usuario[]);
  return coalesce((select jsonb_agg(to_jsonb(p) order by p.activo desc, p.nombre) from perfil p), '[]'::jsonb);
end $$;

-- p_filtros: { actor, recinto, accion, desde, hasta }
create function historial(p_filtros jsonb default '{}', p_limite int default 100, p_desplazamiento int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f_actor uuid := nullif(p_filtros ->> 'actor', '')::uuid;
  f_recinto text := nullif(p_filtros ->> 'recinto', '');
  f_accion text := nullif(p_filtros ->> 'accion', '');
  f_desde date := nullif(p_filtros ->> 'desde', '')::date;
  f_hasta date := nullif(p_filtros ->> 'hasta', '')::date;
begin
  perform _exigir(array['admin']::rol_usuario[]);
  return (
    with f as (
      select ev.*, pp.nombre as actor_nombre, r.codigo, r.nombre as recinto_nombre
      from evento ev
      left join perfil pp on pp.id = ev.actor
      left join recinto r on r.id = ev.recinto_id
      where (f_actor is null or ev.actor = f_actor)
        and (f_recinto is null or ev.recinto_id = f_recinto)
        and (f_accion is null or ev.accion = f_accion)
        and (f_desde is null or (ev.fecha at time zone 'America/Santiago')::date >= f_desde)
        and (f_hasta is null or (ev.fecha at time zone 'America/Santiago')::date <= f_hasta)
    )
    select jsonb_build_object(
      'total', (select count(*) from f),
      'filas', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.fecha desc, x.id desc)
        from (select * from f order by fecha desc, id desc limit p_limite offset p_desplazamiento) x
      ), '[]'::jsonb)
    )
  );
end $$;

-- Respaldo completo de datos del proyecto (§13). Las fotos se respaldan aparte desde Storage.
create function exportar_datos() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(array['admin']::rol_usuario[]);
  return jsonb_build_object(
    'generado', now(),
    'proyecto', (select jsonb_agg(to_jsonb(t)) from proyecto t),
    'recinto', (select jsonb_agg(to_jsonb(t)) from recinto t),
    'recinto_sector', (select jsonb_agg(to_jsonb(t)) from recinto_sector t),
    'figura', (select jsonb_agg(to_jsonb(t)) from figura t),
    'perfil', (select jsonb_agg(to_jsonb(t)) from perfil t),
    'revision', (select jsonb_agg(to_jsonb(t)) from revision t),
    'observacion', (select jsonb_agg(to_jsonb(t)) from observacion t),
    'foto', (select jsonb_agg(to_jsonb(t)) from foto t),
    'comentario', (select jsonb_agg(to_jsonb(t)) from comentario t),
    'recepcion', (select jsonb_agg(to_jsonb(t)) from recepcion t),
    'evento', (select jsonb_agg(to_jsonb(t)) from evento t)
  );
end $$;

-- ───────────────────────── permisos de ejecución ─────────────────────────

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function
  _exigir(rol_usuario[]), _evento(uuid, text, text, text, text, jsonb, jsonb, text),
  _invalidar_recepcion(text, uuid, text), _ficha_editable(uuid, perfil), _estado_json(text),
  _revision_json(revision), crear_perfil_usuario()
from authenticated;


-- ═══════════ migrations/006_storage_realtime.sql ═══════════
-- RSCLL · Recursos propios de Supabase (no se aplican en el modo demostración).

-- Fotos: original para respaldo y versión ligera para listas y PDF (§13). Buckets privados.
insert into storage.buckets (id, name, public)
values ('fotos-original', 'fotos-original', false), ('fotos-ligera', 'fotos-ligera', false)
on conflict (id) do nothing;

create policy "rscll fotos lectura" on storage.objects for select to authenticated
  using (bucket_id in ('fotos-original', 'fotos-ligera') and public.usuario_activo());

create policy "rscll fotos subida" on storage.objects for insert to authenticated
  with check (bucket_id in ('fotos-original', 'fotos-ligera') and public.usuario_activo());

-- Cambios en vivo: los teléfonos actualizan planta y fichas al recibir cambios de otros usuarios.
alter publication supabase_realtime add table revision, observacion, recepcion, comentario, foto;


-- ═══════════ seed.sql ═══════════
-- Generado por scripts/generar_seed.mjs desde data/catalog.json. No editar a mano.
insert into proyecto (id, codigo, nombre) values ('RSCLL', 'RSCLL', 'Reposición SubComisaría Llay Llay')
on conflict (id) do nothing;

insert into recinto (id, proyecto_id, codigo, nombre, tipo, orden) values
('RSCLL:1A', 'RSCLL', '1A', 'Circulación', 'Circulación', 1),
('RSCLL:2A', 'RSCLL', '2A', 'Circulación', 'Circulación', 2),
('RSCLL:3A', 'RSCLL', '3A', 'Circulación', 'Circulación', 3),
('RSCLL:A-01', 'RSCLL', 'A-01', 'Hall Acceso', 'Recinto', 4),
('RSCLL:A-02', 'RSCLL', 'A-02', 'Espera, Módulos, Atención y Área Infantil', 'Recinto', 5),
('RSCLL:A-03', 'RSCLL', 'A-03', 'Baño Público Acc. Universal 1', 'Recinto', 6),
('RSCLL:A-04', 'RSCLL', 'A-04', 'Baño Público Acc. Universal 2', 'Recinto', 7),
('RSCLL:A-05', 'RSCLL', 'A-05', 'Of. Empadronamiento Judiciales y Órdenes', 'Recinto', 8),
('RSCLL:A-06', 'RSCLL', 'A-06', 'Suboficial Guardia', 'Recinto', 9),
('RSCLL:A-07', 'RSCLL', 'A-07', 'Sala Custodia Temporal', 'Recinto', 10),
('RSCLL:A-08', 'RSCLL', 'A-08', 'Sala Rack', 'Recinto', 11),
('RSCLL:A-09', 'RSCLL', 'A-09', 'Of. Integración Comunitaria', 'Recinto', 12),
('RSCLL:A-10', 'RSCLL', 'A-10', 'Baño Func. 01', 'Recinto', 13),
('RSCLL:A-11', 'RSCLL', 'A-11', 'Baño Func. 02', 'Recinto', 14),
('RSCLL:A-12', 'RSCLL', 'A-12', 'Kitchenette', 'Recinto', 15),
('RSCLL:A-13', 'RSCLL', 'A-13', 'Of. Partes', 'Recinto', 16),
('RSCLL:A-14', 'RSCLL', 'A-14', 'Archivo 01', 'Recinto', 17),
('RSCLL:A-15', 'RSCLL', 'A-15', 'Of. Subcomisario (incluye baño y mesa de trabajo)', 'Recinto', 18),
('RSCLL:A-16', 'RSCLL', 'A-16', 'Sala Familia', 'Recinto', 19),
('RSCLL:A-17', 'RSCLL', 'A-17', 'Baño Func. 3', 'Recinto', 20),
('RSCLL:A-18', 'RSCLL', 'A-18', 'Baño Func. 4', 'Recinto', 21),
('RSCLL:A-19', 'RSCLL', 'A-19', 'Archivo 02', 'Recinto', 22),
('RSCLL:A-20', 'RSCLL', 'A-20', 'Sala de Armas', 'Recinto', 23),
('RSCLL:A-21', 'RSCLL', 'A-21', 'Of. Suboficial Interno', 'Recinto', 24),
('RSCLL:A-22', 'RSCLL', 'A-22', 'Bodega Interno', 'Recinto', 25),
('RSCLL:A-23', 'RSCLL', 'A-23', 'Sala Preparación del Turno', 'Recinto', 26),
('RSCLL:A-24', 'RSCLL', 'A-24', 'Custodia Permanente', 'Recinto', 27),
('RSCLL:A-25', 'RSCLL', 'A-25', 'Módulo Carga y Descarga Armamento', 'Recinto', 28),
('RSCLL:A-26', 'RSCLL', 'A-26', 'Acopio', 'Recinto', 29),
('RSCLL:A-27', 'RSCLL', 'A-27', 'Guardia Calabozos', 'Recinto', 30),
('RSCLL:A-29', 'RSCLL', 'A-29', 'Reconocimiento Victimario', 'Recinto', 31),
('RSCLL:A-30', 'RSCLL', 'A-30', 'Calabozo 1', 'Recinto', 32),
('RSCLL:A-31', 'RSCLL', 'A-31', 'Calabozo 2', 'Recinto', 33),
('RSCLL:A-32', 'RSCLL', 'A-32', 'Calabozo 3', 'Recinto', 34),
('RSCLL:A-33', 'RSCLL', 'A-33', 'Baños Calabozos', 'Recinto', 35),
('RSCLL:A-34', 'RSCLL', 'A-34', 'Sala Calderas', 'Recinto técnico', 36),
('RSCLL:A-35', 'RSCLL', 'A-35', 'Sala de Basuras', 'Recinto técnico', 37),
('RSCLL:A-36', 'RSCLL', 'A-36', 'Sala Generador', 'Recinto técnico', 38),
('RSCLL:A-37', 'RSCLL', 'A-37', 'Sala Tableros y Pad Mounted', 'Recinto técnico', 39),
('RSCLL:A-38', 'RSCLL', 'A-38', 'Patio Formación Cubierto', 'Área cubierta', 40),
('RSCLL:A-39', 'RSCLL', 'A-39', 'Bodega Bajo Escalera', 'Recinto', 41),
('RSCLL:A-40', 'RSCLL', 'A-40', 'Tablero Eléctrico', 'Elemento técnico', 42),
('RSCLL:E1', 'RSCLL', 'E1', 'Escalera 01', 'Escalera', 43),
('RSCLL:E2', 'RSCLL', 'E2', 'Escalera 02', 'Escalera', 44),
('RSCLL:1B', 'RSCLL', '1B', 'Circulación', 'Circulación', 45),
('RSCLL:2B', 'RSCLL', '2B', 'Circulación', 'Circulación', 46),
('RSCLL:B-01', 'RSCLL', 'B-01', 'Sala de Reuniones', 'Recinto', 47),
('RSCLL:B-02', 'RSCLL', 'B-02', 'Oficina Operaciones', 'Recinto', 48),
('RSCLL:B-03', 'RSCLL', 'B-03', 'Sala de Monitoreo', 'Recinto', 49),
('RSCLL:B-04', 'RSCLL', 'B-04', 'Archivo', 'Recinto', 50),
('RSCLL:B-05', 'RSCLL', 'B-05', 'Oficina PNI', 'Recinto', 51),
('RSCLL:B-06', 'RSCLL', 'B-06', 'Sala Eléctrica', 'Recinto técnico', 52),
('RSCLL:B-07', 'RSCLL', 'B-07', 'Baño Pers. 05', 'Recinto', 53),
('RSCLL:B-08', 'RSCLL', 'B-08', 'Baño Pers. 06', 'Recinto', 54),
('RSCLL:B-08A', 'RSCLL', 'B-08A', 'Hall Habitabilidad Fem.', 'Circulación', 55),
('RSCLL:B-09', 'RSCLL', 'B-09', 'Dorm. PNI Solteras', 'Recinto', 56),
('RSCLL:B-10', 'RSCLL', 'B-10', 'Baño Dorm. PNI Solteras', 'Recinto', 57),
('RSCLL:B-11', 'RSCLL', 'B-11', 'Roperillos PNI Casadas', 'Recinto', 58),
('RSCLL:B-12', 'RSCLL', 'B-12', 'Baño PNI Casadas', 'Recinto', 59),
('RSCLL:B-13', 'RSCLL', 'B-13', 'Casino', 'Recinto', 60),
('RSCLL:B-14', 'RSCLL', 'B-14', 'Cocina', 'Recinto', 61),
('RSCLL:B-15', 'RSCLL', 'B-15', 'Bodega Insumos', 'Recinto', 62),
('RSCLL:B-16', 'RSCLL', 'B-16', 'Bodega Materiales', 'Recinto', 63),
('RSCLL:B-17', 'RSCLL', 'B-17', 'Área Sucia', 'Recinto', 64),
('RSCLL:B-18', 'RSCLL', 'B-18', 'Área Acopio', 'Recinto', 65),
('RSCLL:B-19', 'RSCLL', 'B-19', 'Hall Baño Pers. Casino', 'Circulación', 66),
('RSCLL:B-20', 'RSCLL', 'B-20', 'Baño Pers. Casino Fem.', 'Recinto', 67),
('RSCLL:B-21', 'RSCLL', 'B-21', 'Baño Pers. Casino Masc.', 'Recinto', 68),
('RSCLL:B-22', 'RSCLL', 'B-22', 'Lavandería', 'Recinto', 69),
('RSCLL:B-23', 'RSCLL', 'B-23', 'Roperillo PNI Masc.', 'Recinto', 70),
('RSCLL:B-24', 'RSCLL', 'B-24', 'Baño PNS Masc.', 'Recinto', 71),
('RSCLL:B-25', 'RSCLL', 'B-25', 'Roperillo PNI Casados', 'Recinto', 72),
('RSCLL:B-26', 'RSCLL', 'B-26', 'Baños PNI Casados', 'Recinto', 73),
('RSCLL:B-27', 'RSCLL', 'B-27', 'Duchas PNI Casados', 'Recinto', 74),
('RSCLL:B-28', 'RSCLL', 'B-28', 'Dorm. PNI Solteros', 'Recinto', 75),
('RSCLL:B-29', 'RSCLL', 'B-29', 'Baños PNI Solteros', 'Recinto', 76),
('RSCLL:B-30', 'RSCLL', 'B-30', 'Duchas PNI Solteros', 'Recinto', 77),
('RSCLL:B-31', 'RSCLL', 'B-31', 'Tab. Elect.', 'Elemento técnico', 78),
('RSCLL:B-32', 'RSCLL', 'B-32', 'Sala Racks', 'Recinto técnico', 79),
('RSCLL:1C', 'RSCLL', '1C', 'Circulación', 'Circulación', 80),
('RSCLL:C-01', 'RSCLL', 'C-01', 'Living Comedor', 'Recinto', 81),
('RSCLL:C-02', 'RSCLL', 'C-02', 'Baño 1', 'Recinto', 82),
('RSCLL:C-03', 'RSCLL', 'C-03', 'Baño 2', 'Recinto', 83),
('RSCLL:C-04', 'RSCLL', 'C-04', 'Closet Walk In', 'Recinto', 84),
('RSCLL:C-05', 'RSCLL', 'C-05', 'Dormitorio 1', 'Recinto', 85),
('RSCLL:C-06', 'RSCLL', 'C-06', 'Terraza', 'Área exterior', 86),
('RSCLL:C-07', 'RSCLL', 'C-07', 'Dormitorio 3', 'Recinto', 87),
('RSCLL:C-08', 'RSCLL', 'C-08', 'Dormitorio 2', 'Recinto', 88),
('RSCLL:C-09', 'RSCLL', 'C-09', 'Cocina', 'Recinto', 89),
('RSCLL:C-10', 'RSCLL', 'C-10', 'Loggia', 'Recinto', 90),
('RSCLL:C-11', 'RSCLL', 'C-11', 'Bodega', 'Recinto', 91),
('RSCLL:C-12', 'RSCLL', 'C-12', 'Patio Techado', 'Área cubierta', 92),
('RSCLL:C-13', 'RSCLL', 'C-13', 'Estacionamiento', 'Área exterior', 93),
('RSCLL:C-14', 'RSCLL', 'C-14', 'Acceso', 'Área exterior', 94),
('RSCLL:D-01', 'RSCLL', 'D-01', 'Circulación vehicular lateral — Fachada Sur', 'Área exterior', 95),
('RSCLL:D-02', 'RSCLL', 'D-02', 'Pasillo exterior — Fachada Norte', 'Área exterior', 96),
('RSCLL:D-03', 'RSCLL', 'D-03', 'Estacionamiento exterior', 'Área exterior', 97),
('RSCLL:D-04', 'RSCLL', 'D-04', 'Estanque de acumulación', 'Elemento técnico', 98),
('RSCLL:D-05', 'RSCLL', 'D-05', 'Cubierta edificio principal', 'Cubierta', 99),
('RSCLL:D-06', 'RSCLL', 'D-06', 'Cubierta casa', 'Cubierta', 100)
on conflict (id) do update set nombre = excluded.nombre, tipo = excluded.tipo, orden = excluded.orden;

insert into recinto_sector (recinto_id, sector, superficie) values
('RSCLL:1A', 'Piso 1 (A)', 36.66),
('RSCLL:2A', 'Piso 1 (A)', 22.48),
('RSCLL:3A', 'Piso 1 (A)', 11.8),
('RSCLL:A-01', 'Piso 1 (A)', 4),
('RSCLL:A-02', 'Piso 1 (A)', 44.77),
('RSCLL:A-03', 'Piso 1 (A)', 3.68),
('RSCLL:A-04', 'Piso 1 (A)', 3.66),
('RSCLL:A-05', 'Piso 1 (A)', 13.25),
('RSCLL:A-06', 'Piso 1 (A)', 13.07),
('RSCLL:A-07', 'Piso 1 (A)', 2.09),
('RSCLL:A-08', 'Piso 1 (A)', 6.01),
('RSCLL:A-09', 'Piso 1 (A)', 22.62),
('RSCLL:A-10', 'Piso 1 (A)', 1.91),
('RSCLL:A-11', 'Piso 1 (A)', 1.93),
('RSCLL:A-12', 'Piso 1 (A)', 2.5),
('RSCLL:A-13', 'Piso 1 (A)', 12),
('RSCLL:A-14', 'Piso 1 (A)', 3.09),
('RSCLL:A-15', 'Piso 1 (A)', 18.4),
('RSCLL:A-16', 'Piso 1 (A)', 17.9),
('RSCLL:A-17', 'Piso 1 (A)', 2.42),
('RSCLL:A-18', 'Piso 1 (A)', 2.42),
('RSCLL:A-19', 'Piso 1 (A)', 2.06),
('RSCLL:A-20', 'Piso 1 (A)', 9.01),
('RSCLL:A-21', 'Piso 1 (A)', 8.92),
('RSCLL:A-22', 'Piso 1 (A)', 10.35),
('RSCLL:A-23', 'Piso 1 (A)', 24.19),
('RSCLL:A-24', 'Piso 1 (A)', 7.23),
('RSCLL:A-25', 'Piso 1 (A)', 9.78),
('RSCLL:A-26', 'Piso 1 (A)', 2.26),
('RSCLL:A-27', 'Piso 1 (A)', 16),
('RSCLL:A-29', 'Piso 1 (A)', 4.21),
('RSCLL:A-30', 'Piso 1 (A)', 7.44),
('RSCLL:A-31', 'Piso 1 (A)', 7.4),
('RSCLL:A-32', 'Piso 1 (A)', 7.4),
('RSCLL:A-33', 'Piso 1 (A)', 12.19),
('RSCLL:A-34', 'Piso 1 (A)', 19.08),
('RSCLL:A-35', 'Piso 1 (A)', 14),
('RSCLL:A-36', 'Piso 1 (A)', 19.94),
('RSCLL:A-37', 'Piso 1 (A)', 22),
('RSCLL:A-38', 'Piso 1 (A)', 40.73),
('RSCLL:A-39', 'Piso 1 (A)', 6.32),
('RSCLL:A-40', 'Piso 1 (A)', 2.09),
('RSCLL:E1', 'Piso 1 (A)', 8.17),
('RSCLL:E1', 'Piso 2 (B)', 10.6),
('RSCLL:E2', 'Piso 1 (A)', 3.84),
('RSCLL:E2', 'Piso 2 (B)', null),
('RSCLL:1B', 'Piso 2 (B)', 28.06),
('RSCLL:2B', 'Piso 2 (B)', 12.98),
('RSCLL:B-01', 'Piso 2 (B)', 18.6),
('RSCLL:B-02', 'Piso 2 (B)', 16.02),
('RSCLL:B-03', 'Piso 2 (B)', 23.17),
('RSCLL:B-04', 'Piso 2 (B)', 4.98),
('RSCLL:B-05', 'Piso 2 (B)', 16.02),
('RSCLL:B-06', 'Piso 2 (B)', 3.74),
('RSCLL:B-07', 'Piso 2 (B)', 2.38),
('RSCLL:B-08', 'Piso 2 (B)', 11.02),
('RSCLL:B-08A', 'Piso 2 (B)', 3.09),
('RSCLL:B-09', 'Piso 2 (B)', 10.99),
('RSCLL:B-10', 'Piso 2 (B)', 4.02),
('RSCLL:B-11', 'Piso 2 (B)', 6.52),
('RSCLL:B-12', 'Piso 2 (B)', 3.37),
('RSCLL:B-13', 'Piso 2 (B)', 70.83),
('RSCLL:B-14', 'Piso 2 (B)', 15.43),
('RSCLL:B-15', 'Piso 2 (B)', 5.03),
('RSCLL:B-16', 'Piso 2 (B)', 3.02),
('RSCLL:B-17', 'Piso 2 (B)', 5.02),
('RSCLL:B-18', 'Piso 2 (B)', 2.16),
('RSCLL:B-19', 'Piso 2 (B)', 4.51),
('RSCLL:B-20', 'Piso 2 (B)', 3.29),
('RSCLL:B-21', 'Piso 2 (B)', 3.29),
('RSCLL:B-22', 'Piso 2 (B)', 7.59),
('RSCLL:B-23', 'Piso 2 (B)', 5.23),
('RSCLL:B-24', 'Piso 2 (B)', 3.61),
('RSCLL:B-25', 'Piso 2 (B)', 50.45),
('RSCLL:B-26', 'Piso 2 (B)', 15.43),
('RSCLL:B-27', 'Piso 2 (B)', 13.88),
('RSCLL:B-28', 'Piso 2 (B)', 74.74),
('RSCLL:B-29', 'Piso 2 (B)', 10.92),
('RSCLL:B-30', 'Piso 2 (B)', 9.93),
('RSCLL:B-31', 'Piso 2 (B)', 0.68),
('RSCLL:B-32', 'Piso 2 (B)', 6.02),
('RSCLL:1C', 'Casa (C)', 7.74),
('RSCLL:C-01', 'Casa (C)', 25.79),
('RSCLL:C-02', 'Casa (C)', 3.79),
('RSCLL:C-03', 'Casa (C)', 4.21),
('RSCLL:C-04', 'Casa (C)', 5.2),
('RSCLL:C-05', 'Casa (C)', 15.4),
('RSCLL:C-06', 'Casa (C)', 3.81),
('RSCLL:C-06', 'Exterior (D)', null),
('RSCLL:C-07', 'Casa (C)', 7.21),
('RSCLL:C-08', 'Casa (C)', 7.21),
('RSCLL:C-09', 'Casa (C)', 9.37),
('RSCLL:C-10', 'Casa (C)', 8.21),
('RSCLL:C-11', 'Casa (C)', 3.42),
('RSCLL:C-12', 'Casa (C)', 15.31),
('RSCLL:C-13', 'Casa (C)', 16.28),
('RSCLL:C-13', 'Exterior (D)', null),
('RSCLL:C-14', 'Casa (C)', 13.62),
('RSCLL:C-14', 'Exterior (D)', null),
('RSCLL:D-01', 'Exterior (D)', null),
('RSCLL:D-02', 'Exterior (D)', null),
('RSCLL:D-03', 'Exterior (D)', null),
('RSCLL:D-04', 'Exterior (D)', null),
('RSCLL:D-05', 'Exterior (D)', null),
('RSCLL:D-06', 'Exterior (D)', null)
on conflict (recinto_id, sector) do update set superficie = excluded.superficie;

insert into figura (recinto_id, plano, element_id) values
('RSCLL:1A', 'Piso 1 (A)', 'recinto-1A'),
('RSCLL:2A', 'Piso 1 (A)', 'recinto-2A'),
('RSCLL:3A', 'Piso 1 (A)', 'recinto-3A'),
('RSCLL:A-01', 'Piso 1 (A)', 'recinto-A-01'),
('RSCLL:A-02', 'Piso 1 (A)', 'recinto-A-02'),
('RSCLL:A-03', 'Piso 1 (A)', 'recinto-A-03'),
('RSCLL:A-04', 'Piso 1 (A)', 'recinto-A-04'),
('RSCLL:A-05', 'Piso 1 (A)', 'recinto-A-05'),
('RSCLL:A-06', 'Piso 1 (A)', 'recinto-A-06'),
('RSCLL:A-07', 'Piso 1 (A)', 'recinto-A-07'),
('RSCLL:A-08', 'Piso 1 (A)', 'recinto-A-08'),
('RSCLL:A-09', 'Piso 1 (A)', 'recinto-A-09'),
('RSCLL:A-10', 'Piso 1 (A)', 'recinto-A-10'),
('RSCLL:A-11', 'Piso 1 (A)', 'recinto-A-11'),
('RSCLL:A-12', 'Piso 1 (A)', 'recinto-A-12'),
('RSCLL:A-13', 'Piso 1 (A)', 'recinto-A-13'),
('RSCLL:A-14', 'Piso 1 (A)', 'recinto-A-14'),
('RSCLL:A-15', 'Piso 1 (A)', 'recinto-A-15'),
('RSCLL:A-16', 'Piso 1 (A)', 'recinto-A-16'),
('RSCLL:A-17', 'Piso 1 (A)', 'recinto-A-17'),
('RSCLL:A-18', 'Piso 1 (A)', 'recinto-A-18'),
('RSCLL:A-19', 'Piso 1 (A)', 'recinto-A-19'),
('RSCLL:A-20', 'Piso 1 (A)', 'recinto-A-20'),
('RSCLL:A-21', 'Piso 1 (A)', 'recinto-A-21'),
('RSCLL:A-22', 'Piso 1 (A)', 'recinto-A-22'),
('RSCLL:A-23', 'Piso 1 (A)', 'recinto-A-23'),
('RSCLL:A-24', 'Piso 1 (A)', 'recinto-A-24'),
('RSCLL:A-25', 'Piso 1 (A)', 'recinto-A-25'),
('RSCLL:A-26', 'Piso 1 (A)', 'recinto-A-26'),
('RSCLL:A-27', 'Piso 1 (A)', 'recinto-A-27'),
('RSCLL:A-29', 'Piso 1 (A)', 'recinto-A-29'),
('RSCLL:A-30', 'Piso 1 (A)', 'recinto-A-30'),
('RSCLL:A-31', 'Piso 1 (A)', 'recinto-A-31'),
('RSCLL:A-32', 'Piso 1 (A)', 'recinto-A-32'),
('RSCLL:A-33', 'Piso 1 (A)', 'recinto-A-33'),
('RSCLL:A-34', 'Piso 1 (A)', 'recinto-A-34'),
('RSCLL:A-35', 'Piso 1 (A)', 'recinto-A-35'),
('RSCLL:A-36', 'Piso 1 (A)', 'recinto-A-36'),
('RSCLL:A-37', 'Piso 1 (A)', 'recinto-A-37'),
('RSCLL:A-38', 'Piso 1 (A)', 'recinto-A-38'),
('RSCLL:A-39', 'Piso 1 (A)', 'recinto-A-39'),
('RSCLL:A-40', 'Piso 1 (A)', 'recinto-A-40'),
('RSCLL:E1', 'Piso 1 (A)', 'recinto-E1'),
('RSCLL:E1', 'Piso 2 (B)', 'recinto-E1'),
('RSCLL:E2', 'Piso 1 (A)', 'recinto-E2'),
('RSCLL:E2', 'Piso 2 (B)', 'recinto-E2'),
('RSCLL:1B', 'Piso 2 (B)', 'recinto-1B'),
('RSCLL:2B', 'Piso 2 (B)', 'recinto-2B'),
('RSCLL:B-01', 'Piso 2 (B)', 'recinto-B-01'),
('RSCLL:B-02', 'Piso 2 (B)', 'recinto-B-02'),
('RSCLL:B-03', 'Piso 2 (B)', 'recinto-B-03'),
('RSCLL:B-04', 'Piso 2 (B)', 'recinto-B-04'),
('RSCLL:B-05', 'Piso 2 (B)', 'recinto-B-05'),
('RSCLL:B-06', 'Piso 2 (B)', 'recinto-B-06'),
('RSCLL:B-07', 'Piso 2 (B)', 'recinto-B-07'),
('RSCLL:B-08', 'Piso 2 (B)', 'recinto-B-08'),
('RSCLL:B-08A', 'Piso 2 (B)', 'recinto-B-08A'),
('RSCLL:B-09', 'Piso 2 (B)', 'recinto-B-09'),
('RSCLL:B-10', 'Piso 2 (B)', 'recinto-B-10'),
('RSCLL:B-11', 'Piso 2 (B)', 'recinto-B-11'),
('RSCLL:B-12', 'Piso 2 (B)', 'recinto-B-12'),
('RSCLL:B-13', 'Piso 2 (B)', 'recinto-B-13'),
('RSCLL:B-14', 'Piso 2 (B)', 'recinto-B-14'),
('RSCLL:B-15', 'Piso 2 (B)', 'recinto-B-15'),
('RSCLL:B-16', 'Piso 2 (B)', 'recinto-B-16'),
('RSCLL:B-17', 'Piso 2 (B)', 'recinto-B-17'),
('RSCLL:B-18', 'Piso 2 (B)', 'recinto-B-18'),
('RSCLL:B-19', 'Piso 2 (B)', 'recinto-B-19'),
('RSCLL:B-20', 'Piso 2 (B)', 'recinto-B-20'),
('RSCLL:B-21', 'Piso 2 (B)', 'recinto-B-21'),
('RSCLL:B-22', 'Piso 2 (B)', 'recinto-B-22'),
('RSCLL:B-23', 'Piso 2 (B)', 'recinto-B-23'),
('RSCLL:B-24', 'Piso 2 (B)', 'recinto-B-24'),
('RSCLL:B-25', 'Piso 2 (B)', 'recinto-B-25'),
('RSCLL:B-26', 'Piso 2 (B)', 'recinto-B-26'),
('RSCLL:B-27', 'Piso 2 (B)', 'recinto-B-27'),
('RSCLL:B-28', 'Piso 2 (B)', 'recinto-B-28'),
('RSCLL:B-29', 'Piso 2 (B)', 'recinto-B-29'),
('RSCLL:B-30', 'Piso 2 (B)', 'recinto-B-30'),
('RSCLL:B-31', 'Piso 2 (B)', 'recinto-B-31'),
('RSCLL:B-32', 'Piso 2 (B)', 'recinto-B-32'),
('RSCLL:1C', 'Casa (C)', 'recinto-1C'),
('RSCLL:C-01', 'Casa (C)', 'recinto-C-01'),
('RSCLL:C-02', 'Casa (C)', 'recinto-C-02'),
('RSCLL:C-03', 'Casa (C)', 'recinto-C-03'),
('RSCLL:C-04', 'Casa (C)', 'recinto-C-04'),
('RSCLL:C-05', 'Casa (C)', 'recinto-C-05'),
('RSCLL:C-07', 'Casa (C)', 'recinto-C-07'),
('RSCLL:C-08', 'Casa (C)', 'recinto-C-08'),
('RSCLL:C-09', 'Casa (C)', 'recinto-C-09'),
('RSCLL:C-10', 'Casa (C)', 'recinto-C-10'),
('RSCLL:C-11', 'Casa (C)', 'recinto-C-11'),
('RSCLL:C-12', 'Casa (C)', 'recinto-C-12'),
('RSCLL:C-13', 'Casa (C)', 'recinto-C-13')
on conflict (plano, element_id) do update set recinto_id = excluded.recinto_id;

commit;
