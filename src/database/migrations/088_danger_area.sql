-- Zonas peligrosas / no llegables. Aditivo y NO rompe el costeo existente:
-- mientras la tabla esté vacía y el % global sea 0, el costo es idéntico al actual.
--
-- Una marca puede ser:
--   scope='POLYGON' -> área dibujada a mano (geom = GeoJSON Polygon/MultiPolygon)
--   scope='PARTIDO' -> partido completo (geom = su polígono IGN; code = id INDEC)
--   scope='CP'      -> por prefijo de código postal (code = prefijo; geom NULL)
-- La validación del destino se hace por LAT/LONG (point-in-polygon sobre geom) y,
-- como respaldo, por prefijo de CP.
CREATE TABLE IF NOT EXISTS logitrack.danger_area (
    id          SERIAL PRIMARY KEY,
    scope       TEXT        NOT NULL DEFAULT 'POLYGON',   -- 'CP' | 'PARTIDO' | 'POLYGON'
    code        TEXT,                                     -- prefijo CP o id INDEC partido
    name        TEXT        NOT NULL,
    reachable   BOOLEAN     NOT NULL DEFAULT TRUE,        -- false = destino no operable
    geom        JSONB,                                    -- GeoJSON geometry (Polygon/MultiPolygon)
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- % de recargo global para destinos peligrosos (llegables). 0 = sin recargo.
INSERT INTO logitrack.setting (key, value)
VALUES ('recargo_zona_peligrosa_pct', '0')
ON CONFLICT (key) DO NOTHING;
