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
