-- =========================================================================================
-- 🔒 CYBER INVESTIGATION BANGPHLI - PRODUCTION RLS HARDENING SCRIPT (SUPABASE AUTH REQUIRED)
-- ⚠️ ขั้นตอนก่อนรันสคริปต์นี้บน Supabase จริง:
--    1. รันไฟล์ supabase_victim_rpc.sql เวอร์ชันล่าสุดก่อน (เพื่อติดตั้ง RPC verify_victim_case / submit_victim_case / reset_victim_case)
--    2. สร้างบัญชีเจ้าหน้าที่ตำรวจใน Supabase Authentication -> Users (ใช้ Email รูปแบบ <username>@bangphli.police.local)
--       หรือแจ้งเจ้าหน้าที่ให้เข้าสู่ระบบผ่าน Supabase Auth เพื่อรับ JWT Token (auth.uid())
--    3. เมื่อรันสคริปต์นี้แล้ว ผู้ที่ไม่ได้ล็อกอิน (anon) จะไม่สามารถ Select / Edit / Delete ตารางใดๆ โดยตรงได้อีกต่อไป
--       - ผู้เสียหาย (/victim-form) จะยังใช้งานได้ตามปกติผ่าน SECURITY DEFINER RPC เท่านั้น (ตรวจสอบ Case ID + เบอร์โทร)
--       - เจ้าหน้าที่ที่เข้าสู่ระบบผ่าน Supabase Auth (authenticated) จะมี auth.uid() และเข้าถึงข้อมูลคดีได้ตามปกติ
-- =========================================================================================

-- 1. ถอนสิทธิ์โดยตรง (Table-Level Privileges) จาก anon บนตารางข้อมูลลับทั้งหมด
REVOKE ALL PRIVILEGES ON TABLE public.users FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.cases FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.subjects FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.cyber_details FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.audit_logs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.newpolice_user_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.inquiry_templates FROM anon;

-- ให้สิทธิ์เฉพาะ authenticated (เจ้าหน้าที่ที่ล็อกอิน Supabase Auth แล้ว)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cyber_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inquiry_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.newpolice_user_requests TO authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO authenticated;
GRANT SELECT ON TABLE public.inquiry_templates TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 2. ลบ Policy เดิมที่เปิดให้ anon บนทุกตาราง แล้วสร้าง Policy ใหม่สำหรับ authenticated เท่านั้น

-- 2.1 public.users (เจ้าหน้าที่ตำรวจ - ห้าม anon อ่าน username/password_hash/salt!)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select_all" ON public.users;
DROP POLICY IF EXISTS "users_insert_all" ON public.users;
DROP POLICY IF EXISTS "users_update_all" ON public.users;
DROP POLICY IF EXISTS "users_delete_all" ON public.users;
DROP POLICY IF EXISTS "users_auth_select" ON public.users;
DROP POLICY IF EXISTS "users_auth_insert" ON public.users;
DROP POLICY IF EXISTS "users_auth_update" ON public.users;
DROP POLICY IF EXISTS "users_auth_delete" ON public.users;

CREATE POLICY "users_auth_select" ON public.users FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "users_auth_insert" ON public.users FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND length(trim(username)) > 0);
CREATE POLICY "users_auth_update" ON public.users FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "users_auth_delete" ON public.users FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 2.2 public.cases (สารบบคดีหลัก)
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cases_select_bangphli" ON public.cases;
DROP POLICY IF EXISTS "cases_insert_bangphli" ON public.cases;
DROP POLICY IF EXISTS "cases_update_bangphli" ON public.cases;
DROP POLICY IF EXISTS "cases_delete_bangphli" ON public.cases;
DROP POLICY IF EXISTS "cases_auth_select" ON public.cases;
DROP POLICY IF EXISTS "cases_auth_insert" ON public.cases;
DROP POLICY IF EXISTS "cases_auth_update" ON public.cases;
DROP POLICY IF EXISTS "cases_auth_delete" ON public.cases;

CREATE POLICY "cases_auth_select" ON public.cases FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001');
CREATE POLICY "cases_auth_insert" ON public.cases FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001');
CREATE POLICY "cases_auth_update" ON public.cases FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001') WITH CHECK (station_code = 'POLICE-STN-BANGPHLI-001');
CREATE POLICY "cases_auth_delete" ON public.cases FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001');

-- 2.3 public.cyber_details (รายละเอียดคดีและข้อมูลผู้เสียหาย)
ALTER TABLE public.cyber_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cyber_details_select_read_only" ON public.cyber_details;
DROP POLICY IF EXISTS "cyber_details_insert_officer" ON public.cyber_details;
DROP POLICY IF EXISTS "cyber_details_update_officer" ON public.cyber_details;
DROP POLICY IF EXISTS "cyber_details_delete_officer" ON public.cyber_details;
DROP POLICY IF EXISTS "cyber_details_auth_select" ON public.cyber_details;
DROP POLICY IF EXISTS "cyber_details_auth_insert" ON public.cyber_details;
DROP POLICY IF EXISTS "cyber_details_auth_update" ON public.cyber_details;
DROP POLICY IF EXISTS "cyber_details_auth_delete" ON public.cyber_details;

CREATE POLICY "cyber_details_auth_select" ON public.cyber_details FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001');
CREATE POLICY "cyber_details_auth_insert" ON public.cyber_details FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001' AND length(trim(case_no)) > 0);
CREATE POLICY "cyber_details_auth_update" ON public.cyber_details FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001') WITH CHECK (station_code = 'POLICE-STN-BANGPHLI-001');
CREATE POLICY "cyber_details_auth_delete" ON public.cyber_details FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001');

-- 2.4 public.subjects (ข้อมูลส่วนบุคคลเข้ารหัส AES-256-GCM)
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subjects_select_bangphli" ON public.subjects;
DROP POLICY IF EXISTS "subjects_insert_bangphli_zk" ON public.subjects;
DROP POLICY IF EXISTS "subjects_update_bangphli_zk" ON public.subjects;
DROP POLICY IF EXISTS "subjects_delete_bangphli" ON public.subjects;
DROP POLICY IF EXISTS "subjects_auth_select" ON public.subjects;
DROP POLICY IF EXISTS "subjects_auth_insert_zk" ON public.subjects;
DROP POLICY IF EXISTS "subjects_auth_update_zk" ON public.subjects;
DROP POLICY IF EXISTS "subjects_auth_delete" ON public.subjects;

CREATE POLICY "subjects_auth_select" ON public.subjects FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001');
CREATE POLICY "subjects_auth_insert_zk" ON public.subjects FOR INSERT TO authenticated WITH CHECK (
    auth.uid() IS NOT NULL
    AND station_code = 'POLICE-STN-BANGPHLI-001'
    AND full_name_enc LIKE 'zk:v1:%'
    AND (national_id_enc IS NULL OR national_id_enc = '' OR national_id_enc LIKE 'zk:v1:%')
    AND (address_enc IS NULL OR address_enc = '' OR address_enc LIKE 'zk:v1:%')
    AND (phone_enc IS NULL OR phone_enc = '' OR phone_enc LIKE 'zk:v1:%')
    AND (bank_account_enc IS NULL OR bank_account_enc = '' OR bank_account_enc LIKE 'zk:v1:%')
);
CREATE POLICY "subjects_auth_update_zk" ON public.subjects FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001') WITH CHECK (
    station_code = 'POLICE-STN-BANGPHLI-001'
    AND full_name_enc LIKE 'zk:v1:%'
);
CREATE POLICY "subjects_auth_delete" ON public.subjects FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001');

-- 2.5 public.audit_logs (บันทึกการตรวจสอบย้อนหลัง - INSERT ONLY สำหรับ authenticated)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_select_bangphli" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_only_bangphli" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_auth_select" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_auth_insert" ON public.audit_logs;

CREATE POLICY "audit_logs_auth_select" ON public.audit_logs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001');
CREATE POLICY "audit_logs_auth_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001' AND length(trim(actor_badge)) > 0);

-- 2.6 public.newpolice_user_requests
ALTER TABLE public.newpolice_user_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "newpolice_requests_select_bangphli" ON public.newpolice_user_requests;
DROP POLICY IF EXISTS "newpolice_requests_insert_bangphli" ON public.newpolice_user_requests;
DROP POLICY IF EXISTS "newpolice_requests_update_bangphli" ON public.newpolice_user_requests;
DROP POLICY IF EXISTS "newpolice_requests_auth_select" ON public.newpolice_user_requests;
DROP POLICY IF EXISTS "newpolice_requests_auth_insert" ON public.newpolice_user_requests;
DROP POLICY IF EXISTS "newpolice_requests_auth_update" ON public.newpolice_user_requests;

CREATE POLICY "newpolice_requests_auth_select" ON public.newpolice_user_requests FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001');
CREATE POLICY "newpolice_requests_auth_insert" ON public.newpolice_user_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001');
CREATE POLICY "newpolice_requests_auth_update" ON public.newpolice_user_requests FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL AND station_code = 'POLICE-STN-BANGPHLI-001') WITH CHECK (station_code = 'POLICE-STN-BANGPHLI-001');

-- 2.7 public.inquiry_templates (อ่านสาธารณะสำหรับฟอร์มผู้เสียหาย / แก้ไขเฉพาะ authenticated)
ALTER TABLE public.inquiry_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inquiry_templates_select_all" ON public.inquiry_templates;
DROP POLICY IF EXISTS "inquiry_templates_write_auth" ON public.inquiry_templates;
DROP POLICY IF EXISTS "inquiry_templates_update_auth" ON public.inquiry_templates;
DROP POLICY IF EXISTS "inquiry_templates_delete_auth" ON public.inquiry_templates;
CREATE POLICY "inquiry_templates_select_all" ON public.inquiry_templates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "inquiry_templates_write_auth" ON public.inquiry_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "inquiry_templates_update_auth" ON public.inquiry_templates FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "inquiry_templates_delete_auth" ON public.inquiry_templates FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 3. อนุญาต anon เฉพาะ SECURITY DEFINER RPCs สำหรับผู้เสียหายและการตรวจสอบ Login Challenge เท่านั้น
GRANT EXECUTE ON FUNCTION public.verify_victim_case(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_victim_case(TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_victim_case(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_officer_login_challenge(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_officer_login(TEXT, TEXT) TO anon, authenticated;
