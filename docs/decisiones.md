# Registro de decisiones

Decisiones tomadas por Calidad durante el desarrollo. Donde una decisión contradice la especificación de origen (`fuentes/Estructura.md`), **manda esta lista**.

| Fecha | Decisión | Sección que ajusta |
| --- | --- | --- |
| 23-09-2026 | Plataforma: Supabase (base, cuentas, fotos, tiempo real) + app React/Vite instalable, alojada en Vercel desde GitHub. | §13 |
| 23-09-2026 | Defecto sin observación previa: Inspección registra una *observación de Inspección*, con especialidad, en un recinto verde claro o recepcionado, y el recinto vuelve a ámbar. | §8, §16.1 (resuelta) |
| 23-09-2026 | Piloto en el plan gratuito de Supabase. Plan Pro cuando la app sea el registro oficial. | §13 |
| 23-09-2026 | Fotos: el "original" se guarda reducido a 2000 px (~0,6 MB), más una versión ligera para listas y PDF. | §13 |
| 23-09-2026 | Diseño «Plano técnico»: tinta sobre papel, colores solo para estados, código de recinto como rótulo de plano. | §14 |
| 23-09-2026 | Plantas largas (Piso 1 y 2) en horizontal, con miniatura que enmarca la zona visible. | §6.1 |
| 23-09-2026 | Revisión: recintos agrupados en secciones desplegables por Piso 1, Piso 2, Casa y Exteriores. Especialidad como desplegable. | §7.1, §7.2 |
| 23-09-2026 | Informe PDF: las columnas se adaptan a la agrupación (sin columna Recinto al agrupar por recinto; sin Especialidad al agrupar por especialidad). Título y encabezados se repiten en cada hoja. Foto centrada. | §9 («conservando columnas») |
| 24-09-2026 | **Inspección también revisa:** abre su propia ficha y registra observaciones como un Revisor, además de sus funciones propias. | §3 («no como revisión ordinaria») |
| 24-09-2026 | **Trabajo en conjunto:** varias personas revisan el mismo recinto a la vez, cada una en su ficha, y ven al instante lo que registran los demás. El formulario muestra las observaciones ya registradas con la misma especialidad para evitar duplicados. | §7.2 |
| 24-09-2026 | Cámara dentro de la app: el sitio pide permiso de cámara y muestra la imagen en vivo. La cámara del teléfono y la galería quedan como alternativa. | §7.2 |
| 24-09-2026 | Endurecimiento antes de operar: permisos mínimos en la base (migración 008) y clave de al menos 8 caracteres. | §3, §13 |
| 24-09-2026 | Limpieza de datos de prueba. La operación real parte en la observación N° 1. | — |
| 24-09-2026 | Orden de la carpeta: se elimina la versión local anterior (Node + SQLite) y el material de origen pasa a `RF/fuentes/`. | — |
| 24-09-2026 | Sin señal, la app conserva la sesión y la cola de observaciones en vez de cerrar la sesión. | §13 |
| 24-09-2026 | Revisión abre en la vista **Planta**. Al escribir en el buscador se pasa a la lista de resultados. | §7.1 |
| 24-09-2026 | **Recepción rápida:** Inspección recepciona desde la lista «Listos para inspeccionar» o desde la tarjeta del recinto en la planta, con confirmación en la misma línea («¿Recepcionar A-02? Sí · No»), porque una recepción por error no se puede deshacer si el recinto no tiene observaciones. | §8 |
| 24-09-2026 | **Respaldo automático** lunes y jueves (tarea de Windows «RSCLL respaldo»), conservando los 10 más recientes. | §13 |
| 24-09-2026 | **Inicio:** la planta abre completa (encuadrada), con el marco ajustado a su forma, y los indicadores parten en «Total de la obra», también en el teléfono. En escritorio, un gráfico de anillo entre el selector y la tabla de estados. La tabla conserva cantidad, porcentaje y barra, y al pasar el cursor por un segmento o una fila se resaltan ambos. | §6.1, §6.2 |

**Pendientes de la especificación:**
- **§16.2:** confirmar los nombres finales de los recintos. Los códigos ya están validados contra los planos.
- **§16.3:** probar el informe PDF con fotos reales de obra. Ya se probó con fotos de ejemplo e informes de varias hojas.
