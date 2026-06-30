-- Gastos operativos (carga manual). El sistema sólo modelaba ingresos (facturación); esta
-- tabla permite registrar egresos reales (combustible, sueldos, alquiler, etc.) para armar
-- el reporte de resultado neto (ingresos − notas de crédito − gastos).
-- Idempotente: corre en cada deploy.
CREATE TABLE IF NOT EXISTS logitrack.expense (
    "id"                 SERIAL        PRIMARY KEY,
    "category"           VARCHAR(40)   NOT NULL,
    "description"        VARCHAR(200)  NULL,
    "amount"             DECIMAL(12,2) NOT NULL DEFAULT 0,
    "incurred_on"        DATE          NOT NULL DEFAULT CURRENT_DATE,
    "branch_id"          INTEGER       NULL,
    "created_by_user_id" INTEGER       NULL,
    "created_at"         TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_expense_incurred" ON logitrack.expense ("incurred_on");
CREATE INDEX IF NOT EXISTS "idx_expense_branch"   ON logitrack.expense ("branch_id");
