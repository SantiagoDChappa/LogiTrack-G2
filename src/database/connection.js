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
        dialectOptions: dbUrl.hostname !== "localhost"
            ? { ssl: { require: true, rejectUnauthorized: false } }
            : {},
    });
}

module.exports = sequelize;
