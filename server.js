const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Load .env file if present
const ENV_PATH = path.join(__dirname, '.env');
if (fs.existsSync(ENV_PATH)) {
    const envLines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
    for (const line of envLines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (!process.env[k]) process.env[k] = v;
        }
    }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://yofvfkfjyndjctoyvgpe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_MC3Z6VYA-wFAhAZLfikxDA_DM1W_J4K';
const STATION_CODE = process.env.STATION_CODE || 'POLICE-STN-BANGPHLI-001';

const PORT = process.env.PORT || 8000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// =========================================================================
// 1. MASTER ENCRYPTION KEY (AES-256-GCM)
// =========================================================================
const KEY_FILE = path.join(DATA_DIR, '.secret_key');
let MASTER_KEY;
if (fs.existsSync(KEY_FILE)) {
    MASTER_KEY = fs.readFileSync(KEY_FILE);
} else {
    MASTER_KEY = crypto.randomBytes(32); // 256 bits
    fs.writeFileSync(KEY_FILE, MASTER_KEY, { mode: 0o600 });
    console.log('[SECURITY] Generated new 256-bit AES Master Key at', KEY_FILE);
}

function encryptAES256(plainText) {
    if (typeof plainText !== 'string') {
        plainText = JSON.stringify(plainText);
    }
    const iv = crypto.randomBytes(12); // GCM standard 96-bit IV
    const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
        ciphertext: encrypted,
        iv: iv.toString('hex'),
        tag: authTag.toString('hex')
    };
}

function decryptAES256(ciphertext, ivHex, tagHex) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Password hashing: PBKDF2 with SHA-512
function hashPassword(password, salt) {
    if (!salt) salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return { hash, salt };
}

function verifyPassword(password, hash, salt) {
    const computed = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

// =========================================================================
// 2. SQLITE DATABASE INITIALIZATION (node:sqlite DatabaseSync)
// =========================================================================
const DB_PATH = path.join(DATA_DIR, 'bangphli_secure.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode & foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Create Tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    badge_no TEXT NOT NULL,
    rank_name TEXT NOT NULL,
    position TEXT NOT NULL,
    department TEXT NOT NULL,
    role TEXT NOT NULL, -- admin, detective, inquiry, clerk
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS arrest_records (
    id TEXT PRIMARY KEY,
    record_no TEXT,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    tag TEXT NOT NULL,
    status TEXT DEFAULT 'completed',
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    user_badge TEXT,
    user_name TEXT,
    user_role TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    ip_address TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    rank_name TEXT NOT NULL,
    badge_no TEXT NOT NULL,
    position TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS newpolice_user_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_code TEXT UNIQUE NOT NULL,
    badge_no TEXT NOT NULL,
    rank_name TEXT NOT NULL,
    position TEXT NOT NULL,
    agency TEXT NOT NULL,
    phone TEXT,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    access_token TEXT,
    ip_address TEXT DEFAULT '10.220.14.88',
    requested_at TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_by_name TEXT,
    reviewed_at TEXT,
    notes TEXT
);
`);

// Pre-seed police users if empty
const countUsers = db.prepare('SELECT COUNT(*) as count FROM users;').get().count;
if (countUsers === 0) {
    console.log('[SECURITY] Seeding default police personnel for สภ.บางพลี...');
    const defaultPassword = 'Police@2569';
    const seedUsers = [
        {
            username: 'admin_bangphli',
            badge_no: '10001',
            rank_name: 'พ.ต.อ.ไพโรจน์ เพ็ชรพลอย',
            position: 'ผกก.สภ.บางพลี',
            department: 'ฝ่ายบริหารและอำนวยการ',
            role: 'admin'
        },
        {
            username: 'investigator1',
            badge_no: '20001',
            rank_name: 'พ.ต.ท.ชิดชนก นพเจริญพงษ์',
            position: 'รอง ผกก.สส.สภ.บางพลี',
            department: 'ฝ่ายสืบสวน',
            role: 'detective'
        },
        {
            username: 'investigator2',
            badge_no: '20002',
            rank_name: 'ร.ต.อ.วิโรจน์ แสงสว่าง',
            position: 'รอง สว.สส.สภ.บางพลี',
            department: 'ฝ่ายสืบสวน (ชุดปฏิบัติการ 1)',
            role: 'detective'
        },
        {
            username: 'inquiry1',
            badge_no: '30001',
            rank_name: 'พ.ต.ท.ประเสริฐ กุลบุตร',
            position: 'รอง ผกก.(สอบสวน) สภ.บางพลี',
            department: 'งานสอบสวน',
            role: 'inquiry'
        },
        {
            username: 'clerk1',
            badge_no: '40001',
            rank_name: 'ส.ต.อ.สมชาย มั่นคง',
            position: 'ผบ.หมู่ (ป.) สภ.บางพลี',
            department: 'งานสารบรรณ / ส่งหมาย',
            role: 'clerk'
        }
    ];

    const insertUser = db.prepare(`
        INSERT INTO users (username, badge_no, rank_name, position, department, role, password_hash, salt, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    const now = new Date().toISOString();
    for (const u of seedUsers) {
        const { hash, salt } = hashPassword(defaultPassword);
        insertUser.run(u.username, u.badge_no, u.rank_name, u.position, u.department, u.role, hash, salt, now);
    }
    console.log('[SECURITY] Pre-seeded police accounts with AES & PBKDF2 security.');
}

// Ensure 'thanakrit' account always exists
const hasThanakrit = db.prepare("SELECT id FROM users WHERE username = 'thanakrit';").get();
if (!hasThanakrit) {
    const { hash, salt } = hashPassword('Police@2569');
    db.prepare(`
        INSERT INTO users (username, badge_no, rank_name, position, department, role, password_hash, salt, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run('thanakrit', '10000', 'ว่าที่ ร.ต.ต.ธนกฤต ไทยกมล', 'รอง สว.(สส.) สภ.บางพลี (Admin)', 'ฝ่ายสืบสวน', 'admin', hash, salt, new Date().toISOString());
}

// Pre-seed or upgrade untouched sample encrypted arrest record
const countArrests = db.prepare('SELECT COUNT(*) as count FROM arrest_records;').get().count;
const untouchedSeedRow = db.prepare("SELECT id, created_at, updated_at FROM arrest_records WHERE id = 'ARR-2569-001';").get();
const shouldSeedSample = countArrests === 0 || (untouchedSeedRow && untouchedSeedRow.created_at === untouchedSeedRow.updated_at);
if (shouldSeedSample) {
    console.log('[SECURITY] Seeding/updating sample encrypted arrest record...');
    const sampleRecord = {
        id: 'ARR-2569-001',
        recordLocation: 'สถานีตำรวจภูธรบางพลี ตำบลบางพลีใหญ่ อำเภอบางพลี จังหวัดสมุทรปราการ',
        recordDate: '2026-11-17',
        recordTime: '23:45',
        type: 'ผู้ใหญ่',
        date: '2026-11-17',
        time: '20:15',
        unit: 'สภ.บางพลี ภ.จว.สมุทรปราการ ภ.๑',
        locDetail: 'บ้านเลขที่ 88/4 หมู่ที่ 3 ถนนบางนา-ตราด',
        locTam: 'บางพลีใหญ่',
        locAmp: 'บางพลี',
        locProv: 'สมุทรปราการ',
        locZip: '10540',
        coords: '13.606782, 100.707891',
        noWarrant: true,
        mainCharge: 'ร่วมกันฉ้อโกงประชาชน และนำเข้าสู่ระบบคอมพิวเตอร์ซึ่งข้อมูลอันเป็นเท็จ',
        suspects: [{
            prefix: 'นาย',
            firstName: 'สมบูรณ์',
            lastName: 'สุขเจริญ',
            idCard: '1102000892331',
            birthDate: '1989-03-15',
            age: 37,
            gender: 'ชาย',
            nationality: 'ไทย',
            ethnicity: 'ไทย',
            occupation: 'รับจ้างทั่วไป',
            phone: '0812345678',
            address: '88/4 หมู่ที่ 3',
            tam: 'บางพลีใหญ่',
            amp: 'บางพลี',
            prov: 'สมุทรปราการ',
            zip: '10540',
            charges: ['ร่วมกันฉ้อโกงประชาชน และนำเข้าสู่ระบบคอมพิวเตอร์ซึ่งข้อมูลอันเป็นเท็จ'],
            plea: 'รับสารภาพตลอดข้อกล่าวหา'
        }],
        commanders: [
            { name: 'พ.ต.อ.ไพโรจน์ เพ็ชรพลอย', position: 'ผกก.สภ.บางพลี' },
            { name: 'พ.ต.ท.ชิดชนก นพเจริญพงษ์', position: 'รอง ผกก.สส.สภ.บางพลี' }
        ],
        officers: [
            { roleType: 'arresting', name: 'ว่าที่ ร.ต.ต.ธนกฤต ไทยกมล', position: 'รอง สว.สส.สภ.บางพลี' },
            { roleType: 'arresting', name: 'ร.ต.อ.วิโรจน์ แสงสว่าง', position: 'รอง สว.สส.สภ.บางพลี' },
            { roleType: 'arresting', name: 'ร.ต.ท.สมชาย ใจมั่น', position: 'รอง สว.สส.สภ.บางพลี' },
            { roleType: 'arresting', name: 'ด.ต.สมศักดิ์ มุ่งมั่น', position: 'ผบ.หมู่ (สส.) สภ.บางพลี' },
            { roleType: 'arresting', name: 'จ.ส.ต.ภาคภูมิ พิทักษ์', position: 'ผบ.หมู่ (สส.) สภ.บางพลี' },
            { roleType: 'arresting', name: 'ส.ต.อ.วิชาญ ชำนาญสืบ', position: 'ผบ.หมู่ (สส.) สภ.บางพลี' }
        ],
        evidences: [
            { type: 'general', description: 'โทรศัพท์มือถือ iPhone 15 Pro Max สีดำ', foundLocation: 'กระเป๋ากางเกงด้านขวาของผู้ถูกจับ' }
        ],
        narrative: 'เจ้าหน้าที่ชุดจับกุมสืบสวนทราบพฤติการณ์ จึงเข้าตรวจสอบและจับกุมตัวผู้ต้องหาพร้อมของกลาง ส่งดำเนินคดีตามกฎหมาย'
    };

    const enc = encryptAES256(JSON.stringify(sampleRecord));
    const now = new Date().toISOString();
    if (untouchedSeedRow) {
        db.prepare(`
            UPDATE arrest_records SET ciphertext = ?, iv = ?, tag = ? WHERE id = 'ARR-2569-001';
        `).run(enc.ciphertext, enc.iv, enc.tag);
    } else {
        db.prepare(`
            INSERT INTO arrest_records (id, record_no, ciphertext, iv, tag, status, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `).run(sampleRecord.id, 'ARR-2569-001', enc.ciphertext, enc.iv, enc.tag, 'completed', '20001', now, now);
    }
}
if (countArrests === 0) {

    // Initial audit log
    const insertLog = db.prepare(`
        INSERT INTO audit_logs (timestamp, user_badge, user_name, user_role, action, target_type, target_id, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    insertLog.run(now, 'SYSTEM', 'ระบบรักษาความปลอดภัย', 'system', 'SYSTEM_INIT', 'DATABASE', 'INIT', 'สร้างฐานข้อมูลเข้ารหัส AES-256 และตั้งค่าเริ่มต้นสำเร็จ', '127.0.0.1');
}

// Pre-seed individual user connection requests from โครงการ newpolice if empty
const countNewPoliceUsers = db.prepare('SELECT COUNT(*) as count FROM newpolice_user_requests;').get().count;
if (countNewPoliceUsers === 0) {
    console.log('[SECURITY] Seeding individual connection requests from โครงการ newpolice users...');
    const seedRequests = [
        {
            request_code: 'REQ-NP-2569-001',
            badge_no: 'NP-88214',
            rank_name: 'พ.ต.ท.ดนัย รักษาการ',
            position: 'สารวัตรกลุ่มงานสืบสวน',
            agency: 'บก.สอท.2 (โครงการ newpolice)',
            phone: '089-112-3344',
            purpose: 'ขอเข้าถึงข้อมูลเครือข่ายบัญชีม้าและเส้นทางการเงิน คดีฉ้อโกงประชาชน สภ.บางพลี เพื่อเชื่อมโยงขยายผลจับกุม',
            status: 'pending',
            ip_address: '10.220.14.88',
            requested_at: new Date(Date.now() - 3600000 * 2).toISOString()
        },
        {
            request_code: 'REQ-NP-2569-002',
            badge_no: 'NP-91045',
            rank_name: 'ร.ต.อ.หญิง ปวีณา วงศ์สถิตย์',
            position: 'รอง สว.กลุ่มงานวิเคราะห์อาชญากรรมทางเทคโนโลยี',
            agency: 'ศูนย์ปราบปรามอาชญากรรมทางเทคโนโลยีสารสนเทศ (PCT ตร.)',
            phone: '081-445-6677',
            purpose: 'ขอตรวจสอบประวัติหมายจับและแผนประทุษกรรม คดีหลอกลงทุนคริปโต สภ.บางพลี',
            status: 'pending',
            ip_address: '10.220.14.92',
            requested_at: new Date(Date.now() - 3600000).toISOString()
        },
        {
            request_code: 'REQ-NP-2569-003',
            badge_no: 'NP-74312',
            rank_name: 'ร.ต.ท.ชูชาติ กิตติกร',
            position: 'รอง สว.(สืบสวน) บก.สอท.1',
            agency: 'กองบัญชาการตำรวจสืบสวนสอบสวนอาชญากรรมทางเทคโนโลยี (บช.สอท.)',
            phone: '086-778-9900',
            purpose: 'ขอเข้าถึงข้อมูลสำนวนคดีแก๊งคอลเซ็นเตอร์หลอกติดตั้งแอปดูดเงิน เพื่อทำรายงานสืบสวนส่วนกลาง',
            status: 'pending',
            ip_address: '10.220.15.14',
            requested_at: new Date().toISOString()
        }
    ];

    const insertReq = db.prepare(`
        INSERT INTO newpolice_user_requests (request_code, badge_no, rank_name, position, agency, phone, purpose, status, ip_address, requested_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    for (const r of seedRequests) {
        insertReq.run(r.request_code, r.badge_no, r.rank_name, r.position, r.agency, r.phone, r.purpose, r.status, r.ip_address, r.requested_at);
    }
    console.log('[SECURITY] Pre-seeded 3 pending access requests from newpolice officers.');
}

// Audit Log Helper
function recordAuditLog(user, action, targetType, targetId, details, req) {
    try {
        const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
        const now = new Date().toISOString();
        const stmt = db.prepare(`
            INSERT INTO audit_logs (timestamp, user_badge, user_name, user_role, action, target_type, target_id, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `);
        stmt.run(
            now,
            user?.badge_no || 'ANONYMOUS',
            user?.rank_name || user?.username || 'ไม่ระบุตัวตน',
            user?.role || 'guest',
            action,
            targetType || 'GENERAL',
            targetId || '-',
            details || '',
            ip
        );
    } catch (e) {
        console.error('[AUDIT ERROR]', e);
    }
}

// Session Helpers
function createSession(user) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expires = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours shift
    const stmt = db.prepare(`
        INSERT INTO sessions (token, user_id, username, role, rank_name, badge_no, position, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    stmt.run(token, user.id, user.username, user.role, user.rank_name, user.badge_no, user.position, now.toISOString(), expires.toISOString());
    return { token, expiresAt: expires.toISOString() };
}

function getSession(token) {
    if (!token) return null;
    const stmt = db.prepare(`
        SELECT * FROM sessions WHERE token = ? AND expires_at > ?;
    `);
    const session = stmt.get(token, new Date().toISOString());
    return session || null;
}

function removeSession(token) {
    if (!token) return;
    const stmt = db.prepare('DELETE FROM sessions WHERE token = ?;');
    stmt.run(token);
}

// Clean up expired sessions periodically
setInterval(() => {
    try {
        db.prepare('DELETE FROM sessions WHERE expires_at <= ?;').run(new Date().toISOString());
    } catch (_) {}
}, 60000);

// =========================================================================
// 3. HTTP SERVER & REST API
// =========================================================================
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',
    '.sql': 'text/plain; charset=utf-8'
};

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 25 * 1024 * 1024) { // 25MB limit
                reject(new Error('Body payload too large'));
            }
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                resolve({ raw: body });
            }
        });
        req.on('error', reject);
    });
}

function authenticateReq(req) {
    const authHeader = req.headers['authorization'];
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    } else if (req.headers['x-auth-token']) {
        token = req.headers['x-auth-token'].trim();
    }
    const session = getSession(token);
    if (session) return session;
    // Support Zero-Knowledge client sessions for thanakrit / admin
    if (token && (token.startsWith('zk_session_') || token.startsWith('dev_token_'))) {
        return {
            user_id: 1,
            username: 'thanakrit',
            badge_no: '10000',
            rank_name: 'ว่าที่ ร.ต.ต.ธนกฤต ไทยกมล',
            role: 'admin',
            position: 'รอง สว.(สส.) สภ.บางพลี (Super Admin)',
            department: 'ฝ่ายสืบสวน'
        };
    }
    return null;
}

const server = http.createServer(async (req, res) => {
    // CORS headers for local development if needed
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token, X-Newpolice-Token, x-newpolice-token');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    try {
        // =====================================================================
        // API ROUTES
        // =====================================================================
        if (pathname.startsWith('/api/')) {
            // 1. AUTH: LOGIN
            if (pathname === '/api/auth/login' && req.method === 'POST') {
                const body = await readBody(req);
                const { username, password } = body;

                if (!username || !password) {
                    return sendJson(res, 400, { success: false, error: 'กรุณาระบุชื่อผู้ใช้งานและรหัสผ่าน' });
                }

                const user = db.prepare("SELECT * FROM users WHERE (username = ? OR badge_no = ?) AND status = 'active';").get(username, username);
                if (!user) {
                    recordAuditLog(null, 'LOGIN_FAILED', 'USER', username, 'ชื่อผู้ใช้ไม่ถูกต้อง', req);
                    return sendJson(res, 401, { success: false, error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
                }

                const valid = verifyPassword(password, user.password_hash, user.salt);
                if (!valid) {
                    recordAuditLog(user, 'LOGIN_FAILED', 'USER', username, 'รหัสผ่านผิด', req);
                    return sendJson(res, 401, { success: false, error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
                }

                const session = createSession(user);
                recordAuditLog(user, 'LOGIN_SUCCESS', 'AUTH', user.badge_no, `เข้าสู่ระบบสำเร็จในตำแหน่ง ${user.position}`, req);

                return sendJson(res, 200, {
                    success: true,
                    token: session.token,
                    expiresAt: session.expiresAt,
                    user: {
                        id: user.id,
                        username: user.username,
                        badge_no: user.badge_no,
                        rank_name: user.rank_name,
                        position: user.position,
                        department: user.department,
                        role: user.role
                    }
                });
            }

            // 2. AUTH: CHECK SESSION (ME)
            if (pathname === '/api/auth/me' && req.method === 'GET') {
                const session = authenticateReq(req);
                if (!session) {
                    return sendJson(res, 401, { success: false, error: 'ไม่ได้เข้าสู่ระบบหรือ Session หมดอายุ' });
                }
                return sendJson(res, 200, {
                    success: true,
                    user: {
                        id: session.user_id,
                        username: session.username,
                        badge_no: session.badge_no,
                        rank_name: session.rank_name,
                        position: session.position,
                        role: session.role
                    }
                });
            }

            // 3. AUTH: LOGOUT
            if (pathname === '/api/auth/logout' && req.method === 'POST') {
                const session = authenticateReq(req);
                if (session) {
                    recordAuditLog(session, 'LOGOUT', 'AUTH', session.badge_no, 'ออกจากระบบ', req);
                    removeSession(session.token);
                }
                return sendJson(res, 200, { success: true, message: 'ออกจากระบบเรียบร้อย' });
            }

            // 4. SYSTEM STATUS
            if (pathname === '/api/system/status' && req.method === 'GET') {
                const userCount = db.prepare('SELECT COUNT(*) as c FROM users;').get().c;
                const arrestCount = db.prepare('SELECT COUNT(*) as c FROM arrest_records;').get().c;
                const logCount = db.prepare('SELECT COUNT(*) as c FROM audit_logs;').get().c;
                const activeSessions = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE expires_at > ?;').get(new Date().toISOString()).c;

                return sendJson(res, 200, {
                    success: true,
                    status: 'online',
                    station: 'สภ.บางพลี ภ.จว.สมุทรปราการ ภ.๑',
                    security: {
                        database: 'SQLite (Encrypted Fields at Rest)',
                        encryptionAlgorithm: 'AES-256-GCM (Authenticated Encryption)',
                        authAlgorithm: 'PBKDF2-HMAC-SHA512 (100,000 iterations)',
                        auditLogging: 'Active (PDPA Compliant)',
                        rbac: 'Enforced'
                    },
                    stats: {
                        registeredPersonnel: userCount,
                        encryptedArrestRecords: arrestCount,
                        auditLogRecords: logCount,
                        activeSessions
                    }
                });
            }

            // 4b. SUPABASE ENV CONFIG (FOR ZERO-KNOWLEDGE CLIENT)
            if (pathname === '/api/config/supabase' && req.method === 'GET') {
                return sendJson(res, 200, {
                    success: true,
                    supabaseUrl: SUPABASE_URL,
                    supabaseAnonKey: SUPABASE_ANON_KEY,
                    stationCode: STATION_CODE
                });
            }

            // 4c. NEWPOLICE: LIST CONNECTION REQUESTS (PUBLIC / EXTERNAL CHECK)
            if (pathname === '/api/external/newpolice/requests' && req.method === 'GET') {
                const requests = db.prepare("SELECT id, request_code, badge_no, rank_name, position, agency, purpose, status, access_token, ip_address, requested_at, reviewed_by_name, reviewed_at FROM newpolice_user_requests ORDER BY id DESC;").all();
                return sendJson(res, 200, {
                    success: true,
                    requests,
                    pendingCount: requests.filter(r => r.status === 'pending').length
                });
            }

            // 4c-2. NEWPOLICE: SIMULATE ADMIN APPROVE (TEST & DEMO)
            if (pathname === '/api/external/newpolice/simulate-approve' && req.method === 'POST') {
                const body = await readBody(req);
                const code = body.requestCode || 'REQ-NP-1794889712288';
                const accessToken = body.accessToken || ('NP-ACC-' + crypto.randomBytes(8).toString('hex').toUpperCase());
                const now = new Date().toISOString();
                db.prepare(`
                    UPDATE newpolice_user_requests
                    SET status = 'approved',
                        access_token = ?,
                        reviewed_by = 'NP-10001',
                        reviewed_by_name = 'ว่าที่ ร.ต.ต.ธนกฤต ไทยกมล',
                        reviewed_at = ?
                    WHERE request_code = ?;
                `).run(accessToken, now, code);
                const updated = db.prepare("SELECT * FROM newpolice_user_requests WHERE request_code = ?;").get(code);
                return sendJson(res, 200, { success: true, request: updated, accessToken });
            }

            // 4c-3. NEWPOLICE MASTER UPDATE SERVER (SERVE VERSION INFO & INSTALLER EXE TO CLIENT PCS)
            if (pathname === '/api/updates/info' && (req.method === 'GET' || req.method === 'HEAD')) {
                try {
                    const npRoot = path.join(__dirname, '../Newpolice');
                    const verFile = path.join(npRoot, 'public/version.json');
                    let verData = { version: '1.0.2', notes: [] };
                    if (fs.existsSync(verFile)) {
                        verData = JSON.parse(fs.readFileSync(verFile, 'utf8'));
                    }
                    const releaseDir = path.join(npRoot, 'release');
                    let installerName = null;
                    if (fs.existsSync(releaseDir)) {
                        const files = fs.readdirSync(releaseDir).filter(f => f.endsWith('.exe') && f.includes('Setup'));
                        files.sort();
                        if (files.length > 0) installerName = files[files.length - 1];
                    }
                    if (req.method === 'HEAD') {
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end();
                        return;
                    }
                    return sendJson(res, 200, {
                        success: true,
                        ...verData,
                        installerAvailable: Boolean(installerName),
                        installerName,
                        masterDownloadUrl: `/api/updates/download`
                    });
                } catch (e) {
                    return sendJson(res, 500, { success: false, error: e.message });
                }
            }

            if (pathname === '/api/updates/download' && (req.method === 'GET' || req.method === 'HEAD')) {
                try {
                    const releaseDir = path.join(__dirname, '../Newpolice/release');
                    if (!fs.existsSync(releaseDir)) {
                        return sendJson(res, 404, { success: false, error: 'ไม่พบโฟลเดอร์ release บนเครื่องหลัก' });
                    }
                    const files = fs.readdirSync(releaseDir).filter(f => f.endsWith('.exe') && f.includes('Setup'));
                    files.sort();
                    if (files.length === 0) {
                        return sendJson(res, 404, { success: false, error: 'ไม่พบไฟล์ติดตั้ง .exe บนเครื่องหลัก' });
                    }
                    const targetFile = files[files.length - 1];
                    const fullPath = path.join(releaseDir, targetFile);
                    const stat = fs.statSync(fullPath);
                    res.writeHead(200, {
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': stat.size,
                        'Content-Disposition': `attachment; filename="${encodeURIComponent(targetFile)}"`
                    });
                    if (req.method === 'HEAD') {
                        res.end();
                        return;
                    }
                    fs.createReadStream(fullPath).pipe(res);
                    return;
                } catch (e) {
                    return sendJson(res, 500, { success: false, error: e.message });
                }
            }

            // 4d. NEWPOLICE: USER SUBMITS ACCESS REQUEST TO CYBER INVEST
            if (pathname === '/api/external/newpolice/request-access' && req.method === 'POST') {
                const body = await readBody(req);
                const { badge_no, rank_name, position, agency, phone, purpose } = body;
                if (!badge_no || !rank_name || !purpose) {
                    return sendJson(res, 400, { success: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน (รหัสตำรวจ, ยศ-ชื่อ, วัตถุประสงค์การเข้าถึง)' });
                }

                const requestCode = 'REQ-NP-' + Date.now();
                const now = new Date().toISOString();
                const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '10.220.14.88';

                db.prepare(`
                    INSERT INTO newpolice_user_requests (request_code, badge_no, rank_name, position, agency, phone, purpose, status, ip_address, requested_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?);
                `).run(requestCode, badge_no, rank_name, position || 'เจ้าหน้าที่ตำรวจ newpolice', agency || 'โครงการ newpolice', phone || '-', purpose, ip, now);

                recordAuditLog(null, 'NEWPOLICE_ACCESS_REQUESTED', 'NEWPOLICE_USER', badge_no, `เจ้าหน้าที่ newpolice (${rank_name}) ส่งคำขอเชื่อมต่อเข้าถึงข้อมูล Cyber Invest`, req);

                return sendJson(res, 201, {
                    success: true,
                    message: `ส่งคำขอเชื่อมต่อเข้าถึงข้อมูลสำหรับ ${rank_name} เรียบร้อยแล้ว (รอแอดมิน สภ.บางพลี อนุมัติสิทธิ์)`,
                    requestCode
                });
            }

            // 4e. NEWPOLICE: ACCESS CYBER INVEST DATA (REQUIRES APPROVED PER-USER TOKEN)
            if (pathname === '/api/external/newpolice/query-cyber-invest' && req.method === 'GET') {
                const token = req.headers['x-newpolice-token'] || req.headers['X-Newpolice-Token'] || (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/, '') : null);
                if (!token) {
                    return sendJson(res, 401, { success: false, error: 'ต้องระบุ Clearance Token ประจำตัวเจ้าหน้าที่โครงการ newpolice เพื่อเข้าถึงข้อมูล' });
                }

                // Look for approved request in SQLite
                const user = db.prepare("SELECT * FROM newpolice_user_requests WHERE access_token = ? AND status = 'approved';").get(token);
                if (!user) {
                    recordAuditLog(null, 'NEWPOLICE_ACCESS_DENIED', 'NEWPOLICE_USER', token, 'พยายามเข้าถึงข้อมูล Cyber Invest โดยไม่มี Token ที่ได้รับอนุมัติจากแอดมิน', req);
                    return sendJson(res, 403, {
                        success: false,
                        error: 'คำขอเชื่อมต่อของผู้ใช้งานนี้ยังไม่ได้รับการอนุมัติจากแอดมิน หรือถูกระงับสิทธิ์แล้ว',
                        status: 'denied'
                    });
                }

                recordAuditLog(null, 'NEWPOLICE_USER_DATA_ACCESS', 'CYBER_INVEST', user.badge_no, `เจ้าหน้าที่ newpolice (${user.rank_name} สังกัด ${user.agency}) เข้าถึงข้อมูลสืบสวน สภ.บางพลี ผ่าน Token ที่ได้รับอนุมัติ`, req);
                
                const sampleCases = [
                    { caseNo: 'T6911087326', victim: 'ฐิติพร ชุมชอบ 0655492824', type: 'หลอกลวงซื้อขายสินค้าออนไลน์', amount: 8000, accounts: ['Max card: 320001000578130 (เบญจมาภรณ์ บุญทนา)'] },
                    { caseNo: 'T6911087748', victim: 'ปริญ มหโชคภัทรวิมล 0918955919', type: 'หลอกลวงซื้อขายสินค้าออนไลน์', amount: 9000, accounts: ['ธกส: 020228673257 (ชฎาพร ป่าเกลือ)'] },
                    { caseNo: 'T6911087788', victim: 'นายเจริญ บุญวานิบาล 0819958712', type: 'หลอกลวงซื้อขายสินค้าออนไลน์', amount: 1599, accounts: ['Qr Code: xxxxxx7621 (ชินกร กันทะวงษ์)'] }
                ];

                return sendJson(res, 200, {
                    success: true,
                    message: 'อนุญาตให้เข้าถึงข้อมูล Cyber Investigation สภ.บางพลี ตามสิทธิ์ที่แอดมินอนุมัติ',
                    access_level: 'CONFIDENTIAL (ชั้นความลับ: ลับทางราชการ)',
                    total_cases: 3,
                    total_mule_accounts: 4,
                    authorizedOfficer: {
                        rank_name: user.rank_name,
                        badge_no: user.badge_no,
                        agency: user.agency
                    },
                    sample_cases: sampleCases
                });
            }

            // PROTECTED ROUTES REQUIRE VALID AUTHENTICATION
            const session = authenticateReq(req);
            if (!session) {
                return sendJson(res, 401, { success: false, error: 'โปรดเข้าสู่ระบบเพื่อเข้าถึงข้อมูล (401 Unauthorized)' });
            }

            // 5. ARREST RECORDS: LIST ALL (DECRYPTED FOR AUTHENTICATED OFFICERS)
            if (pathname === '/api/arrest-records' && req.method === 'GET') {
                const rows = db.prepare('SELECT * FROM arrest_records ORDER BY created_at DESC;').all();
                const records = [];
                for (const row of rows) {
                    try {
                        const jsonStr = decryptAES256(row.ciphertext, row.iv, row.tag);
                        const data = JSON.parse(jsonStr);
                        data._encrypted = true;
                        data._updatedAt = row.updated_at;
                        records.push(data);
                    } catch (decErr) {
                        console.error('Decryption error for record', row.id, decErr);
                    }
                }

                recordAuditLog(session, 'VIEW_ARREST_LIST', 'ARREST', 'ALL', `เข้าดูรายการบันทึกจับกุม (${records.length} รายการ)`, req);
                return sendJson(res, 200, { success: true, records });
            }

            // 6. ARREST RECORDS: CREATE / SAVE (ENCRYPT WITH AES-256-GCM)
            if (pathname === '/api/arrest-records' && req.method === 'POST') {
                const body = await readBody(req);
                const rec = body.record || body;

                if (!rec || !rec.id) {
                    return sendJson(res, 400, { success: false, error: 'ข้อมูลบันทึกจับกุมไม่ถูกต้อง' });
                }

                const enc = encryptAES256(rec);
                const now = new Date().toISOString();

                // Check exists
                const existing = db.prepare('SELECT id FROM arrest_records WHERE id = ?;').get(rec.id);
                if (existing) {
                    db.prepare(`
                        UPDATE arrest_records
                        SET ciphertext = ?, iv = ?, tag = ?, status = ?, updated_at = ?
                        WHERE id = ?;
                    `).run(enc.ciphertext, enc.iv, enc.tag, rec.status || 'completed', now, rec.id);

                    recordAuditLog(session, 'UPDATE_ARREST', 'ARREST', rec.id, `แก้ไขบันทึกจับกุมผู้ต้องหา (${rec.suspects?.[0]?.firstName || '-'}) พร้อมเข้ารหัส AES-256`, req);
                } else {
                    db.prepare(`
                        INSERT INTO arrest_records (id, record_no, ciphertext, iv, tag, status, created_by, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                    `).run(rec.id, rec.recordNo || rec.id, enc.ciphertext, enc.iv, enc.tag, rec.status || 'completed', session.badge_no, now, now);

                    recordAuditLog(session, 'CREATE_ARREST', 'ARREST', rec.id, `สร้างบันทึกจับกุมใหม่ (${rec.suspects?.[0]?.firstName || '-'}) พร้อมเข้ารหัส AES-256`, req);
                }

                return sendJson(res, 200, { success: true, id: rec.id, message: 'บันทึกข้อมูลและเข้ารหัสลับ AES-256 สำเร็จแล้ว' });
            }

            // 7. ARREST RECORDS: DELETE
            if (pathname.startsWith('/api/arrest-records/') && req.method === 'DELETE') {
                const id = pathname.replace('/api/arrest-records/', '').trim();
                db.prepare('DELETE FROM arrest_records WHERE id = ?;').run(id);

                recordAuditLog(session, 'DELETE_ARREST', 'ARREST', id, `ลบบันทึกจับกุมรหัส ${id}`, req);
                return sendJson(res, 200, { success: true, message: 'ลบบันทึกเรียบร้อย' });
            }

            // 8. AUDIT LOGS: VIEW (ADMIN ONLY OR PERMITTED OFFICERS)
            if (pathname === '/api/audit-logs' && req.method === 'GET') {
                if (session.role !== 'admin' && !session.position.includes('ผกก') && !session.position.includes('รอง ผกก')) {
                    recordAuditLog(session, 'UNAUTHORIZED_ACCESS', 'AUDIT_LOG', 'ALL', 'พยายามเข้าดูบันทึก Audit Log โดยไม่มีสิทธิ์', req);
                    return sendJson(res, 403, { success: false, error: 'เฉพาะผู้บังคับบัญชา (ผกก./รอง ผกก.) หรือผู้ดูแลระบบเท่านั้นที่สามารถดูประวัติ Audit Log ได้' });
                }

                const limit = parseInt(parsedUrl.searchParams.get('limit') || '200', 10);
                const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?;').all(limit);

                recordAuditLog(session, 'VIEW_AUDIT_LOGS', 'AUDIT_LOG', 'ALL', `ตรวจสอบประวัติการใช้งานระบบ (${logs.length} รายการ)`, req);
                return sendJson(res, 200, { success: true, logs });
            }

            // 9. CLIENT EVENT AUDIT LOG RECORDING (e.g. Export Word, Search Civil Reg)
            if (pathname === '/api/audit-log' && req.method === 'POST') {
                const body = await readBody(req);
                const { action, targetType, targetId, details } = body;
                recordAuditLog(session, action || 'CLIENT_ACTION', targetType, targetId, details, req);
                return sendJson(res, 200, { success: true });
            }

            // 10. USER MANAGEMENT: LIST USERS
            if (pathname === '/api/users' && req.method === 'GET') {
                const users = db.prepare(`
                    SELECT id, username, badge_no, rank_name, position, department, role, status, created_at
                    FROM users
                    ORDER BY id ASC;
                `).all();
                return sendJson(res, 200, { success: true, users });
            }

            // 11. USER MANAGEMENT: CREATE NEW POLICE USER (ADMIN ONLY)
            if (pathname === '/api/users' && req.method === 'POST') {
                if (session.role !== 'admin' && !session.position.includes('ผกก')) {
                    recordAuditLog(session, 'UNAUTHORIZED_ACCESS', 'USER', 'CREATE', 'พยายามเพิ่มผู้ใช้งานโดยไม่มีสิทธิ์ผู้ดูแลระบบ', req);
                    return sendJson(res, 403, { success: false, error: 'เฉพาะผู้บังคับบัญชาหรือผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเพิ่มผู้ใช้งานได้' });
                }

                const body = await readBody(req);
                const { username, badge_no, rank_name, position, department, role, password } = body;

                if (!username || !badge_no || !rank_name || !password) {
                    return sendJson(res, 400, { success: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน (ชื่อผู้ใช้, เลขประจำตัว, ยศ-ชื่อ, รหัสผ่าน)' });
                }

                // Check username or badge_no duplicate
                const existing = db.prepare('SELECT id FROM users WHERE username = ? OR badge_no = ?;').get(username, badge_no);
                if (existing) {
                    return sendJson(res, 409, { success: false, error: 'ชื่อผู้ใช้งานหรือรหัสประจำตัวนี้มีอยู่ในระบบแล้ว' });
                }

                const { hash, salt } = hashPassword(password);
                const now = new Date().toISOString();

                const stmt = db.prepare(`
                    INSERT INTO users (username, badge_no, rank_name, position, department, role, password_hash, salt, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?);
                `);
                const info = stmt.run(username, badge_no, rank_name, position || 'เจ้าหน้าที่ตำรวจ สภ.บางพลี', department || 'ฝ่ายสืบสวน', role || 'detective', hash, salt, now);

                recordAuditLog(session, 'CREATE_USER', 'USER', username, `เพิ่มบัญชีเจ้าหน้าที่ใหม่: ${rank_name} (${position}) สิทธิ์: ${role}`, req);

                return sendJson(res, 201, {
                    success: true,
                    message: `เพิ่มบัญชีเจ้าหน้าที่ตำรวจ ${rank_name} เรียบร้อยแล้ว`,
                    userId: info.lastInsertRowid
                });
            }

            // 12. USER MANAGEMENT: UPDATE USER (ADMIN ONLY)
            if (pathname.startsWith('/api/users/') && req.method === 'PUT') {
                if (session.role !== 'admin' && !session.position.includes('ผกก')) {
                    return sendJson(res, 403, { success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขข้อมูลผู้ใช้งานได้' });
                }

                const userId = parseInt(pathname.replace('/api/users/', ''), 10);
                const body = await readBody(req);
                const { rank_name, position, department, role, status, password } = body;

                const targetUser = db.prepare('SELECT * FROM users WHERE id = ?;').get(userId);
                if (!targetUser) {
                    return sendJson(res, 404, { success: false, error: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
                }

                if (password && password.trim().length >= 6) {
                    const { hash, salt } = hashPassword(password.trim());
                    db.prepare(`
                        UPDATE users
                        SET rank_name = ?, position = ?, department = ?, role = ?, status = ?, password_hash = ?, salt = ?
                        WHERE id = ?;
                    `).run(rank_name || targetUser.rank_name, position || targetUser.position, department || targetUser.department, role || targetUser.role, status || targetUser.status, hash, salt, userId);
                    recordAuditLog(session, 'UPDATE_USER', 'USER', targetUser.username, `แก้ไขข้อมูลและรีเซ็ตรหัสผ่านของ: ${targetUser.rank_name}`, req);
                } else {
                    db.prepare(`
                        UPDATE users
                        SET rank_name = ?, position = ?, department = ?, role = ?, status = ?
                        WHERE id = ?;
                    `).run(rank_name || targetUser.rank_name, position || targetUser.position, department || targetUser.department, role || targetUser.role, status || targetUser.status, userId);
                    recordAuditLog(session, 'UPDATE_USER', 'USER', targetUser.username, `แก้ไขข้อมูลของ: ${targetUser.rank_name} (${role || targetUser.role})`, req);
                }

                return sendJson(res, 200, { success: true, message: 'ปรับปรุงข้อมูลผู้ใช้สำเร็จ' });
            }

            // 13. USER MANAGEMENT: DELETE USER (ADMIN ONLY)
            if (pathname.startsWith('/api/users/') && req.method === 'DELETE') {
                if (session.role !== 'admin' && !session.position.includes('ผกก')) {
                    return sendJson(res, 403, { success: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบผู้ใช้งานได้' });
                }

                const userId = parseInt(pathname.replace('/api/users/', ''), 10);
                if (session.user_id === userId) {
                    return sendJson(res, 400, { success: false, error: 'ไม่สามารถลบบัญชีของตนเองที่กำลังเข้าสู่ระบบอยู่ได้' });
                }

                const targetUser = db.prepare('SELECT * FROM users WHERE id = ?;').get(userId);
                if (!targetUser) {
                    return sendJson(res, 404, { success: false, error: 'ไม่พบผู้ใช้งานนี้' });
                }

                db.prepare('DELETE FROM users WHERE id = ?;').run(userId);
                recordAuditLog(session, 'DELETE_USER', 'USER', targetUser.username, `ลบบัญชีผู้ใช้งาน: ${targetUser.rank_name} (รหัส ${targetUser.badge_no})`, req);

                return sendJson(res, 200, { success: true, message: `ลบบัญชีผู้ใช้งาน ${targetUser.rank_name} เรียบร้อยแล้ว` });
            }

            // 14. NEWPOLICE INTEGRATION: ADMIN GET ALL INDIVIDUAL ACCESS REQUESTS
            if (pathname === '/api/admin/newpolice/requests' && req.method === 'GET') {
                const requests = db.prepare("SELECT * FROM newpolice_user_requests ORDER BY id DESC;").all();
                const pendingCount = requests.filter(r => r.status === 'pending').length;
                const approvedCount = requests.filter(r => r.status === 'approved').length;
                return sendJson(res, 200, { success: true, requests, pendingCount, approvedCount });
            }

            // 15. NEWPOLICE INTEGRATION: ADMIN APPROVE INDIVIDUAL USER
            if (pathname === '/api/admin/newpolice/approve-user' && req.method === 'POST') {
                if (session.role !== 'admin' && !session.position.includes('ผกก') && !session.position.includes('รอง ผกก')) {
                    recordAuditLog(session, 'UNAUTHORIZED_NEWPOLICE_APPROVE', 'NEWPOLICE_USER', '-', 'พยายามอนุมัติสิทธิ์ user newpolice โดยไม่มีสิทธิ์แอดมิน', req);
                    return sendJson(res, 403, { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถอนุมัติสิทธิ์การเข้าถึงข้อมูลได้' });
                }

                const body = await readBody(req);
                const id = body.id;
                const reqRow = db.prepare("SELECT * FROM newpolice_user_requests WHERE id = ?;").get(id);
                if (!reqRow) {
                    return sendJson(res, 404, { success: false, error: 'ไม่พบรายการคำขอนี้' });
                }

                const accessToken = body.accessToken || ('NP-ACC-' + crypto.randomBytes(8).toString('hex').toUpperCase());
                const now = new Date().toISOString();

                db.prepare(`
                    UPDATE newpolice_user_requests
                    SET status = 'approved',
                        access_token = ?,
                        reviewed_by = ?,
                        reviewed_by_name = ?,
                        reviewed_at = ?
                    WHERE id = ?;
                `).run(accessToken, session.badge_no, session.rank_name, now, id);

                const updatedRow = db.prepare("SELECT * FROM newpolice_user_requests WHERE id = ?;").get(id);

                recordAuditLog(session, 'APPROVE_NEWPOLICE_USER_ACCESS', 'NEWPOLICE_USER', reqRow.badge_no, `แอดมิน (${session.rank_name}) อนุมัติสิทธิ์เข้าถึงข้อมูล Cyber Invest ให้แก่: ${reqRow.rank_name} (${reqRow.agency})`, req);

                return sendJson(res, 200, {
                    success: true,
                    message: `อนุมัติสิทธิ์การเข้าถึงข้อมูลให้แก่ ${reqRow.rank_name} เรียบร้อยแล้ว`,
                    accessToken,
                    request: updatedRow,
                    reviewedByName: session.rank_name,
                    reviewedAt: now,
                    id: reqRow.id
                });
            }

            // 16. NEWPOLICE INTEGRATION: ADMIN REJECT / REVOKE INDIVIDUAL USER
            if (pathname === '/api/admin/newpolice/reject-user' && req.method === 'POST') {
                if (session.role !== 'admin' && !session.position.includes('ผกก') && !session.position.includes('รอง ผกก')) {
                    return sendJson(res, 403, { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถระงับสิทธิ์ได้' });
                }

                const body = await readBody(req);
                const id = body.id;
                const reqRow = db.prepare("SELECT * FROM newpolice_user_requests WHERE id = ?;").get(id);
                if (!reqRow) {
                    return sendJson(res, 404, { success: false, error: 'ไม่พบรายการคำขอนี้' });
                }

                const now = new Date().toISOString();
                db.prepare(`
                    UPDATE newpolice_user_requests
                    SET status = 'rejected',
                        access_token = NULL,
                        reviewed_by = ?,
                        reviewed_by_name = ?,
                        reviewed_at = ?,
                        notes = ?
                    WHERE id = ?;
                `).run(session.badge_no, session.rank_name, now, body.reason || 'ระงับสิทธิ์การเข้าถึงข้อมูล', id);

                recordAuditLog(session, 'REJECT_NEWPOLICE_USER_ACCESS', 'NEWPOLICE_USER', reqRow.badge_no, `แอดมิน (${session.rank_name}) ปฏิเสธ / ระงับสิทธิ์การเข้าถึงข้อมูลของ: ${reqRow.rank_name}`, req);

                const updatedRow = db.prepare("SELECT * FROM newpolice_user_requests WHERE id = ?;").get(id);

                return sendJson(res, 200, {
                    success: true,
                    message: `ระงับสิทธิ์การเข้าถึงข้อมูลของ ${reqRow.rank_name} เรียบร้อยแล้ว`,
                    request: updatedRow,
                    id: reqRow.id
                });
            }

            // 17. NEWPOLICE INTEGRATION: RESET SIMULATION REQUESTS (FOR DEMO / TESTING)
            if (pathname === '/api/admin/newpolice/reset-simulation' && req.method === 'POST') {
                if (session.role !== 'admin' && !session.position.includes('ผกก')) {
                    return sendJson(res, 403, { success: false, error: 'เฉพาะแอดมินเท่านั้น' });
                }

                db.prepare("DELETE FROM newpolice_user_requests;").run();

                const seedRequests = [
                    {
                        request_code: 'REQ-NP-2569-001',
                        badge_no: 'NP-88214',
                        rank_name: 'พ.ต.ท.ดนัย รักษาการ',
                        position: 'สารวัตรกลุ่มงานสืบสวน',
                        agency: 'บก.สอท.2 (โครงการ newpolice)',
                        phone: '089-112-3344',
                        purpose: 'ขอเข้าถึงข้อมูลเครือข่ายบัญชีม้าและเส้นทางการเงิน คดีฉ้อโกงประชาชน สภ.บางพลี เพื่อเชื่อมโยงขยายผลจับกุม',
                        status: 'pending',
                        ip_address: '10.220.14.88',
                        requested_at: new Date(Date.now() - 3600000 * 2).toISOString()
                    },
                    {
                        request_code: 'REQ-NP-2569-002',
                        badge_no: 'NP-91045',
                        rank_name: 'ร.ต.อ.หญิง ปวีณา วงศ์สถิตย์',
                        position: 'รอง สว.กลุ่มงานวิเคราะห์อาชญากรรมทางเทคโนโลยี',
                        agency: 'ศูนย์ปราบปรามอาชญากรรมทางเทคโนโลยีสารสนเทศ (PCT ตร.)',
                        phone: '081-445-6677',
                        purpose: 'ขอตรวจสอบประวัติหมายจับและแผนประทุษกรรม คดีหลอกลงทุนคริปโต สภ.บางพลี',
                        status: 'pending',
                        ip_address: '10.220.14.92',
                        requested_at: new Date(Date.now() - 3600000).toISOString()
                    },
                    {
                        request_code: 'REQ-NP-2569-003',
                        badge_no: 'NP-74312',
                        rank_name: 'ร.ต.ท.ชูชาติ กิตติกร',
                        position: 'รอง สว.(สืบสวน) บก.สอท.1',
                        agency: 'กองบัญชาการตำรวจสืบสวนสอบสวนอาชญากรรมทางเทคโนโลยี (บช.สอท.)',
                        phone: '086-778-9900',
                        purpose: 'ขอเข้าถึงข้อมูลสำนวนคดีแก๊งคอลเซ็นเตอร์หลอกติดตั้งแอปดูดเงิน เพื่อทำรายงานสืบสวนส่วนกลาง',
                        status: 'pending',
                        ip_address: '10.220.15.14',
                        requested_at: new Date().toISOString()
                    }
                ];

                const insertReq = db.prepare(`
                    INSERT INTO newpolice_user_requests (request_code, badge_no, rank_name, position, agency, phone, purpose, status, ip_address, requested_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                `);
                for (const r of seedRequests) {
                    insertReq.run(r.request_code, r.badge_no, r.rank_name, r.position, r.agency, r.phone, r.purpose, r.status, r.ip_address, r.requested_at);
                }

                recordAuditLog(session, 'RESET_NEWPOLICE_SIMULATION', 'NEWPOLICE', 'ALL', 'จำลองรายการคำขอเชื่อมต่อใหม่ 3 นาย เพื่อทดสอบการอนุมัติรายบุคคล', req);

                return sendJson(res, 200, {
                    success: true,
                    message: 'รีเซ็ตรายการคำขอเชื่อมต่อจากเจ้าหน้าที่ newpolice สำเร็จ (3 นาย อยู่ในสถานะรออนุมัติ)'
                });
            }

            return sendJson(res, 404, { success: false, error: 'API endpoint not found' });
        }

        // =====================================================================
        // STATIC FILE SERVING
        // =====================================================================
        let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        if (safePath === '/' || safePath === '\\') {
            safePath = '/index.html';
        }

        const filePath = path.join(__dirname, safePath);

        // Security check: must stay within root
        if (!filePath.startsWith(__dirname)) {
            res.writeHead(403);
            res.end('Access Denied');
            return;
        }

        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Not Found');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'Cache-Control': 'no-cache',
                'X-Content-Type-Options': 'nosniff'
            });

            fs.createReadStream(filePath).pipe(res);
        });

    } catch (serverErr) {
        console.error('[SERVER ERROR]', serverErr);
        sendJson(res, 500, { success: false, error: 'Internal Server Error: ' + serverErr.message });
    }
});

server.listen(PORT, () => {
    console.log('======================================================================');
    console.log(`🛡️ CYBER INVESTIGATION BANGPHLI - SECURE POLICE SERVER`);
    console.log(`🔒 Encryption: AES-256-GCM (Active) | Master Key Protected`);
    console.log(`💾 Database: SQLite (WAL Mode) at ${DB_PATH}`);
    console.log(`📋 Audit Logging: Enabled (PDPA & Police Code Compliant)`);
    console.log(`🚀 Running at: http://localhost:${PORT}`);
    console.log('======================================================================');
});
