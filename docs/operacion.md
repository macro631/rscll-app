# Manual de operación

Tareas habituales para mantener la app funcionando. Los comandos se ejecutan en una terminal, desde `prototipo/` o desde `prototipo/app/`, según se indica.

## Accesos

| Servicio | Dónde | Para qué |
| --- | --- | --- |
| App | https://rscll-app.vercel.app | Uso diario. |
| GitHub | https://github.com/macro631/rscll-app | Código. Cada `git push` a `main` publica. |
| Vercel | Proyecto `rscll-app` | Alojamiento. Sin configuración manual: usa `vercel.json`. |
| Supabase | Proyecto `rscll-app` (São Paulo) | Base de datos, cuentas, fotos y tiempo real. |

**Credenciales locales:** están en `prototipo/.env.supabase.local`. Nunca se suben a GitHub, porque `.gitignore` las excluye.

| Variable | Qué es | Riesgo si se filtra |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Token personal de la cuenta Supabase. Sirve para aplicar migraciones. | Alto: controla todo el proyecto. Revóquelo cuando no lo use. |
| `SUPABASE_SECRET_KEY` | Clave secreta del proyecto. La usa el script de respaldo. | Alto: lee y escribe todos los datos. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Valores públicos. También están en `app/.env.production`. | Ninguno: la seguridad la dan las reglas de la base. |

## Cuentas

Todo se hace desde **Historial → Usuarios**, con la cuenta de Administrador:

- **Crear una cuenta:** nombre, correo, clave inicial de mínimo 8 caracteres y rol.
- **Cambiar nombre, rol o desactivar:** directamente en la fila. Una cuenta desactivada pierde el acceso de inmediato y conserva todo su historial.
- **Cambiar una clave:** botón «Cambiar» en la fila. No existe "olvidé mi clave".
- **Si el Administrador olvida su propia clave:** en Supabase → Authentication → Users → la cuenta → *Send password recovery*, o fijar una clave nueva ahí mismo.

**Roles:**
- **Revisor:** revisa y registra observaciones.
- **Inspección:** además de revisar, recepciona, devuelve observaciones a pendiente y registra defectos nuevos.
- **Administrador:** todo lo anterior, más Historial, cuentas, reapertura y anulación de fichas.

## Respaldo (automático)

El plan gratuito de Supabase **no guarda respaldos** y **pausa el proyecto tras 7 días sin uso**. Por eso hay una tarea de Windows en este computador, **«RSCLL respaldo»**, que corre **lunes y jueves a las 09:00**. Si el computador está apagado a esa hora, corre al encenderlo. Además, al usar el proyecto dos veces por semana evita que Supabase lo pause.

- **Qué guarda:** todas las tablas (`datos.json`) y todas las fotos, en `prototipo/respaldos/AAAAMMDD_HHMM/`.
- **Cuántos conserva:** los **10** más recientes; los anteriores se borran solos.
- **Registro:** cada ejecución deja una línea en `prototipo/respaldos/registro.log`, con OK o ERROR.
- **Revisar la tarea:** en el Programador de tareas de Windows, «RSCLL respaldo». El último resultado 0 significa correcto.
- **Respaldo manual en cualquier momento:** `node scripts/respaldo.mjs`, desde `prototipo/`.
- **Programar la tarea en otro computador:** `powershell -ExecutionPolicy Bypass -File scripts\programar_respaldo.ps1`.
- **Guardar en otra carpeta**, por ejemplo una de OneDrive para tener copia fuera del equipo: agregue `RSCLL_RESPALDOS=C:\ruta\a\la\carpeta` en `.env.supabase.local`. Para cambiar cuántos se conservan, use `RSCLL_RESPALDOS_CONSERVAR=10`.
- **Requisito:** la tarea usa la clave secreta de `.env.supabase.local`. Si esa clave se cambia en Supabase, hay que actualizar el archivo.

**Otra vía:** en la app, **Historial → Respaldo** descarga los datos sin las fotos.

**Si el proyecto se pausó:** en Supabase, abra el proyecto y pulse *Restore*. Los datos no se pierden.

## Cambios en la base de datos

La base se construye con migraciones numeradas en `supabase/migrations/`. Para agregar un cambio:

1. Cree `supabase/migrations/009_descripcion.sql`, con el número siguiente. Nunca modifique una migración ya aplicada.
2. Regístrela en las pruebas y en el modo demostración:
   - `app/src/test/db.ts`: lista `SCRIPTS`.
   - `app/src/lib/backend/demo.ts`: `import` y lista `SCRIPTS`.
3. Pruebe con `npm test`, desde `app/`.
4. Aplíquela en producción de una de estas dos formas:
   - En Supabase → SQL Editor, pegando el archivo.
   - Con el token, usando la API de gestión: `POST https://api.supabase.com/v1/projects/<ref>/database/query`.
5. Regenere el instalador completo con `node scripts/unir_sql.mjs`, desde `prototipo/`.
6. Haga commit y push.

**Función de cuentas:** si cambia `supabase/functions/admin-usuarios/index.ts`, publíquela con:

```bash
npx supabase functions deploy admin-usuarios --project-ref <ref> --use-api
```

## Catálogo de recintos

El origen es `../fuentes/RSCLL_Recintos.xlsx` junto con los planos SVG.

1. Si cambia el Excel, regenere el catálogo con `python ../fuentes/scripts/build_catalog.py`. Requiere Python y openpyxl.
2. Copie `../fuentes/data/catalog.json` a `prototipo/data/catalog.json`.
3. Genere el SQL:
   ```bash
   node scripts/generar_seed.mjs
   node scripts/unir_sql.mjs
   ```
4. Aplique `supabase/seed.sql` en producción. Es idempotente: actualiza nombres y superficies sin tocar las observaciones.
5. Si cambian los planos, copie los SVG a `app/public/plantas/`.

Los **códigos** de recinto no deben cambiar una vez que existan observaciones. Los **nombres** sí se pueden corregir.

## Despliegue

- **Producción:** cada `git push` a `main` compila y publica en 1 a 2 minutos. La configuración está en `prototipo/vercel.json`. En Vercel, el proyecto **no** debe tener *Root Directory*.
- **Claves de producción:** la dirección de Supabase y la clave pública van en `app/.env.production`.
- **Actualización en los teléfonos:** la app se actualiza sola al abrirla. Si alguien ve una versión antigua, basta con cerrarla y abrirla de nuevo.

## Pruebas

Todos los comandos van desde `prototipo/app/`.

| Comando | Qué comprueba | Datos |
| --- | --- | --- |
| `npm test` | 23 pruebas: reglas de estado, permisos por rol, seguridad de la base, informes. | Base temporal en memoria. |
| `npm run lint` | Calidad del código. | — |
| `npm run build:demo` y `npm run preview`, y en otra terminal `npm run e2e` | Recorrido completo de 21 pasos en Edge: plantas, revisión con foto, subsanación, recepción (también desde la lista), PDF, Excel e Historial. | Modo demostración. |
| `npm run e2e:camara` | Cámara dentro de la app, con permiso concedido y denegado. | Modo demostración. |
| `npm run e2e:informe -- <carpeta> <foto>` | Informes PDF de varias hojas. | Modo demostración. |
| `npm run e2e:capturas -- <carpeta>` | Capturas de todas las pantallas, en teléfono y escritorio. | Modo demostración. |
| `npm run e2e:tiempo-real` | Dos personas en el mismo recinto: tiempo real y aviso de duplicados. | **Supabase real:** usar cuentas temporales `@rscll-prueba.cl` y borrar después su actividad. |
| `npm run e2e:supabase` | Alta de cuentas, fotos en Storage, tiempo real y recepción. | **Supabase real:** necesita la clave del Administrador y crea datos de prueba. |

Las pruebas que usan Supabase real **crean datos**. Con datos reales en producción, límpielas borrando solo lo que hicieron las cuentas de prueba, nunca por recinto ni por fecha.

## Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| La cámara aparece en negro o bloqueada en el iPhone | El permiso de cámara de Safari. La app muestra los pasos: «aA» → Configuración del sitio web → Cámara → Permitir. Alternativa: «Galería». |
| Sin señal la app abre, pero sin plantas ni fichas | Esperado: la sesión y las observaciones pendientes se conservan, pero los datos se consultan en línea. Lo que se registra sin señal se envía al volver la conexión («⟳ por enviar»). |
| «Correo o clave incorrectos» | El Administrador cambia la clave desde Historial → Usuarios. |
| La app no carga datos en ningún teléfono | El proyecto de Supabase puede estar pausado. Ver Respaldo → *Restore*. |
| Un teléfono muestra una versión vieja | Cerrar la app o la pestaña y abrirla de nuevo. |
