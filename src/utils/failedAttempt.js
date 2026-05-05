const getSuggestedDate = (reason) => {
    const today = new Date();
    
    const businessDaysMap = {
        'ausente':              1,
        'domicilio incorrecto': 2,
        'rechazo':              3,
        'zona inaccesible':     2,
        'otro':                 1,
    };

    const daysToAdd = businessDaysMap[reason.toLowerCase()] || 1;
    return addBusinessDays(today, daysToAdd);
};

const addBusinessDays = (date, days) => {
    const result = new Date(date);
    let added = 0;

    while (added < days) {
        result.setDate(result.getDate() + 1);
        const day = result.getDay();
        if (day !== 0 && day !== 6) { // 0 = domingo, 6 = sábado
            added++;
        }
    }

    return result.toISOString().split('T')[0]; // formato YYYY-MM-DD
};

module.exports = { getSuggestedDate };