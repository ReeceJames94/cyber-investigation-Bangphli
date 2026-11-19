-- =========================================================================================
-- 🛡️ SUPABASE RPC & TABLE SETUP FOR VICTIM SELF-REPORTING (/victim-form)
-- สถานีตำรวจภูธรบางพลี (POLICE-STN-BANGPHLI-001) | มาตรฐาน PDPA 2.5 & SECURITY DEFINER
-- วิธีใช้: คัดลอกสคริปต์นี้ไปรันใน Supabase SQL Editor แล้วกด Run
-- =========================================================================================

-- 1. เพิ่มคอลัมน์รองรับข้อมูลฟอร์มผู้เสียหายและสืบสวนผู้รับผิดชอบในตาราง public.cases
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS incident_date TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_name TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_phone TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS detective_name TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS mule_accounts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_profile JSONB;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS freeze_info JSONB;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS transfer_records JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS inquiry_answers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS victim_submitted_at TIMESTAMPTZ;

-- อัปเดตข้อมูลเบอร์โทรผู้เสียหายลงในตาราง public.cases สำหรับเคสหลักของ สภ.บางพลี
UPDATE public.cases SET victim_name = 'ฐิติพร ชุมชอบ', victim_phone = '0655492824', incident_date = '08/11/2569',
    fraud_category = COALESCE(NULLIF(fraud_category, 'ฉ้อโกงออนไลน์'), '1. หลอกลวงซื้อขายสินค้าออนไลน์'),
    mule_accounts = '[{"bank": "Max card", "no": "320001000578130", "name": "เบญจมาภรณ์ บุญทนา"}]'::jsonb
WHERE UPPER(TRIM(case_no)) = 'T6911087326' AND (victim_phone IS NULL OR victim_phone = '');

UPDATE public.cases SET victim_name = 'ปริญ มหโชคภัทรวิมล', victim_phone = '0918955919', incident_date = '08/11/2569',
    fraud_category = COALESCE(NULLIF(fraud_category, 'ฉ้อโกงออนไลน์'), '2. หลอกให้โอนเงินเพื่อทำงาน (หารายได้พิเศษ)'),
    mule_accounts = '[{"bank": "ธกส", "no": "020228673257", "name": "ชฎาพร ป่าเกลือ"}]'::jsonb
WHERE UPPER(TRIM(case_no)) = 'T6911087748' AND (victim_phone IS NULL OR victim_phone = '');

UPDATE public.cases SET victim_name = 'นายเจริญ บุญญานิบาล', victim_phone = '0819958712', incident_date = '08/11/2569',
    fraud_category = COALESCE(NULLIF(fraud_category, 'ฉ้อโกงออนไลน์'), '3. หลอกให้กู้เงินออนไลน์'),
    mule_accounts = '[{"bank": "QR Code", "no": "xxxxxx7621", "name": "ชินกร กันทะวงษ์"}, {"bank": "QR Code", "no": "xxxxxx7917", "name": "วิศรุต ไชยสุรินทร์"}]'::jsonb
WHERE UPPER(TRIM(case_no)) = 'T6911087788' AND (victim_phone IS NULL OR victim_phone = '');

UPDATE public.cases SET victim_name = 'ศศิธร วงศ์เจริญ', victim_phone = '0891234567', incident_date = '08/11/2569',
    fraud_category = COALESCE(NULLIF(fraud_category, 'ฉ้อโกงออนไลน์'), '5. หลอกให้ลงทุนผ่านระบบคอมพิวเตอร์'),
    mule_accounts = '[{"bank": "กสิกรไทย", "no": "0451239988", "name": "สมรักษ์ คำสิงห์พาณิชย์"}]'::jsonb
WHERE UPPER(TRIM(case_no)) = 'T6911088120' AND (victim_phone IS NULL OR victim_phone = '');

-- =========================================================================================
-- 2. สร้างตาราง public.cyber_details (หากยังไม่มีใน Supabase)
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.cyber_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_no TEXT UNIQUE NOT NULL,
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
    interrogation_statements JSONB,
    statement_variables JSONB,
    property_damaged JSONB,
    property_recovered JSONB,
    property_unrecovered JSONB,
    victim_submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cyber_details_case_no ON public.cyber_details(UPPER(case_no));

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
WITH CHECK (length(trim(case_no)) > 0);

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

-- Pre-seed ข้อมูลคดีหลักลงใน public.cyber_details
INSERT INTO public.cyber_details (
    case_no, incident_date, victim_name, victim_phone, damage_amount, fraud_category,
    mule_accounts, investigator_name, investigator_badge, detective_name, status
) VALUES
(
    'T6911087326', '08/11/2569', 'ฐิติพร ชุมชอบ', '0655492824', 8000.00,
    '1. หลอกลวงซื้อขายสินค้าออนไลน์',
    '[{"bank": "Max card", "no": "320001000578130", "name": "เบญจมาภรณ์ บุญทนา"}]'::jsonb,
    'พ.ต.ต.ธีรเดช สุขเกษม', '30002', 'ร.ต.ต.ธนกฤต ไทยกมล', 'พบพงส.'
),
(
    'T6911087748', '08/11/2569', 'ปริญ มหโชคภัทรวิมล', '0918955919', 9000.00,
    '2. หลอกให้โอนเงินเพื่อทำงาน (หารายได้พิเศษ)',
    '[{"bank": "ธกส", "no": "020228673257", "name": "ชฎาพร ป่าเกลือ"}]'::jsonb,
    'พ.ต.ต.ธีรเดช สุขเกษม', '30002', 'ร.ต.ต.ธนกฤต ไทยกมล', 'พบพงส.'
),
(
    'T6911087788', '08/11/2569', 'นายเจริญ บุญญานิบาล', '0819958712', 1599.00,
    '3. หลอกให้กู้เงินออนไลน์',
    '[{"bank": "QR Code", "no": "xxxxxx7621", "name": "ชินกร กันทะวงษ์"}, {"bank": "QR Code", "no": "xxxxxx7917", "name": "วิศรุต ไชยสุรินทร์"}]'::jsonb,
    'พ.ต.ต.ธีรเดช สุขเกษม', '30002', 'ร.ต.ต.ธนกฤต ไทยกมล', 'พบพงส.'
),
(
    'T6911088120', '08/11/2569', 'ศศิธร วงศ์เจริญ', '0891234567', 35000.00,
    '5. หลอกให้ลงทุนผ่านระบบคอมพิวเตอร์',
    '[{"bank": "กสิกรไทย", "no": "0451239988", "name": "สมรักษ์ คำสิงห์พาณิชย์"}]'::jsonb,
    'พ.ต.ท.ประเสริฐ กุลบุตร', '30001', 'ร.ต.ต.ธนกฤต ไทยกมล', 'นัดหมาย'
)
ON CONFLICT (case_no) DO NOTHING;

-- =========================================================================================
-- 3. สร้างตาราง public.inquiry_templates (ประเด็นสอบสวน 14 กลโกง)
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

INSERT INTO public.inquiry_templates (id, title, points) VALUES
(1, '1. หลอกลวงซื้อขายสินค้าออนไลน์', '["สั่งซื้อสินค้าผ่านช่องทางใด (Facebook, Line, TikTok, เว็บไซต์)", "ตรวจสอบหลักฐานการโอนเงิน สลิป และบัญชีปลายทาง", "วันเวลาที่ตกลงส่งสินค้าและช่องทางการติดต่อที่ถูกบล็อก"]'::jsonb),
(2, '2. หลอกให้โอนเงินเพื่อทำงาน (หารายได้พิเศษ)', '["พบเห็นโฆษณาชักชวนทำงานจากที่ใด", "ขั้นตอนการโอนเงินสำรองจ่ายเพื่อรับค่าคอมมิชชั่นแต่ละรอบ", "ลิงก์เว็บไซต์หรือแอปพลิเคชันที่คนร้ายให้สมัครสมาชิก"]'::jsonb),
(3, '3. หลอกให้กู้เงินออนไลน์', '["ช่องทางที่ติดต่อขอกู้เงินและวงเงินที่ขอกู้", "เหตุผลที่คนร้ายอ้างให้โอนเงินค่ามัดจำ ค่าปลดล็อกระบบ หรือค่าแก้ไขเลขบัญชี", "ตรวจสอบสลิปการโอนเงินทุกครั้งที่โอนให้คนร้าย"]'::jsonb),
(4, '4. ข่มขู่ทางโทรศัพท์ (Call Center)', '["เบอร์โทรศัพท์ที่โทรเข้ามาแอบอ้างเป็นเจ้าหน้าที่หน่วยงานใด", "พฤติการณ์การข่มขู่ว่าเกี่ยวข้องกับการฟอกเงินหรือคดียาเสพติด", "ช่องทางที่ให้แอดไลน์พูดคุยและโอนเงินเพื่อตรวจสอบ"]'::jsonb),
(5, '5. หลอกให้ลงทุนผ่านระบบคอมพิวเตอร์', '["แพลตฟอร์มหรือแอปพลิเคชันที่ชักชวนให้ลงทุน (หุ้น, คริปโต, ทองคำ)", "ช่วงแรกได้รับผลตอบแทนจริงหรือไม่ จำนวนเท่าใด", "ยอดเงินลงทุนทั้งหมดและบัญชีม้าที่รับโอนเงิน"]'::jsonb),
(6, '6. หลอกให้รักแล้วโอนเงิน (Romance Scam)', '["รู้จักกันผ่านแอปพลิเคชันใด โปรไฟล์คนร้ายอ้างเป็นใคร", "เหตุผลที่ขอให้โอนเงิน (ส่งพัสดุติดด่านศุลกากร, ค่ารักษาพยาบาล, ลงทุนร่วมกัน)"]'::jsonb),
(7, '7. หลอกให้รักแล้วลงทุน (Hybrid Scam)', '["ความสัมพันธ์และการชักชวนให้ลงทุนควบคู่กัน", "แพลตฟอร์มเทรดปลอมที่คนร้ายส่งลิงก์ให้ดาวน์โหลด"]'::jsonb),
(8, '8. แฮ็กบัญชีโซเชียลมีเดียหลอกยืมเงิน', '["บัญชีโซเชียลที่ถูกแฮ็กเป็นของใคร และคนร้ายทักมายืมเงินอย่างไร", "บัญชีธนาคารปลายทางที่โอนเงินไปให้"]'::jsonb),
(9, '9. หลอกให้ติดตั้งโปรแกรมควบคุมระบบ (รีโมท/แอปดูดเงิน)', '["คนร้ายแอบอ้างเป็นหน่วยงานใดหลอกให้กดลิงก์ติดตั้งไฟล์ .apk", "ช่วงเวลาที่หน้าจอโทรศัพท์ค้างและเงินถูกโอนออกจากบัญชีอัตโนมัติ", "ตรวจสอบรายการเดินบัญชี (Statement) ปลายทางที่เงินถูกดูดไป"]'::jsonb),
(10, '10. หลอกลวงเกี่ยวกับสินทรัพย์ดิจิทัล (Crypto)', '["กระเป๋าเงินดิจิทัล (Wallet Address) ต้นทางและปลายทาง", "รหัสธุรกรรม (TxID / Hash) ที่โอนเหรียญออกไป"]'::jsonb),
(11, '11. หลอกลวงให้โอนเงินโดยแอบอ้างเป็นบุคคลอื่น', '["แอบอ้างเป็นญาติ ผู้บังคับบัญชา หรือคนรู้จัก", "เบอร์โทรหรือบัญชีไลน์ที่ใช้ติดต่อขอยืมเงิน"]'::jsonb),
(12, '12. หลอกลวงให้ทำประกัน/รับรางวัล/โชคลาภ', '["ข้อความ SMS หรือโทรศัพท์แจ้งว่าได้รับรางวัลใหญ่", "เงื่อนไขให้โอนเงินค่าภาษีหรือค่าธรรมเนียมก่อนรับรางวัล"]'::jsonb),
(13, '13. หลอกลวงเกี่ยวกับการจองที่พัก/ตั๋วเครื่องบิน', '["เพจปลอมที่แอบอ้างชื่อโรงแรม รีสอร์ท หรือสายการบิน", "ตรวจสอบความแตกต่างของชื่อบัญชีรับโอนกับชื่อสถานประกอบการ"]'::jsonb),
(14, '14. คดีอาชญากรรมทางเทคโนโลยีประเภทอื่นๆ', '["รายละเอียดพฤติการณ์แห่งคดีโดยละเอียด", "พยานหลักฐานทางอิเล็กทรอนิกส์ที่รวบรวมได้"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- =========================================================================================
-- 4. SUPABASE RPC FUNCTION (SECURITY DEFINER): verify_victim_case(p_case_id, p_phone)
-- อนุญาตให้ anon (ผู้เสียหายที่ไม่ได้ล็อกอิน) ตรวจสอบ Case ID + เบอร์โทรศัพท์
-- และดึงข้อมูลเบื้องต้นของคดีที่ผ่านการทำ Data Masking ตามมาตรฐาน PDPA
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

    -- ดึงชุดประเด็นคำถาม 14 กลโกงล่าสุด
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'points', points) ORDER BY id ASC), '[]'::jsonb)
    INTO v_templates
    FROM public.inquiry_templates;

    -- สร้างเบอร์โทรแบบ Masked ตามหลัก PDPA (เช่น 065-xxx-2824)
    IF length(v_phone) >= 10 THEN
        v_masked_phone := substr(v_phone, 1, 3) || '-xxx-' || substr(v_phone, 7, 4);
    ELSE
        v_masked_phone := substr(v_phone, 1, 3) || '-xxx-' || right(v_phone, 2);
    END IF;

    -- -----------------------------------------------------------------
    -- ขั้นที่ 1: ค้นหาจากตาราง public.cyber_details
    -- -----------------------------------------------------------------
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

        -- ทำ Data Masking ชื่อผู้เสียหายตามหลัก PDPA
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

    -- -----------------------------------------------------------------
    -- ขั้นที่ 2: ค้นหาจากตาราง public.cases (กรณีเคสถูกสร้างผ่านโหมด Zero-Knowledge Cloud)
    -- -----------------------------------------------------------------
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

    -- หากในตาราง cases มีเบอร์โทรระบุไว้ชัดเจน ให้ตรวจสอบทันที
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

    -- กรณีเคสในตาราง cases เก็บเฉพาะข้อมูลเข้ารหัส Zero-Knowledge (summary_enc / subjects)
    -- ส่งข้อมูล Ciphertext กลับไปให้ฝั่ง Client ถอดรหัสและตรวจสอบเบอร์โทรด้วย WebCrypto
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

-- อนุญาตให้ anon (ผู้เสียหายที่เปิดลิงก์จากมือถือ/Incognito) และ authenticated เรียกใช้งาน RPC ได้
GRANT EXECUTE ON FUNCTION public.verify_victim_case(TEXT, TEXT) TO anon, authenticated;

-- =========================================================================================
-- 5. SUPABASE RPC FUNCTION (SECURITY DEFINER): submit_victim_case(...)
-- อนุญาตให้ผู้เสียหายส่งแบบฟอร์มและพยานหลักฐานบันทึกเข้าสู่ฐานข้อมูลโดยตรงอย่างปลอดภัย
-- (ตรวจสอบ Case ID + เบอร์โทรศัพท์ให้ตรงกับข้อมูลคดีก่อนอนุญาตอัปเดตทุกครั้ง)
-- =========================================================================================
CREATE OR REPLACE FUNCTION public.submit_victim_case(
    p_case_id TEXT,
    p_phone TEXT,
    p_victim_profile JSONB,
    p_transfer_records JSONB,
    p_inquiry_answers JSONB,
    p_investigator_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_case_no TEXT;
    v_phone TEXT;
    v_now TIMESTAMPTZ := NOW();
    v_cd RECORD;
    v_case RECORD;
    v_db_phone TEXT;
    v_full_name TEXT;
    v_phone_ok BOOLEAN := FALSE;
BEGIN
    v_case_no := UPPER(TRIM(COALESCE(p_case_id, '')));
    v_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

    IF v_case_no = '' OR length(v_phone) < 9 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_INPUT',
            'error', 'ข้อมูลระบุตัวตน Case ID หรือหมายเลขโทรศัพท์ไม่สมบูรณ์'
        );
    END IF;

    -- ตรวจสอบเบอร์โทรศัพท์กับข้อมูลคดีใน cyber_details หรือ cases ก่อนอนุญาตบันทึก
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
                    'error', 'หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลผู้เสียหายในสารบบคดี'
                );
            END IF;
            v_phone_ok := TRUE;
        END IF;
    END IF;

    SELECT * INTO v_case
    FROM public.cases
    WHERE UPPER(TRIM(case_no)) = v_case_no
    ORDER BY updated_at DESC
    LIMIT 1;

    IF NOT v_phone_ok THEN
        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'CASE_NOT_FOUND',
                'error', 'ไม่พบข้อมูลเลข Case ID นี้ในสารบบ สภ.บางพลี'
            );
        END IF;
        v_db_phone := regexp_replace(COALESCE(v_case.victim_phone, '') || ' ' || COALESCE(v_case.victim_name, ''), '[^0-9]', '', 'g');
        IF length(v_db_phone) >= 9 THEN
            IF right(v_db_phone, 9) <> right(v_phone, 9) AND position(right(v_phone, 9) IN v_db_phone) = 0 THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error_code', 'PHONE_MISMATCH',
                    'error', 'หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลผู้เสียหายในสารบบคดี'
                );
            END IF;
            v_phone_ok := TRUE;
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'PHONE_UNVERIFIED',
                'error', 'ไม่สามารถยืนยันเบอร์โทรศัพท์กับคดีนี้ได้ กรุณาติดต่อพนักงานสอบสวน'
            );
        END IF;
    END IF;

    v_full_name := TRIM(COALESCE(p_victim_profile->>'prefix', '') || ' ' || COALESCE(p_victim_profile->>'firstName', '') || ' ' || COALESCE(p_victim_profile->>'lastName', ''));
    IF v_full_name = '' THEN
        v_full_name := 'ผู้เสียหาย';
    END IF;

    -- อัปเดตตาราง public.cyber_details (คง victim_profile เดิมไว้หากไม่ได้ส่งมาตามหลัก PDPA)
    UPDATE public.cyber_details
    SET victim_profile = COALESCE(p_victim_profile, victim_profile),
        transfer_records = COALESCE(p_transfer_records, '[]'::jsonb),
        inquiry_answers = COALESCE(p_inquiry_answers, '[]'::jsonb),
        status = 'ผู้เสียหายกรอกข้อมูลแล้ว',
        victim_submitted_at = v_now,
        updated_at = v_now
    WHERE UPPER(TRIM(case_no)) = v_case_no;

    -- หากยังไม่มีแถวใน cyber_details แต่มีใน cases ให้ Insert ลง cyber_details อัตโนมัติ
    IF NOT FOUND THEN
        INSERT INTO public.cyber_details (
            case_no, incident_date, victim_name, victim_phone,
            damage_amount, fraud_category, investigator_name,
            status, victim_profile, transfer_records, inquiry_answers, victim_submitted_at
        )
        SELECT
            c.case_no,
            COALESCE(c.incident_date, to_char(c.created_at, 'DD/MM/YYYY')),
            COALESCE(NULLIF(c.victim_name, ''), v_full_name),
            COALESCE(NULLIF(c.victim_phone, ''), v_phone),
            COALESCE(c.damage_amount, 0),
            COALESCE(c.fraud_category, '1. หลอกลวงซื้อขายสินค้าออนไลน์'),
            COALESCE(p_investigator_name, c.investigator_name, 'พ.ต.ต.ธีรเดช สุขเกษม'),
            'ผู้เสียหายกรอกข้อมูลแล้ว',
            p_victim_profile,
            COALESCE(p_transfer_records, '[]'::jsonb),
            COALESCE(p_inquiry_answers, '[]'::jsonb),
            v_now
        FROM public.cases c
        WHERE UPPER(TRIM(c.case_no)) = v_case_no
        ORDER BY c.updated_at DESC
        LIMIT 1
        ON CONFLICT (case_no) DO UPDATE
        SET victim_profile = COALESCE(EXCLUDED.victim_profile, public.cyber_details.victim_profile),
            transfer_records = EXCLUDED.transfer_records,
            inquiry_answers = EXCLUDED.inquiry_answers,
            status = 'ผู้เสียหายกรอกข้อมูลแล้ว',
            victim_submitted_at = v_now,
            updated_at = v_now;
    END IF;

    -- อัปเดตตาราง public.cases ให้ซิงค์ตรงกัน
    UPDATE public.cases
    SET status = 'ผู้เสียหายกรอกข้อมูลแล้ว',
        victim_profile = COALESCE(p_victim_profile, victim_profile),
        transfer_records = COALESCE(p_transfer_records, '[]'::jsonb),
        inquiry_answers = COALESCE(p_inquiry_answers, '[]'::jsonb),
        victim_submitted_at = v_now,
        investigator_name = COALESCE(NULLIF(p_investigator_name, ''), investigator_name),
        updated_at = v_now
    WHERE UPPER(TRIM(case_no)) = v_case_no;

    RETURN jsonb_build_object(
        'success', true,
        'caseNo', v_case_no,
        'victimSubmittedAt', v_now,
        'message', 'บันทึกข้อมูลและส่งมอบพยานหลักฐานล่วงหน้าให้พนักงานสอบสวน สภ.บางพลี เรียบร้อยแล้ว'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_victim_case(TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) TO anon, authenticated;

-- =========================================================================================
-- 6. SUPABASE RPC FUNCTION (SECURITY DEFINER): reset_victim_case(p_case_id, p_phone)
-- (บังคับยืนยันหมายเลขโทรศัพท์ให้ตรงกับข้อมูลคดี หรือเป็นผู้ใช้งาน authenticated ก่อนอนุญาตล้างข้อมูล)
-- =========================================================================================
CREATE OR REPLACE FUNCTION public.reset_victim_case(
    p_case_id TEXT,
    p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_case_no TEXT;
    v_phone TEXT;
    v_db_phone TEXT;
    v_cd RECORD;
    v_case RECORD;
    v_verified BOOLEAN := (auth.uid() IS NOT NULL);
BEGIN
    v_case_no := UPPER(TRIM(COALESCE(p_case_id, '')));
    v_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

    IF v_case_no = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ไม่ระบุเลข Case ID');
    END IF;

    IF NOT v_verified THEN
        IF length(v_phone) < 9 THEN
            RETURN jsonb_build_object('success', false, 'error', 'กรุณาระบุหมายเลขโทรศัพท์เพื่อยืนยันสิทธิ์ในการล้างข้อมูล');
        END IF;

        SELECT victim_phone, victim_name INTO v_cd
        FROM public.cyber_details
        WHERE UPPER(TRIM(case_no)) = v_case_no
        ORDER BY updated_at DESC
        LIMIT 1;

        IF FOUND THEN
            v_db_phone := regexp_replace(COALESCE(v_cd.victim_phone, '') || ' ' || COALESCE(v_cd.victim_name, ''), '[^0-9]', '', 'g');
            IF length(v_db_phone) >= 9 AND (right(v_db_phone, 9) = right(v_phone, 9) OR position(right(v_phone, 9) IN v_db_phone) > 0) THEN
                v_verified := TRUE;
            END IF;
        END IF;

        IF NOT v_verified THEN
            SELECT victim_phone, victim_name INTO v_case
            FROM public.cases
            WHERE UPPER(TRIM(case_no)) = v_case_no
            ORDER BY updated_at DESC
            LIMIT 1;

            IF FOUND THEN
                v_db_phone := regexp_replace(COALESCE(v_case.victim_phone, '') || ' ' || COALESCE(v_case.victim_name, ''), '[^0-9]', '', 'g');
                IF length(v_db_phone) >= 9 AND (right(v_db_phone, 9) = right(v_phone, 9) OR position(right(v_phone, 9) IN v_db_phone) > 0) THEN
                    v_verified := TRUE;
                END IF;
            END IF;
        END IF;

        IF NOT v_verified THEN
            RETURN jsonb_build_object('success', false, 'error', 'หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลคดี ไม่ได้รับอนุญาตให้ล้างข้อมูล');
        END IF;
    END IF;

    UPDATE public.cyber_details
    SET victim_profile = NULL,
        freeze_info = NULL,
        transfer_records = '[]'::jsonb,
        inquiry_answers = '[]'::jsonb,
        status = 'พบพงส.',
        victim_submitted_at = NULL,
        updated_at = NOW()
    WHERE UPPER(TRIM(case_no)) = v_case_no;

    UPDATE public.cases
    SET victim_profile = NULL,
        freeze_info = NULL,
        transfer_records = '[]'::jsonb,
        inquiry_answers = '[]'::jsonb,
        status = 'พบพงส.',
        victim_submitted_at = NULL,
        updated_at = NOW()
    WHERE UPPER(TRIM(case_no)) = v_case_no;

    RETURN jsonb_build_object('success', true, 'caseNo', v_case_no);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_victim_case(TEXT, TEXT) TO anon, authenticated;

-- =========================================================================================
-- 6b. SECURE OFFICER LOGIN CHALLENGE / VERIFICATION RPCs (ไม่เปิดเผย password_hash ให้ anon)
-- =========================================================================================
CREATE OR REPLACE FUNCTION public.get_officer_login_challenge(p_identifier TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ident TEXT := TRIM(COALESCE(p_identifier, ''));
    v_u RECORD;
BEGIN
    IF v_ident = '' THEN
        RETURN jsonb_build_object('found', false);
    END IF;
    SELECT username, salt INTO v_u
    FROM public.users
    WHERE (LOWER(username) = LOWER(v_ident) OR badge_no = v_ident)
      AND COALESCE(status, 'active') <> 'suspended'
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;
    RETURN jsonb_build_object('found', true, 'username', v_u.username, 'salt', v_u.salt);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_officer_login(p_identifier TEXT, p_password_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ident TEXT := TRIM(COALESCE(p_identifier, ''));
    v_hash TEXT := LOWER(TRIM(COALESCE(p_password_hash, '')));
    v_u RECORD;
BEGIN
    IF v_ident = '' OR length(v_hash) < 64 THEN
        RETURN jsonb_build_object('success', false, 'error', 'ข้อมูลยืนยันตัวตนไม่ถูกต้อง');
    END IF;
    SELECT id, username, full_name, rank, badge_no, role, position, department, status, password_hash
    INTO v_u
    FROM public.users
    WHERE (LOWER(username) = LOWER(v_ident) OR badge_no = v_ident)
      AND COALESCE(status, 'active') <> 'suspended'
    LIMIT 1;

    IF NOT FOUND OR LOWER(v_u.password_hash) <> v_hash THEN
        RETURN jsonb_build_object('success', false, 'error', 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user', jsonb_build_object(
            'id', v_u.id,
            'username', v_u.username,
            'full_name', v_u.full_name,
            'rank', v_u.rank,
            'badge_no', v_u.badge_no,
            'role', v_u.role,
            'position', COALESCE(v_u.position, ''),
            'department', COALESCE(v_u.department, ''),
            'status', COALESCE(v_u.status, 'active')
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_officer_login_challenge(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_officer_login(TEXT, TEXT) TO anon, authenticated;

-- =========================================================================================
-- 7. สร้างตาราง public.newpolice_user_requests (หากยังไม่มี) และเปิดสิทธิ์ GRANT ครบทุกตาราง
-- (สำคัญมาก: PostgREST จะคืนค่า 401 code 42501 หากไม่ได้รัน GRANT สิทธิ์ระดับตารางให้ anon, authenticated)
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
    status TEXT NOT NULL DEFAULT 'pending',
    access_token TEXT,
    ip_address TEXT DEFAULT '10.220.14.88',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by TEXT,
    reviewed_by_name TEXT,
    reviewed_at TIMESTAMPTZ,
    notes TEXT
);

ALTER TABLE public.newpolice_user_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newpolice_requests_select_bangphli" ON public.newpolice_user_requests;
CREATE POLICY "newpolice_requests_select_bangphli"
ON public.newpolice_user_requests FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "newpolice_requests_insert_bangphli" ON public.newpolice_user_requests;
CREATE POLICY "newpolice_requests_insert_bangphli"
ON public.newpolice_user_requests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "newpolice_requests_update_bangphli" ON public.newpolice_user_requests;
CREATE POLICY "newpolice_requests_update_bangphli"
ON public.newpolice_user_requests FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- เพิ่มคอลัมน์ position / department / status บนตาราง public.users (เพื่อเก็บ ฝ่าย/งาน สำหรับกำหนด พงส./สืบสวน)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'ฝ่ายสืบสวน';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- GRANT สิทธิ์ระดับตารางให้ anon และ authenticated เพื่อแก้ปัญหา 401 (code 42501: permission denied)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.cases TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.subjects TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.cyber_details TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.inquiry_templates TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.newpolice_user_requests TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

