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
