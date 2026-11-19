/**
 * =========================================================================================
 * 🛡️ ZERO-KNOWLEDGE CLIENT-SIDE ENCRYPTION ENGINE (Web Crypto API - AES-256-GCM)
 * สถานีตำรวจภูธรบางพลี (POLICE-STN-BANGPHLI-001)
 * =========================================================================================
 * ใช้ Web Crypto API (crypto.subtle) เข้ารหัสข้อมูลส่วนบุคคลสำคัญ:
 *  - เลขบัตรประจำตัวประชาชน 13 หลัก (national_id_enc)
 *  - ที่อยู่ตามทะเบียนราษฎร์/ที่เกิดเหตุ (address_enc)
 *  - เบอร์โทรศัพท์ (phone_enc)
 *  - เลขบัญชีธนาคาร (bank_account_enc)
 *  - ชื่อ-นามสกุล และรายละเอียดสำนวน (full_name_enc, summary_enc)
 * ด้วยกุญแจหลักของสถานี (Station Master Key) ภายในเครื่องผู้ใช้ก่อนส่งขึ้น Supabase Cloud ทุกครั้ง
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ZeroKnowledgeCrypto = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEFAULT_STATION_CODE = 'POLICE-STN-BANGPHLI-001';
    const LEGACY_INSECURE_DEFAULTS = ['BANGPHLI-ZK-MASTER-KEY-2569'];
    const PBKDF2_ITERATIONS = 100000;
    const ZK_PREFIX = 'zk:v1:';
    let _inMemoryMasterKey = '';

    // รองรับทั้ง Browser (window.crypto) และ Node.js (crypto.webcrypto)
    function getWebCrypto() {
        if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
            return window.crypto;
        }
        if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
            return globalThis.crypto;
        }
        if (typeof require === 'function') {
            return require('node:crypto').webcrypto;
        }
        throw new Error('Web Crypto API (crypto.subtle) ไม่รองรับในสภาพแวดล้อมนี้');
    }

    function bytesToBase64(bytes) {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(bytes).toString('base64');
        }
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function base64ToBytes(base64) {
        if (typeof Buffer !== 'undefined') {
            return new Uint8Array(Buffer.from(base64, 'base64'));
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    // Cache derived CryptoKey in memory for performance
    const keyCache = new Map();

    /**
     * สร้างกุญแจ AES-256-GCM (256-bit) จากรหัสผ่านหลักของสถานี (Station Master Key)
     * ด้วยอัลกอริทึม PBKDF2-SHA256 (100,000 รอบ)
     */
    async function deriveStationKey(masterPassphrase, stationCode) {
        const pass = String(masterPassphrase || getSavedMasterKey() || '').trim();
        if (!pass) {
            const err = new Error('ยังไม่ได้ตั้งค่ารหัสผ่านหลักของสถานี (Station Master Key) สำหรับเข้ารหัส/ถอดรหัส Zero-Knowledge');
            err.code = 'MASTER_KEY_NOT_CONFIGURED';
            throw err;
        }
        const station = (stationCode || DEFAULT_STATION_CODE).trim();
        const cacheKey = `${station}::${pass}`;

        if (keyCache.has(cacheKey)) {
            return keyCache.get(cacheKey);
        }

        const webCrypto = getWebCrypto();
        const encoder = new TextEncoder();
        const keyMaterial = await webCrypto.subtle.importKey(
            'raw',
            encoder.encode(pass),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        const salt = encoder.encode(`ZK-SALT-V1-${station}`);
        const derivedKey = await webCrypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        keyCache.set(cacheKey, derivedKey);
        return derivedKey;
    }

    /**
     * สร้างลายนิ้วมือของกุญแจ (Key Fingerprint) ขนาด 12 ตัวอักษร เพื่อใช้ตรวจสอบว่ากุญแจตรงกันหรือไม่
     * โดยไม่เปิดเผยรหัสผ่านหลัก (Zero-Knowledge Fingerprint)
     */
    async function getKeyFingerprint(masterPassphrase, stationCode) {
        const pass = String(masterPassphrase || getSavedMasterKey() || '').trim();
        if (!pass) return 'fp_unset';
        const station = (stationCode || DEFAULT_STATION_CODE).trim();
        const webCrypto = getWebCrypto();
        const encoder = new TextEncoder();
        const data = encoder.encode(`ZK-FINGERPRINT-V1:${station}:${pass}`);
        const hashBuffer = await webCrypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return 'fp_' + hashHex.slice(0, 12);
    }

    /**
     * ดึง Station Master Key จาก session/memory (หรือ localStorage เฉพาะเมื่อตั้งใจจำไว้บนเครื่องสถานีที่ปลอดภัย)
     * ไม่คืนค่ารหัสผ่าน Hardcoded จากซอร์สโค้ดอีกต่อไป
     */
    function getSavedMasterKey() {
        if (_inMemoryMasterKey) return _inMemoryMasterKey;
        try {
            if (typeof sessionStorage !== 'undefined') {
                const sKey = sessionStorage.getItem('cyber_zk_station_master_key');
                if (sKey && sKey.trim()) return sKey.trim();
            }
            if (typeof localStorage !== 'undefined') {
                const lKey = localStorage.getItem('cyber_zk_station_master_key');
                if (lKey && lKey.trim()) return lKey.trim();
            }
        } catch (_) {}
        return '';
    }

    function hasConfiguredMasterKey() {
        return Boolean(getSavedMasterKey());
    }

    function isLegacyDefaultKey(passphrase) {
        const p = String(passphrase !== undefined ? passphrase : getSavedMasterKey()).trim();
        return Boolean(p && LEGACY_INSECURE_DEFAULTS.includes(p));
    }

    function setSavedMasterKey(newPassphrase, persistLocal = false) {
        if (!newPassphrase || !String(newPassphrase).trim()) return;
        const clean = String(newPassphrase).trim();
        keyCache.clear();
        _inMemoryMasterKey = clean;
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('cyber_zk_station_master_key', clean);
            }
            if (typeof localStorage !== 'undefined') {
                if (persistLocal) {
                    localStorage.setItem('cyber_zk_station_master_key', clean);
                } else {
                    localStorage.removeItem('cyber_zk_station_master_key');
                }
            }
        } catch (_) {}
    }

    function clearSavedMasterKey() {
        keyCache.clear();
        _inMemoryMasterKey = '';
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('cyber_zk_station_master_key');
            if (typeof localStorage !== 'undefined') localStorage.removeItem('cyber_zk_station_master_key');
        } catch (_) {}
    }

    /**
     * เข้ารหัสข้อความด้วย AES-256-GCM (Web Crypto API)
     * คืนค่ารูปแบบ: zk:v1:<iv_base64>:<ciphertext_and_tag_base64>
     */
    async function encryptField(plainText, masterPassphrase, stationCode) {
        if (plainText === null || plainText === undefined || plainText === '') {
            return '';
        }
        const str = typeof plainText === 'string' ? plainText : JSON.stringify(plainText);
        if (str.startsWith(ZK_PREFIX)) {
            return str; // เข้ารหัสไว้แล้ว
        }

        const webCrypto = getWebCrypto();
        const key = await deriveStationKey(masterPassphrase, stationCode);
        const iv = webCrypto.getRandomValues(new Uint8Array(12)); // 96-bit IV มาตรฐาน NIST สำหรับ AES-GCM
        const encoder = new TextEncoder();
        const encodedData = encoder.encode(str);

        const cipherBuffer = await webCrypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 },
            key,
            encodedData
        );

        const ivB64 = bytesToBase64(iv);
        const cipherB64 = bytesToBase64(new Uint8Array(cipherBuffer));
        return `${ZK_PREFIX}${ivB64}:${cipherB64}`;
    }

    /**
     * ถอดรหัสข้อความจากรูปแบบ zk:v1:<iv_base64>:<ciphertext_base64> ด้วย AES-256-GCM
     */
    async function decryptField(zkPayload, masterPassphrase, stationCode) {
        if (!zkPayload || typeof zkPayload !== 'string') {
            return '';
        }
        if (!zkPayload.startsWith(ZK_PREFIX)) {
            return zkPayload;
        }

        const raw = zkPayload.slice(ZK_PREFIX.length);
        const parts = raw.split(':');
        if (parts.length !== 2) {
            throw new Error('รูปแบบข้อมูล Ciphertext ไม่ถูกต้อง');
        }

        const iv = base64ToBytes(parts[0]);
        const cipherBytes = base64ToBytes(parts[1]);
        const webCrypto = getWebCrypto();
        const key = await deriveStationKey(masterPassphrase, stationCode);

        const decryptedBuffer = await webCrypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 },
            key,
            cipherBytes
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    }

    /**
     * เข้ารหัสข้อมูลส่วนบุคคลสำคัญ (PII) ของผู้เสียหาย/ผู้ต้องหา สำหรับบันทึกขึ้นตาราง public.subjects บน Supabase
     * บังคับเข้ารหัส: เลขบัตรประชาชน 13 หลัก, ที่อยู่, เบอร์โทรศัพท์, เลขบัญชีธนาคาร, ชื่อ-นามสกุล
     */
    async function encryptSubjectForSupabase(subjectInput, masterPassphrase, stationCode) {
        const station = stationCode || DEFAULT_STATION_CODE;
        const fp = await getKeyFingerprint(masterPassphrase, station);

        const fullName = subjectInput.fullName || `${subjectInput.prefix || ''}${subjectInput.firstName || ''} ${subjectInput.lastName || ''}`.trim() || 'ไม่ระบุชื่อ';
        const nationalId = String(subjectInput.idCard || subjectInput.nationalId || '').replace(/[^0-9]/g, '');
        const address = subjectInput.addressFull || `${subjectInput.address || ''} ต.${subjectInput.tam || ''} อ.${subjectInput.amp || ''} จ.${subjectInput.prov || ''} ${subjectInput.zip || ''}`.trim();
        const phone = String(subjectInput.phone || '').trim();
        const bankAccount = String(subjectInput.bankAccount || subjectInput.bank || '').trim();

        const extraObj = {
            age: subjectInput.age || null,
            birthDate: subjectInput.birthDate || null,
            gender: subjectInput.gender || null,
            nationality: subjectInput.nationality || 'ไทย',
            occupation: subjectInput.occupation || null,
            charges: subjectInput.charges || [],
            plea: subjectInput.plea || null
        };

        return {
            case_id: subjectInput.caseId || null,
            station_code: station,
            subject_role: subjectInput.role || 'suspect',
            display_alias: subjectInput.displayAlias || `${subjectInput.role === 'victim' ? 'ผู้เสียหาย' : 'ผู้ต้องหา'} (เข้ารหัส Zero-Knowledge)`,
            full_name_enc: await encryptField(fullName, masterPassphrase, station),
            national_id_enc: nationalId ? await encryptField(nationalId, masterPassphrase, station) : null,
            address_enc: address ? await encryptField(address, masterPassphrase, station) : null,
            phone_enc: phone ? await encryptField(phone, masterPassphrase, station) : null,
            bank_account_enc: bankAccount ? await encryptField(bankAccount, masterPassphrase, station) : null,
            extra_pii_enc: await encryptField(JSON.stringify(extraObj), masterPassphrase, station),
            encryption_algo: 'AES-256-GCM-WebCrypto',
            key_fingerprint: fp,
            created_by: subjectInput.createdBy || 'POLICE-OFFICER'
        };
    }

    /**
     * ถอดรหัสข้อมูลผู้เสียหาย/ผู้ต้องหาที่ดึงมาจากตาราง public.subjects บน Supabase
     */
    async function decryptSubjectFromSupabase(row, masterPassphrase, stationCode) {
        if (!row) return null;
        let extra = {};
        try {
            if (row.extra_pii_enc) {
                const extraStr = await decryptField(row.extra_pii_enc, masterPassphrase, stationCode);
                extra = JSON.parse(extraStr);
            }
        } catch (_) {}

        return {
            id: row.id,
            caseId: row.case_id,
            stationCode: row.station_code,
            role: row.subject_role,
            displayAlias: row.display_alias,
            fullName: row.full_name_enc ? await decryptField(row.full_name_enc, masterPassphrase, stationCode) : '',
            idCard: row.national_id_enc ? await decryptField(row.national_id_enc, masterPassphrase, stationCode) : '',
            address: row.address_enc ? await decryptField(row.address_enc, masterPassphrase, stationCode) : '',
            phone: row.phone_enc ? await decryptField(row.phone_enc, masterPassphrase, stationCode) : '',
            bankAccount: row.bank_account_enc ? await decryptField(row.bank_account_enc, masterPassphrase, stationCode) : '',
            extra,
            keyFingerprint: row.key_fingerprint,
            createdAt: row.created_at
        };
    }

    /**
     * เข้ารหัสข้อมูลคดีสำหรับตาราง public.cases บน Supabase
     */
    async function encryptCaseForSupabase(caseInput, masterPassphrase, stationCode) {
        const station = stationCode || DEFAULT_STATION_CODE;
        const fp = await getKeyFingerprint(masterPassphrase, station);

        const summaryText = caseInput.narrative || caseInput.summary || caseInput.mainCharge || '';
        const metaObj = {
            unit: caseInput.unit || 'สภ.บางพลี ภ.จว.สมุทรปราการ ภ.๑',
            recordLocation: caseInput.recordLocation || '',
            date: caseInput.date || '',
            time: caseInput.time || '',
            coords: caseInput.coords || '',
            warrantNo: caseInput.warrantNo || '',
            warrantCourt: caseInput.warrantCourt || '',
            detectiveName: caseInput.detectiveName || '',
            evidences: caseInput.evidences || [],
            officers: caseInput.officers || []
        };

        const payload = {
            id: String(caseInput.id || caseInput.caseNo || `CASE-${Date.now()}`),
            case_no: String(caseInput.caseNo || caseInput.id || `ตช-0016.36-${Date.now()}`),
            station_code: station,
            case_type: caseInput.caseType || caseInput.type || 'คดีอาชญากรรมทางเทคโนโลยี',
            fraud_category: caseInput.fraudCategory || caseInput.mainCharge || 'ฉ้อโกงออนไลน์',
            status: caseInput.status || 'กำลังสืบสวน/จับกุม',
            damage_amount: Number(caseInput.damageAmount || 0),
            investigator_name: caseInput.investigatorName || (caseInput.officers && caseInput.officers[0]?.name) || 'เจ้าหน้าที่สืบสวน สภ.บางพลี',
            investigator_badge: caseInput.investigatorBadge || '20001',
            detective_name: caseInput.detectiveName || null,
            summary_enc: summaryText ? await encryptField(summaryText, masterPassphrase, station) : null,
            metadata_enc: await encryptField(JSON.stringify(metaObj), masterPassphrase, station),
            encryption_algo: 'AES-256-GCM-WebCrypto',
            key_fingerprint: fp,
            created_by: caseInput.createdBy || 'POLICE-OFFICER'
        };
        if (caseInput.victimName !== undefined) payload.victim_name = caseInput.victimName;
        if (caseInput.victimPhone !== undefined) payload.victim_phone = caseInput.victimPhone;
        if (caseInput.incidentDate !== undefined) payload.incident_date = caseInput.incidentDate;
        if (caseInput.muleAccounts !== undefined) payload.mule_accounts = caseInput.muleAccounts;
        return payload;
    }

    return {
        DEFAULT_STATION_CODE,
        ZK_PREFIX,
        deriveStationKey,
        getKeyFingerprint,
        getSavedMasterKey,
        hasConfiguredMasterKey,
        isLegacyDefaultKey,
        setSavedMasterKey,
        clearSavedMasterKey,
        encryptField,
        decryptField,
        encryptSubjectForSupabase,
        decryptSubjectFromSupabase,
        encryptCaseForSupabase
    };
});
