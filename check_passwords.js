const bcrypt = require('bcryptjs');

const hashes = {
    'Santiago/Carlos/Maria/Pedro': '$2b$12$GiN3kS0fdJMsjJSymc6HAuNYtIOmjMLf/QieEw2Y4dwxKstQWC5Oa',
    'Amin supervisor':             '$2b$12$eqMriItP1Z9X7kKZL9iHyurmsTwsYX8OBGSvibhvM6eGfZlgFK/za',
    'Juan supervisor':             '$2b$12$A4eIs04S45G3LAenyjt8h.Etu57ieZpjHdD.P3WSdmnLWeO4rNxnK',
    'Juan Operador':               '$2b$12$0FghDPRkMXlET7XfKvRNXOORzwmo0qP7OJ.becrlMtDmUtuP4Uv82',
    'Amin Operador':               '$2b$12$Y2tw4Fb5Vu3hB2x6boSVCulGoYLRDAcjhpviVgBNxatfcQnVz72wS',
    'Flores supervisor':           '$2b$12$QeMel/akGF9KTkQXqnXtWeP4.TyyNeUJdcW6gChg.5iu7kK7O2JUG',
    'Rubi Rose operador':          '$2b$12$zPvoebtpukk2aNU276GJXOLDtgOk2IBeG6eMhlDnRm.eJnO7PQL92',
    'Admin':                       '$2b$12$SdXTpizzNqadaUlooEyCXu7n9AybN/4kXHFznyAQwHhC04vpk3sUi',
};

const candidates = [
    'Password123@', 'password123', 'admin123', 'logitrack', 'Logitrack1@',
    'Test1234@', 'Santiago123', 'santiago', 'chappa', '12345678', 'password',
    'Admin123@', 'admin', '123456789', '123456', 'logitrack123', 'Logitrack123',
    'LogiTrack1@', 'Amin123@', 'Juan123@', 'amin123', 'juan123',
];

async function check() {
    for (const [user, hash] of Object.entries(hashes)) {
        let found = false;
        for (const p of candidates) {
            const ok = await bcrypt.compare(p, hash);
            if (ok) { console.log(`${user} => "${p}"`); found = true; break; }
        }
        if (!found) console.log(`${user} => [no match in candidates]`);
    }
}
check();
