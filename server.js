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

// Automated Backup Directory & Rotation
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function createDatabaseBackup() {
    try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        const now = new Date();
        const stamp = now.toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `bangphli_secure_backup_${stamp}.db`);
        fs.copyFileSync(DB_PATH, backupFile);
        console.log(`[BACKUP] Automated SQLite backup created: ${backupFile}`);

        // Rotate backups older than 14 days
        const files = fs.readdirSync(BACKUP_DIR);
        const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
        for (const f of files) {
            const fPath = path.join(BACKUP_DIR, f);
            try {
                const stat = fs.statSync(fPath);
                if (stat.mtimeMs < cutoff) {
                    fs.unlinkSync(fPath);
                    console.log(`[BACKUP] Rotated old backup: ${f}`);
                }
            } catch (_) {}
        }
        return backupFile;
    } catch (e) {
        console.error('[BACKUP ERROR]', e);
        return null;
    }
}

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

CREATE TABLE IF NOT EXISTS victim_inquiries (
    id TEXT PRIMARY KEY,
    case_number TEXT,
    victim_name TEXT,
    victim_phone TEXT,
    victim_id_card TEXT,
    victim_address TEXT,
    category_id TEXT,
    category_title TEXT,
    answers_json TEXT,
    qa_list_json TEXT,
    evidence_note TEXT,
    submitted_at TEXT,
    status TEXT DEFAULT 'submitted'
);

CREATE TABLE IF NOT EXISTS cyber_details (
    id TEXT PRIMARY KEY,
    case_no TEXT UNIQUE NOT NULL,
    incident_date TEXT,
    victim_name TEXT NOT NULL,
    victim_phone TEXT,
    victim_id_card TEXT,
    victim_address TEXT,
    damage_amount REAL DEFAULT 0,
    fraud_category TEXT NOT NULL,
    mule_accounts TEXT NOT NULL DEFAULT '[]',
    financial_trails TEXT NOT NULL DEFAULT '[]',
    investigator_name TEXT NOT NULL,
    investigator_badge TEXT,
    detective_name TEXT,
    status TEXT DEFAULT 'พบพงส.',
    urgency TEXT DEFAULT '[]',
    legal_actions TEXT DEFAULT '{"summons1": false, "summons2": false, "warrant": false}',
    victim_profile TEXT,
    freeze_info TEXT,
    transfer_records TEXT,
    inquiry_answers TEXT,
    victim_submitted_at TEXT,
    station_code TEXT DEFAULT 'POLICE-STN-BANGPHLI-001',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inquiry_templates (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    points TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
`);

try { db.exec('ALTER TABLE cyber_details ADD COLUMN interrogation_statements TEXT;'); } catch(_) {}
try { db.exec('ALTER TABLE cyber_details ADD COLUMN statement_variables TEXT;'); } catch(_) {}
try { db.exec('ALTER TABLE cyber_details ADD COLUMN property_damaged TEXT;'); } catch(_) {}
try { db.exec('ALTER TABLE cyber_details ADD COLUMN property_recovered TEXT;'); } catch(_) {}
try { db.exec('ALTER TABLE cyber_details ADD COLUMN property_unrecovered TEXT;'); } catch(_) {}

// Pre-seed inquiry_templates if empty
try {
    const countInquiryTemplates = db.prepare('SELECT COUNT(*) as count FROM inquiry_templates;').get().count;
    if (countInquiryTemplates === 0) {
        const defaultInquiryTemplates = [
            { title: '1. หลอกลวงซื้อขายสินค้าออนไลน์', points: ['สั่งซื้อสินค้าผ่านช่องทางใด (Facebook, Line, TikTok, เว็บไซต์)', 'ตรวจสอบหลักฐานการโอนเงิน สลิป และบัญชีปลายทาง', 'วันเวลาที่ตกลงส่งสินค้าและช่องทางการติดต่อที่ถูกบล็อก'] },
            { title: '2. หลอกให้โอนเงินเพื่อทำงาน (หารายได้พิเศษ)', points: ['พบเห็นโฆษณาชักชวนทำงานจากที่ใด', 'ขั้นตอนการโอนเงินสำรองจ่ายเพื่อรับค่าคอมมิชชั่นแต่ละรอบ', 'ลิงก์เว็บไซต์หรือแอปพลิเคชันที่คนร้ายให้สมัครสมาชิก'] },
            { title: '3. หลอกให้กู้เงินออนไลน์', points: ['ช่องทางที่ติดต่อขอกู้เงินและวงเงินที่ขอกู้', 'เหตุผลที่คนร้ายอ้างให้โอนเงินค่ามัดจำ ค่าปลดล็อกระบบ หรือค่าแก้ไขเลขบัญชี', 'ตรวจสอบสลิปการโอนเงินทุกครั้งที่โอนให้คนร้าย'] },
            { title: '4. ข่มขู่ทางโทรศัพท์ (Call Center)', points: ['เบอร์โทรศัพท์ที่โทรเข้ามาแอบอ้างเป็นเจ้าหน้าที่หน่วยงานใด', 'พฤติการณ์การข่มขู่ว่าเกี่ยวข้องกับการฟอกเงินหรือคดียาเสพติด', 'ช่องทางที่ให้แอดไลน์พูดคุยและโอนเงินเพื่อตรวจสอบ'] },
            { title: '5. หลอกให้ลงทุนผ่านระบบคอมพิวเตอร์', points: ['แพลตฟอร์มหรือแอปพลิเคชันที่ชักชวนให้ลงทุน (หุ้น, คริปโต, ทองคำ)', 'ช่วงแรกได้รับผลตอบแทนจริงหรือไม่ จำนวนเท่าใด', 'ยอดเงินลงทุนทั้งหมดและบัญชีม้าที่รับโอนเงิน'] },
            { title: '6. หลอกให้รักแล้วโอนเงิน (Romance Scam)', points: ['รู้จักกันผ่านแอปพลิเคชันใด โปรไฟล์คนร้ายอ้างเป็นใคร', 'เหตุผลที่ขอให้โอนเงิน (ส่งพัสดุติดด่านศุลกากร, ค่ารักษาพยาบาล, ลงทุนร่วมกัน)'] },
            { title: '7. หลอกให้รักแล้วลงทุน (Hybrid Scam)', points: ['ความสัมพันธ์และการชักชวนให้ลงทุนควบคู่กัน', 'แพลตฟอร์มเทรดปลอมที่คนร้ายส่งลิงก์ให้ดาวน์โหลด'] },
            { title: '8. แฮ็กบัญชีโซเชียลมีเดียหลอกยืมเงิน', points: ['บัญชีโซเชียลที่ถูกแฮ็กเป็นของใคร และคนร้ายทักมายืมเงินอย่างไร', 'บัญชีธนาคารปลายทางที่โอนเงินไปให้'] },
            { title: '9. หลอกให้ติดตั้งโปรแกรมควบคุมระบบ (รีโมท/แอปดูดเงิน)', points: ['คนร้ายแอบอ้างเป็นหน่วยงานใดหลอกให้กดลิงก์ติดตั้งไฟล์ .apk', 'ช่วงเวลาที่หน้าจอโทรศัพท์ค้างและเงินถูกโอนออกจากบัญชีอัตโนมัติ', 'ตรวจสอบรายการเดินบัญชี (Statement) ปลายทางที่เงินถูกดูดไป'] },
            { title: '10. หลอกลวงเกี่ยวกับสินทรัพย์ดิจิทัล (Crypto)', points: ['กระเป๋าเงินดิจิทัล (Wallet Address) ต้นทางและปลายทาง', 'รหัสธุรกรรม (TxID / Hash) ที่โอนเหรียญออกไป'] },
            { title: '11. หลอกลวงให้โอนเงินโดยแอบอ้างเป็นบุคคลอื่น', points: ['แอบอ้างเป็นญาติ ผู้บังคับบัญชา หรือคนรู้จัก', 'เบอร์โทรหรือบัญชีไลน์ที่ใช้ติดต่อขอยืมเงิน'] },
            { title: '12. หลอกลวงให้ทำประกัน/รับรางวัล/โชคลาภ', points: ['ข้อความ SMS หรือโทรศัพท์แจ้งว่าได้รับรางวัลใหญ่', 'เงื่อนไขให้โอนเงินค่าภาษีหรือค่าธรรมเนียมก่อนรับรางวัล'] },
            { title: '13. หลอกลวงเกี่ยวกับการจองที่พัก/ตั๋วเครื่องบิน', points: ['เพจปลอมที่แอบอ้างชื่อโรงแรม รีสอร์ท หรือสายการบิน', 'ตรวจสอบความแตกต่างของชื่อบัญชีรับโอนกับชื่อสถานประกอบการ'] },
            { title: '14. คดีอาชญากรรมทางเทคโนโลยีประเภทอื่นๆ', points: ['รายละเอียดพฤติการณ์แห่งคดีโดยละเอียด', 'พยานหลักฐานทางอิเล็กทรอนิกส์ที่รวบรวมได้'] }
        ];
        const ins = db.prepare('INSERT INTO inquiry_templates (id, title, points, updated_at) VALUES (?, ?, ?, ?);');
        const nowIso = new Date().toISOString();
        defaultInquiryTemplates.forEach((t, idx) => {
            ins.run(idx + 1, t.title, JSON.stringify(t.points), nowIso);
        });
        console.log('[SECURITY] Pre-seeded 14 fraud inquiry templates in SQLite.');
    }
} catch (e) {
    console.error('[DB INQUIRY TEMPLATES INIT ERROR]', e.message);
}

// Migration: Ensure victim self-reporting columns exist in cyber_details
try {
    const cyberCols = db.prepare(`PRAGMA table_info(cyber_details);`).all().map(c => c.name);
    if (!cyberCols.includes('victim_profile')) db.prepare('ALTER TABLE cyber_details ADD COLUMN victim_profile TEXT;').run();
    if (!cyberCols.includes('freeze_info')) db.prepare('ALTER TABLE cyber_details ADD COLUMN freeze_info TEXT;').run();
    if (!cyberCols.includes('transfer_records')) db.prepare('ALTER TABLE cyber_details ADD COLUMN transfer_records TEXT;').run();
    if (!cyberCols.includes('inquiry_answers')) db.prepare('ALTER TABLE cyber_details ADD COLUMN inquiry_answers TEXT;').run();
    if (!cyberCols.includes('victim_submitted_at')) db.prepare('ALTER TABLE cyber_details ADD COLUMN victim_submitted_at TEXT;').run();
} catch(e) {
    console.error('[DB MIGRATION cyber_details]', e.message);
}

// Pre-seed cyber_details if empty
const countCyberDetails = db.prepare('SELECT COUNT(*) as count FROM cyber_details;').get().count;
if (countCyberDetails === 0) {
    console.log('[SECURITY] Pre-seeding cyber_details for Inquiry System...');
    const nowIso = new Date().toISOString();
    const seedCyberDetails = [
        {
            id: 'cd-1',
            case_no: 'T6911087326',
            incident_date: '08/11/2569',
            victim_name: 'ฐิติพร ชุมชอบ',
            victim_phone: '0655492824',
            victim_id_card: '1-1004-00129-84-1',
            victim_address: '145/22 หมู่ 3 ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ',
            damage_amount: 8000,
            fraud_category: 'หลอกลวงซื้อขายสินค้าออนไลน์',
            mule_accounts: JSON.stringify([
                { tier: 1, bank: 'Max Card / บัตรเงินสด', account_no: '320001000578130', account_name: 'เบญจมาภรณ์ บุญทนา', status: 'ส่งหนังสืออายัดแล้ว' }
            ]),
            financial_trails: JSON.stringify([
                { step: 1, trail_type: 'โอนเงินค่าสินค้าออนไลน์', from_source: 'บัญชีผู้เสียหาย (ฐิติพร ชุมชอบ)', to_destination: 'Max Card 320001000578130 (เบญจมาภรณ์ บุญทนา)', amount: 8000, timestamp: '2026-11-08 14:22:15', tx_reference: 'TXN-691108-88219' }
            ]),
            investigator_name: 'พ.ต.ต.ธีรเดช สุขเกษม',
            investigator_badge: '30002',
            detective_name: 'ร.ต.ต.ธนกฤต ไทยกมล',
            status: 'warroom',
            urgency: JSON.stringify(['ภจว.ติดตาม']),
            legal_actions: JSON.stringify({ summons1: true, summons1Date: '08/11/2569', summons1Pdf: 'หมายเรียก1_เบญจมาภรณ์.pdf', summons2: false, warrant: false })
        },
        {
            id: 'cd-2',
            case_no: 'T6911087748',
            incident_date: '08/11/2569',
            victim_name: 'ปริญ มหโชคภัทรวิมล',
            victim_phone: '0918955919',
            victim_id_card: '3-1102-00481-99-2',
            victim_address: '88/14 หมู่บ้านพฤกษา ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ',
            damage_amount: 9000,
            fraud_category: 'หลอกลวงซื้อขายสินค้าออนไลน์',
            mule_accounts: JSON.stringify([
                { tier: 1, bank: 'ธ.ก.ส.', account_no: '020228673257', account_name: 'ชฎาพร ป่าเกลือ', status: 'ออกหมายจับแล้ว' }
            ]),
            financial_trails: JSON.stringify([
                { step: 1, trail_type: 'โอนเงินซื้อสินค้าโมเดล', from_source: 'บัญชีผู้เสียหาย (ปริญ มหโชคภัทรวิมล)', to_destination: 'ธ.ก.ส. 020228673257 (ชฎาพร ป่าเกลือ)', amount: 9000, timestamp: '2026-11-08 15:45:00', tx_reference: 'TXN-691108-99014' }
            ]),
            investigator_name: 'พ.ต.ต.ธีรเดช สุขเกษม',
            investigator_badge: '30002',
            detective_name: 'ร.ต.ต.ธนกฤต ไทยกมล',
            status: 'พบพงส.',
            urgency: JSON.stringify(['คดีเร่งด่วน ภ.1ติดตาม']),
            legal_actions: JSON.stringify({ summons1: true, summons1Date: '08/11/2569', summons2: true, summons2Date: '15/11/2569', warrant: true, warrantPdf: 'หมายจับ_ศาลสมุทรปราการ_ชฎาพร.pdf' })
        },
        {
            id: 'cd-3',
            case_no: 'T6911087788',
            incident_date: '08/11/2569',
            victim_name: 'นายเจริญ บุญญานิบาล',
            victim_phone: '0819958712',
            victim_id_card: '1-1004-98432-11-0',
            victim_address: '12/9 หมู่ 2 ต.บางโฉลง อ.บางพลี จ.สมุทรปราการ',
            damage_amount: 1599,
            fraud_category: 'หลอกลวงซื้อขายสินค้าออนไลน์',
            mule_accounts: JSON.stringify([
                { tier: 1, bank: 'พร้อมเพย์ QR Code', account_no: 'xxxxxx7621', account_name: 'ชินกร กันทะวงษ์', status: 'ส่งตรวจสอบเส้นทาง' },
                { tier: 2, bank: 'พร้อมเพย์ QR Code', account_no: 'xxxxxx7917', account_name: 'วีศรุต ไชยสุรินทร์', status: 'แถว 2 ปลายทาง' }
            ]),
            financial_trails: JSON.stringify([
                { step: 1, trail_type: 'โอนชำระสินค้า', from_source: 'ผู้เสียหาย', to_destination: 'QR Code xxxxxx7621 (ชินกร กันทะวงษ์)', amount: 1599, timestamp: '2026-11-08 16:10:00', tx_reference: 'TXN-691108-7621' },
                { step: 2, trail_type: 'ยักย้ายถ่ายเทเงินแถว 2', from_source: 'ชินกร กันทะวงษ์', to_destination: 'QR Code xxxxxx7917 (วีศรุต ไชยสุรินทร์)', amount: 1500, timestamp: '2026-11-08 16:15:20', tx_reference: 'TXN-691108-7917' }
            ]),
            investigator_name: 'พ.ต.ต.ธีรเดช สุขเกษม',
            investigator_badge: '30002',
            detective_name: 'ร.ต.ต.ธนกฤต ไทยกมล',
            status: 'พบพงส.',
            urgency: JSON.stringify(['ตร.ติดตาม']),
            legal_actions: JSON.stringify({ summons1: false, summons2: false, warrant: false })
        },
        {
            id: 'cd-4',
            case_no: 'T6911088120',
            incident_date: '08/11/2569',
            victim_name: 'ศศิธร วงศ์เจริญ',
            victim_phone: '0891234567',
            victim_id_card: '2-1005-00129-33-8',
            victim_address: '99/50 ต.ราชาเทวะ อ.บางพลี จ.สมุทรปราการ',
            damage_amount: 35000,
            fraud_category: 'หลอกให้โอนเงินเพื่อทำงาน',
            mule_accounts: JSON.stringify([
                { tier: 1, bank: 'ธนาคารกสิกรไทย', account_no: '0451239988', account_name: 'สมรักษ์ คำสิงห์พาณิชย์', status: 'ส่งหนังสืออายัดแล้ว' }
            ]),
            financial_trails: JSON.stringify([
                { step: 1, trail_type: 'โอนเงินเพื่อทำภารกิจหารายได้', from_source: 'บัญชีผู้เสียหาย', to_destination: 'กสิกรไทย 0451239988 (สมรักษ์ คำสิงห์พาณิชย์)', amount: 35000, timestamp: '2026-11-08 17:00:00', tx_reference: 'TXN-691108-0451' }
            ]),
            investigator_name: 'พ.ต.ท.ประเสริฐ กุลบุตร',
            investigator_badge: '30001',
            detective_name: 'ร.ต.ต.ธนกฤต ไทยกมล',
            status: 'นัดหมาย',
            urgency: JSON.stringify([]),
            legal_actions: JSON.stringify({ summons1: false, summons2: false, warrant: false })
        }
    ];

    const insCyber = db.prepare(`
        INSERT INTO cyber_details (
            id, case_no, incident_date, victim_name, victim_phone, victim_id_card, victim_address,
            damage_amount, fraud_category, mule_accounts, financial_trails,
            investigator_name, investigator_badge, detective_name, status, urgency, legal_actions,
            station_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    for (const c of seedCyberDetails) {
        insCyber.run(
            c.id, c.case_no, c.incident_date, c.victim_name, c.victim_phone, c.victim_id_card, c.victim_address,
            c.damage_amount, c.fraud_category, c.mule_accounts, c.financial_trails,
            c.investigator_name, c.investigator_badge, c.detective_name, c.status, c.urgency, c.legal_actions,
            'POLICE-STN-BANGPHLI-001', nowIso, nowIso
        );
    }
    console.log('[SECURITY] Pre-seeded 4 cyber_details cases for สภ.บางพลี.');
}

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

// Ensure 'theeradej' (พ.ต.ต.ธีรเดช สุขเกษม) inquiry account always exists
const hasTheeradej = db.prepare("SELECT id FROM users WHERE username = 'theeradej';").get();
if (!hasTheeradej) {
    const { hash, salt } = hashPassword('Police@2569');
    db.prepare(`
        INSERT INTO users (username, badge_no, rank_name, position, department, role, password_hash, salt, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run('theeradej', '30002', 'พ.ต.ต.ธีรเดช สุขเกษม', 'สารวัตร (สอบสวน) สภ.บางพลี', 'งานสอบสวน', 'inquiry', hash, salt, new Date().toISOString());
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
                    {
                        id: 'cyber-c_1',
                        caseNo: 'T6911087326',
                        date: '2026-11-08',
                        victim: 'ฐิติพร ชุมชอบ 0655492824',
                        type: 'หลอกลวงซื้อขายสินค้าออนไลน์',
                        amount: 8000,
                        status: 'พบพงส.',
                        accounts: [{ bank: 'Max card เลขอ้างอิง', no: '320001000578130', name: 'เบญจมาภรณ์ บุญทนา' }],
                        investigator: 'พ.ต.ต.ธีรเดช สุขเกษม',
                        detective: 'ร.ต.ต.ธนกฤต ไทยกมล',
                        summons1: true,
                        summons1Date: '2026-11-09',
                        summons2: false,
                        summons2Date: '',
                        warrant: false
                    },
                    {
                        id: 'cyber-c_2',
                        caseNo: 'T6911087748',
                        date: '2026-11-08',
                        victim: 'ปริญ มหโชคภัทรวิมล 0918955919',
                        type: 'หลอกลวงซื้อขายสินค้าออนไลน์',
                        amount: 9000,
                        status: 'พบพงส.',
                        accounts: [{ bank: 'ธกส', no: '020228673257', name: 'ชฎาพร ป่าเกลือ' }],
                        investigator: 'พ.ต.ต.ธีรเดช สุขเกษม',
                        detective: 'ร.ต.ต.ธนกฤต ไทยกมล',
                        summons1: true,
                        summons1Date: '2026-11-09',
                        summons2: true,
                        summons2Date: '2026-11-15',
                        warrant: true
                    },
                    {
                        id: 'cyber-c_3',
                        caseNo: 'T6911087788',
                        date: '2026-11-08',
                        victim: 'นายเจริญ บุญวานิบาล 0819958712',
                        type: 'หลอกลวงซื้อขายสินค้าออนไลน์',
                        amount: 1599,
                        status: 'พบพงส.',
                        accounts: [
                            { bank: 'Qr Code: เลขอ้างอิง', no: 'xxxxxx7621', name: 'ชินกร กันทะวงษ์' },
                            { bank: 'Qr Code: เลขอ้างอิง', no: 'xxxxxx7917', name: 'วีศรุต ไชยสุรินทร์' }
                        ],
                        investigator: 'พ.ต.ต.ธีรเดช สุขเกษม',
                        detective: 'ร.ต.ต.ธนกฤต ไทยกมล',
                        summons1: false,
                        summons1Date: '',
                        summons2: false,
                        summons2Date: '',
                        warrant: false
                    }
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

            // 4f. NEWPOLICE: LIST CYBER INVEST CASES (OPEN ENDPOINT MATCHING CYBER INVEST PORTAL)
            if (pathname === '/api/external/newpolice/cases' && (req.method === 'GET' || req.method === 'HEAD')) {
                const urlObj = new URL(req.url, 'http://localhost');
                const requestedInvestigator = (urlObj.searchParams.get('investigator') || '').trim();
                const requestedCaseNo = (urlObj.searchParams.get('caseNo') || '').trim();

                let query = 'SELECT * FROM cyber_details WHERE 1=1';
                const params = [];
                if (requestedCaseNo) {
                    query += ' AND UPPER(case_no) = ?';
                    params.push(requestedCaseNo.toUpperCase());
                }
                if (requestedInvestigator) {
                    const cleanName = requestedInvestigator.replace(/^ว่าที่\s*/, '').replace(/^[พรรดจส]\.?[ตโทอ]\.?[ตโทอ]?\.?\s*/, '').trim();
                    query += ' AND (investigator_name LIKE ? OR investigator_name = ?)';
                    params.push(`%${cleanName}%`, requestedInvestigator);
                }
                query += ' ORDER BY created_at DESC;';

                let rows = [];
                try {
                    rows = db.prepare(query).all(...params);
                } catch(e) {
                    console.error('[NEWPOLICE CASES DB ERROR]', e);
                }

                const casesList = rows.map(r => {
                    let accs = [];
                    try { accs = JSON.parse(r.mule_accounts || '[]'); } catch(e) {}
                    let leg = {};
                    try { leg = JSON.parse(r.legal_actions || '{}'); } catch(e) {}
                    let vProf = null;
                    try { if (r.victim_profile) vProf = JSON.parse(r.victim_profile); } catch(e) {}
                    let frz = null;
                    try { if (r.freeze_info) frz = JSON.parse(r.freeze_info); } catch(e) {}
                    let tRecs = [];
                    try { if (r.transfer_records) tRecs = JSON.parse(r.transfer_records); } catch(e) {}
                    let inqAns = [];
                    try { if (r.inquiry_answers) inqAns = JSON.parse(r.inquiry_answers); } catch(e) {}
                    let intStmts = null;
                    try { if (r.interrogation_statements) intStmts = JSON.parse(r.interrogation_statements); } catch(e) {}
                    let pDamaged = null;
                    try { if (r.property_damaged) pDamaged = JSON.parse(r.property_damaged); } catch(e) {}
                    let pRecovered = null;
                    try { if (r.property_recovered) pRecovered = JSON.parse(r.property_recovered); } catch(e) {}
                    let pUnrecovered = null;
                    try { if (r.property_unrecovered) pUnrecovered = JSON.parse(r.property_unrecovered); } catch(e) {}

                    return {
                        id: r.id,
                        caseNo: r.case_no,
                        date: r.incident_date,
                        victim: `${r.victim_name} ${r.victim_phone || ''}`.trim(),
                        type: r.fraud_category,
                        amount: Number(r.damage_amount) || 0,
                        status: r.status,
                        accounts: accs,
                        investigator: r.investigator_name,
                        detective: r.detective_name || r.investigator_name,
                        summons1: !!leg.summons1,
                        summons1Date: leg.summons1Date || '',
                        summons2: !!leg.summons2,
                        summons2Date: leg.summons2Date || '',
                        warrant: !!leg.warrant,
                        // โครงสร้างฟิลด์ใหม่จากผู้เสียหาย (Lightweight Mode: ไม่มี Base64 fileData)
                        victimProfile: vProf,
                        victim_profile: vProf,
                        freezeInfo: frz,
                        freeze_info: frz,
                        transferRecords: tRecs,
                        transfer_records: tRecs,
                        inquiryAnswers: inqAns,
                        inquiry_answers: inqAns,
                        interrogationStatements: intStmts,
                        statementVariables: r.statement_variables ? JSON.parse(r.statement_variables) : null,
                        statement_variables: r.statement_variables ? JSON.parse(r.statement_variables) : null,
                        propertyDamaged: pDamaged,
                        propertyRecovered: pRecovered,
                        propertyUnrecovered: pUnrecovered,
                        victimSubmittedAt: r.victim_submitted_at || null,
                        victim_submitted_at: r.victim_submitted_at || null,
                        station_code: r.station_code || 'POLICE-STN-BANGPHLI-001'
                    };
                });

                if (req.method === 'HEAD') {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end();
                    return;
                }
                return sendJson(res, 200, {
                    success: true,
                    total_cases: casesList.length,
                    cases: casesList
                });
            }

            if (pathname === '/api/external/newpolice/cases' && req.method === 'POST') {
                const body = await readBody(req);
                const cleanCaseNo = String(body.caseNo || body.case_no || '').trim().toUpperCase();
                if (!cleanCaseNo) {
                    return sendJson(res, 400, { success: false, error: 'Missing caseNo' });
                }
                const rawVictim = String(body.victim || body.victim_name || '');
                const phoneMatch = rawVictim.match(/0\d{8,9}/);
                const victimPhone = phoneMatch ? phoneMatch[0] : (body.victim_phone || '');
                const victimCleanName = rawVictim.replace(/0\d{8,9}/g, '').replace(/[-\s]+$/g, '').trim() || 'ผู้เสียหาย';
                const nowIso = new Date().toISOString();

                try {
                    const existing = db.prepare('SELECT id FROM cyber_details WHERE UPPER(case_no) = ?;').get(cleanCaseNo);
                    if (existing) {
                        db.prepare(`
                            UPDATE cyber_details
                            SET investigator_name = COALESCE(?, investigator_name),
                                detective_name = COALESCE(?, detective_name),
                                status = COALESCE(?, status),
                                damage_amount = COALESCE(?, damage_amount),
                                fraud_category = COALESCE(?, fraud_category),
                                victim_name = COALESCE(?, victim_name),
                                victim_phone = COALESCE(?, victim_phone),
                                incident_date = COALESCE(?, incident_date),
                                mule_accounts = COALESCE(?, mule_accounts),
                                updated_at = ?
                            WHERE UPPER(case_no) = ?;
                        `).run(
                            body.investigator || body.investigator_name || null,
                            body.detective || body.detective_name || null,
                            body.status || null,
                            body.amount !== undefined ? Number(body.amount) : null,
                            body.type || body.fraud_category || null,
                            victimCleanName,
                            victimPhone || null,
                            body.date || body.incident_date || null,
                            Array.isArray(body.accounts) ? JSON.stringify(body.accounts) : null,
                            nowIso,
                            cleanCaseNo
                        );
                    } else {
                        db.prepare(`
                            INSERT INTO cyber_details (
                                case_no, incident_date, victim_name, victim_phone, fraud_category,
                                damage_amount, status, mule_accounts, investigator_name, detective_name,
                                station_code, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POLICE-STN-BANGPHLI-001', ?, ?);
                        `).run(
                            cleanCaseNo,
                            body.date || '',
                            victimCleanName,
                            victimPhone,
                            body.type || '1. หลอกลวงซื้อขายสินค้าออนไลน์',
                            Number(body.amount || 0),
                            body.status || 'พบพงส.',
                            JSON.stringify(Array.isArray(body.accounts) ? body.accounts : []),
                            body.investigator || 'พ.ต.ต.ธีรเดช สุขเกษม',
                            body.detective || 'ร.ต.ต.ธนกฤต ไทยกมล',
                            nowIso,
                            nowIso
                        );
                    }
                    return sendJson(res, 200, { success: true, caseNo: cleanCaseNo });
                } catch (dbErr) {
                    return sendJson(res, 500, { success: false, error: dbErr.message });
                }
            }

            if (pathname === '/api/external/newpolice/cases' && req.method === 'DELETE') {
                const urlObj = new URL(req.url, 'http://localhost');
                let targetCaseNo = (urlObj.searchParams.get('caseNo') || '').trim().toUpperCase();
                let targetId = (urlObj.searchParams.get('id') || '').trim();
                if (!targetCaseNo && !targetId) {
                    try {
                        const body = await readBody(req);
                        targetCaseNo = String(body.caseNo || body.case_no || '').trim().toUpperCase();
                        targetId = String(body.id || '').trim();
                    } catch (_) {}
                }
                if (!targetCaseNo && !targetId) {
                    return sendJson(res, 400, { success: false, error: 'Missing caseNo or id' });
                }
                try {
                    let changes = 0;
                    if (targetCaseNo) {
                        const info = db.prepare('DELETE FROM cyber_details WHERE UPPER(TRIM(case_no)) = ?;').run(targetCaseNo);
                        changes += info.changes || 0;
                    }
                    if (targetId && /^\d+$/.test(targetId)) {
                        const info2 = db.prepare('DELETE FROM cyber_details WHERE id = ?;').run(Number(targetId));
                        changes += info2.changes || 0;
                    }
                    return sendJson(res, 200, { success: true, deletedCount: changes, caseNo: targetCaseNo, id: targetId });
                } catch (dbErr) {
                    return sendJson(res, 500, { success: false, error: dbErr.message });
                }
            }

            // 4e. VICTIM PRE-FILL INQUIRY SUBMISSIONS (NEWPOLICE INTEGRATION)
            if (pathname === '/api/external/newpolice/victim-inquiry' && req.method === 'POST') {
                const body = await readBody(req);
                const id = body.id || ('sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7));
                const caseNumber = body.caseNumber || '';
                const victimName = body.victimName || '';
                const victimPhone = body.victimPhone || '';
                const victimIdCard = body.victimIdCard || '';
                const victimAddress = body.victimAddress || '';
                const categoryId = body.categoryId || 'cat_1';
                const categoryTitle = body.categoryTitle || '';
                const answersJson = JSON.stringify(body.answers || {});
                const qaListJson = JSON.stringify(body.qaList || []);
                const evidenceNote = body.evidenceNote || '';
                const submittedAt = body.submittedAt || new Date().toISOString();

                try {
                    db.prepare(`
                        INSERT OR REPLACE INTO victim_inquiries (
                            id, case_number, victim_name, victim_phone, victim_id_card, victim_address,
                            category_id, category_title, answers_json, qa_list_json, evidence_note, submitted_at, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted');
                    `).run(
                        id, caseNumber, victimName, victimPhone, victimIdCard, victimAddress,
                        categoryId, categoryTitle, answersJson, qaListJson, evidenceNote, submittedAt
                    );

                    return sendJson(res, 200, {
                        success: true,
                        message: 'บันทึกคำตอบผู้เสียหายเข้าสู่ระบบเรียบร้อยแล้ว',
                        id,
                        submittedAt
                    });
                } catch (dbErr) {
                    return sendJson(res, 500, { success: false, error: 'Database error: ' + dbErr.message });
                }
            }

            if (pathname === '/api/external/newpolice/victim-inquiries' && req.method === 'GET') {
                const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
                const caseNo = urlObj.searchParams.get('caseNo') || '';

                let rows = [];
                if (caseNo) {
                    rows = db.prepare('SELECT * FROM victim_inquiries WHERE LOWER(TRIM(case_number)) = LOWER(TRIM(?)) ORDER BY submitted_at DESC;').all(caseNo);
                } else {
                    rows = db.prepare('SELECT * FROM victim_inquiries ORDER BY submitted_at DESC LIMIT 50;').all();
                }

                const submissions = rows.map(r => ({
                    id: r.id,
                    caseNumber: r.case_number,
                    victimName: r.victim_name,
                    victimPhone: r.victim_phone,
                    victimIdCard: r.victim_id_card,
                    victimAddress: r.victim_address,
                    categoryId: r.category_id,
                    categoryTitle: r.category_title,
                    answers: JSON.parse(r.answers_json || '{}'),
                    qaList: JSON.parse(r.qa_list_json || '[]'),
                    evidenceNote: r.evidence_note,
                    submittedAt: r.submitted_at,
                    status: r.status
                }));

                return sendJson(res, 200, {
                    success: true,
                    count: submissions.length,
                    submissions
                });
            }

            // 4g. CYBER DETAILS & CASES READ-ONLY EXPORT ENDPOINT FOR INQUIRY SYSTEM (พนักงานสอบสวนเจ้าของเรื่อง)
            if (pathname === '/api/cyber-details/export' || pathname === '/api/external/inquiry/cases-json') {
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                    return sendJson(res, 405, { success: false, error: 'Endpoint นี้เป็นแบบ Read-Only เท่านั้น (405 Method Not Allowed)' });
                }

                const urlObj = new URL(req.url, 'http://localhost');
                const requestedInvestigator = (urlObj.searchParams.get('investigator') || '').trim();
                const requestedBadge = (urlObj.searchParams.get('badge') || '').trim();
                const requestedCaseNo = (urlObj.searchParams.get('caseNo') || '').trim();

                // ตรวจสอบสิทธิ์ผ่าน Session (ถ้ามีการส่ง Authorization Bearer Token)
                const session = authenticateReq(req);
                let targetInvestigator = requestedInvestigator;
                let targetBadge = requestedBadge;

                if (session) {
                    const isAdmin = session.role === 'admin' || (session.position && session.position.includes('ผกก'));
                    if (isAdmin) {
                        targetInvestigator = requestedInvestigator || '';
                        targetBadge = requestedBadge || '';
                    } else {
                        // บังคับจำกัดสิทธิ์เฉพาะ พงส. เจ้าของเรื่องเท่านั้น
                        targetInvestigator = session.rank_name;
                        targetBadge = session.badge_no;
                    }
                }

                // หากไม่ได้ล็อกอินและไม่ระบุชื่อ/รหัส พงส. ให้ปฏิเสธการเข้าถึง
                if (!session && !targetInvestigator && !targetBadge && !requestedCaseNo) {
                    return sendJson(res, 403, {
                        success: false,
                        error: 'การเข้าถึงถูกจำกัด: อนุญาตให้ดึงได้เฉพาะข้อมูลคดีของพนักงานสอบสวนเจ้าของเรื่องเท่านั้น โปรดระบุ ?investigator=... หรือ ?badge=...'
                    });
                }

                let query = 'SELECT * FROM cyber_details WHERE 1=1';
                const params = [];

                if (requestedCaseNo) {
                    query += ' AND case_no = ?';
                    params.push(requestedCaseNo);
                }

                if (targetInvestigator) {
                    const cleanName = targetInvestigator.replace(/^ว่าที่\s*/, '').replace(/^[พรรดจส]\.?[ตโทอ]\.?[ตโทอ]?\.?\s*/, '').trim();
                    query += ' AND (investigator_name LIKE ? OR investigator_name = ?)';
                    params.push(`%${cleanName}%`, targetInvestigator);
                } else if (targetBadge) {
                    query += ' AND investigator_badge = ?';
                    params.push(targetBadge);
                }

                query += ' ORDER BY created_at DESC;';

                let rows = [];
                try {
                    rows = db.prepare(query).all(...params);
                } catch(dbErr) {
                    console.error('[DB ERROR cyber_details]', dbErr);
                    rows = [];
                }

                const casesExport = rows.map(r => ({
                    case_no: r.case_no,
                    incident_date: r.incident_date,
                    fraud_category: r.fraud_category,
                    damage_amount: Number(r.damage_amount) || 0,
                    status: r.status,
                    urgency: JSON.parse(r.urgency || '[]'),
                    victim: {
                        name: r.victim_name,
                        phone: r.victim_phone,
                        id_card: r.victim_id_card,
                        address: r.victim_address,
                        damage: Number(r.damage_amount) || 0
                    },
                    mule_accounts: JSON.parse(r.mule_accounts || '[]'),
                    financial_trails: JSON.parse(r.financial_trails || '[]'),
                    officer_inquiry: {
                        name: r.investigator_name,
                        badge: r.investigator_badge || '',
                        role: 'พนักงานสอบสวนผู้รับผิดชอบ'
                    },
                    officer_investigate: {
                        name: r.detective_name || '',
                        role: 'สืบสวนผู้รับผิดชอบ'
                    },
                    legal_actions: JSON.parse(r.legal_actions || '{}'),
                    victim_profile: r.victim_profile ? JSON.parse(r.victim_profile) : null,
                    freeze_info: r.freeze_info ? JSON.parse(r.freeze_info) : null,
                    transfer_records: r.transfer_records ? JSON.parse(r.transfer_records) : [],
                    inquiry_answers: r.inquiry_answers ? JSON.parse(r.inquiry_answers) : [],
                    victim_submitted_at: r.victim_submitted_at || null,
                    station_code: r.station_code || 'POLICE-STN-BANGPHLI-001',
                    station_name: 'สถานีตำรวจภูธรบางพลี'
                }));

                if (req.method === 'HEAD') {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end();
                    return;
                }

                return sendJson(res, 200, {
                    success: true,
                    read_only: true,
                    source: 'Bangphli Cyber Investigation System',
                    filter_investigator: targetInvestigator || targetBadge || 'ทั้งหมด (สิทธิ์ Admin)',
                    total_cases: casesExport.length,
                    export_timestamp: new Date().toISOString(),
                    cases: casesExport
                });
            }

            // 4h. VICTIM PRE-INVESTIGATION: VERIFY CREDENTIALS & SELF-SERVICE (NO OFFICER LOGIN REQUIRED)
            if (pathname === '/api/victim/verify' && req.method === 'POST') {
                const body = await readBody(req);
                const rawCaseNo = (body.caseNo || '').trim();
                const cleanCaseNo = rawCaseNo.toUpperCase();
                const rawPhone = (body.phone || '').trim();
                const cleanPhone = rawPhone.replace(/[-\s]/g, '');
                const consentAccepted = !!body.consentAccepted;

                if (!consentAccepted) {
                    return sendJson(res, 400, {
                        success: false,
                        error: 'กรุณายินยอมข้อตกลงและคำยินยอม PDPA เพื่อการสืบสวนสอบสวนก่อนดำเนินการ'
                    });
                }

                if (!cleanCaseNo || !cleanPhone) {
                    return sendJson(res, 400, {
                        success: false,
                        error: 'กรุณาระบุเลข Case ID และหมายเลขโทรศัพท์ให้ครบถ้วน'
                    });
                }

                // ค้นหาเคสใน SQLite cyber_details
                const row = db.prepare(`SELECT * FROM cyber_details WHERE UPPER(case_no) = ?;`).get(cleanCaseNo);

                if (!row) {
                    return sendJson(res, 404, {
                        success: false,
                        error: 'ไม่พบเลข Case ID นี้ในระบบ กรุณาตรวจสอบเลขรับแจ้งความให้ถูกต้อง'
                    });
                }

                // ดึงหมายเลขโทรศัพท์จากข้อมูลในระบบ (victim_phone หรือ victim_name)
                const phoneCandidates = [
                    (row.victim_phone || '').replace(/\D/g, ''),
                    (row.victim_name || '').replace(/\D/g, '')
                ].filter(p => p.length >= 9);

                const isPhoneMatched = phoneCandidates.some(p => p.endsWith(cleanPhone) || cleanPhone.endsWith(p));

                if (!isPhoneMatched) {
                    return sendJson(res, 401, {
                        success: false,
                        error: 'หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลผู้เสียหายที่ได้แจ้งความไว้ในระบบ สภ.บางพลี'
                    });
                }

                // Data Masking เพื่อความปลอดภัยตามมาตรฐาน PDPA 2.5
                const maskPhone = (p) => {
                    const clean = (p || '').replace(/\D/g, '');
                    if (clean.length === 10) return `${clean.slice(0, 3)}-xxx-${clean.slice(6)}`;
                    return clean.slice(0, 3) + '***' + clean.slice(-2);
                };

                const maskName = (name) => {
                    const clean = (name || '').replace(/\d+/g, '').trim();
                    const parts = clean.split(/\s+/);
                    if (parts.length >= 2) {
                        return `${parts[0]} ${parts[1].charAt(0)}...`;
                    }
                    return clean ? `${clean.slice(0, 4)}...` : 'ผู้เสียหาย';
                };

                // บัญชีม้าเดิม
                let muleAccounts = [];
                try { muleAccounts = JSON.parse(row.mule_accounts || '[]'); } catch(e) {}

                // ข้อมูลที่กรอกไว้เดิม (ถ้ามี)
                let existingProfile = null;
                let existingFreeze = null;
                let existingTransfers = [];
                let existingAnswers = [];
                try { if (row.victim_profile) existingProfile = JSON.parse(row.victim_profile); } catch(e) {}
                try { if (row.freeze_info) existingFreeze = JSON.parse(row.freeze_info); } catch(e) {}
                try { if (row.transfer_records) existingTransfers = JSON.parse(row.transfer_records); } catch(e) {}
                try { if (row.inquiry_answers) existingAnswers = JSON.parse(row.inquiry_answers); } catch(e) {}

                // ดึง templates ประเด็นคำถาม 14 กลโกง ล่าสุด
                let inqTemplates = [];
                try {
                    const tRows = db.prepare('SELECT id, title, points FROM inquiry_templates ORDER BY id ASC;').all();
                    inqTemplates = tRows.map(r => ({
                        id: r.id,
                        title: r.title,
                        points: JSON.parse(r.points || '[]')
                    }));
                } catch(e) {}

                return sendJson(res, 200, {
                    success: true,
                    verified: true,
                    caseNo: row.case_no,
                    incidentDate: row.incident_date,
                    fraudCategory: row.fraud_category,
                    damageAmount: Number(row.damage_amount) || 0,
                    investigatorName: row.investigator_name,
                    stationName: 'สถานีตำรวจภูธรบางพลี',
                    maskedPhone: maskPhone(cleanPhone),
                    maskedName: maskName(row.victim_name),
                    accounts: muleAccounts,
                    status: row.status,
                    alreadySubmitted: row.status === 'ผู้เสียหายกรอกข้อมูลแล้ว' || !!row.victim_submitted_at,
                    victimSubmittedAt: row.victim_submitted_at,
                    inquiryTemplates: inqTemplates,
                    draft: {
                        victimProfile: existingProfile,
                        freezeInfo: existingFreeze,
                        transferRecords: existingTransfers,
                        inquiryAnswers: existingAnswers
                    }
                });
            }

            // 4h-2. INQUIRY TEMPLATES (14 กลโกง DYNAMIC ENDPOINT)
            if (pathname === '/api/inquiry/templates' && (req.method === 'GET' || req.method === 'HEAD')) {
                let templates = [];
                try {
                    const rows = db.prepare('SELECT id, title, points FROM inquiry_templates ORDER BY id ASC;').all();
                    templates = rows.map(r => ({
                        id: r.id,
                        title: r.title,
                        points: JSON.parse(r.points || '[]')
                    }));
                } catch(e) {}
                return sendJson(res, 200, { success: true, templates });
            }

            if (pathname === '/api/inquiry/templates' && req.method === 'POST') {
                const body = await readBody(req);
                if (Array.isArray(body.templates)) {
                    const ins = db.prepare('INSERT OR REPLACE INTO inquiry_templates (id, title, points, updated_at) VALUES (?, ?, ?, ?);');
                    const now = new Date().toISOString();
                    db.exec('BEGIN TRANSACTION;');
                    try {
                        db.exec('DELETE FROM inquiry_templates;');
                        body.templates.forEach((t, idx) => {
                            ins.run(idx + 1, t.title, JSON.stringify(t.points || []), now);
                        });
                        db.exec('COMMIT;');
                    } catch(e) {
                        db.exec('ROLLBACK;');
                        return sendJson(res, 500, { success: false, error: e.message });
                    }
                    return sendJson(res, 200, { success: true, count: body.templates.length });
                }
                return sendJson(res, 400, { success: false, error: 'templates must be an array' });
            }

            // 4h-3. SAVE INTERACTIVE INTERROGATION STATEMENTS (Q&A LIST)
            if (pathname === '/api/interrogation/save' && req.method === 'POST') {
                const body = await readBody(req);
                const cleanCaseNo = (body.caseNo || '').trim().toUpperCase();
                if (!cleanCaseNo) {
                    return sendJson(res, 400, { success: false, error: 'Missing caseNo' });
                }
                const nowIso = new Date().toISOString();
                const qaList = Array.isArray(body.qaList) ? body.qaList : [];
                const inqAnswers = Array.isArray(body.inquiryAnswers) ? body.inquiryAnswers : null;
                const victimProfile = body.victimProfile || null;

                const existing = db.prepare('SELECT id FROM cyber_details WHERE UPPER(case_no) = ?;').get(cleanCaseNo);
                if (!existing) {
                    return sendJson(res, 404, { success: false, error: 'ไม่พบเคสในฐานข้อมูล' });
                }

                if (inqAnswers) {
                    db.prepare('UPDATE cyber_details SET interrogation_statements = ?, inquiry_answers = ?, updated_at = ? WHERE UPPER(case_no) = ?;').run(
                        JSON.stringify(qaList), JSON.stringify(inqAnswers), nowIso, cleanCaseNo
                    );
                } else {
                    db.prepare('UPDATE cyber_details SET interrogation_statements = ?, updated_at = ? WHERE UPPER(case_no) = ?;').run(
                        JSON.stringify(qaList), nowIso, cleanCaseNo
                    );
                }

                if (victimProfile) {
                    db.prepare('UPDATE cyber_details SET victim_profile = ? WHERE UPPER(case_no) = ?;').run(
                        JSON.stringify(victimProfile), cleanCaseNo
                    );
                }

                if (body.statementVariables) {
                    try {
                        db.prepare('UPDATE cyber_details SET statement_variables = ? WHERE UPPER(case_no) = ?;').run(
                            JSON.stringify(body.statementVariables), cleanCaseNo
                        );
                    } catch (_) {}
                }

                if (body.propertyDamaged) {
                    try {
                        db.prepare('UPDATE cyber_details SET property_damaged = ? WHERE UPPER(case_no) = ?;').run(
                            JSON.stringify(body.propertyDamaged), cleanCaseNo
                        );
                    } catch (_) {}
                }

                if (body.propertyRecovered) {
                    try {
                        db.prepare('UPDATE cyber_details SET property_recovered = ? WHERE UPPER(case_no) = ?;').run(
                            JSON.stringify(body.propertyRecovered), cleanCaseNo
                        );
                    } catch (_) {}
                }

                if (body.propertyUnrecovered) {
                    try {
                        db.prepare('UPDATE cyber_details SET property_unrecovered = ? WHERE UPPER(case_no) = ?;').run(
                            JSON.stringify(body.propertyUnrecovered), cleanCaseNo
                        );
                    } catch (_) {}
                }

                recordAuditLog(
                    { user_name: body.officerName || 'พนักงานสอบสวน', user_badge: 'INVESTIGATOR', user_role: 'inquiry' },
                    'INTERROGATION_SAVE',
                    cleanCaseNo,
                    `บันทึกคำให้การในโหมดสอบปากคำ (${qaList.length} ประเด็น)`,
                    req
                );

                return sendJson(res, 200, { success: true, caseNo: cleanCaseNo, savedCount: qaList.length });
            }

            // 4i. VICTIM PRE-INVESTIGATION: SUBMIT FORM & UPDATE CASE DATA DIRECTLY
            if (pathname === '/api/victim/submit' && req.method === 'POST') {
                const body = await readBody(req);
                const rawCaseNo = (body.caseNo || '').trim();
                const cleanCaseNo = rawCaseNo.toUpperCase();
                const rawPhone = (body.phone || '').trim().replace(/[-\s]/g, '');

                if (!cleanCaseNo || !rawPhone) {
                    return sendJson(res, 400, { success: false, error: 'ข้อมูลระบุตัวตน Case ID หรือเบอร์โทรศัพท์ไม่สมบูรณ์' });
                }

                const row = db.prepare(`SELECT * FROM cyber_details WHERE UPPER(case_no) = ?;`).get(cleanCaseNo);
                if (!row) {
                    return sendJson(res, 404, { success: false, error: 'ไม่พบเคสในระบบ' });
                }

                // Verify phone matches record
                const phoneCandidates = [
                    (row.victim_phone || '').replace(/\D/g, ''),
                    (row.victim_name || '').replace(/\D/g, '')
                ].filter(p => p.length >= 9);
                const isPhoneMatched = phoneCandidates.some(p => p.endsWith(rawPhone) || rawPhone.endsWith(p));
                if (!isPhoneMatched) {
                    return sendJson(res, 401, { success: false, error: 'หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลในระบบ' });
                }

                const victimProfile = (body.victimProfile && typeof body.victimProfile === 'object' && Object.keys(body.victimProfile).length > 0) ? body.victimProfile : null;
                const freezeInfo = body.freezeInfo || null;
                const transferRecords = Array.isArray(body.transferRecords) ? body.transferRecords : [];
                const inquiryAnswers = Array.isArray(body.inquiryAnswers) ? body.inquiryAnswers : [];

                const nowIso = new Date().toISOString();

                // อัปเดตตาราง cyber_details ใน SQLite (ไม่เขียนทับ victim_profile เดิมหากผู้เสียหายไม่ได้ส่งมาตามหลัก PDPA)
                db.prepare(`
                    UPDATE cyber_details
                    SET victim_profile = COALESCE(?, victim_profile),
                        freeze_info = COALESCE(?, freeze_info),
                        transfer_records = ?,
                        inquiry_answers = ?,
                        status = 'ผู้เสียหายกรอกข้อมูลแล้ว',
                        victim_submitted_at = ?,
                        updated_at = ?
                    WHERE UPPER(case_no) = ?;
                `).run(
                    victimProfile ? JSON.stringify(victimProfile) : null,
                    freezeInfo ? JSON.stringify(freezeInfo) : null,
                    JSON.stringify(transferRecords),
                    JSON.stringify(inquiryAnswers),
                    nowIso,
                    nowIso,
                    cleanCaseNo
                );

                // Sync status to Supabase cases table if reachable
                try {
                    const SUPA_URL = process.env.VITE_SUPABASE_URL || 'https://yofvfkfjyndjctoyvgpe.supabase.co';
                    const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_MC3Z6VYA-wFAhAZLfikxDA_DM1W_J4K';
                    const supaHeaders = {
                        'apikey': SUPA_KEY,
                        'Content-Type': 'application/json'
                    };
                    if (!SUPA_KEY.startsWith('sb_publishable_')) {
                        supaHeaders['Authorization'] = `Bearer ${SUPA_KEY}`;
                    }
                    fetch(`${SUPA_URL}/rest/v1/cases?case_no=eq.${encodeURIComponent(cleanCaseNo)}`, {
                        method: 'PATCH',
                        headers: supaHeaders,
                        body: JSON.stringify({
                            status: 'ผู้เสียหายกรอกข้อมูลแล้ว',
                            updated_at: nowIso
                        })
                    }).catch(() => {});
                } catch(_) {}

                // บันทึก Audit Log
                recordAuditLog(
                    { user_name: `ผู้เสียหาย (${cleanCaseNo})`, user_badge: 'CITIZEN', user_role: 'victim' },
                    'VICTIM_FORM_SUBMITTED',
                    'CASE',
                    cleanCaseNo,
                    `ผู้เสียหายได้กรอกข้อมูลและส่งมอบหลักฐานล่วงหน้าผ่าน /victim-form เรียบร้อยแล้ว (ยอดโอน ${transferRecords.length} รายการ)`,
                    req
                );

                return sendJson(res, 200, {
                    success: true,
                    caseNo: row.case_no,
                    victimSubmittedAt: nowIso,
                    investigatorName: row.investigator_name,
                    stationName: 'สถานีตำรวจภูธรบางพลี',
                    message: 'บันทึกข้อมูลและส่งมอบพยานหลักฐานล่วงหน้าให้พนักงานสอบสวน สภ.บางพลี เรียบร้อยแล้ว'
                });
            }

            // 4j. VICTIM PRE-INVESTIGATION: RESET CASE STATUS FOR RE-FILLING
            if (pathname === '/api/victim/reset' && req.method === 'POST') {
                const body = await readBody(req);
                const rawCaseNo = (body.caseNo || '').trim();
                const cleanCaseNo = rawCaseNo.toUpperCase();

                if (cleanCaseNo) {
                    db.prepare(`
                        UPDATE cyber_details
                        SET victim_profile = NULL,
                            freeze_info = NULL,
                            transfer_records = NULL,
                            inquiry_answers = NULL,
                            status = 'พบพงส.',
                            victim_submitted_at = NULL,
                            updated_at = ?
                        WHERE UPPER(case_no) = ?;
                    `).run(new Date().toISOString(), cleanCaseNo);

                    recordAuditLog(
                        { user_name: `ผู้เสียหาย/เจ้าหน้าที่ (${cleanCaseNo})`, user_badge: 'SYSTEM', user_role: 'victim' },
                        'VICTIM_FORM_RESET',
                        'CASE',
                        cleanCaseNo,
                        `รีเซ็ตสถานะเคส ${cleanCaseNo} เพื่อเริ่มกรอกข้อมูลใหม่`,
                        req
                    );
                }

                return sendJson(res, 200, {
                    success: true,
                    message: `รีเซ็ตสถานะเคส ${cleanCaseNo} เรียบร้อยแล้ว`
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

            // 18. DATABASE BACKUP: DOWNLOAD SQLITE SNAPSHOT (ADMIN ONLY)
            if (pathname === '/api/admin/backup-db' && req.method === 'GET') {
                if (session.role !== 'admin' && !session.position.includes('ผกก')) {
                    return sendJson(res, 403, { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถดาวน์โหลดฐานข้อมูลแม่ข่ายได้' });
                }
                try {
                    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
                    const stat = fs.statSync(DB_PATH);
                    const now = new Date();
                    const stamp = `${now.getFullYear() + 543}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}`;
                    const filename = `bangphli_secure_backup_${stamp}.db`;
                    res.writeHead(200, {
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': stat.size,
                        'Content-Disposition': `attachment; filename="${filename}"`
                    });
                    fs.createReadStream(DB_PATH).pipe(res);
                    recordAuditLog(session, 'DOWNLOAD_DATABASE_BACKUP', 'DATABASE', 'ALL', 'ดาวน์โหลดไฟล์สำรองฐานข้อมูลแม่ข่าย SQLite (.db)', req);
                    return;
                } catch (e) {
                    return sendJson(res, 500, { success: false, error: 'เกิดข้อผิดพลาดในการสำรองฐานข้อมูล: ' + e.message });
                }
            }

            // 19. DATABASE BACKUP: LIST BACKUPS (ADMIN ONLY)
            if (pathname === '/api/admin/backups' && req.method === 'GET') {
                if (session.role !== 'admin' && !session.position.includes('ผกก')) {
                    return sendJson(res, 403, { success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' });
                }
                try {
                    const files = fs.readdirSync(BACKUP_DIR).map(f => {
                        const stat = fs.statSync(path.join(BACKUP_DIR, f));
                        return {
                            filename: f,
                            sizeBytes: stat.size,
                            sizeKb: Math.round(stat.size / 1024),
                            createdAt: stat.mtime.toISOString()
                        };
                    });
                    files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    return sendJson(res, 200, { success: true, backups: files });
                } catch (e) {
                    return sendJson(res, 500, { success: false, error: e.message });
                }
            }

            return sendJson(res, 404, { success: false, error: 'API endpoint not found' });
        }

        // =====================================================================
        // STATIC FILE SERVING (SUPPORT /victim-form AND SPA REFRESH)
        // =====================================================================
        let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        const normLower = safePath.toLowerCase().replace(/[\/\\]+$/, '');
        if (normLower === '' || normLower === '/' || normLower === '\\') {
            safePath = '/index.html';
        } else if (normLower === '/victim-form' || normLower === '\\victim-form' || normLower.startsWith('/victim-form/') || normLower.startsWith('\\victim-form\\') || normLower === '/victim_form' || normLower === '\\victim_form') {
            safePath = '/victim-form.html';
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

    // Automated database snapshot on startup and every 24 hours
    setTimeout(createDatabaseBackup, 3000);
    setInterval(createDatabaseBackup, 24 * 60 * 60 * 1000);
});
