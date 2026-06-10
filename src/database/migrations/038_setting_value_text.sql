-- El logo institucional pasa a guardarse en la base (base64) en vez de en disco,
-- porque el filesystem de Render es efímero y el archivo se pierde en cada deploy.
-- Para alojar el base64 (hasta ~2.7 MB) la columna value debe ser TEXT, no VARCHAR(255).

ALTER TABLE logitrack.setting ALTER COLUMN value TYPE TEXT;
