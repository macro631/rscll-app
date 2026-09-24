# RSCLL · Revisión de recintos

Aplicación web de Calidad para la **Reposición SubComisaría Llay Llay**. Con ella se revisan los recintos, se registran observaciones con foto, se comprueban las subsanaciones y Inspección recepciona. También emite informes PDF y exporta la base a Excel.

- **App:** https://rscll-app.vercel.app
- **Código:** https://github.com/macro631/rscll-app. Cada `git push` a `main` publica una versión nueva.
- **Base de datos:** proyecto Supabase `rscll-app`, región São Paulo.
- **Especificación de origen:** [`../fuentes/Estructura.md`](../fuentes/Estructura.md). Los cambios acordados después están en [docs/decisiones.md](docs/decisiones.md).

## Documentación

| Documento | Para qué |
| --- | --- |
| [docs/operacion.md](docs/operacion.md) | Manual de operación: cuentas, respaldos, cambios en la base, catálogo, despliegue, pruebas y problemas frecuentes. |
| [docs/decisiones.md](docs/decisiones.md) | Registro fechado de las decisiones que ajustaron la especificación. |
| [docs/auditoria-2026-09-24.md](docs/auditoria-2026-09-24.md) | Auditoría de efectividad, eficiencia y funcionamiento, con las mejoras priorizadas. |

## Cómo está hecha

- **Interfaz:** React, Vite y TypeScript, como PWA instalable en el teléfono. Se aloja en Vercel.
- **Servidor:** Supabase.
  - Postgres con seguridad por fila. Toda escritura pasa por funciones del servidor que validan el rol.
  - Auth para las cuentas.
  - Storage para las fotos.
  - Realtime para ver al instante lo que registran los demás.
- **Modo demostración:** la misma base de datos corre dentro del navegador (PGlite), con usuarios y datos de ejemplo. Sirve para probar sin tocar datos reales.

## Estructura

```
prototipo/
  README.md               Esta página
  docs/                   Operación, decisiones y auditoría
  app/                    La aplicación web
    src/features/         Pantallas: Inicio, Revisión, Informes, Base, Historial
    src/components/       Piezas de interfaz: planta, cámara, observación, cajetín…
    src/lib/              Datos, cola sin conexión, PDF, Excel, sesión
    src/lib/backend/      Supabase o modo demostración (misma interfaz)
    src/test/             Pruebas de reglas y permisos sobre la base real (PGlite)
    e2e/                  Recorridos automáticos en el navegador
    public/plantas/       Planos SVG oficiales
  supabase/
    migrations/           Base de datos por etapas (001 a 008)
    functions/            Función de alta de cuentas y cambio de clave
    local/                Sustituto de Auth para pruebas y modo demostración
    seed.sql              Catálogo de 100 recintos (generado)
    instalar.sql          Todo en un archivo, para un proyecto nuevo (generado)
  data/catalog.json       Catálogo validado (copia de fuentes/)
  scripts/                Respaldo, generación del catálogo SQL, íconos
  vercel.json             Compilación en Vercel
```

## Empezar en este computador

Necesita Node 20 o superior.

```bash
cd app
npm install
npm run dev:demo      # http://localhost:5173 en modo demostración
npm test              # reglas, permisos y seguridad de la base
```

Los demás comandos (recorridos del navegador, respaldo, cambios en la base) están en [docs/operacion.md](docs/operacion.md).
