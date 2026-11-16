/**
 * Export & Printable Reports Module
 */
window.CyberExport = (function() {
    let currentDocPrintHtml = '';

    function executePrintDirect(htmlContent) {
        try {
            let printFrame = document.getElementById('cyberPrintDirectIframe');
            if (!printFrame) {
                printFrame = document.createElement('iframe');
                printFrame.id = 'cyberPrintDirectIframe';
                printFrame.name = 'cyberPrintDirectIframe';
                printFrame.style.position = 'fixed';
                printFrame.style.left = '-9999px';
                printFrame.style.top = '-9999px';
                printFrame.style.width = '1000px';
                printFrame.style.height = '800px';
                printFrame.style.border = '0';
                printFrame.style.opacity = '0.01';
                printFrame.style.zIndex = '-999';
                document.body.appendChild(printFrame);
            }

            const win = printFrame.contentWindow;
            const doc = win.document;
            doc.open();
            doc.write(htmlContent);
            doc.close();

            setTimeout(() => {
                try {
                    win.focus();
                    win.print();
                } catch (err) {
                    console.warn('Iframe print failed, falling back:', err);
                    const w = window.open('', '_blank');
                    if (w) {
                        w.document.open();
                        w.document.write(htmlContent);
                        w.document.close();
                        setTimeout(() => { w.focus(); w.print(); }, 350);
                    }
                }
            }, 350);
        } catch (e) {
            console.warn('Direct print error:', e);
        }
    }

    function showDocPreviewModal(title, fullHtml) {
        currentDocPrintHtml = fullHtml;
        const modal = document.getElementById('docPreviewModal');
        const titleEl = document.getElementById('docPreviewTitle');
        const contentEl = document.getElementById('docPreviewContent');

        if (titleEl) titleEl.textContent = title;
        if (contentEl) contentEl.innerHTML = fullHtml;

        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        executePrintDirect(fullHtml);
        window.CyberUI.showToast('เปิดหน้าต่างพิมพ์เรียบร้อยแล้ว (สามารถเลือกเครื่องพิมพ์ หรือ "บันทึกเป็น PDF")', 'success');
    }

    function triggerDirectPrint(htmlContent, title) {
        if (htmlContent) {
            showDocPreviewModal(title || 'พิมพ์เอกสาร', htmlContent);
            return;
        }
        if (currentDocPrintHtml) {
            executePrintDirect(currentDocPrintHtml);
            window.CyberUI.showToast('กำลังส่งคำสั่งพิมพ์...', 'info');
        }
    }

    function closeDocPreviewModal() {
        const modal = document.getElementById('docPreviewModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    function openPrintWindow(title, subtitle, tableHeaders, tableRowsHtml) {
        const nowStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const headersHtml = tableHeaders.map(h => `<th>${h}</th>`).join('');
        const fullHtml = `
            <div style="font-family: 'Sarabun', sans-serif; padding: 15px; color: #0f172a; font-size: 13px;">
                <style>
                    .header { text-align: center; margin-bottom: 18px; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; }
                    .header h1 { margin: 0; font-size: 20px; color: #0f172a; }
                    .header p { margin: 4px 0 0; color: #475569; font-size: 13px; }
                    .meta { display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-bottom: 12px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; }
                    th { background-color: #f1f5f9; font-weight: 700; color: #0f172a; }
                    tr:nth-child(even) { background-color: #f8fafc; }
                </style>
                <div class="header">
                    <h1>${title}</h1>
                    <p>${subtitle}</p>
                </div>
                <div class="meta">
                    <span>หน่วยงาน: สถานีตำรวจภูธรบางพลี (สภ.บางพลี)</span>
                    <span>พิมพ์เมื่อ: ${nowStr}</span>
                </div>
                <table>
                    <thead><tr>${headersHtml}</tr></thead>
                    <tbody>${tableRowsHtml}</tbody>
                </table>
            </div>
        `;
        showDocPreviewModal(title, fullHtml);
    }

    function exportCases() {
        const list = window.CyberCases.getFilteredCases();
        if (list.length === 0) {
            window.CyberUI.showToast('ไม่มีข้อมูลเคสคดีสำหรับส่งออกพิมพ์', 'info');
            return;
        }
        const headers = ['ลำดับ', 'วันที่รับแจ้ง / เลขเคส', 'ผู้เสียหาย', 'ประเภทกลโกง', 'มูลค่า (บาท)', 'สถานะคดี', 'บัญชีคนร้าย', 'พงส. / สืบสวนผู้รับผิดชอบ', 'หมายเรียก / หมายจับ'];
        const rowsHtml = list.map((c, idx) => {
            const accText = (c.accounts || []).map(a => {
                if (typeof a === 'string') return a;
                if (typeof a === 'object' && a !== null) {
                    const bank = a.bank || '';
                    const no = a.no || a.accNo || a.number || '';
                    const name = a.name || a.owner || '';
                    return `${bank} ${no} ${name ? '(' + name + ')' : ''}`.trim();
                }
                return String(a);
            }).join('<br>') || '-';

            const caseNum = c.caseNo || c.caseId || '-';
            const rawAmount = c.amount !== undefined ? c.amount : c.damage;
            const numAmount = Number(rawAmount);
            const amountText = !isNaN(numAmount) && rawAmount !== '' && rawAmount !== null ? `${numAmount.toLocaleString()} ฿` : (rawAmount ? `${rawAmount} ฿` : '-');
            const pongs = c.investigator || c.officerInquiry || '-';
            const sueber = c.detective || c.officerInvestigate || '-';

            const statusDocs = [
                `หมายเรียก 1: ${c.summons1 ? (c.summons1Date || 'ออกแล้ว') : 'ยัง'}`,
                `หมายเรียก 2: ${c.summons2 ? (c.summons2Date || 'ออกแล้ว') : 'ยัง'}`,
                `หมายจับ: ${c.warrant ? 'ออกแล้ว' : 'ยัง'}`
            ].join('<br>');
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${caseNum}</strong><br>${c.date || '-'}</td>
                    <td>${c.victim || '-'}</td>
                    <td>${c.type || '-'}</td>
                    <td>${amountText}</td>
                    <td>${c.status || '-'}</td>
                    <td>${accText}</td>
                    <td><strong>พงส.:</strong> ${pongs}<br><strong>สืบสวน:</strong> ${sueber}</td>
                    <td>${statusDocs}</td>
                </tr>
            `;
        }).join('');

        openPrintWindow(
            'รายงานข้อมูลคดีอาชญากรรมทางเทคโนโลยี สภ.บางพลี',
            `จำนวนทั้งหมด ${list.length} คดี`,
            headers,
            rowsHtml
        );
    }

    function openPrintModal() {
        const warrants = window.CyberState.getWarrants();
        const sel = document.getElementById('exportSuspectSelect');
        if (sel) {
            sel.innerHTML = '';
            warrants.forEach(w => {
                const opt = document.createElement('option');
                opt.value = w.id;
                opt.textContent = `${w.warrantNo} - ${w.suspectName || w.suspect} (${w.court || 'ศาลจังหวัดสมุทรปราการ'})`;
                sel.appendChild(opt);
            });
        }
        const m = document.getElementById('printWarrantModal');
        if (m) {
            m.classList.remove('hidden');
            m.classList.add('flex');
        }
    }

    function closePrintModal() {
        const m = document.getElementById('printWarrantModal');
        if (m) {
            m.classList.add('hidden');
            m.classList.remove('flex');
        }
    }

    function printIndividualDossier(warrantId) {
        const warrants = window.CyberState.getWarrants();
        const w = warrants.find(item => item.id === warrantId);
        if (!w) {
            window.CyberUI.showToast('ไม่พบข้อมูลหมายจับที่เลือก', 'error');
            return;
        }

        const now = new Date();
        const thMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const printDate = `${now.getDate()} ${thMonths[now.getMonth()]} พ.ศ. ${now.getFullYear() + 543}`;

        const chk = w.trackingChecklist || {};
        const chkItems = [
            { label: '1. ข้อมูลโทรศัพท์ / การใช้เครือข่ายมือถือ', data: chk.phone || { checked: false, note: '-' } },
            { label: '2. ข้อมูลการส่งพัสดุ / ที่อยู่จัดส่งสินค้า', data: chk.parcel || { checked: false, note: '-' } },
            { label: '3. การตรวจสอบสถานะการคุมขังในเรือนจำ', data: chk.prison || { checked: false, note: '-' } },
            { label: '4. ข้อมูลการรักษาพยาบาลและสิทธิการรักษา (สปสช./ประกันสังคม)', data: chk.hospital || { checked: false, note: '-' } },
            { label: '5. ข้อมูลทะเบียนราษฎร์ (ทร.14) และสถานที่พักอาศัยจริง', data: chk.domicile || { checked: false, note: '-' } }
        ];

        const chkHtml = chkItems.map(item => `
            <tr>
                <td style="width: 36%; padding: 8px 10px; border: 1px solid #cbd5e1; font-weight: bold; background: #f8fafc;">
                    ${item.label}
                </td>
                <td style="width: 15%; padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; color: ${item.data.checked ? '#059669' : '#64748b'}; font-weight: bold;">
                    ${item.data.checked ? '☑ ตรวจสอบแล้ว' : '☐ ยังไม่ได้ตรวจ'}
                </td>
                <td style="padding: 8px 10px; border: 1px solid #cbd5e1;">
                    ${item.data.note || '-'}
                </td>
            </tr>
        `).join('');

        const fullHtml = `
            <div style="font-family: 'Sarabun', sans-serif; font-size: 13px; line-height: 1.5; color: #000; padding: 10px;">
                <style>
                    @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
                    table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 12px; }
                    th, td { border: 1px solid #94a3b8; padding: 7px 9px; font-size: 12.5px; vertical-align: top; }
                    th { background: #f1f5f9; }
                    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
                    .badge-green { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
                    .badge-red { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
                    .badge-blue { background: #dbeafe; color: #1d4ed8; border: 1px solid #93c5fd; }
                </style>

                <!-- Police Header -->
                <div class="text-center">
                    <img src="assets/police_logo_transparent.png" style="height: 65px; margin: 0 auto 6px; display: block;" alt="ตราพระแสงดาบเขนและโล่ สำนักงานตำรวจแห่งชาติ">
                    <h2 style="margin: 4px 0 2px; font-size: 17px; font-weight: bold;">แบบรายงานผลการสืบสวนติดตามจับกุมบุคคลตามหมายจับ</h2>
                    <p style="margin: 0; font-size: 13px;">งานสืบสวน สถานีตำรวจภูธรบางพลี กองบังคับการตำรวจภูธรจังหวัดสมุทรปราการ</p>
                    <p style="margin: 2px 0 10px; font-size: 11.5px; color: #475569;">วันที่พิมพ์เอกสาร: ${printDate}</p>
                </div>

                <div style="border-top: 1.5px solid #000; margin-bottom: 10px;"></div>

                <!-- ส่วนที่ 1: ข้อมูลหมายศาล -->
                <div style="background: #f1f5f9; padding: 6px 10px; font-weight: bold; border-left: 4px solid #1e3a8a; margin-bottom: 6px;">
                    ส่วนที่ 1: ข้อมูลหมายศาล
                </div>
                <table>
                    <tr>
                        <td style="width: 20%; font-weight: bold; background: #f8fafc;">เลขที่หมายจับ:</td>
                        <td style="width: 30%; color: #b91c1c; font-weight: bold;">${w.warrantNo}</td>
                        <td style="width: 20%; font-weight: bold; background: #f8fafc;">วันที่ออกหมาย:</td>
                        <td style="width: 30%;">${w.date || '-'}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; background: #f8fafc;">ศาลที่ออกหมาย:</td>
                        <td colspan="3">${w.court || 'ศาลจังหวัดสมุทรปราการ'}</td>
                    </tr>
                </table>

                <!-- ส่วนที่ 2: ข้อมูลผู้ต้องหา -->
                <div style="background: #f1f5f9; padding: 6px 10px; font-weight: bold; border-left: 4px solid #1e3a8a; margin-bottom: 6px;">
                    ส่วนที่ 2: ข้อมูลผู้ต้องหาและข้อกล่าวหา
                </div>
                <table>
                    <tr>
                        <td style="width: 20%; font-weight: bold; background: #f8fafc;">ชื่อ - สกุล ผู้ต้องหา:</td>
                        <td style="width: 35%; font-weight: bold;">${w.suspectName || w.suspect}</td>
                        <td style="width: 20%; font-weight: bold; background: #f8fafc;">เลขประจำตัวประชาชน:</td>
                        <td style="width: 25%; font-family: monospace; font-weight: bold;">${w.idCard || '-'}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; background: #f8fafc;">ข้อกล่าวหาแห่งคดี:</td>
                        <td colspan="3">${w.charges || w.suspect}</td>
                    </tr>
                </table>

                <!-- ส่วนที่ 3: เช็คลิสต์ติดตามตัว 5 ด้าน -->
                <div style="background: #f1f5f9; padding: 6px 10px; font-weight: bold; border-left: 4px solid #1e3a8a; margin-bottom: 6px;">
                    ส่วนที่ 3: ผลการตรวจสอบและสืบสวนติดตามตัวบุคคลตามหมายจับ
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>มิติการตรวจสอบ</th>
                            <th style="text-align: center;">สถานะ</th>
                            <th>รายละเอียดและพยานหลักฐานที่ตรวจพบ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${chkHtml}
                    </tbody>
                </table>

                <!-- ส่วนที่ 4: สถานะคดีและจับกุม -->
                <div style="background: #f1f5f9; padding: 6px 10px; font-weight: bold; border-left: 4px solid #1e3a8a; margin-bottom: 6px;">
                    ส่วนที่ 4: สถานะการดำเนินคดีและการจับกุม
                </div>
                <table>
                    <tr>
                        <td style="width: 25%; font-weight: bold; background: #f8fafc;">การส่งสำนวนต่ออัยการ:</td>
                        <td style="width: 25%;">${w.filed ? `<span class="badge badge-blue">ส่งสำนวนแล้ว (${w.filedDate || '-'})</span>` : '<span class="badge badge-red">ยังไม่ส่งสำนวน</span>'}</td>
                        <td style="width: 25%; font-weight: bold; background: #f8fafc;">สถานะการจับกุม:</td>
                        <td style="width: 25%;">${w.arrested ? `<span class="badge badge-green">จับกุมแล้ว (${w.arrestedDate || '-'})</span>` : '<span class="badge badge-red">ยังไม่จับกุม</span>'}</td>
                    </tr>
                    ${w.arrestPdf ? `<tr><td style="font-weight: bold; background: #f8fafc;">ไฟล์บันทึกจับกุมแนบ:</td><td colspan="3">${w.arrestPdf}</td></tr>` : ''}
                </table>

                <!-- ส่วนที่ 5: ช่องลงนาม -->
                <div style="margin-top: 30px; display: flex; justify-content: space-between; text-align: center;">
                    <div style="width: 45%;">
                        <p style="margin-bottom: 35px;">ลงชื่อ........................................................ผู้รายงาน<br>( ร.ต.ต.ธนกฤต ไทยกมล )<br>รอง สว.สส.สภ.บางพลี</p>
                    </div>
                    <div style="width: 45%;">
                        <p style="margin-bottom: 35px;">ลงชื่อ........................................................พงส. ผู้รับผิดชอบ<br>( ร.ต.อ.ธนากร พิศุจน์ )<br>รอง สว.(สอบสวน) สภ.บางพลี</p>
                    </div>
                </div>
            </div>
        `;
        showDocPreviewModal(`รายงานสืบสวนติดตามบุคคลตามหมายจับ (${w.warrantNo})`, fullHtml);
    }

    function printWarrantLogSheet(filterType) {
        let list = [...window.CyberState.getWarrants()];
        let titleType = 'ทั้งหมด';
        if (filterType === 'arrested') {
            list = list.filter(w => w.arrested);
            titleType = 'ที่จับกุมแล้ว';
        } else if (filterType === 'not_arrested') {
            list = list.filter(w => !w.arrested);
            titleType = 'ที่ยังไม่ได้จับกุม (หมายจับค้างเก่า)';
        }

        if (list.length === 0) {
            window.CyberUI.showToast('ไม่มีรายการหมายจับตามเงื่อนไขที่เลือก', 'info');
            return;
        }

        const now = new Date();
        const thMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const printDate = `${now.getDate()} ${thMonths[now.getMonth()]} พ.ศ. ${now.getFullYear() + 543}`;

        const totalCount = window.CyberState.getWarrants().length;
        const arrestedCount = window.CyberState.getWarrants().filter(w => w.arrested).length;
        const pendingCount = totalCount - arrestedCount;
        const filedCount = window.CyberState.getWarrants().filter(w => w.filed).length;

        const rowsHtml = list.map((w, idx) => {
            const chk = w.trackingChecklist || {};
            const chkSummary = Object.entries(chk).filter(([k, v]) => v.checked).map(([k, v]) => {
                const labelMap = { phone: 'โทรศัพท์', parcel: 'พัสดุ', prison: 'เรือนจำ', hospital: 'รพ.', domicile: 'ภูมิลำเนา' };
                return labelMap[k] || k;
            }).join(', ') || 'อยู่ระหว่างตรวจสอบ';

            return `
                <tr>
                    <td style="text-align: center;">${idx + 1}</td>
                    <td><strong style="color: #b91c1c;">${w.warrantNo}</strong><br><span style="font-size: 11px; color: #475569;">${w.court || 'ศาลจังหวัดสมุทรปราการ'}</span></td>
                    <td style="text-align: center;">${w.date || '-'}</td>
                    <td><strong>${w.suspectName || w.suspect}</strong></td>
                    <td style="font-family: monospace;">${w.idCard || '-'}</td>
                    <td style="font-size: 11.5px;">${w.charges || w.suspect}</td>
                    <td style="font-size: 11px; color: #0284c7;">${chkSummary}</td>
                    <td style="text-align: center; font-size: 11px;">${w.filed ? `ส่งแล้ว<br>(${w.filedDate || '-'})` : '<span style="color: #94a3b8;">ยังไม่ส่ง</span>'}</td>
                    <td style="text-align: center; font-size: 11px;">${w.arrested ? `<strong style="color: #15803d;">จับกุมแล้ว</strong><br>(${w.arrestedDate || '-'})` : '<span style="color: #b91c1c;">ยังไม่จับ</span>'}</td>
                </tr>
            `;
        }).join('');

        const fullHtml = `
            <div style="font-family: 'Sarabun', sans-serif; font-size: 12px; line-height: 1.4; color: #000; padding: 10px;">
                <style>
                    @page { size: A4 landscape; margin: 12mm 12mm 12mm 12mm; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #94a3b8; padding: 6px 8px; font-size: 11.5px; vertical-align: top; }
                    th { background: #f1f5f9; font-weight: bold; }
                    .stat-box { display: flex; gap: 15px; justify-content: center; margin: 8px 0; font-size: 12px; }
                    .stat-item { background: #f8fafc; border: 1px solid #cbd5e1; padding: 4px 12px; border-radius: 6px; }
                </style>

                <div style="text-align: center;">
                    <h2 style="margin: 0; font-size: 16px; font-weight: bold;">บัญชีคุมหมายจับและติดตามสถานะการจับกุมผู้ต้องหา (${titleType})</h2>
                    <p style="margin: 2px 0; font-size: 12.5px;">สถานีตำรวจภูธรบางพลี กองบังคับการตำรวจภูธรจังหวัดสมุทรปราการ</p>
                    <p style="margin: 0 0 6px; font-size: 11.5px; color: #475569;">พิมพ์เมื่อ: ${printDate} | จำนวนในบัญชีนี้: ${list.length} หมาย</p>
                </div>

                <div class="stat-box">
                    <div class="stat-item">หมายจับทั้งหมด: <strong>${totalCount}</strong> หมาย</div>
                    <div class="stat-item" style="color: #15803d;">จับกุมแล้ว: <strong>${arrestedCount}</strong> หมาย</div>
                    <div class="stat-item" style="color: #b91c1c;">ยังไม่จับกุม: <strong>${pendingCount}</strong> หมาย</div>
                    <div class="stat-item" style="color: #1d4ed8;">ส่งสำนวนแล้ว: <strong>${filedCount}</strong> หมาย</div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 4%;">ลำดับ</th>
                            <th style="width: 14%;">เลขที่หมาย / ศาล</th>
                            <th style="width: 9%;">วันที่ออกหมาย</th>
                            <th style="width: 15%;">ชื่อ - สกุล ผู้ต้องหา</th>
                            <th style="width: 13%;">เลขประจำตัวประชาชน</th>
                            <th style="width: 19%;">ข้อหาความผิด</th>
                            <th style="width: 12%;">การติดตามตัว</th>
                            <th style="width: 7%;">ส่งสำนวน</th>
                            <th style="width: 7%;">สถานะจับกุม</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div style="margin-top: 30px; display: flex; justify-content: flex-end; text-align: center;">
                    <div style="width: 320px;">
                        <p style="margin-bottom: 40px;">ตรวจถูกต้องและรับรองข้อมูล</p>
                        <p>( ร.ต.ต.ธนกฤต ไทยกมล )<br>รอง สว.สส.สภ.บางพลี ผู้ควบคุมบัญชีหมายจับ</p>
                    </div>
                </div>
            </div>
        `;
        showDocPreviewModal(`บัญชีคุมหมายจับและติดตามสถานะ (${titleType})`, fullHtml);
    }

    return {
        exportCases,
        exportWarrants,
        openPrintModal,
        closePrintModal,
        printIndividualDossier,
        printWarrantLogSheet,
        triggerDirectPrint,
        showDocPreviewModal,
        closeDocPreviewModal
    };
})();
