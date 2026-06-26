-- Última Milla — soporte de avisos con franja horaria (ETA) + chat repartidor↔cliente.
-- Idempotente: corre en cada deploy.

-- ── Settings configurables (editables desde Ajustes) ────────────────────────
INSERT INTO logitrack.setting ("key", "value")
SELECT 'eta_proximity_minutes', '4'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.setting WHERE "key" = 'eta_proximity_minutes');

INSERT INTO logitrack.setting ("key", "value")
SELECT 'eta_format', 'range'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.setting WHERE "key" = 'eta_format');

INSERT INTO logitrack.setting ("key", "value")
SELECT 'eta_range_margin_minutes', '20'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.setting WHERE "key" = 'eta_range_margin_minutes');

INSERT INTO logitrack.setting ("key", "value")
SELECT 'eta_avg_speed_kmh', '25'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.setting WHERE "key" = 'eta_avg_speed_kmh');

-- ── route_stop.next_notified: idempotencia del aviso "ya casi llego" ─────────
ALTER TABLE logitrack.route_stop
    ADD COLUMN IF NOT EXISTS "next_notified" BOOLEAN NOT NULL DEFAULT false;

-- ── Mejora de la plantilla SHIPMENT_NEXT_DELIVERY ───────────────────────────
-- Suma la franja horaria calculada ({{etaText}}) y el link al mapa en vivo
-- ({{trackingUrl}}). Sólo si la plantilla por defecto todavía NO fue personalizada
-- (no contiene ya el token {{etaText}}), para no pisar ediciones del usuario.
UPDATE logitrack.email_template
   SET "subject" = 'Tu envío {{trackingCode}} está por llegar',
       "body"    = 'Hola {{fullName}}, el repartidor está cerca: tu envío {{trackingCode}} es la próxima entrega.

{{etaText}}

Seguí al repartidor en el mapa en vivo: {{trackingUrl}}

Saludos,
LogiTrack'
 WHERE "eventCode"::text = 'SHIPMENT_NEXT_DELIVERY'
   AND "body" NOT LIKE '%{{etaText}}%';

-- ── Chat repartidor ↔ cliente (efímero, durante la entrega) ──────────────────
CREATE TABLE IF NOT EXISTS logitrack.delivery_chat (
    "id"            SERIAL      PRIMARY KEY,
    "shipment_id"   INTEGER     NOT NULL,
    "route_stop_id" INTEGER     NULL,
    "status"        VARCHAR(10) NOT NULL DEFAULT 'OPEN',  -- OPEN | CLOSED
    "opened_at"     TIMESTAMP   NOT NULL DEFAULT NOW(),
    "closed_at"     TIMESTAMP   NULL,
    CONSTRAINT "fk_dchat_shipment" FOREIGN KEY ("shipment_id")
        REFERENCES logitrack."shipment" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_dchat_shipment" ON logitrack.delivery_chat ("shipment_id");

CREATE TABLE IF NOT EXISTS logitrack.delivery_chat_message (
    "id"          SERIAL      PRIMARY KEY,
    "chat_id"     INTEGER     NOT NULL,
    "sender_role" VARCHAR(10) NOT NULL,                  -- DRIVER | CLIENT
    "body"        TEXT        NOT NULL,
    "created_at"  TIMESTAMP   NOT NULL DEFAULT NOW(),
    "read_at"     TIMESTAMP   NULL,
    CONSTRAINT "fk_dmsg_chat" FOREIGN KEY ("chat_id")
        REFERENCES logitrack.delivery_chat ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_dmsg_chat_created" ON logitrack.delivery_chat_message ("chat_id", "created_at");
