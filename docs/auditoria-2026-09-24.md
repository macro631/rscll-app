# Auditoría · 24-09-2026

Revisión previa al inicio de las revisiones reales. Cubre tres cosas:
1. Orden de la carpeta.
2. Efectividad y eficiencia del proyecto.
3. Funcionamiento de la herramienta, con las mejoras priorizadas.

## Resumen

- **Estado:** la app está lista para operar.
- **Errores encontrados en la auditoría:** dos, ya corregidos:
  1. **Sin señal, la app cerraba la sesión.** Se confirmó en la versión publicada. Ahora conserva la sesión y la cola de observaciones.
  2. **Refresco excesivo.** Cada cambio de cualquier usuario hacía que todos los teléfonos volvieran a descargar el catálogo y los planos, aunque no cambian.
- **Riesgos de servicio:** dos, y dependen de decisiones de plan:
  1. Vercel Hobby no permite uso comercial.
  2. Supabase Free no guarda respaldos y se pausa tras 7 días sin uso.

## 1. Orden de la carpeta

| Antes | Después |
| --- | --- |
| La raíz de `RF` mezclaba la especificación, los planos, el Excel y una **versión anterior de la app** (Node + SQLite, con su servidor aún corriendo en el puerto 4173). | `RF/fuentes/` guarda el material de origen, `RF/prototipo/` la app vigente y `RF/LEEME.md` sirve de índice. |
| La versión anterior tenía 1 usuario y 1 observación de ensayo. | Eliminada, con su servidor detenido. |
| Había basura técnica en `prototipo/`: compilación, temporales de Supabase, carpetas vacías, un `vercel.json` y un `.gitignore` duplicados, 2 respaldos de datos de prueba y una clave temporal vencida. | Eliminada. `.gitignore` quedó ordenado y comentado. |
| Documentación en un README largo. | README corto, más `docs/` con operación, decisiones y esta auditoría. |
| Las pruebas de navegador requerían `VITE_MODO=demo …`, que no funciona en la terminal de Windows. | Comandos simples: `npm run build:demo`, `npm run e2e`, `npm run e2e:camara`, etc. |

**Verificación:**
- El catálogo y los 3 planos de `fuentes/` son idénticos a los que usa la app: 0 diferencias en 100 recintos.

## 2. Efectividad: ¿hace lo que debe?

| Aspecto | Resultado |
| --- | --- |
| Criterios de aceptación de la especificación (§15) | **10 de 10**, cubiertos por pruebas automáticas sobre la base real. |
| Secciones (§4) | Inicio, Revisión, Informes, Base (escritorio) e Historial (Administrador), todas en funcionamiento. |
| Pruebas | 23 de reglas y permisos, más 6 recorridos de navegador. El recorrido completo tiene 19 pasos. Dos recorridos corren contra Supabase real: tiempo real y alta de cuentas. |
| Tiempo real | La observación de otra persona aparece en **1,1 a 1,6 s**, medido con dos sesiones en producción. |
| Seguridad | Sin sesión no se accede a nada (probado contra la API pública). Toda escritura pasa por funciones que validan el rol. 0 vulnerabilidades en dependencias. |
| Cambios respecto de la especificación | 15 decisiones registradas en [decisiones.md](decisiones.md). |

**Pendientes de la especificación:**
- **§16.2:** confirmar los nombres finales de los recintos. Hoy exige editar el catálogo; ver la mejora M2.
- **§16.3:** probar el PDF con fotos reales de obra.

## 3. Eficiencia

### Costos y servicio

| Servicio | Plan actual | Riesgo | Recomendación |
| --- | --- | --- | --- |
| Supabase | Free (US$0) | Sin respaldos; pausa tras 7 días sin uso; 1 GB de fotos (≈ 1.300 fotos, a unos 0,77 MB por foto). | Respaldo semanal con `scripts/respaldo.mjs`. Pasar a **Pro (US$25/mes)** cuando sea el registro oficial: respaldos diarios, sin pausa y 100 GB. |
| Vercel | Hobby (US$0) | **Según sus condiciones, Hobby es solo para uso personal no comercial.** Una herramienta de trabajo de la obra no califica. | **Pro (US$20/mes)**, o mover el alojamiento a un servicio gratuito que permita uso comercial (por ejemplo, Cloudflare Pages). La app es estática, así que mudarla toma menos de una hora. |
| GitHub | Público, gratis | El código es visible. No contiene claves. | Hacerlo privado si no se quiere exponer el catálogo ni los planos. |

### Rendimiento en el teléfono

| Medida | Valor | Comentario |
| --- | --- | --- |
| Primera carga | ≈ 300 KB comprimidos (JS 203 KB, CSS 9 KB, fuente 90 KB) | Adecuada para red móvil. |
| Instalación como app | 897 KB guardados para uso sin señal | Incluye planos y fuente. |
| Primer informe PDF en el teléfono | ≈ 815 KB adicionales (motor PDF y sus fuentes) | Se descarga una sola vez. Se puede reducir; ver la mejora M5. |
| Excel | 256 KB | Solo en escritorio. |
| Base de datos | 12 MB con el catálogo; ≈ 1–2 KB por observación | Crecimiento irrelevante. |

### Código

- **Tamaño:** ≈ 4.300 líneas de TypeScript, 1.200 de SQL y 610 de CSS, con 12 dependencias de producción.
- **Cambios en la base:** se hacen por migraciones numeradas (001 a 008), aplicadas y registradas.
- **Publicación:** automática con cada push, en 1 a 2 minutos.
- **Eficiencia aplicada hoy:** el refresco en tiempo real ya no vuelve a pedir el catálogo, los planos ni la lista de nombres.

## 4. Funcionamiento: qué mejorar o agilizar

**Flujo actual para registrar:** Revisión → piso → recinto → Iniciar → especialidad → descripción → foto → Guardar. Son unos **9 toques** la primera observación y unos **6** las siguientes en la misma ficha.

### Mejoras priorizadas

| # | Mejora | Beneficio | Esfuerzo |
| --- | --- | --- | --- |
| M1 | **Trabajo completo sin señal:** guardar en el teléfono la última copia de plantas, estados y fichas abiertas. | Hoy sin señal se conservan la sesión y la cola, pero no se ven plantas ni fichas. Es clave en recintos interiores sin cobertura. | Medio |
| M2 | **Editar nombres de recintos desde la app** (Administrador). | Cierra §16.2 sin depender de SQL. | Bajo |
| M3 | **Recepcionar desde la lista** «Listos para inspeccionar». | Inspección recepciona varios recintos seguidos sin entrar a cada ficha. | Bajo |
| M4 | **Respaldo automático semanal** (tarea programada de Windows o GitHub). | Elimina el riesgo de olvidarlo mientras se esté en el plan gratuito. | Bajo |
| M5 | **PDF más liviano** en el teléfono: fuentes reducidas. | El primer informe pasa de ≈ 815 KB a ≈ 300 KB. | Bajo |
| M6 | **Revisar desde la planta:** al tocar un recinto en Revisión → Planta, botón directo «Iniciar revisión». | Un paso menos. | Bajo |
| M7 | **Recintos recientes** al entrar a Revisión. | Volver a un recinto de hoy en 1 toque. | Bajo |
| M8 | **Excel con enlaces de fotos en lote.** | Hoy se pide un enlace por foto: lento con miles de fotos. | Bajo |
| M9 | **Borrar las fotos del almacenamiento** al eliminar una observación. | Evita ocupar espacio del plan con fotos huérfanas. | Bajo |
| M10 | **Recuperar clave por correo.** | Menos dependencia del Administrador. Requiere configurar un servicio de correo. | Medio |

**Orden sugerido:**
- **Antes de salir a terreno:** M1, M2 y M3.
- **En la primera semana:** M4 y M5.
- **Después:** el resto.

## 5. Acciones pendientes del responsable

1. **Revocar el token personal de Supabase** que se compartió por chat (supabase.com/dashboard/account/tokens). Al 24-09 seguía activo.
2. **Decidir el plan de alojamiento:** Vercel Pro o un servicio alternativo, por el uso comercial.
3. **Confirmar los nombres de los recintos** (§16.2).
4. **Respaldo semanal**, mientras se siga en Supabase Free.
