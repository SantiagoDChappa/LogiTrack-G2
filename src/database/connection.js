const { Sequelize } = require("sequelize");
const { URL } = require("url");

let sequelize;

if (process.env.NODE_ENV === 'test') {
    sequelize = new Sequelize('sqlite::memory:', {
        logging: false,
        define: {
            timestamps: false,
        }
    });
} else {
    const dbUrl = new URL(process.env.DATABASE_URL);
    dbUrl.searchParams.delete("sslmode");

    sequelize = new Sequelize(dbUrl.toString(), {
        dialect: "postgres",
        logging: false,
        define: {
            schema: "logitrack",
            timestamps: false,
        },
        // Pool tuneado para Neon serverless: connections caras (handshake SSL),
        // pero Neon corta tras inactividad. Mantenemos un minimo caliente.
        // max: techo razonable para Render free/starter (1 worker).
        // idle 10s: conexiones se reciclan si no se usan, alineado con Neon.
        // acquire 20s: si pool lleno, espera 20s antes de fallar.
        // evict cada 5s: chequea idle para devolver al pool / cerrar.
        pool: {
            max:     10,
            min:     2,
            idle:    10000,
            acquire: 20000,
            evict:   5000,
        },
        // Reintenta si la conexion fue cerrada por inactividad (Neon).
        retry: { max: 3, match: [/ECONNRESET/, /ETIMEDOUT/, /Connection terminated unexpectedly/] },
        dialectOptions: dbUrl.hostname !== "localhost"
            ? { ssl: { require: true, rejectUnauthorized: false }, keepAlive: true }
            : {},
    });
}

module.exports = sequelize;
