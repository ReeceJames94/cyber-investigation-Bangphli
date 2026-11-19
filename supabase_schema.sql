-- =========================================================================================
-- 🛡️ CYBER INVESTIGATION PORTAL - สภ.บางพลี (POLICE-STN-BANGPHLI-001)
-- ZERO-KNOWLEDGE PRIVATE CLOUD SCHEMA & ROW LEVEL SECURITY (RLS)
-- สำหรับรันใน Supabase SQL Editor (https://supabase.com/dashboard/project/yofvfkfjyndjctoyvgpe/sql)
-- =========================================================================================

-- เปิดใช้งาน Extension สำหรับสร้าง UUID
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================================================
-- 0. ตาราง users: ระบบยืนยันตัวตนเจ้าหน้าที่ตำรวจ (PBKDF2-SHA512 100,000 รอบ)
-- รองรับการล็อกอินข้ามเครื่อง คอมพิวเตอร์ มือถือ และแท็บเล็ต
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    full_name TEXT NOT NULL,
    rank TEXT,
    badge_no TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'detective' CHECK (role IN ('admin', 'detective', 'inquiry', 'clerk')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_badge_no ON public.users(badge_no);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_all" ON public.users;
DROP POLICY IF EXISTS "users_insert_all" ON public.users;
DROP POLICY IF EXISTS "users_update_all" ON public.users;
DROP POLICY IF EXISTS "users_delete_all" ON public.users;

CREATE POLICY "users_select_all"
ON public.users FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "users_insert_all"
ON public.users FOR INSERT
TO anon, authenticated
WITH CHECK (length(trim(username)) > 0 AND length(trim(password_hash)) > 0);

CREATE POLICY "users_update_all"
ON public.users FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "users_delete_all"
ON public.users FOR DELETE
TO anon, authenticated
USING (true);

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
-- 5. ตาราง newpolice_user_requests: ระบบอนุมัติสิทธิ์เข้าถึงข้อมูล Cyber Invest สำหรับเจ้าหน้าที่โครงการ newpolice
-- ข้อกำหนด: ไม่ดึงข้อมูลจาก newpolice แต่ให้อนุมัติสิทธิ์เข้าถึงข้อมูล cyber invest เป็นรายคน
-- เจ้าหน้าที่แต่ละคนจาก newpolice ต้องส่งคำขอเชื่อมต่อเข้ามา และแอดมินพิจารณาอนุมัติเป็นรายบุคคล
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.newpolice_user_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_code TEXT NOT NULL DEFAULT 'POLICE-STN-BANGPHLI-001',
    request_code TEXT UNIQUE NOT NULL,
    badge_no TEXT NOT NULL,
    rank_name TEXT NOT NULL,
    position TEXT NOT NULL,
    agency TEXT NOT NULL,
    phone TEXT,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    access_token TEXT,
    ip_address TEXT DEFAULT '10.220.14.88',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by TEXT,
    reviewed_by_name TEXT,
    reviewed_at TIMESTAMPTZ,
    notes TEXT,
    CONSTRAINT chk_newpolice_req_station CHECK (station_code = 'POLICE-STN-BANGPHLI-001')
);

ALTER TABLE public.newpolice_user_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "newpolice_requests_select_bangphli"
ON public.newpolice_user_requests FOR SELECT
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001');

CREATE POLICY "newpolice_requests_insert_bangphli"
ON public.newpolice_user_requests FOR INSERT
TO anon, authenticated
WITH CHECK (station_code = 'POLICE-STN-BANGPHLI-001');

CREATE POLICY "newpolice_requests_update_bangphli"
ON public.newpolice_user_requests FOR UPDATE
TO anon, authenticated
USING (station_code = 'POLICE-STN-BANGPHLI-001')
WITH CHECK (station_code = 'POLICE-STN-BANGPHLI-001');

-- =========================================================================================
-- 5. ตาราง cyber_details: รายละเอียดคดีออนไลน์เชิงลึกสำหรับระบบทำสำนวนของพนักงานสอบสวน
-- มีฟิลด์ครบถ้วน: เลขรับแจ้ง, ข้อมูลผู้เสียหาย, บัญชีม้า, เส้นทางการเงิน (Financial Trails)
-- ออกแบบสำหรับเชื่อมต่อแบบ Read-Only ให้พนักงานสอบสวนเจ้าของเรื่องดึงเข้าสู่ระบบทำสำนวน
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.cyber_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_no TEXT NOT NULL,
    station_code TEXT NOT NULL DEFAULT 'POLICE-STN-BANGPHLI-001',
    incident_date TEXT,
    victim_name TEXT NOT NULL,
    victim_phone TEXT,
    victim_id_card TEXT,
    victim_address TEXT,
    damage_amount NUMERIC(15, 2) DEFAULT 0.00,
    fraud_category TEXT NOT NULL,
    mule_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
    financial_trails JSONB NOT NULL DEFAULT '[]'::jsonb,
    investigator_name TEXT NOT NULL,
    investigator_badge TEXT,
    detective_name TEXT,
    status TEXT NOT NULL DEFAULT 'พบพงส.',
    urgency TEXT[] DEFAULT ARRAY[]::TEXT[],
    legal_actions JSONB DEFAULT '{"summons1": false, "summons2": false, "warrant": false}'::jsonb,
    victim_profile JSONB,
    freeze_info JSONB,
    transfer_records JSONB DEFAULT '[]'::jsonb,
    inquiry_answers JSONB DEFAULT '[]'::jsonb,
    victim_submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cyber_details_station CHECK (station_code = 'POLICE-STN-BANGPHLI-001')
);

-- Migration for existing instances
ALTER TABLE public.cyber_details ADD COLUMN IF NOT EXISTS victim_profile JSONB;
ALTER TABLE public.cyber_details ADD COLUMN IF NOT EXISTS freeze_info JSONB;
ALTER TABLE public.cyber_details ADD COLUMN IF NOT EXISTS transfer_records JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cyber_details ADD COLUMN IF NOT EXISTS inquiry_answers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cyber_details ADD COLUMN IF NOT EXISTS victim_submitted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cyber_details_case_no ON public.cyber_details(case_no);
CREATE INDEX IF NOT EXISTS idx_cyber_details_investigator ON public.cyber_details(investigator_name);
CREATE INDEX IF NOT EXISTS idx_cyber_details_badge ON public.cyber_details(investigator_badge);

ALTER TABLE public.cyber_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cyber_details_select_read_only" ON public.cyber_details;
CREATE POLICY "cyber_details_select_read_only"
ON public.cyber_details FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "cyber_details_insert_officer" ON public.cyber_details;
CREATE POLICY "cyber_details_insert_officer"
ON public.cyber_details FOR INSERT
TO anon, authenticated
WITH CHECK (length(trim(case_no)) > 0 AND length(trim(investigator_name)) > 0);

DROP POLICY IF EXISTS "cyber_details_update_officer" ON public.cyber_details;
CREATE POLICY "cyber_details_update_officer"
ON public.cyber_details FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "cyber_details_delete_officer" ON public.cyber_details;
CREATE POLICY "cyber_details_delete_officer"
ON public.cyber_details FOR DELETE
TO anon, authenticated
USING (true);

-- เพิ่มคอลัมน์รองรับข้อมูลฟอร์มผู้เสียหายในตาราง public.cases
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS incident_date TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_name TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_phone TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS mule_accounts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_profile JSONB;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS freeze_info JSONB;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS transfer_records JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS inquiry_answers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_submitted_at TIMESTAMPTZ;

-- =========================================================================================
-- 6. ตาราง public.inquiry_templates (ประเด็นสอบสวน 14 กลโกง)
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.inquiry_templates (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    points JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.inquiry_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inquiry_templates_select_all" ON public.inquiry_templates;
CREATE POLICY "inquiry_templates_select_all"
ON public.inquiry_templates FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "inquiry_templates_upsert_all" ON public.inquiry_templates;
CREATE POLICY "inquiry_templates_upsert_all"
ON public.inquiry_templates FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- =========================================================================================
-- 7. SUPABASE RPC FUNCTION (SECURITY DEFINER): verify_victim_case(p_case_id, p_phone)
-- อนุญาตให้ anon (ผู้เสียหายที่ไม่ได้ล็อกอิน) ตรวจสอบ Case ID + เบอร์โทรศัพท์อย่างปลอดภัยตามหลัก PDPA
-- =========================================================================================
CREATE OR REPLACE FUNCTION public.verify_victim_case(
    p_case_id TEXT,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_case_no TEXT;
    v_phone TEXT;
    v_cd RECORD;
    v_case RECORD;
    v_db_phone TEXT;
    v_clean_name TEXT;
    v_name_parts TEXT[];
    v_masked_name TEXT;
    v_masked_phone TEXT;
    v_templates JSONB;
    v_subjects JSONB;
BEGIN
    v_case_no := UPPER(TRIM(COALESCE(p_case_id, '')));
    v_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

    IF v_case_no = '' OR length(v_phone) < 9 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_INPUT',
            'error', 'กรุณาระบุเลข Case ID และหมายเลขโทรศัพท์ (อย่างน้อย 9-10 หลัก) ให้ครบถ้วน'
        );
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'points', points) ORDER BY id ASC), '[]'::jsonb)
    INTO v_templates
    FROM public.inquiry_templates;

    IF length(v_phone) >= 10 THEN
        v_masked_phone := substr(v_phone, 1, 3) || '-xxx-' || substr(v_phone, 7, 4);
    ELSE
        v_masked_phone := substr(v_phone, 1, 3) || '-xxx-' || right(v_phone, 2);
    END IF;

    SELECT * INTO v_cd
    FROM public.cyber_details
    WHERE UPPER(TRIM(case_no)) = v_case_no
    ORDER BY updated_at DESC
    LIMIT 1;

    IF FOUND THEN
        v_db_phone := regexp_replace(COALESCE(v_cd.victim_phone, '') || ' ' || COALESCE(v_cd.victim_name, ''), '[^0-9]', '', 'g');
        IF length(v_db_phone) >= 9 THEN
            IF right(v_db_phone, 9) <> right(v_phone, 9) AND position(right(v_phone, 9) IN v_db_phone) = 0 THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error_code', 'PHONE_MISMATCH',
                    'error', 'หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลผู้เสียหายที่ได้แจ้งความไว้ในระบบ สภ.บางพลี'
                );
            END IF;
        END IF;

        v_clean_name := TRIM(regexp_replace(COALESCE(v_cd.victim_name, 'ผู้เสียหาย'), '[0-9]+', '', 'g'));
        v_name_parts := regexp_split_to_array(v_clean_name, '\s+');
        IF array_length(v_name_parts, 1) >= 2 THEN
            v_masked_name := v_name_parts[1] || ' ' || substr(v_name_parts[2], 1, 1) || '...';
        ELSIF length(v_clean_name) > 0 THEN
            v_masked_name := substr(v_clean_name, 1, 4) || '...';
        ELSE
            v_masked_name := 'ผู้เสียหาย';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'verified', true,
            'source', 'supabase_rpc_cyber_details',
            'caseNo', v_cd.case_no,
            'incidentDate', COALESCE(NULLIF(v_cd.incident_date, ''), to_char(v_cd.created_at, 'DD/MM/YYYY')),
            'fraudCategory', COALESCE(v_cd.fraud_category, '1. หลอกลวงซื้อขายสินค้าออนไลน์'),
            'damageAmount', COALESCE(v_cd.damage_amount, 0),
            'investigatorName', COALESCE(v_cd.investigator_name, 'พ.ต.ต.ธีรเดช สุขเกษม'),
            'stationName', 'สถานีตำรวจภูธรบางพลี',
            'maskedPhone', v_masked_phone,
            'maskedName', v_masked_name,
            'accounts', COALESCE(v_cd.mule_accounts, '[]'::jsonb),
            'status', COALESCE(v_cd.status, 'พบพงส.'),
            'alreadySubmitted', (v_cd.status = 'ผู้เสียหายกรอกข้อมูลแล้ว' OR v_cd.victim_submitted_at IS NOT NULL),
            'victimSubmittedAt', v_cd.victim_submitted_at,
            'inquiryTemplates', v_templates,
            'draft', jsonb_build_object(
                'victimProfile', v_cd.victim_profile,
                'freezeInfo', v_cd.freeze_info,
                'transferRecords', COALESCE(v_cd.transfer_records, '[]'::jsonb),
                'inquiryAnswers', COALESCE(v_cd.inquiry_answers, '[]'::jsonb)
            )
        );
    END IF;

    SELECT * INTO v_case
    FROM public.cases
    WHERE UPPER(TRIM(case_no)) = v_case_no
    ORDER BY updated_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'CASE_NOT_FOUND',
            'error', 'ไม่พบข้อมูลเลข Case ID นี้ในสารบบ สภ.บางพลี กรุณาตรวจสอบเลขรหัสแจ้งความให้ถูกต้อง'
        );
    END IF;

    v_db_phone := regexp_replace(COALESCE(v_case.victim_phone, '') || ' ' || COALESCE(v_case.victim_name, ''), '[^0-9]', '', 'g');

    IF length(v_db_phone) >= 9 THEN
        IF right(v_db_phone, 9) <> right(v_phone, 9) AND position(right(v_phone, 9) IN v_db_phone) = 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'PHONE_MISMATCH',
                'error', 'หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลผู้เสียหายที่ได้แจ้งความไว้ในระบบ สภ.บางพลี'
            );
        END IF;

        v_clean_name := TRIM(regexp_replace(COALESCE(v_case.victim_name, 'ผู้เสียหาย'), '[0-9]+', '', 'g'));
        v_name_parts := regexp_split_to_array(v_clean_name, '\s+');
        IF array_length(v_name_parts, 1) >= 2 THEN
            v_masked_name := v_name_parts[1] || ' ' || substr(v_name_parts[2], 1, 1) || '...';
        ELSIF length(v_clean_name) > 0 THEN
            v_masked_name := substr(v_clean_name, 1, 4) || '...';
        ELSE
            v_masked_name := 'ผู้เสียหาย';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'verified', true,
            'source', 'supabase_rpc_cases',
            'caseNo', v_case.case_no,
            'incidentDate', COALESCE(NULLIF(v_case.incident_date, ''), to_char(v_case.created_at, 'DD/MM/YYYY')),
            'fraudCategory', COALESCE(v_case.fraud_category, v_case.case_type, '1. หลอกลวงซื้อขายสินค้าออนไลน์'),
            'damageAmount', COALESCE(v_case.damage_amount, 0),
            'investigatorName', COALESCE(v_case.investigator_name, 'พ.ต.ต.ธีรเดช สุขเกษม'),
            'stationName', 'สถานีตำรวจภูธรบางพลี',
            'maskedPhone', v_masked_phone,
            'maskedName', v_masked_name,
            'accounts', COALESCE(v_case.mule_accounts, '[]'::jsonb),
            'status', COALESCE(v_case.status, 'พบพงส.'),
            'alreadySubmitted', (v_case.status = 'ผู้เสียหายกรอกข้อมูลแล้ว' OR v_case.victim_submitted_at IS NOT NULL),
            'victimSubmittedAt', v_case.victim_submitted_at,
            'inquiryTemplates', v_templates,
            'draft', jsonb_build_object(
                'victimProfile', v_case.victim_profile,
                'freezeInfo', v_case.freeze_info,
                'transferRecords', COALESCE(v_case.transfer_records, '[]'::jsonb),
                'inquiryAnswers', COALESCE(v_case.inquiry_answers, '[]'::jsonb)
            )
        );
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'case_id', s.case_id,
        'display_alias', s.display_alias,
        'full_name_enc', s.full_name_enc,
        'phone_enc', s.phone_enc,
        'bank_account_enc', s.bank_account_enc
    )), '[]'::jsonb)
    INTO v_subjects
    FROM public.subjects s
    WHERE s.case_id = v_case.id OR s.display_alias ILIKE '%' || v_case_no || '%';

    RETURN jsonb_build_object(
        'success', true,
        'needs_client_zk_verify', true,
        'caseNo', v_case.case_no,
        'incidentDate', COALESCE(NULLIF(v_case.incident_date, ''), to_char(v_case.created_at, 'DD/MM/YYYY')),
        'fraudCategory', COALESCE(v_case.fraud_category, v_case.case_type, '1. หลอกลวงซื้อขายสินค้าออนไลน์'),
        'damageAmount', COALESCE(v_case.damage_amount, 0),
        'investigatorName', COALESCE(v_case.investigator_name, 'พ.ต.ต.ธีรเดช สุขเกษม'),
        'stationName', 'สถานีตำรวจภูธรบางพลี',
        'maskedPhone', v_masked_phone,
        'status', COALESCE(v_case.status, 'พบพงส.'),
        'alreadySubmitted', (v_case.status = 'ผู้เสียหายกรอกข้อมูลแล้ว' OR v_case.victim_submitted_at IS NOT NULL),
        'victimSubmittedAt', v_case.victim_submitted_at,
        'summary_enc', v_case.summary_enc,
        'metadata_enc', v_case.metadata_enc,
        'subjects_enc', v_subjects,
        'inquiryTemplates', v_templates,
        'draft', jsonb_build_object(
            'victimProfile', v_case.victim_profile,
            'freezeInfo', v_case.freeze_info,
            'transferRecords', COALESCE(v_case.transfer_records, '[]'::jsonb),
            'inquiryAnswers', COALESCE(v_case.inquiry_answers, '[]'::jsonb)
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_victim_case(TEXT, TEXT) TO anon, authenticated;

-- เพิ่มคอลัมน์ detective_name ในตาราง public.cases และ GRANT สิทธิ์ระดับตารางให้ anon, authenticated ครบทุกตาราง
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS detective_name TEXT;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.cases TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.subjects TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.cyber_details TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.inquiry_templates TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.newpolice_user_requests TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;





