# RSCLL · Revisión de recintos

Aplicación web para revisar los recintos de la **Reposición SubComisaría Llay Llay**: registrar observaciones por recinto, comprobar subsanaciones, recepcionar por Inspección, emitir informes PDF y exportar la base a Excel. La especificación funcional está en [`../Estructura.md`](../Estructura.md).

- **Frontend:** React, Vite y TypeScript como PWA instalable en el teléfono. Se despliega en **Vercel**.
- **Backend:** **Supabase**:
  - Postgres con Row Level Security. Todas las escrituras pasan por funciones RPC que validan el rol en el servidor.
  - Auth para las cuentas.
  - Storage para las fotos.
  - Realtime para las actualizaciones en vivo.
- **Modo demostración:** si faltan las variables de Supabase, la app funciona sola en el navegador. Usa las mismas migraciones SQL sobre PGlite y trae usuarios y datos de ejemplo.

## Estructura

```
prototipo/
  app/                      App React (Root Directory en Vercel)
    public/plantas/         SVG oficiales de Piso 1, Piso 2 y Casa
    src/lib/backend/        Supabase o demostración (misma interfaz)
    src/lib/cola.ts         Cola sin conexión: observaciones y fotos
    src/lib/pdf.ts          Única plantilla de informe
    src/lib/excel.ts        Exportación de la Base
    src/features/           Inicio, Revisión, Informes, Base, Historial
    src/test/sql.test.ts    Criterios de aceptación sobre la base real (PGlite)
    e2e/recorrido.mjs       Recorrido completo en Edge/Chrome
  supabase/
    migrations/             001 esquema · 002 estado · 003 RLS · 004 acciones · 005 consultas · 006 storage/realtime · 007 Inspección revisa
    seed.sql                Catálogo de 100 unidades (generado)
    instalar.sql            Todo lo anterior en un solo archivo (generado)
    functions/admin-usuarios/  Alta de cuentas y cambio de clave (Edge Function)
  data/catalog.json         Copia del catálogo validado
  scripts/                  generar_seed.mjs · unir_sql.mjs · generar_iconos.mjs
```

## Probar en este equipo

Necesita Node 20 o superior.

```bash
cd app
npm install
npm run dev          # http://localhost:5173, en modo demostración
npm test             # 22 pruebas de reglas, permisos y RLS
npm run build && npx vite preview --port 4173
VITE_MODO=demo npm run build && npx vite preview --port 4180   # y en otra terminal: npm run e2e
node e2e/recorrido-supabase.mjs              # recorrido contra Supabase real (crea datos de prueba)
node e2e/informe-largo.mjs <carpeta> <foto>  # informes PDF de varias hojas para revisar formato
node e2e/tiempo-real.mjs                     # dos personas en el mismo recinto contra Supabase real (crea datos de prueba)
```

En el modo demostración se entra eligiendo un rol: Calidad (Administrador), Revisor Terreno 1 o 2, o Inspección Técnica. Los datos quedan solo en ese navegador. El botón «Reiniciar datos de demostración» los borra.

## Puesta en marcha con Supabase

1. **Crear el proyecto** en [supabase.com](https://supabase.com). Se recomienda la región São Paulo.
2. **Crear la base.** En *SQL Editor*, pegue y ejecute el contenido completo de `supabase/instalar.sql` una sola vez. Crea tablas, reglas, funciones, buckets de fotos y el catálogo.
3. **Cerrar el registro público.** En *Authentication → Providers → Email*, desactive **Allow new users to sign up**. Solo el Administrador creará cuentas.
4. **Crear el primer Administrador.**
   1. En *Authentication → Users → Add user*, ingrese su correo y clave y marque **Auto Confirm**.
   2. En *SQL Editor*, ejecute:
      ```sql
      update perfil set rol = 'admin', nombre = 'Calidad' where email = 'correo@ejemplo.cl';
      ```
   Este paso siempre es necesario: toda cuenta nueva parte como Revisor. Las cuentas que después cree el Administrador desde la app reciben su rol directamente.
5. **Publicar la función de cuentas.** Tiene dos opciones:
   - En *Edge Functions → Deploy a new function*, use el nombre `admin-usuarios` y pegue `supabase/functions/admin-usuarios/index.ts`.
   - Con la CLI de Supabase:
     ```bash
     supabase functions deploy admin-usuarios --project-ref <ref>
     ```
   Después, el Administrador crea las demás cuentas desde **Historial → Usuarios**.
6. **Copiar las claves.** En *Project Settings → API* están la **URL** y la **anon public key**. Se usan en Vercel en el paso siguiente.

## Despliegue en Vercel desde GitHub

1. Suba esta carpeta `prototipo/` a un repositorio de GitHub.
2. En Vercel, elija **Add New → Project** e importe el repositorio con esta configuración:
   - **Root Directory:** `app`. Vercel detecta Vite: build `npm run build` y salida `dist`.
   - **Environment Variables:** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, con los valores del paso 6.
3. Cada `git push` a `main` publica una nueva versión, y cada rama genera una vista previa.

**Configuración actual:** la URL y la clave *publishable* del proyecto están en `app/.env.production`, dentro del repositorio. Son valores públicos por diseño: los recibe el navegador de cada usuario, y la seguridad la dan RLS y las funciones RPC. Vercel los usa al compilar sin configurar nada más. La clave secreta nunca va en ese archivo.

Para compilar el modo demostración:
```bash
VITE_MODO=demo npm run build
```

## Si cambia el catálogo

1. Edite `data/catalog.json` (o regenérelo con `../scripts/build_catalog.py`).
2. Regenere los archivos SQL:
   ```bash
   node scripts/generar_seed.mjs
   node scripts/unir_sql.mjs
   ```
3. Ejecute `supabase/seed.sql` en el editor SQL. Es idempotente: actualiza nombres y superficies sin tocar las observaciones.
4. Copie los SVG nuevos a `app/public/plantas/`.

## Respaldo y continuidad (§13)

- **Datos:** en **Historial → Respaldo** se descarga un JSON completo con recintos, fichas, observaciones, comentarios, recepciones e historial.
- **Fotos:** están en los buckets `fotos-original` y `fotos-ligera`. Se pueden descargar con la CLI de Supabase o desde *Storage*.
- **Respaldos automáticos:** revise qué incluye su plan de Supabase. Los respaldos diarios y la recuperación a un punto en el tiempo dependen del plan, y los proyectos gratuitos pueden pausarse tras días sin uso. Para la obra se recomienda un plan pagado o, como mínimo, un respaldo manual semanal.

## Reglas principales implementadas

- **Estado del recinto:** se calcula en la vista `recinto_estado` y no se pinta a mano. El orden de prioridad es:
  1. Ficha abierta: azul.
  2. Pendientes: ámbar.
  3. Sin revisión finalizada: gris.
  4. Recepción vigente: verde oscuro.
  5. Resto: verde claro.
- **Escaleras:** E1 y E2 son una sola unidad con figura en ambos pisos. El total global las cuenta una vez.
- **Inspección también revisa** (decisión del 24-09-2026, reemplaza la restricción de §3): además de recepcionar, devolver y registrar defectos nuevos, abre sus propias fichas de revisión y registra observaciones como un Revisor. Migración `007_inspeccion_revisa.sql`.
- **Trabajo en conjunto:** todos los roles registran observaciones; varias personas pueden revisar el mismo recinto a la vez, cada una en su ficha. En la ficha se ven al instante las observaciones de los demás y quién más está revisando, y el formulario muestra las observaciones ya registradas con la misma especialidad para evitar duplicados.
- **Recepción:** solo Inspección recepciona. Cualquier pendiente posterior deja la recepción sin vigencia, y el Historial la conserva.
- **Defecto sin observación previa** (§16.1, resuelto): Inspección registra una *Observación de Inspección* con especialidad en un recinto verde claro o recepcionado.
- **Administrador:** reabre, anula y revierte anulaciones, y todo queda en el Historial.
- **Sin conexión:** las observaciones y fotos se guardan en el teléfono y se envían al volver la red. El `client_id` evita duplicados.

## Pendiente de validar en terreno

- **§16.3:** probar el PDF con textos largos y fotos reales. Hoy usa tamaño carta vertical, fotos de unos 35 mm de ancho en la columna y filas que no se cortan entre páginas.
- **Catálogo:** confirmar los nombres finales de los recintos antes de congelar el seed. Los códigos ya están validados contra los SVG.
