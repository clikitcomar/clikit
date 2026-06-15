# Clikit by ZAP

Sistema POS (Point of Sale) para kioscos, minimarkets y comercios de mostrador argentinos.

**Stack**: Next.js 16 · React 19 · Prisma 7 · PostgreSQL (Neon) · Tailwind CSS 4 · Vercel

## Inicio Rápido

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales (ver sección Variables de Entorno)

# Generar cliente Prisma
npx prisma generate

# Ejecutar en desarrollo
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Iniciar en producción |
| `npm run lint` | ESLint |
| `npm run test` | Ejecutar tests (Vitest) |
| `npm run test:watch` | Tests en modo watch |
| `npm run typecheck` | Typegen + verificación de tipos |
| `npm run verify:release` | Typecheck + build completo |

## Variables de Entorno

Ver `.env.example` para la lista completa. Las más importantes:

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `DATABASE_URL` | URL de conexión a PostgreSQL (Neon) | Sí |
| `AUTH_SECRET` | Secreto para NextAuth | Sí |
| `NEXTAUTH_URL` | URL del sitio en producción | Sí |
| `MP_ACCESS_TOKEN` | Token de Mercado Pago | Para cobros MP |
| `RESEND_API_KEY` | API key para envío de emails | Para reset password |
| `ZAP_FISCAL_BASE_URL` | URL del Fiscal Worker | Para facturación |
| `ZAP_FISCAL_API_KEY` | API key del Fiscal Worker | Para facturación |
| `SENTRY_DSN` | DSN de Sentry | Para monitoreo |

## Arquitectura

```
src/
├── app/                    # App Router (Next.js 16)
│   ├── (app)/[branchId]/   # Panel principal por sucursal
│   │   ├── caja/           # Punto de venta (3500+ líneas)
│   │   ├── productos/      # Gestión de productos
│   │   ├── estadisticas/   # Reportes y estadísticas (6 tabs)
│   │   ├── configuracion/  # Configuración de sucursal
│   │   ├── fiados/         # Cuentas corrientes
│   │   ├── facturas/       # Facturación fiscal
│   │   ├── promociones/    # Promociones y cupones
│   │   ├── resumen/        # Resumen del día
│   │   └── tickets/        # Historial de tickets
│   ├── admin/              # Panel de administración (platform admin)
│   ├── partner/            # Portal de partners/vendedores
│   ├── api/                # 95+ API routes
│   ├── login/              # Autenticación
│   ├── register/           # Registro
│   └── onboarding/         # Onboarding de nuevos kioscos
├── components/             # Componentes React por dominio (80+)
│   ├── caja/               # Componentes de caja
│   ├── ui/                 # Componentes UI base (13)
│   ├── admin/              # Panel admin
│   ├── partner/            # Portal de partners
│   ├── fiscal/             # Facturación AFIP
│   ├── turnos/             # Gestión de turnos
│   ├── products/           # Gestión de productos
│   ├── stats/              # Estadísticas
│   └── ...                 # Otros dominios
├── lib/                    # Lógica de negocio (70+ archivos)
│   ├── auth.ts             # NextAuth v5 configuration
│   ├── prisma.ts           # Prisma client singleton
│   ├── promo-engine.ts     # Motor de promociones (419 líneas)
│   ├── fiscal.ts           # Utilidades fiscales
│   ├── fiscal-worker-client.ts # Cliente del Fiscal Worker
│   ├── offline/            # Soporte offline (IndexedDB)
│   └── ...                 # Utilidades por dominio
├── __tests__/              # Tests de integración
└── types/                  # Definiciones de tipos
```

## Testing

```bash
npm run test          # Ejecutar todos los tests
npm run test:watch    # Modo watch (re-ejecuta al guardar)
```

**79 tests** cubriendo:
- Utilidades de venta (subtotals, weight parsing)
- Validación fiscal (CUIT, DNI, documentos)
- Motor de promociones (combos, cupones)
- Límites de crédito
- Formateo de tickets
- Constantes de pricing
- Utilidades generales

## Base de Datos

Usa Prisma ORM con PostgreSQL (Neon serverless). Ver `prisma/MIGRATIONS.md` para la estrategia de migraciones.

```bash
# Generar cliente
npx prisma generate

# Crear migración (desarrollo)
npx prisma migrate dev --name <nombre>

# Aplicar migraciones (producción)
npx prisma migrate deploy
```

## Deploy

Desplegado en **Vercel** con:
- Cron job diario para procesamiento de pagos a partners
- Sentry para monitoreo de errores
- Fiscal Worker en Cloudflare para facturación

```bash
npm run verify:release  # Verificar antes de deploy
```

## Funcionalidades Principales

- **Caja rápida**: Escáner USB, cámara, productos por peso, variantes, 6 medios de pago
- **Multi-sucursal**: Turnos, empleados, configuración independiente por branch
- **Inventario avanzado**: Lotes, vencimientos (FEFO), capas de costos, valuación
- **Promociones**: Combos, Happy Hour, Zona Roja, cupones con QR
- **Facturación**: Emisión de Factura C via Fiscal Worker, historial, PDF, NC
- **Fiados**: Cuentas corrientes con límites de crédito
- **Estadísticas**: Resumen diario, ventas, turnos, empleados, stock, fiados
- **Partners**: Portal de vendedores con comisiones y pagos
- **PWA**: Instalable, service worker, soporte offline básico
- **Catálogo colaborativo**: Lookup por código de barras, sincronización global
- **Backup/Restore**: Exportación e importación completa del kiosco
- **Keyboard shortcuts**: F1-F11 para operación rápida en caja

## Documentación Interna

- `NEGOCIO-REAL.md` — Checklist para negocio real
- `PRODUCCION.md` — Checklist de producción y smoke tests
- `quehaceclikit.md` — Documentación completa de funcionalidades
- `brechas_mejoras_clikit.md` — Análisis de brechas y mejoras enterprise
- `prisma/MIGRATIONS.md` — Estrategia de migraciones
