# Estrategia de Migraciones Prisma — Clikit

## Estado Actual

- **Schema:** 35+ modelos, 25+ enums
- **Migraciones formales:** 2 (`001_add_stock_lot_traceability`, `002_add_sale_consumption_traceability`)
- **Baseline:** Creado inicialmente con `prisma db push` (no recomendado para producción)
- **Estado DB:** Sincronizado (`prisma migrate status` = "up to date")

## Reglas para Futuros Cambios

### SIEMPRE usar `prisma migrate dev`

```bash
# 1. Modificar prisma/schema.prisma
# 2. Ejecutar:
npx prisma migrate dev --name descripcion-del-cambio

# 3. Esto genera:
#    - prisma/migrations/XXXX_descripcion-del-cambio/migration.sql
#    - Actualiza el cliente Prisma
#    - Verifica que el schema es válido
```

### NUNCA usar `prisma db push` en producción

`prisma db push` es para desarrollo rápido. No genera archivos de migración y puede causar inconsistencias entre entornos.

### Para producción (Vercel/Neon)

El comando `npm run build` ejecuta primero `scripts/migrate-db.mjs`:

- Si la base está vacía, crea el esquema completo desde `schema.prisma` y registra las dos migraciones históricas como aplicadas.
- Si ya existe un esquema sin historial Prisma, solo lo adopta cuando una comparación confirma que coincide exactamente con el esquema actual.
- Si ya hay historial de migraciones, ejecuta `prisma migrate deploy` para aplicar únicamente las pendientes.
- Ante tablas preexistentes con diferencias y sin historial, detiene el build. No hace reset ni elimina datos.

Prisma CLI usa `DATABASE_URL_UNPOOLED` cuando está disponible para ejecutar las migraciones con una conexión directa.

```bash
# Las migraciones se ejecutan automáticamente en el build
# o manualmente:
npx prisma migrate deploy
```

## Si la DB está desincronizada

Si `prisma migrate status` muestra migraciones pendientes:

```bash
# Aplicar migraciones pendientes
npx prisma migrate deploy

# Si hay conflictos, resetsar (CUIDADO: borra datos)
npx prisma migrate reset
```

## Archivos Importantes

- `prisma/schema.prisma` — fuente de verdad del schema
- `prisma/migrations/` — historial de cambios
- `prisma.config.ts` — configuración de Prisma
- `src/lib/prisma.ts` — cliente Prisma singleton
