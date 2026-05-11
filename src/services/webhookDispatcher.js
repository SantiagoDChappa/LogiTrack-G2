const sequelize = require('../database/connection');
const { QueryTypes } = require('sequelize');
const crypto = require('crypto');

const TIMEOUT_MS = 4000;

const fire = async (event, payload) => {
    let subs = [];
    try {
        subs = await sequelize.query(
            `SELECT id, url, secret FROM logitrack.webhook_subscription
              WHERE enabled=true AND (cardinality(events)=0 OR :event = ANY(events))`,
            { replacements: { event }, type: QueryTypes.SELECT }
        );
    } catch (e) { console.warn('webhook subs query', e.message); return; }

    if (subs.length === 0) { return; }

    const body = JSON.stringify({ event, payload, ts: new Date().toISOString() });

    // Fire-and-forget
    for (const s of subs) {
        const ctrl = new globalThis.AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const headers = { 'Content-Type': 'application/json', 'X-LogiTrack-Event': event };
        if (s.secret) {
            headers['X-LogiTrack-Signature'] = crypto.createHmac('sha256', s.secret).update(body).digest('hex');
        }
        fetch(s.url, { method: 'POST', headers, body, signal: ctrl.signal })
            .catch(err => console.warn('webhook', s.url, 'failed:', err.message))
            .finally(() => clearTimeout(t));
    }
};

module.exports = { fire };
