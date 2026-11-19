# Preparacion comercial de Clikit — auditoria 19/11/2026

## Base de auditoria

- Repositorio: `clikitcomar/clikit`
- Rama auditada: `main`
- Commit: `36b536905f826b1740bb6554635822c7c5111068`
- Deployment principal: proyecto Vercel `clikit`, estado `READY`, asociado a `www.clikit.com.ar`
- Verificacion en produccion: `GET /api/health` respondio HTTP 200 y `{"ok":true}` el 19/11/2026.
- Se creo la rama de trabajo `hardening/readiness-nodo-fiscal`; no se modifica `main` durante esta etapa.

Esta es una auditoria estatica del codigo y configuracion visible, con una comprobacion HTTP de salud. No equivale a una prueba completa de caja, base de datos, ARCA ni hardware.

## Criterio de salida comercial

Clikit se considera listo para un lanzamiento comercial controlado cuando:

1. Existe una copia recuperable de los datos operativos y se probo restaurarla en un entorno aislado.
2. Venta, cobro, devolucion, caja, stock e historial mantienen consistencia ante errores y reintentos.
3. La facturacion electronica se puede configurar y operar con el proveedor seleccionado sin depender accidentalmente del proveedor legado.
4. Los flujos criticos tienen pruebas automatizadas y un smoke test reproducible.
5. Errores y operaciones pendientes pueden ser detectados y resueltos por soporte.
6. Alta, importacion y puesta en marcha se pueden repetir con un comercio real sin asistencia improvisada.

## P0 — Bloqueantes

### P0.1 Backup y recuperacion

Estado observado:
- `GET /api/admin/backup` exporta datos maestros y parte de inventario/configuracion.
- No incluye historial completo de ventas, turnos, gastos, retiros, comprobantes, pagos de fiados, ingresos de mercaderia y otros registros operativos.
- `POST /api/admin/restore` responde 503 intencionalmente. No se debe reactivar el restore anterior.

Trabajo:
- Definir el alcance de un backup completo por comercio y una estrategia de respaldo de base de datos.
- Excluir credenciales, tokens OAuth, contrasenas y secretos; documentar que datos quedan fuera.
- Verificar integridad referencial, versionado, conteos por tabla y checksums.
- Restaurar en una base aislada y comparar conteos, relaciones, archivos y totales.
- Mantener el restore deshabilitado hasta superar las pruebas.

Aceptacion:
- Restauracion de ensayo completa y documentada.
- Comparacion de registros antes/despues sin diferencias inexplicadas.
- Procedimiento de rollback que no requiera intervenir sobre la base productiva.

### P0.2 Devoluciones, anulaciones y caja

Estado observado:
- La ruta de devolucion repone stock, restaura consumos/costos y revierte saldo de fiado.
- La ruta recibe un motivo pero no lo persiste.
- La venta queda marcada como anulada/de vuelta dentro de una transaccion.
- No se encontro un movimiento financiero de devolucion asociado al turno/medio de pago.
- La emision de nota de credito se intenta despues de confirmar la devolucion local. El resultado remoto no queda persistido en la factura.
- El webhook fiscal sale temprano si la factura original ya esta en estado `ISSUED`, por lo que no aplica el resultado de una NC a ese registro.
- No se debe tratar una devolucion local como sinonimo de NC fiscal emitida.

Trabajo:
- Definir estados separados para devolucion comercial y nota de credito fiscal.
- Persistir motivo, usuario, fecha, importes, medio de reintegro, comprobante original y comprobante NC.
- Implementar idempotencia y una cola/outbox durable para operaciones fiscales pendientes.
- Resolver la conciliacion de timeout, rechazo, webhook tardio y reintento.
- Registrar impacto en caja y reportes sin modificar ventas historicas silenciosamente.
- Definir si V1 admite solo devolucion total; bloquear claramente devolucion parcial hasta implementarla.

Aceptacion:
- Cada devolucion tiene trazabilidad comercial y financiera.
- Cada factura emitida que se anula tiene NC confirmada o un estado pendiente/error accionable.
- Repetir la misma solicitud no duplica reposicion, reintegro ni NC.
- Los cierres y reportes concilian ventas menos devoluciones.

### P0.3 Facturacion online — NODO ZAP Fiscal

Estado de Clikit observado:
- Hay un cliente `src/lib/fiscal-worker-client.ts` para `emit`, `void`, consulta de job y estado ARCA.
- La ruta de emision usa el worker solo cuando existen `ZAP_FISCAL_BASE_URL` y `ZAP_FISCAL_API_KEY`; ademas conserva fallback a AfipSDK.
- La configuracion fiscal visible sigue pidiendo/validando `afipAccessToken` de AfipSDK. En consecuencia, el worker aun no es un proveedor independiente configurado de punta a punta.
- El modo de emision invocado desde Clikit usa `sync=true`; el webhook depende de `ZAP_FISCAL_WEBHOOK_SECRET`.
- La llamada actual de NC construye un objeto contributor con CUIT vacio y no persiste el resultado fiscal en la factura.
- La aplicacion limita la V1 a Factura C y Monotributo.
- El cliente define `emitInvoiceDryRun` y `getArcaStatus`, pero no se encontro uso desde la interfaz o rutas; `getJobStatus` solo se utiliza en la ruta de devolucion. No hay reconciliacion periodica de facturas pendientes.
- En el proyecto Vercel de produccion revisado no aparecen configuradas las variables `ZAP_FISCAL_BASE_URL`, `ZAP_FISCAL_API_KEY` ni `ZAP_FISCAL_WEBHOOK_SECRET`. No se ejecuto una emision real.

Acceso pendiente:
- El repositorio del worker NODO ZAP no esta disponible entre los repositorios GitHub accesibles en esta sesion. El plan interno de reemplazo menciona `zap-fiscal-core/fiscal-worker`, pero las brechas especificas del worker deben revalidarse contra su codigo y deployment actuales antes de corregirlas.
- No realizar pruebas contra ARCA PROD hasta disponer de un contribuyente, certificado, punto de venta y autorizacion de prueba explicitamente habilitados.

Trabajo en Clikit:
- Introducir una interfaz `FiscalProvider` y separar el adaptador legado de `ZapFiscalProvider`.
- Permitir onboarding/configuracion worker sin exigir token de AfipSDK.
- Definir y persistir proveedor, entorno, CUIT, punto de venta, job ID, voucher ID, clave de idempotencia, observaciones y respuesta del proveedor.
- Validar firma HMAC, timestamp, identidad del job/venta y procesamiento idempotente de webhooks.
- Agregar reconciliacion por job ID y accion segura para pendientes ambiguos.
- Completar PDF, consulta de comprobante y visualizacion de errores.
- Integrar emision de NC y vinculo con comprobante original.
- Mantener fallback legado solo durante una migracion controlada y con proveedor explicito por comercio.

Pruebas de aceptacion worker (primero TEST):
1. Estado del worker y ARCA.
2. Alta/consulta de contribuyente.
3. Certificado real activo y punto de venta.
4. Dry-run.
5. Factura C sincrona y persistencia de CAE/PDF.
6. Respuesta 202/timeout y reconciliacion.
7. Webhook valido, firma invalida, timestamp vencido y evento duplicado.
8. Consulta de job y comprobante.
9. Reintento idempotente sin duplicar comprobante.
10. Nota de credito, webhook de NC y relacion con la factura original.
11. Rotacion de certificado y separacion TEST/PROD.

No marcar facturacion online como disponible comercialmente hasta completar estas pruebas con el worker realmente desplegado.

### P0.4 Pruebas de release y jornada de comercio

Estado observado:
- Existen pruebas unitarias, pero `src/__tests__/integration.test.ts` contiene mocks y aserciones que no verifican un flujo real de API/DB.
- No se encontro workflow de GitHub Actions en el repositorio.
- `verify:release` ejecuta typecheck y build, no tests ni lint.
- Se agrego `.github/workflows/ci.yml` con PostgreSQL efimero para Prisma validate, tests, lint, typecheck y build. La ejecucion del workflow aun no fue verificada.

Trabajo:
- Crear pruebas de integracion contra PostgreSQL de ensayo para ventas, turnos, fiados, stock, devoluciones e invoices.
- Crear E2E para login, apertura de turno, escaneo/busqueda, venta, cobro, impresion, gastos, retiros, cierre y reportes.
- Ejecutar `typecheck`, `lint`, tests unitarios/integracion y build como gate de release.
- Mantener fixtures sin datos reales y aislar todo efecto fiscal externo.

Aceptacion:
- Pipeline reproducible en cada PR.
- Smoke test documentado antes de cada release.
- Ninguna prueba automatizada emite comprobantes reales.

### P0.5 Operaciones pendientes y soporte

- Hacer visibles las ventas offline que no sincronizan y ofrecer reintento/descarga de diagnostico sin duplicarlas.
- Registrar los eventos criticos de caja, anulaciones, devoluciones, cambios de stock y acciones administrativas.
- Incorporar monitoreo de frontend/backend y alertas para errores fiscales y de sincronizacion.
- Documentar soporte de primer dia y recuperacion ante incidentes.

## P1 — Importante para ampliar rubros

- Vincular `Supplier` con `RestockEvent.supplierId`; hoy los ingresos siguen guardando `supplierName` como texto.
- Completar auditoria de inventario: la API calcula diferencias, pero no aplica ajustes ni persiste una sesion de conteo.
- Crear consulta por empleado/turno para `CartRemoval`; hoy se registra la eliminacion del carrito, pero no se comprobo una vista de auditoria terminada.
- Agregar mermas con impacto en stock, costo y reportes.
- Definir unidades de medida; el stock general y las cantidades de lineas se almacenan como enteros y el peso se representa en gramos.
- Preparar catalogos y onboarding para verduleria, carniceria y ferreteria; validar balanzas y codigos de peso variable antes de prometer compatibilidad.

## P2 — Evolucion

- Integracion con balanzas y etiquetas/codigos de peso variable.
- Ampliacion de tipos fiscales y regimenes cuando el worker y las reglas oficiales esten validados.
- Automatizacion de pagos de partners (el worker de payouts actual esta deshabilitado hasta integrar un proveedor real).
- Panel de soporte multi-comercio y analitica operacional.

## Pruebas operativas minimas

| Flujo | Caso nominal | Caso de error/reintento |
|---|---|---|
| Venta | Efectivo, transferencia/MP, fiado y pesable | doble submit, stock concurrente, timeout |
| Turnos | abrir, transferir, cerrar visible/ciego | empleado anterior intenta operar |
| Inventario | ingreso, correccion, lote y FEFO | producto/variante inexistente |
| Devolucion | reintegro, stock y costo | doble solicitud, factura pendiente/emitida |
| Fiscal | Factura C TEST y PDF | timeout, webhook duplicado/alterado, NC fallida |
| Offline | venta pendiente y sincronizacion | HTTP 4xx/5xx, reconexion, doble sincronizacion |
| Backup | export y restore aislado | backup incompleto/corrupto/version anterior |

## Estado de ejecucion

- [x] Auditoria estatica inicial de Clikit en commit indicado.
- [x] Comprobacion de salud HTTP de produccion.
- [x] Rama aislada de trabajo creada.
- [x] Baseline de migraciones corregido para registrar las cuatro migraciones de esquema al inicializar una base vacia.
- [x] Workflow de CI agregado; ejecucion pendiente de confirmacion.
- [ ] Acceso al repo/contrato vigente de NODO ZAP Fiscal.
- [ ] Backup y restauracion probados en entorno aislado.
- [ ] Devoluciones financieras/fiscales cerradas.
- [ ] Suite automatizada de negocio (el pipeline CI fue agregado, aun sin ejecucion confirmada).
- [ ] Facturacion worker TEST end-to-end aprobada.
- [ ] Piloto comercial con comercio real aprobado.

