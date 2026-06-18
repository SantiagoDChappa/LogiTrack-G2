const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');
const { EmailQueueStatus } = require('../constants/enums');

const NotificationEmail = sequelize.define('NotificationEmail', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    recipient: {
        type: DataTypes.STRING,
        allowNull: false
    },
    subject: {
        type: DataTypes.STRING,
        allowNull: false
    },
    body: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    format: {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: 'text'
    },
    status: {
        type: DataTypes.ENUM(...Object.values(EmailQueueStatus)),
        allowNull: false,
    },
    attempts: {
        type: DataTypes.INTEGER
    },
    nextRetryAt: {
        type: DataTypes.DATE
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: new Date()
    },
    lastError: {
        type: DataTypes.STRING
    },
    sentAt: {
        type: DataTypes.DATE
    },
    provider: {
        type: DataTypes.STRING(20)
    }
}, {
    tableName: 'notification_email',
    schema: 'logitrack',
    timestamps: false
}
);

// Log de intentos de envío (uno por cada try de cada proveedor).
const NotificationEmailAttempt = sequelize.define('NotificationEmailAttempt', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    emailId:     { type: DataTypes.INTEGER, allowNull: false },
    provider:    { type: DataTypes.STRING(20) },
    success:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    error:       { type: DataTypes.TEXT },
    attemptedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
    tableName: 'notification_email_attempt',
    schema: 'logitrack',
    timestamps: false,
});

NotificationEmail.hasMany(NotificationEmailAttempt, { as: 'attemptLog', foreignKey: 'emailId' });
NotificationEmailAttempt.belongsTo(NotificationEmail, { as: 'email', foreignKey: 'emailId' });

// Registra una fila por cada intento de envío (lo llama el processor).
const logAttempt = ({ emailId, provider, success, error }) =>
    NotificationEmailAttempt.create({
        emailId,
        provider: provider || null,
        success: !!success,
        error: error ? String(error).slice(0, 1000) : null,
        attemptedAt: new Date(),
    });

// Marca como enviado registrando además el proveedor ganador.
const markAsSentWithProvider = (id, provider) =>
    NotificationEmail.update(
        { status: 'SENT', sentAt: new Date(), lastError: null, provider: provider || null },
        { where: { id, status: 'PROCESSING' } }
    );

// Orden del listado según la columna elegida en la bandeja. Las fechas de envío
// (sentAt) van con NULLS LAST: los no enviados quedan al final, no arriba.
const LIST_ORDERS = {
    created_desc: [['createdAt', 'DESC']],
    created_asc:  [['createdAt', 'ASC']],
    sent_desc:    [[sequelize.literal('"NotificationEmail"."sentAt" DESC NULLS LAST')]],
    sent_asc:     [[sequelize.literal('"NotificationEmail"."sentAt" ASC NULLS LAST')]],
};

// Listado para la vista "Fallidas" con filtros opcionales por estado / búsqueda
// y orden configurable (por fecha de creación o de envío, asc/desc).
const listForAdmin = async ({ status, q, sort, limit = 200 } = {}) => {
    const where = {};
    if (status && ['PENDING', 'PROCESSING', 'SENT', 'FAILED'].includes(status)) {
        where.status = status;
    }
    if (q) {
        where[Op.or] = [
            { recipient: { [Op.iLike]: `%${q}%` } },
            { subject:   { [Op.iLike]: `%${q}%` } },
        ];
    }
    const baseOrder = LIST_ORDERS[sort] || LIST_ORDERS.created_desc;
    return NotificationEmail.findAll({
        where,
        include: [{ model: NotificationEmailAttempt, as: 'attemptLog', required: false }],
        order: [...baseOrder, [{ model: NotificationEmailAttempt, as: 'attemptLog' }, 'attemptedAt', 'ASC']],
        limit,
        subQuery: false,
    });
};

// Trae una fila por id (la usa el envío individual desde la bandeja).
const findById = (id) => NotificationEmail.findByPk(id);

// Reabre un mail para reenvío manual: lo pone PENDING, limpia el backoff y reinicia
// el contador de intentos, de modo que processOneEmail pueda reclamarlo sin importar
// su estado previo (FAILED/SENT) y no caiga en FAILED al instante por intentos viejos.
const resetToPending = (id) =>
    NotificationEmail.update(
        { status: 'PENDING', nextRetryAt: null, attempts: 0 },
        { where: { id } }
    );

// Conteos por estado para los KPIs de la cabecera de la vista.
const countsByStatus = async () => {
    const rows = await NotificationEmail.findAll({
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
        group: ['status'],
        raw: true,
    });
    const out = { PENDING: 0, PROCESSING: 0, SENT: 0, FAILED: 0 };
    for (const r of rows) { out[r.status] = Number(r.n) || 0; }
    return out;
};

const findPending = async () => {
    return NotificationEmail.findAll({
        where: {
            status: 'PENDING',
            [Op.or]: [
                {
                    nextRetryAt: null
                },
                {
                    nextRetryAt: {
                        [Op.lte]: new Date()
                    }
                }
            ]
        },
        order: [['createdAt', 'ASC']]
    });
};

const markAsSent = async (id) => {
    return NotificationEmail.update(
        {
            status: 'SENT',
            sentAt: new Date(),
            lastError: null
        }, {
        where: {
            id,
            status: 'PROCESSING'
        }
    }
    );
};

const claimEmailForProcessing = async (id) => {
    const [updatedRows] = await NotificationEmail.update(
        {
            status: 'PROCESSING'
        },
        {
            where: {
                id,
                status: 'PENDING'
            }
        }
    );
    return updatedRows === 1;
};


const scheduleRetry = async (id, currentAttempts, errorMessaje) => {
    const attempts = currentAttempts + 1;

    if (attempts >= 5) {//esto puede ser en el futuro una variable configurable
        return NotificationEmail.update(
            {
                status: 'FAILED',
                attempts,
                lastError: errorMessaje
            }, {
            where: { id }
        }
        );
    };

    return NotificationEmail.update(
        {
            status: 'PENDING',
            attempts,
            lastError: errorMessaje,
            nextRetryAt: calculateNextRetry(attempts)
        }, {
        where: {
            id,
            status: 'PROCESSING'
        }
    }
    );
};

const calculateNextRetry = (attempts) => {
    const delays = {
        1: 5 * 60 * 1000,          // 5 min
        2: 15 * 60 * 1000,         // 15 min
        3: 60 * 60 * 1000,         // 1 hora
        4: 6 * 60 * 60 * 1000      // 6 horas
    };
    const delay = delays[attempts] || 24 * 60 * 60 * 1000;

    return new Date(Date.now() + delay);
};

module.exports = {
    NotificationEmail, NotificationEmailAttempt,
    findPending, markAsSent, scheduleRetry, claimEmailForProcessing,
    logAttempt, markAsSentWithProvider, listForAdmin, countsByStatus,
    findById, resetToPending,
};