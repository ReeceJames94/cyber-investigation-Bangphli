-- =========================================================================================
-- 🛡️ CYBER INVESTIGATION PORTAL - สภ.บางพลี (POLICE-STN-BANGPHLI-001)
-- ZERO-KNOWLEDGE PRIVATE CLOUD SCHEMA & ROW LEVEL SECURITY (RLS)
-- สำหรับรันใน Supabase SQL Editor (https://supabase.com/dashboard/project/yofvfkfjyndjctoyvgpe/sql)
-- =========================================================================================

-- เปิดใช้งาน Extension สำหรับสร้าง UUID
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================================================
-- 1. ตาราง cases: เก็บข้อมูลคดี, เลขคดี, รหัสสถานีตำรวจ และสถานะคดี
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.cases (
    id TEXT PRIMARY KEY,
    case_no TEXT NOT NULL,
    station_code TEXT NOT NULL DEFAULT 'POLICE-STN-BANGPHLI-001',
    case_type TEXT NOT NULL DEFAULT 'คดีอาชญากรรมทางเทคโนโลยี',
    fraud_category TEXT,
    status TEXT NOT NULL DEFAULT 'อยู่ระหว่างสืบสวน/สอบสวน',
    damage_amount NUMERIC(15, 2) DEFAULT 0.00,
    investigator_name TEXT,
    investigator_badge TEXT,
    -- ข้อมูลพฤติการณ์และรายละเอียดสำนวนที่เข้ารหัส AES-256-GCM ฝั่ง Client แล้ว
    summary_enc TEXT,
    metadata_enc TEXT,
    encryption_algo TEXT NOT NULL DEFAULT 'AES-256-GCM',
    key_fingerprint TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cases_station CHECK (station_code = 'POLICE-STN-BANGPHLI-001')
);

CREATE INDEX IF NOT EXISTS idx_cases_case_no ON public.cases(case_no);
CREATE INDEX IF NOT EXISTS idx_cases_station_status ON public.cases(station_code, status);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON public.cases(created_at DESC);

-- =========================================================================================
-- 2. ตาราง subjects: เก็บข้อมูลผู้เสียหาย/ผู้ต้องหา (Zero-Knowledge AES-256-GCM Encrypted)
-- บังคับให้ฟิลด์ข้อมูลส่วนบุคคลสำคัญ (เลขบัตร 13 หลัก, ที่อยู่, เบอร์โทร, บัญชีธนาคาร)
-- ต้องอยู่ในรูปแบบ Ciphertext (zk:v1:<iv_base64>:<ciphertext_base64>) เท่านั้น
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id TEXT REFERENCES public.cases(id) ON DELETE CASCADE,
    station_code TEXT NOT NULL DEFAULT 'POLICE-STN-BANGPHLI-001',
    subject_role TEXT NOT NULL DEFAULT 'suspect' CHECK (subject_role IN ('suspect', 'victim', 'arrestee', 'witness')),
    display_alias TEXT DEFAULT 'ปกปิดชื่อ (Zero-Knowledge)',
    -- ฟิลด์ข้อมูลส่วนบุคคลที่เข้ารหัสด้วย Web Crypto API (AES-256-GCM) จากเครื่องผู้ใช้ก่อนส่งขึ้น Cloud
    full_name_enc TEXT NOT NULL,
    national_id_enc TEXT,      -- เลขบัตรประจำตัวประชาชน 13 หลัก (AES-256-GCM)
    address_enc TEXT,          -- ที่อยู่ตามทะเบียนราษฎร์/ที่เกิดเหตุ (AES-256-GCM)
    phone_enc TEXT,            -- หมายเลขโทรศัพท์ (AES-256-GCM)
    bank_account_enc TEXT,     -- เลขบัญชีธนาคาร/กระเป๋าเงินดิจิทัล (AES-256-GCM)
    extra_pii_enc TEXT,        -- ข้อมูลประกอบอื่นๆ ที่เข้ารหัสแล้ว (เช่น วันเกิด, อาชีพ, พิกัดจับกุม)
    encryption_algo TEXT NOT NULL DEFAULT 'AES-256-GCM-WebCrypto',
    key_fingerprint TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Zero-Knowledge Database Constraint: ป้องกันการส่งข้อมูล Plaintext ที่ไม่ได้เข้ารหัสขึ้น Cloud
    CONSTRAINT chk_subjects_station CHECK (station_code = 'POLICE-STN-BANGPHLI-001'),
    CONSTRAINT chk_zk_national_id CHECK (national_id_enc IS NULL OR national_id_enc = '' OR national_id_enc LIKE 'zk:v1:%'),
    CONSTRAINT chk_zk_address CHECK (address_enc IS NULL OR address_enc = '' OR address_enc LIKE 'zk:v1:%'),
    CONSTRAINT chk_zk_phone CHECK (phone_enc IS NULL OR phone_enc = '' OR phone_enc LIKE 'zk:v1:%'),
    CONSTRAINT chk_zk_bank_account CHECK (bank_account_enc IS NULL OR bank_account_enc = '' OR bank_account_enc LIKE 'zk:v1:%')
);

CREATE INDEX IF NOT EXISTS idx_subjects_case_id ON public.subjects(case_id);
CREATE INDEX IF NOT EXISTS idx_subjects_role ON public.subjects(station_code, subject_role);

-- =========================================================================================
-- 3. ตาราง audit_logs: เก็บประวัติการเข้าดูข้อมูล, แก้ไขสำนวน, Export เอกสาร (Insert-Only / WORM)
-- ตามมาตรฐาน พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) และระเบียบสำนักงานตำรวจแห่งชาติ
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    station_code TEXT NOT NULL DEFAULT 'POLICE-STN-BANGPHLI-001',
    actor_badge TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL DEFAULT 'officer',
    action TEXT NOT NULL,       -- เช่น VIEW_CASE, CREATE_CASE, UPDATE_CASE, EXPORT_DOCX, SEARCH_CIVIL_REG, ZK_SYNC
    target_type TEXT NOT NULL,  -- เช่น CASE, SUBJECT, ARREST, CIVIL_REG, SYSTEM
    target_id TEXT,
    details TEXT,
    client_ip TEXT,
    user_agent TEXT,
    CONSTRAINT chk_audit_station CHECK (station_code = 'POLICE-STN-BANGPHLI-001')
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_badge, action);

-- =========================================================================================
-- 4. TRIGGER บังคับให้ audit_logs เป็นแบบ INSERT-ONLY (ห้ามแก้ไขหรือลบประวัติย้อนหลังเด็ดขาด)
-- =========================================================================================
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: ตาราง audit_logs เป็นแบบ Insert-Only ไม่อนุญาตให้แก้ไข (UPDATE) หรือลบ (DELETE) ประวัติย้อนหลังตามมาตรฐาน PDPA';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_log_modification();

-- Trigger อัปเดตเวลา updated_at อัตโนมัติสำหรับ cases และ subjects
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cases_updated_at ON public.cases;
CREATE TRIGGER trg_cases_updated_at
BEFORE UPDATE ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_subjects_updated_at ON public.subjects;
CREATE TRIGGER trg_subjects_updated_at
BEFORE UPDATE ON public.subjects
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================================
-- 5. เปิดใช้งาน ROW LEVEL SECURITY (RLS) และสร้าง POLICY กำกับทุกตาราง
-- =========================================================================================
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ล้าง Policy เดิม (หากต้องการรันซ้ำเพื่ออัปเดต)
DROP POLICY IF EXISTS "cases_select_bangphli" ON public.cases;
DROP POLICY IF EXISTS "cases_insert_bangphli" ON public.cases;
DROP POLICY IF EXISTS "cases_update_bangphli" ON public.cases;
DROP POLICY IF EXISTS "cases_delete_bangphli" ON public.cases;

DROP POLICY IF EXISTS "subjects_select_bangphli" ON public.subjects;
DROP POLICY IF EXISTS "subjects_insert_bangphli_zk" ON public.subjects;
DROP POLICY IF EXISTS "subjects_update_bangphli_zk" ON public.subjects;
DROP POLICY IF EXISTS "subjects_delete_bangphli" ON public.subjects;

DROP POLICY IF EXISTS "audit_logs_select_bangphli" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_only_bangphli" ON public.audit_logs;

-- -----------------------------------------------------------------------------------------
-- RLS Policies สำหรับตาราง public.cases (เฉพาะรหัสสถานี POLICE-STN-BANGPHLI-001)
-- -----------------------------------------------------------------------------------------
CREATE POLICY "cases_select_bangphli"
ON public.cases FOR SELECT
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001');

CREATE POLICY "cases_insert_bangphli"
ON public.cases FOR INSERT
TO anon, authenticated
WITH CHECK (
    station_code = 'POLICE-STN-BANGPHLI-001'
    AND length(trim(case_no)) > 0
);

CREATE POLICY "cases_update_bangphli"
ON public.cases FOR UPDATE
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001')
WITH CHECK (station_code = 'POLICE-STN-BANGPHLI-001');

CREATE POLICY "cases_delete_bangphli"
ON public.cases FOR DELETE
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001');

-- -----------------------------------------------------------------------------------------
-- RLS Policies สำหรับตาราง public.subjects (บังคับ Zero-Knowledge Ciphertext Format)
-- -----------------------------------------------------------------------------------------
CREATE POLICY "subjects_select_bangphli"
ON public.subjects FOR SELECT
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001');

CREATE POLICY "subjects_insert_bangphli_zk"
ON public.subjects FOR INSERT
TO anon, authenticated
WITH CHECK (
    station_code = 'POLICE-STN-BANGPHLI-001'
    AND full_name_enc LIKE 'zk:v1:%'
    AND (national_id_enc IS NULL OR national_id_enc = '' OR national_id_enc LIKE 'zk:v1:%')
    AND (address_enc IS NULL OR address_enc = '' OR address_enc LIKE 'zk:v1:%')
    AND (phone_enc IS NULL OR phone_enc = '' OR phone_enc LIKE 'zk:v1:%')
    AND (bank_account_enc IS NULL OR bank_account_enc = '' OR bank_account_enc LIKE 'zk:v1:%')
);

CREATE POLICY "subjects_update_bangphli_zk"
ON public.subjects FOR UPDATE
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001')
WITH CHECK (
    station_code = 'POLICE-STN-BANGPHLI-001'
    AND full_name_enc LIKE 'zk:v1:%'
    AND (national_id_enc IS NULL OR national_id_enc = '' OR national_id_enc LIKE 'zk:v1:%')
    AND (address_enc IS NULL OR address_enc = '' OR address_enc LIKE 'zk:v1:%')
    AND (phone_enc IS NULL OR phone_enc = '' OR phone_enc LIKE 'zk:v1:%')
    AND (bank_account_enc IS NULL OR bank_account_enc = '' OR bank_account_enc LIKE 'zk:v1:%')
);

CREATE POLICY "subjects_delete_bangphli"
ON public.subjects FOR DELETE
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001');

-- -----------------------------------------------------------------------------------------
-- RLS Policies สำหรับตาราง public.audit_logs (INSERT-ONLY: มีเฉพาะ SELECT และ INSERT เท่านั้น)
-- ไม่อนุญาตให้มี Policy สำหรับ UPDATE หรือ DELETE อย่างเด็ดขาด
-- -----------------------------------------------------------------------------------------
CREATE POLICY "audit_logs_select_bangphli"
ON public.audit_logs FOR SELECT
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001');

CREATE POLICY "audit_logs_insert_only_bangphli"
ON public.audit_logs FOR INSERT
TO anon, authenticated
WITH CHECK (
    station_code = 'POLICE-STN-BANGPHLI-001'
    AND length(trim(actor_badge)) > 0
    AND length(trim(action)) > 0
);

-- =========================================================================================
-- 5. ตาราง newpolice_connections: เกตเวย์ควบคุมการเชื่อมต่อซิ้งค์ข้อมูลโครงการ newpolice
-- กำหนดให้สถานะเริ่มต้นเป็น 'pending' (รอแอดมินอนุมัติ) และต้องให้แอดมินอนุมัติก่อนจึงเข้าถึงข้อมูลได้
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.newpolice_connections (
    id TEXT PRIMARY KEY,
    station_code TEXT NOT NULL DEFAULT 'POLICE-STN-BANGPHLI-001',
    project_code TEXT NOT NULL DEFAULT 'newpolice',
    project_name TEXT NOT NULL DEFAULT 'โครงการ newpolice (ระบบงานสืบสวนสอบสวนคดีอาญาและคดีไซเบอร์ ตร.)',
    gateway_node TEXT NOT NULL DEFAULT 'NP-GW-BANGPHLI-SYNC',
    origin_ip TEXT NOT NULL DEFAULT '10.220.14.88',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    data_scope TEXT NOT NULL,
    item_count INTEGER DEFAULT 0,
    payload_encrypted TEXT,
    auth_handshake_key TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by TEXT,
    reviewed_by_name TEXT,
    reviewed_at TIMESTAMPTZ,
    notes TEXT,
    CONSTRAINT chk_newpolice_station CHECK (station_code = 'POLICE-STN-BANGPHLI-001')
);

ALTER TABLE public.newpolice_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "newpolice_select_bangphli"
ON public.newpolice_connections FOR SELECT
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001');

CREATE POLICY "newpolice_insert_bangphli"
ON public.newpolice_connections FOR INSERT
TO anon, authenticated
WITH CHECK (station_code = 'POLICE-STN-BANGPHLI-001');

CREATE POLICY "newpolice_update_bangphli"
ON public.newpolice_connections FOR UPDATE
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001')
WITH CHECK (station_code = 'POLICE-STN-BANGPHLI-001');

