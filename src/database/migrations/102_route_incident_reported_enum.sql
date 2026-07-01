-- Incidente en ruta (RouteIncident) → notificación al supervisor de la sucursal origen.
-- Va en su propia migración (separada de los INSERT) porque Postgres no permite usar un
-- valor de enum recién agregado en la misma transacción/sentencia que el ALTER TYPE.
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'ROUTE_INCIDENT_REPORTED';
