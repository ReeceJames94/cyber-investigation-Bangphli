/**
 * State Management & Data Sync
 */
window.CyberState = (function() {
    // Default initial datasets
    const defaultUsers = [
        { id: 'u_1', name: 'ร.ต.ต.ธนกฤต ไทยกมล', username: 'thanakrit', password: 'gg4102563', role: 'Admin (ผู้ดูแลระบบสูงสุด)' },
        { id: 'u_2', name: 'ร.ต.อ.ธนากร พิศุจน์', username: 'investigator', password: '1234', role: 'พนักงานสอบสวน' }
    ];

    const defaultCases = [
        {
            id: 'c_1',
            date: '2026-11-08',
            caseNo: 'T6911087326',
            victim: 'ฐิติพร ชุมชอบ 0655492824',
            type: 'หลอกลวงซื้อขายสินค้าออนไลน์',
            status: 'พบพงส.',
            amount: '8000',
            accounts: [{ bank: 'Max card เลขอ้างอิง', no: '320001000578130', name: 'เบญจมาภรณ์ บุญทนา' }],
            investigator: 'ร.ต.ต. ธนกฤต ไทยกมล',
            detective: 'ร.ต.ต. ธนกฤต ไทยกมล',
            summons1: false,
            summons1Date: '',
            summons2: false,
            summons2Date: '',
            warrant: false,
            warrantPdf: '',
            warrantPdfData: ''
        },
        {
            id: 'c_2',
            date: '2026-11-08',
            caseNo: 'T6911087748',
            victim: 'ปริญ มหโชคภัทรวิมล 0918955919',
            type: 'หลอกลวงซื้อขายสินค้าออนไลน์',
            status: 'พบพงส.',
            amount: '9000',
            accounts: [{ bank: 'ธกส', no: '020228673257', name: 'ชฎาพร ป่าเกลือ' }],
            investigator: 'ร.ต.ต. ธนกฤต ไทยกมล',
            detective: 'ร.ต.ต. ธนกฤต ไทยกมล',
            summons1: false,
            summons1Date: '',
            summons2: false,
            summons2Date: '',
            warrant: false,
            warrantPdf: '',
            warrantPdfData: ''
        },
        {
            id: 'c_3',
            date: '2026-11-08',
            caseNo: 'T6911087788',
            victim: 'นายเจริญ บุญญานิบาล 0819958712',
            type: 'หลอกลวงซื้อขายสินค้าออนไลน์',
            status: 'พบพงส.',
            amount: '1599',
            accounts: [
                { bank: 'Qr Code: เลขอ้างอิง', no: 'xxxxxx7621', name: 'ชินกร กันทะวงษ์' },
                { bank: 'Qr Code: เลขอ้างอิง', no: 'xxxxxx7917', name: 'วีศรุต ไชยสุรินทร์' }
            ],
            investigator: 'ร.ต.ต. ธนกฤต ไทยกมล',
            detective: 'ร.ต.ต. ธนกฤต ไทยกมล',
            summons1: false,
            summons1Date: '',
            summons2: false,
            summons2Date: '',
            warrant: false,
            warrantPdf: '',
            warrantPdfData: ''
        }
    ];

    const defaultWarrants = [
        {
            id: 'w_1',
            warrantNo: 'จ.102/2569',
            date: '08/11/2569',
            court: 'ศาลจังหวัดสมุทรปราการ',
            suspectName: 'นายไม่ดี ไม่ได้แล้ว',
            idCard: '1-2345-68978-97-1',
            charges: 'ร่วมกันฉ้อโกงประชาชน และนำเข้าสู่ระบบคอมพิวเตอร์ซึ่งข้อมูลคอมพิวเตอร์ที่บิดเบือนหรือปลอม',
            suspect: '123456897897 นายไม่ดี ไม่ได้แล้ว (ฉ้อโกงประชาชน)',
            trackingChecklist: {
                phone: { checked: true, note: 'ตรวจสอบหมายเลข 081-xxx-xxxx พิกัดล่าสุด ต.บางพลีใหญ่' },
                parcel: { checked: true, note: 'รับพัสดุ Flash Express ปลายทางหมู่บ้านพฤกษา 15 สมุทรปราการ' },
                prison: { checked: false, note: 'ตรวจสอบระบบกรมราชทัณฑ์ ไม่พบข้อมูลการคุมขัง' },
                hospital: { checked: true, note: 'สิทธิบัตรทอง รพ.บางพลี เข้ารับการรักษาล่าสุด ก.ย. 69' },
                domicile: { checked: true, note: 'ตามภูมิลำเนาเลขที่ 99/12 หมู่ 5 ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ' }
            },
            warrantPdf: '',
            warrantPdfData: '',
            filed: false,
            filedDate: '',
            arrested: false,
            arrestedDate: '',
            arrestPdf: 'ตัวอย่างรายงานการสอบสวน ศปอส.ภ.3 และ หนังสือส~ติธรรมตอบกลับกรณีพนักงานอัยการส่งสำนวนคืน.pdf',
            arrestPdfData: ''
        },
        {
            id: 'w_2',
            warrantNo: '123/321',
            date: '15/10/2569',
            court: 'ศาลจังหวัดสมุทรปราการ',
            suspectName: 'นายไม่ดี ไม่ได้แล้ว',
            idCard: '1-2345-68978-97-1',
            charges: 'ฉ้อโกงประชาชน',
            suspect: '123456897897 นายไม่ดี ไม่ได้แล้ว\n(ฉ้อโกงประชาชน)',
            trackingChecklist: {
                phone: { checked: false, note: 'อยู่ระหว่างขอหมายศาลขอข้อมูลจราจรคอมพิวเตอร์ (Log files)' },
                parcel: { checked: true, note: 'พบประวัติรับพัสดุเคอรี่ สาขาบางพลี' },
                prison: { checked: false, note: 'ตรวจสอบแล้วไม่อยู่ในเรือนจำ' },
                hospital: { checked: false, note: 'ยังไม่พบข้อมูลประวัติการรักษาพยาบาลล่าสุด' },
                domicile: { checked: true, note: 'ตรวจสอบทะเบียนราษฎร์แล้ว ย้ายออกจากภูมิลำเนาเดิม' }
            },
            warrantPdf: '',
            warrantPdfData: '',
            filed: true,
            filedDate: '2026-01-11',
            arrested: false,
            arrestedDate: '',
            arrestPdf: 'T6911086963.pdf',
            arrestPdfData: ''
        }
    ];

    const defaultInquiryCategories = [
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

    const defaultKnowledgeDocs = [
        { id: 'k_1', name: 'พ.ร.ก. มาตรการป้องกันและปราบปรามอาชญากรรมทางเทคโนโลยี พ.ศ. 2566.pdf', date: 'เอกสารมาตรฐานระบบ', data: '' },
        { id: 'k_2', name: 'แนวทางการอายัดบัญชีม้าและการประสานงานธนาคาร.pdf', date: 'เอกสารมาตรฐานระบบ', data: '' }
    ];

    const defaultInvestigators = [
        'ร.ต.อ.ธนากร พิศุจน์',
        'ร.ต.ต.ธนกฤต ไทยกมล',
        'ร.ต.ท.สมชาย ใจมั่น',
        'พ.ต.ต.เกรียงไกร สืบสร้าง'
    ];

    const defaultDetectives = [
        'ร.ต.ต.ธนกฤต ไทยกมล',
        'ร.ต.อ.ธนากร พิศุจน์',
        'ด.ต.สมศักดิ์ มุ่งมั่น',
        'ส.ต.อ.วิชาญ ชำนาญสืบ'
    ];

    const defaultDispatchDocs = [
        {
            id: 'disp_1',
            docNo: 'ตช.0016.36(อท.)/142',
            date: '08/11/2569',
            from: 'สว.สส.สภ.บางพลี',
            to: 'ผู้จัดการ ธนาคารกสิกรไทย จำกัด (มหาชน)',
            subject: 'ขอความร่วมมือตรวจสอบข้อมูลบัญชีเงินฝากและรายการเดินบัญชี (Statement)',
            caseNo: 'T6911087326',
            officer: 'ร.ต.ต.ธนกฤต ไทยกมล',
            channel: 'ส่งทางไปรษณีย์ EMS',
            trackingNo: 'ED882194012TH',
            status: 'ส่งแล้ว (รอผล)',
            file: 'ตช0016_36_อท_142_ขอสเตทเมนต์_ธ_กสิกรไทย.pdf'
        },
        {
            id: 'disp_2',
            docNo: 'ตช.0016.36(อท.)/143',
            date: '09/11/2569',
            from: 'สว.สส.สภ.บางพลี',
            to: 'ผู้จัดการ บริษัท ทรูมันนี่ จำกัด',
            subject: 'ขอข้อมูลการลงทะเบียนบัญชีกระเป๋าเงินอิเล็กทรอนิกส์ (TrueMoney Wallet)',
            caseNo: 'T6911087748',
            officer: 'ร.ต.ต.ธนกฤต ไทยกมล',
            channel: 'ส่งทางระบบสารบรรณอิเล็กทรอนิกส์',
            trackingNo: 'TRU-691109-004',
            status: 'ส่งแล้ว (รอผล)',
            file: 'ตช0016_36_อท_143_ขอข้อมูลทรูมันนี่.pdf'
        },
        {
            id: 'disp_3',
            docNo: 'ตช.0016.36(อท.)/144',
            date: '11/11/2569',
            from: 'ผกก.สภ.บางพลี',
            to: 'ผู้บังคับการตำรวจสืบสวนสอบสวนอาชญากรรมทางเทคโนโลยี 1',
            subject: 'ส่งรายงานผลการสืบสวนและขอข้อมูลจราจรคอมพิวเตอร์ (Log files)',
            caseNo: 'T6911087788',
            officer: 'ร.ต.อ.ธนากร พิศุจน์',
            channel: 'ส่งทางสารบรรณ ตช.',
            trackingNo: 'CCIB-69-1144',
            status: 'ตอบกลับแล้ว/เสร็จสิ้น',
            file: 'รายงานผลการสืบสวน_ส่ง_บก_สอท_1.pdf'
        }
    ];

    const defaultReceiptDocs = [
        {
            id: 'rec_1',
            receiptNo: 'รับที่ 315/2569',
            date: '10/11/2569',
            originDocNo: 'ที่ KBANK.COMP/2569/1102',
            originDate: '09/11/2569',
            from: 'ธนาคารกสิกรไทย จำกัด (มหาชน) สำนักงานใหญ่',
            to: 'ผกก.สภ.บางพลี',
            subject: 'แจ้งผลการตรวจสอบข้อมูลรายการเดินบัญชีเงินฝากและข้อมูลเปิดบัญชี',
            assignTo: 'ร.ต.ต.ธนกฤต ไทยกมล',
            action: 'สว.สส. ทราบ/อยู่ระหว่างวิเคราะห์เส้นเงิน',
            status: 'อยู่ระหว่างสืบสวน',
            file: 'ผลตรวจสอบบัญชี_KBANK_1102.pdf'
        },
        {
            id: 'rec_2',
            receiptNo: 'รับที่ 316/2569',
            date: '12/11/2569',
            originDocNo: 'ที่ ตช 0026.3/4521',
            originDate: '11/11/2569',
            from: 'กองบังคับการตำรวจสืบสวนสอบสวนอาชญากรรมทางเทคโนโลยี 1 (บก.สอท.1)',
            to: 'ผกก.สภ.บางพลี',
            subject: 'ส่งมอบข้อมูลจราจรทางคอมพิวเตอร์และพิกัดการใช้งาน IP Address คนร้าย',
            assignTo: 'ร.ต.ต.ธนกฤต ไทยกมล',
            action: 'รวบรวมเข้าสำนวนเพื่อขออนุมัติหมายจับ',
            status: 'ดำเนินการแล้วเสร็จ',
            file: 'รายงาน_Log_IP_บก_สอท_1.pdf'
        },
        {
            id: 'rec_3',
            receiptNo: 'รับที่ 317/2569',
            date: '15/11/2569',
            originDocNo: 'ที่ ยธ 0704/8912',
            originDate: '14/11/2569',
            from: 'สำนักงานคณะกรรมการป้องกันและปราบปรามการฟอกเงิน (ปปง.)',
            to: 'ผกก.สภ.บางพลี',
            subject: 'แจ้งคำสั่งยึดและอายัดทรัพย์สินที่เกี่ยวกับการกระทำความผิดชั่วคราว',
            assignTo: 'ร.ต.อ.ธนากร พิศุจน์',
            action: 'แจ้งผู้เสียหายและรวบรวมเข้าสำนวนการสอบสวน',
            status: 'รับเรื่องแล้ว',
            file: 'คำสั่งอายัดทรัพย์สิน_ปปง_8912.pdf'
        }
    ];

    // Local Storage Helpers
    function getStored(key, fallback) {
        const item = localStorage.getItem(key);
        if (!item) {
            localStorage.setItem(key, JSON.stringify(fallback));
            return fallback;
        }
        try {
            return JSON.parse(item);
        } catch (e) {
            return fallback;
        }
    }

    function setStored(key, val) {
        localStorage.setItem(key, JSON.stringify(val));
    }

    // State Variables
    let users = getStored('cyber_users', defaultUsers);
    let cases = getStored('cyber_cases', defaultCases);
    let warrants = getStored('cyber_warrants', defaultWarrants);
    let dispatchDocs = (() => {
        const docs = getStored('cyber_dispatch_docs', defaultDispatchDocs);
        let changed = false;
        docs.forEach(d => {
            if (d.docNo && d.docNo.startsWith('ตช 0016(สป).6/')) {
                d.docNo = d.docNo.replace('ตช 0016(สป).6/', 'ตช.0016.36(อท.)/');
                changed = true;
            }
        });
        if (changed) setStored('cyber_dispatch_docs', docs);
        return docs;
    })();
    let receiptDocs = getStored('cyber_receipt_docs', defaultReceiptDocs);
    let inquiry = getStored('cyber_inquiry_data', defaultInquiryCategories);
    let knowledge = getStored('cyber_knowledge_docs', defaultKnowledgeDocs);
    let investigators = getStored('cyber_investigators', defaultInvestigators);
    let detectives = getStored('cyber_detectives', defaultDetectives);
    let currentUser = JSON.parse(localStorage.getItem('cyber_current_user')) || null;

    // Cloud Real-time Listeners Setup
    function setupCloudListeners() {
        const db = window.CyberConfig ? window.CyberConfig.getDb() : null;
        if (!db) return;

        // 1. Users
        db.collection('cyber_users').onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                const cloudUsers = [];
                snapshot.forEach(doc => cloudUsers.push({ id: doc.id, ...doc.data() }));
                users = cloudUsers;
                setStored('cyber_users', users);
                if (window.CyberUsers) window.CyberUsers.render();
            } else {
                users.forEach(u => db.collection('cyber_users').doc(u.id).set(u));
            }
        }, (err) => {
            console.warn('Firestore users listener error:', err);
            const statusEl = document.getElementById('cloud-sync-status');
            const dotEl = document.getElementById('cloud-sync-dot');
            if (statusEl) statusEl.textContent = 'โหมดออฟไลน์ (Local Mode)';
            if (dotEl) dotEl.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
        });

        // 2. Cases
        db.collection('cyber_cases').onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                const cloudCases = [];
                snapshot.forEach(doc => cloudCases.push({ id: doc.id, ...doc.data() }));
                cloudCases.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                cases = cloudCases;
                setStored('cyber_cases', cases);
                if (currentUser && window.CyberCases) window.CyberCases.render();
            } else {
                cases.forEach(c => db.collection('cyber_cases').doc(c.id).set(c));
            }
        });

        // 3. Warrants
        db.collection('cyber_warrants').onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                const cloudWarrants = [];
                snapshot.forEach(doc => cloudWarrants.push({ id: doc.id, ...doc.data() }));
                warrants = cloudWarrants;
                setStored('cyber_warrants', warrants);
                if (currentUser && window.CyberWarrants) window.CyberWarrants.render();
            } else {
                warrants.forEach(w => db.collection('cyber_warrants').doc(w.id).set(w));
            }
        });

        // 4. Inquiry
        db.collection('cyber_settings').doc('inquiry_data').onSnapshot((docSnap) => {
            if (docSnap.exists && docSnap.data().categories) {
                inquiry = docSnap.data().categories;
                setStored('cyber_inquiry_data', inquiry);
                if (currentUser && window.CyberInquiry) window.CyberInquiry.render();
            } else {
                db.collection('cyber_settings').doc('inquiry_data').set({ categories: inquiry });
            }
        });

        // 5. Knowledge Docs
        db.collection('cyber_knowledge_docs').onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                const cloudDocs = [];
                snapshot.forEach(doc => cloudDocs.push({ id: doc.id, ...doc.data() }));
                knowledge = cloudDocs;
                setStored('cyber_knowledge_docs', knowledge);
                if (currentUser && window.CyberKnowledge) window.CyberKnowledge.render();
            }
        });

        // 5.1 Dispatch Docs (สารบรรณ: ทะเบียนหนังสือส่ง)
        db.collection('cyber_dispatch_docs').onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                const cloudDispatches = [];
                snapshot.forEach(doc => cloudDispatches.push({ id: doc.id, ...doc.data() }));
                dispatchDocs = cloudDispatches;
                setStored('cyber_dispatch_docs', dispatchDocs);
                if (currentUser && window.CyberRegistry) window.CyberRegistry.render();
            } else if (dispatchDocs.length > 0) {
                dispatchDocs.forEach(d => db.collection('cyber_dispatch_docs').doc(d.id).set(d).catch(e => {}));
            }
        });

        // 5.2 Receipt Docs (สารบรรณ: ทะเบียนหนังสือรับ)
        db.collection('cyber_receipt_docs').onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                const cloudReceipts = [];
                snapshot.forEach(doc => cloudReceipts.push({ id: doc.id, ...doc.data() }));
                receiptDocs = cloudReceipts;
                setStored('cyber_receipt_docs', receiptDocs);
                if (currentUser && window.CyberRegistry) window.CyberRegistry.render();
            } else if (receiptDocs.length > 0) {
                receiptDocs.forEach(r => db.collection('cyber_receipt_docs').doc(r.id).set(r).catch(e => {}));
            }
        });
        // 6. Officers (พงส. & สืบสวน)
        db.collection('cyber_settings').doc('officers').onSnapshot((docSnap) => {
            if (docSnap.exists) {
                const data = docSnap.data();
                if (data.investigators) {
                    investigators = data.investigators;
                    setStored('cyber_investigators', investigators);
                }
                if (data.detectives) {
                    detectives = data.detectives;
                    setStored('cyber_detectives', detectives);
                }
                if (window.CyberCases && window.CyberCases.populateOfficerDropdowns) {
                    window.CyberCases.populateOfficerDropdowns();
                }
            } else {
                db.collection('cyber_settings').doc('officers').set({ investigators, detectives });
            }
        });
    }

    function saveDoc(collectionName, item) {
        const db = window.CyberConfig ? window.CyberConfig.getDb() : null;
        if (db && item && item.id) {
            db.collection(collectionName).doc(item.id).set(item).catch(e => console.warn(e));
        }
    }

    function deleteDoc(collectionName, docId) {
        const db = window.CyberConfig ? window.CyberConfig.getDb() : null;
        if (db && docId) {
            db.collection(collectionName).doc(docId).delete().catch(e => console.warn(e));
        }
    }

    function addInvestigator(name) {
        const trimmed = name.trim();
        if (!trimmed || investigators.includes(trimmed)) return;
        investigators.push(trimmed);
        setStored('cyber_investigators', investigators);
        const db = window.CyberConfig ? window.CyberConfig.getDb() : null;
        if (db) db.collection('cyber_settings').doc('officers').set({ investigators, detectives }, { merge: true }).catch(e => console.warn(e));
    }

    function addDetective(name) {
        const trimmed = name.trim();
        if (!trimmed || detectives.includes(trimmed)) return;
        detectives.push(trimmed);
        setStored('cyber_detectives', detectives);
        const db = window.CyberConfig ? window.CyberConfig.getDb() : null;
        if (db) db.collection('cyber_settings').doc('officers').set({ investigators, detectives }, { merge: true }).catch(e => console.warn(e));
    }

    return {
        getUsers: () => users,
        setUsers: (val) => { users = val; setStored('cyber_users', val); },
        getCases: () => cases,
        setCases: (val) => { cases = val; setStored('cyber_cases', val); },
        getWarrants: () => warrants,
        setWarrants: (val) => { warrants = val; setStored('cyber_warrants', val); },
        getDispatchDocs: () => dispatchDocs,
        setDispatchDocs: (val) => { dispatchDocs = val; setStored('cyber_dispatch_docs', val); },
        getReceiptDocs: () => receiptDocs,
        setReceiptDocs: (val) => { receiptDocs = val; setStored('cyber_receipt_docs', val); },
        getInquiry: () => inquiry,
        setInquiry: (val) => { inquiry = val; setStored('cyber_inquiry_data', val); },
        getKnowledge: () => knowledge,
        setKnowledge: (val) => { knowledge = val; setStored('cyber_knowledge_docs', val); },
        getInvestigators: () => {
            const combined = new Set([...investigators, ...users.filter(u => (u.role || '').includes('พนักงานสอบสวน')).map(u => u.name)]);
            return Array.from(combined);
        },
        addInvestigator,
        getDetectives: () => {
            const combined = new Set([...detectives, ...users.filter(u => (u.role || '').includes('สืบสวน')).map(u => u.name)]);
            return Array.from(combined);
        },
        addDetective,
        getCurrentUser: () => currentUser,
        setCurrentUser: (u) => { currentUser = u; localStorage.setItem('cyber_current_user', JSON.stringify(u)); },
        setupCloudListeners,
        saveDoc,
        deleteDoc
    };
})();
