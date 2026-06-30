// Traductor de reportes a lenguaje natural.
//
// Cada reporte arma sus números (en su controller) y los pasa por la función de narración
// correspondiente. La salida es un objeto { headline, bullets[], tone } que la vista pinta con
// el partial `partials/report-narrative.ejs`. Objetivo: que cualquiera entienda los números sin
// leer la tabla — "facturaste $X, cobraste el 78%, la sucursal Centro fue la que más vendió".
//
// Es 100% determinista (sin IA): mismas entradas → mismo texto. No hace queries; sólo formatea
// lo que el controller ya calculó.

const money = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const moneyExact = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('es-AR');
const pct = (n) => `${Math.round(Number(n || 0))}%`;
const plural = (n, sing, plur) => (Number(n) === 1 ? sing : (plur || sing + 's'));
// "De cada $100 …, $X": vuelve un porcentaje algo más fácil de imaginar en plata.
const per100 = (part, whole) => (Number(whole) > 0 ? Math.round((Number(part) / Number(whole)) * 100) : 0);

// Texto del rango de fechas para anclar cada resumen.
function rangeLabel(filters = {}) {
    const { from, to } = filters;
    if (from && to) { return `entre el ${from} y el ${to}`; }
    if (from) { return `desde el ${from}`; }
    if (to) { return `hasta el ${to}`; }
    return 'en todo el período';
}

// Compara dos valores y devuelve una frase de variación ("12% más que…").
function deltaPhrase(curr, prev, { unitMoney = true } = {}) {
    if (prev == null || prev === 0) { return null; }
    const diff = curr - prev;
    const p = Math.round((diff / prev) * 100);
    if (p === 0) { return 'igual que el período anterior'; }
    const dir = p > 0 ? 'más' : 'menos';
    const amt = unitMoney ? money(Math.abs(diff)) : num(Math.abs(diff));
    return `${Math.abs(p)}% ${dir} que el período anterior (${amt})`;
}

// ── Ingresos por período ───────────────────────────────────────────────────────
function incomeByPeriod(data) {
    const { totals = {}, prevTotal, filters, granularityLabel = 'período' } = data;
    const bullets = [];
    bullets.push(`Emitiste ${num(totals.count)} ${plural(totals.count, 'factura')} por un total de ${money(totals.total)}.`);
    if (totals.count > 0) {
        bullets.push(`El ticket promedio fue de ${money(totals.avgTicket)} por factura.`);
        bullets.push('El ticket promedio es lo que pagó, en promedio, cada cliente en una factura.');
    }
    const d = deltaPhrase(totals.total, prevTotal);
    if (d) {
        bullets.push(`La facturación fue ${d}.`);
        bullets.push(d.startsWith('igual')
            ? 'O sea: vendiste casi lo mismo que antes.'
            : (totals.total >= (prevTotal || 0) ? 'O sea: este período vendiste más que el anterior.' : 'O sea: este período vendiste menos que el anterior.'));
    }
    if (data.topPeriod) {
        bullets.push(`El ${granularityLabel} más fuerte fue ${data.topPeriod.label} con ${money(data.topPeriod.total)}.`);
        if (totals.total > 0) {
            bullets.push(`Ese solo ${granularityLabel} juntó ${pct((data.topPeriod.total / totals.total) * 100)} de todo lo que facturaste.`);
        }
    }
    return {
        headline: `Facturaste ${money(totals.total)} ${rangeLabel(filters)}.`,
        tone: 'info',
        bullets,
    };
}

// ── Ingresos por concepto ──────────────────────────────────────────────────────
function incomeByConcept(data) {
    const { concepts = [], total = 0, filters } = data;
    const bullets = [];
    bullets.push('Un concepto es cada cosa que cobrás por separado: el envío, el seguro, un recargo, etc.');
    const top = concepts[0];
    if (top) {
        bullets.push(`Lo que más aporta es "${top.label}": ${money(top.total)} (${pct(top.pct)} del total).`);
        bullets.push(`Dicho fácil: de cada $100 que entran, $${per100(top.total, total)} vienen de "${top.label}".`);
    }
    const top3 = concepts.slice(0, 3).map(c => c.label).join(', ');
    if (top3) { bullets.push(`Los tres conceptos principales son: ${top3}.`); }
    const iva = concepts.find(c => c.key === 'iva');
    if (iva) {
        bullets.push(`Del total, ${money(iva.total)} corresponden a IVA (impuesto, no es ingreso propio).`);
        bullets.push('El IVA lo cobrás al cliente pero se lo tenés que pagar al Estado: no te lo quedás vos.');
    }
    return {
        headline: `Tus ingresos de ${money(total)} ${rangeLabel(filters)} se reparten en ${concepts.length} ${plural(concepts.length, 'concepto')}.`,
        tone: 'info',
        bullets,
    };
}

// ── Cobranzas / morosidad (aging) ──────────────────────────────────────────────
function receivablesAging(data) {
    const { buckets = [], totalPending = 0, oldestDays = 0, filters } = data;
    const bullets = [];
    bullets.push('Cada tramo agrupa las facturas según hace cuánto tiempo deberían estar pagas.');
    const overdue = buckets.filter(b => b.minDays >= 8).reduce((a, b) => a + b.total, 0);
    if (totalPending > 0) {
        bullets.push(`De lo pendiente, ${money(overdue)} (${pct((overdue / totalPending) * 100)}) lleva más de una semana sin cobrarse.`);
        bullets.push(`Dicho fácil: de cada $100 que te deben, $${per100(overdue, totalPending)} ya están atrasados.`);
    }
    const worst = [...buckets].filter(b => b.total > 0).sort((a, b) => b.minDays - a.minDays)[0];
    if (worst) { bullets.push(`El tramo más viejo (${worst.label}) suma ${money(worst.total)} en ${num(worst.count)} ${plural(worst.count, 'factura')}.`); }
    if (oldestDays > 0) { bullets.push(`La factura impaga más antigua tiene ${num(oldestDays)} ${plural(oldestDays, 'día')} de atraso.`); }
    bullets.push('Cuanto más vieja la deuda, más difícil de cobrar: empezá por los tramos de mayor antigüedad.');
    return {
        headline: totalPending > 0
            ? `Te deben ${money(totalPending)} en facturas sin pagar.`
            : '¡Al día! No hay facturas pendientes de cobro en este rango.',
        tone: totalPending > 0 ? 'warn' : 'good',
        bullets: totalPending > 0 ? bullets : [],
    };
}

// ── Gastos + resultado neto ────────────────────────────────────────────────────
function expensesResult(data) {
    const { income = 0, totalExpenses = 0, creditNotes = 0, net = 0, byCategory = [], filters } = data;
    const bullets = [];
    bullets.push('El resultado es lo que te queda después de restar gastos y devoluciones a lo que facturaste.');
    bullets.push(`Ingresos facturados: ${money(income)}.`);
    if (creditNotes > 0) { bullets.push(`Notas de crédito (plata que devolviste): −${money(creditNotes)}.`); }
    bullets.push(`Gastos cargados: −${money(totalExpenses)}.`);
    const top = byCategory[0];
    if (top) {
        bullets.push(`El mayor gasto fue "${top.category}" con ${money(top.total)}.`);
        if (totalExpenses > 0) { bullets.push(`Ese rubro se llevó ${pct((top.total / totalExpenses) * 100)} de todos los gastos.`); }
    }
    bullets.push(net >= 0
        ? `Resultado: ganancia de ${money(net)}.`
        : `Resultado: pérdida de ${money(Math.abs(net))} — los gastos superan a los ingresos.`);
    if (income > 0 && net >= 0) {
        bullets.push(`Dicho fácil: de cada $100 facturados, te quedaron $${per100(net, income)} limpios.`);
    } else if (income > 0 && net < 0) {
        bullets.push(`Dicho fácil: por cada $100 facturados, gastaste $${per100(totalExpenses + creditNotes, income)}.`);
    }
    return {
        headline: net >= 0
            ? `Cerrás ${rangeLabel(filters)} con ${money(net)} a favor.`
            : `Cerrás ${rangeLabel(filters)} con ${money(Math.abs(net))} en rojo.`,
        tone: net >= 0 ? 'good' : 'warn',
        bullets,
    };
}

// ── Reportes operativos existentes ─────────────────────────────────────────────
// Narradores para los reportes que ya existían. Reciben el mismo viewModel que cada controller
// pasa a la vista; leen sus campos reales (dateFrom/dateTo, totalShipments, summary, etc.) de
// forma defensiva. Devuelven null si el reporte trajo error (la vista no pinta la caja).
function rangeFromDates(d = {}) {
    return rangeLabel({ from: d.dateFrom, to: d.dateTo });
}

function shipmentsByPeriod(data) {
    if (data.error) { return null; }
    const total = Number(data.totalShipments || 0);
    const bullets = [];
    const top = (data.statusTotals || []).filter(s => Number(s.total) > 0)
        .sort((a, b) => Number(b.total) - Number(a.total))[0];
    if (top) {
        bullets.push(`El estado más común fue "${top.status_label}" con ${num(top.total)} ${plural(top.total, 'envío')}.`);
        if (total > 0) { bullets.push(`O sea: ${pct((top.total / total) * 100)} de los envíos están en ese estado.`); }
    }
    bullets.push('Un envío es cada paquete que entró al sistema para repartir en este período.');
    return {
        headline: `Se generaron ${num(total)} ${plural(total, 'envío')} ${rangeFromDates(data)}.`,
        tone: 'info', bullets,
    };
}

function onTimeDeliveries(data) {
    if (data.error) { return null; }
    const s = data.summary || {};
    const onTimePct = Number(data.pctOnTime || 0);
    const bullets = [];
    bullets.push('"A tiempo" quiere decir que el paquete llegó en la fecha prometida o antes.');
    if (s.total != null) {
        bullets.push(`Sobre ${num(s.total)} ${plural(s.total, 'entrega')}, ${num(s.on_time || 0)} llegaron a tiempo y ${num(s.late || 0)} con demora.`);
        if (Number(s.total) > 0) { bullets.push(`Dicho fácil: de cada 10 entregas, ${Math.round((onTimePct / 100) * 10)} llegaron a horario.`); }
    }
    bullets.push(onTimePct >= 90
        ? 'Nivel de cumplimiento alto: la mayoría llega cuando se promete.'
        : onTimePct >= 70
            ? 'Cumplimiento aceptable, pero hay margen para reducir demoras.'
            : 'Cumplimiento bajo: demasiadas entregas llegan tarde, conviene revisar la operación.');
    return {
        headline: `El ${pct(onTimePct)} de las entregas llegó a tiempo ${rangeFromDates(data)}.`,
        tone: onTimePct >= 90 ? 'good' : onTimePct >= 70 ? 'info' : 'warn',
        bullets,
    };
}

function satisfaction(data) {
    if (data.error) { return null; }
    const nps = Number(data.npsVal || 0);
    const responses = Number(data.kpis?.totalSurveys || 0);
    const bullets = [];
    if (responses) { bullets.push(`Se basa en ${num(responses)} ${plural(responses, 'respuesta')} de clientes.`); }
    bullets.push('El NPS mide si te recomendarían: va de −100 (todos hablan mal) a 100 (todos te recomiendan).');
    bullets.push(nps >= 50 ? 'Los clientes están muy conformes (NPS alto).'
        : nps >= 0 ? 'Hay más clientes contentos que disconformes, pero se puede mejorar.'
            : 'Predominan los clientes insatisfechos: atención a las quejas.');
    return {
        headline: responses === 0
            ? `Sin respuestas de satisfacción ${rangeFromDates(data)}.`
            : `El índice de satisfacción (NPS) es ${num(nps)}.`,
        tone: responses === 0 ? 'info' : (nps >= 50 ? 'good' : nps >= 0 ? 'info' : 'warn'),
        bullets: responses === 0 ? [] : bullets,
    };
}

function incidentsByPeriod(data) {
    if (data.error) { return null; }
    const total = Number(data.totalIncidents || 0);
    const bullets = [];
    if (total > 0) { bullets.push('Una incidencia es cualquier problema en una entrega: paquete roto, dirección mal, cliente ausente, etc.'); }
    const top = (data.rows || []).filter(r => Number(r.total) > 0)
        .sort((a, b) => Number(b.total) - Number(a.total))[0];
    if (top) {
        bullets.push(`El problema más frecuente fue "${top.incident_type}" (${num(top.total)} ${plural(top.total, 'caso')}).`);
        if (total > 0) { bullets.push(`Eso es ${pct((top.total / total) * 100)} de todos los problemas: si lo resolvés, bajás bastante el total.`); }
    }
    return {
        headline: total === 0
            ? `Sin incidencias registradas ${rangeFromDates(data)}. ¡Buena señal!`
            : `Se registraron ${num(total)} ${plural(total, 'incidencia')} ${rangeFromDates(data)}.`,
        tone: total === 0 ? 'good' : 'warn',
        bullets,
    };
}

function billingPanel(data) {
    const t = data.totals || {};
    const bullets = [];
    bullets.push(`Cobraste ${money(t.cobrado)} de ${money(t.facturado)} facturados (${pct(t.pctCobrado)}).`);
    bullets.push('Facturar es lo que emitiste; cobrar es la plata que de verdad entró: no siempre coinciden.');
    if (Number(t.facturado) > 0) { bullets.push(`Dicho fácil: de cada $100 facturados, ya cobraste $${per100(t.cobrado, t.facturado)}.`); }
    if (t.pendiente > 0) { bullets.push(`Quedan ${money(t.pendiente)} pendientes de cobro.`); }
    const top = (data.rows || []).filter(r => r.facturado > 0)[0];
    if (top) { bullets.push(`La sucursal que más facturó fue ${top.branchName} con ${money(top.facturado)}.`); }
    return {
        headline: `Facturaste ${money(t.facturado)} y cobraste el ${pct(t.pctCobrado)}.`,
        tone: Number(t.pctCobrado) >= 80 ? 'good' : 'info',
        bullets,
    };
}

function deliveryPerformance(data) {
    if (data.error || !data.summary) {
        return data.error ? null : {
            headline: `Sin entregas con fecha comprometida ${rangeFromDates(data)}.`,
            tone: 'info', bullets: [],
        };
    }
    const s = data.summary;
    const onTimePct = s.total > 0 ? Math.round((s.on_time / s.total) * 100) : 0;
    const bullets = [];
    bullets.push(`Sobre ${num(s.total)} ${plural(s.total, 'entrega')}, ${num(s.on_time || 0)} a tiempo y ${num(s.late || 0)} con demora.`);
    if (Number(s.total) > 0) { bullets.push(`Dicho fácil: de cada 10 entregas, ${Math.round((onTimePct / 100) * 10)} llegaron a horario.`); }
    const top = (data.rows || []).filter(r => Number(r.delivered) > 0)
        .sort((a, b) => Number(b.success_pct) - Number(a.success_pct))[0];
    if (top) {
        bullets.push(`El mejor repartidor fue ${top.full_name} con ${pct(top.success_pct)} de efectividad.`);
        bullets.push('Efectividad es cuántas de las entregas que tomó terminó dejando bien.');
    }
    return {
        headline: `El equipo entregó a tiempo el ${pct(onTimePct)} ${rangeFromDates(data)}.`,
        tone: onTimePct >= 90 ? 'good' : onTimePct >= 70 ? 'info' : 'warn',
        bullets,
    };
}

function usersReport(data) {
    const rows = data.rows || [];
    const total = rows.length;
    const active = rows.filter(u => u.active).length;
    const bullets = [];
    bullets.push(`${num(active)} ${plural(active, 'activo')} y ${num(total - active)} ${plural(total - active, 'inactivo')}.`);
    bullets.push('Activo es quien puede entrar a usar el sistema; inactivo es quien está dado de baja.');
    const topRole = Object.entries(rows.reduce((m, u) => { m[u.roleLabel] = (m[u.roleLabel] || 0) + 1; return m; }, {}))
        .sort((a, b) => b[1] - a[1])[0];
    if (topRole) {
        bullets.push(`El rol más frecuente es "${topRole[0]}" (${num(topRole[1])} ${plural(topRole[1], 'usuario')}).`);
        bullets.push('El rol marca qué puede hacer cada persona dentro del sistema.');
    }
    const mostActive = [...rows].sort((a, b) => (b.loginCount || 0) - (a.loginCount || 0))[0];
    if (mostActive && mostActive.loginCount > 0) { bullets.push(`El que más ingresó fue ${mostActive.fullName} (${num(mostActive.loginCount)} ${plural(mostActive.loginCount, 'ingreso')}).`); }
    return {
        headline: `Hay ${num(total)} ${plural(total, 'usuario')} en el sistema.`,
        tone: 'info', bullets,
    };
}

function invoiceCenter(data) {
    const rows = data.rows || [];
    const live = rows.filter(r => r.payStatus !== 'ANULADA');
    const total = live.reduce((a, r) => a + Number(r.amount || 0), 0);
    const paid = rows.filter(r => r.payStatus === 'PAGADA');
    const paidAmt = paid.reduce((a, r) => a + Number(r.amount || 0), 0);
    const bullets = [];
    bullets.push(`${num(rows.length)} ${plural(rows.length, 'factura')} en total; ${num(paid.length)} ya ${plural(paid.length, 'pagada')} (${money(paidAmt)}).`);
    if (total > 0) { bullets.push(`Dicho fácil: de cada $100 facturados, $${per100(paidAmt, total)} ya están cobrados.`); }
    const pendingAmt = total - paidAmt;
    if (pendingAmt > 0) { bullets.push(`Quedan ${money(pendingAmt)} por cobrar.`); }
    const anuladas = rows.length - live.length;
    if (anuladas > 0) { bullets.push(`Hay ${num(anuladas)} ${plural(anuladas, 'factura')} anulada${anuladas === 1 ? '' : 's'} (no cuentan en el total).`); }
    return {
        headline: `Facturación de ${money(total)} ${rangeLabel(data.filters)}.`,
        tone: 'info', bullets,
    };
}

function creditNoteCenter(data) {
    const rows = data.rows || [];
    const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
    const bullets = [];
    if (rows.length > 0) {
        const porInc = rows.filter(r => r.motivo === 'Incidencia').length;
        const porDev = rows.filter(r => r.motivo === 'Devolución').length;
        bullets.push(`${num(porInc)} por incidencias y ${num(porDev)} por devoluciones.`);
        bullets.push('Las notas de crédito son plata que devolvés: vigilá que no crezcan.');
    }
    return {
        headline: rows.length === 0
            ? `Sin notas de crédito ${rangeLabel(data.filters)}. ¡Sin reembolsos!`
            : `Emitiste ${num(rows.length)} ${plural(rows.length, 'nota')} de crédito por ${money(total)}.`,
        tone: rows.length === 0 ? 'good' : 'warn',
        bullets,
    };
}

module.exports = {
    // helpers expuestos por si una vista los necesita
    money, moneyExact, num, pct,
    // finanzas (nuevos)
    incomeByPeriod,
    incomeByConcept,
    receivablesAging,
    expensesResult,
    // operativos (existentes)
    shipmentsByPeriod,
    onTimeDeliveries,
    satisfaction,
    incidentsByPeriod,
    billingPanel,
    deliveryPerformance,
    usersReport,
    invoiceCenter,
    creditNoteCenter,
};
