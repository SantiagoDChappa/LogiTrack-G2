const { Sequelize } = require("sequelize");
const { URL } = require("url");

const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.searchParams.delete("sslmode");

const sequelize = new Sequelize(dbUrl.toString(), {
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

module.exports = sequelize;
