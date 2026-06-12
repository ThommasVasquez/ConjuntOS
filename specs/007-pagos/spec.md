# 007 — Pagos & recibos públicos

Status: **implemented+tested** (M4) — pagos list + pagar (simulated). admin/stats wired to real data. Test passing.

> IMPLEMENTED (M4) — `backend/api/src/domains/pagos/` + `domains/admin_stats.rs`.

## Purpose
Administration fees + utility bills. Replaces `/api/user/pagos` (GET, PUT simulate-pay)
and `/api/admin/stats`. `/api/user/pagos/seed` DROPPED.

## Surface (implemented)
- `GET /api/v1/pagos` → `{ pagos: [...latest 24], recibos: [...latest 12] }` for the
  caller's unidad. Users without a unidad get `{ pagos: [], recibos: [] }` (no mock
  fallback — Law 4).
  - PagoDto: `{ id, unidadId, concepto, monto (string), estado, metodo, fechaVencimiento,
    fechaPago, comprobante, createdAt }`.
  - ReciboDto: `{ id, unidadId, servicio, empresa, periodo, monto (string), vencimiento,
    urlRecibo, pagado, fechaPago, createdAt }`.
- `PUT /api/v1/pagos/{id}/pagar` body `{ metodo: PSE|TARJETA|NEQUI|DAVIPLATA|EFECTIVO }` →
  simulated payment (legacy parity): sets estado `PAGADO`, `fechaPago = now()`, metodo.
  Only the pago's own `usuarioId` (and conjunto) can pay it → 404 otherwise.
- `GET /api/v1/admin/stats` (guard::require_admin) →
  `{ recaudoMes: string, reservasPendientes: number }` where recaudoMes = SUM(monto) of
  PAGADO pagos with `fechaPago` in the current UTC month, conjunto-scoped.

## Notes
- Money NUMERIC(14,2) → BigDecimal → JSON string (Law 6).
- Wompi out of scope; `wompi_ref` carried over.
- Recibo "pagar" (legacy type=RECIBO branch) not exposed: utility bills are
  informational in v1.
- Legacy ultra-shield mock fallbacks DROPPED — real errors (Law 4).
