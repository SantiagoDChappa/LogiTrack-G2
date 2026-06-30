-- Override ESTÉTICO de la delimitación de un partido en el mapa de zonas.
-- Solo afecta el render del mapa: el costeo y la asignación de zonas siguen usando
-- CP / departamentoIds, no esta geometría. code = id INDEC del partido (departamento).
CREATE TABLE IF NOT EXISTS logitrack.departamento_geom_override (
    code       TEXT        PRIMARY KEY,            -- id INDEC del partido
    geom       JSONB       NOT NULL,               -- GeoJSON geometry editada
    updated_by INTEGER,                            -- usuario que la editó
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
