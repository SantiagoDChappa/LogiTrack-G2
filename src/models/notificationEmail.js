const { DataTypes, Op, where } = require('sequelize');
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
    }
}, {
    tableName: 'notification_email',
    schema: 'logitrack',
    timestamps: false
}
);

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
    )
}

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
}


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
}

module.exports = { NotificationEmail, findPending, markAsSent, scheduleRetry, claimEmailForProcessing };