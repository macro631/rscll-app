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
