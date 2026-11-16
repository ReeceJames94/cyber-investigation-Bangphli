/**
 * Official Registry Module (สมุดออกเลขหนังสือส่ง และ สมุดทะเบียนรับหนังสือราชการ)
 * สภ.บางพลี • Cyber Investigation Portal
 */
window.CyberRegistry = (function() {
    let currentSubTab = 'dispatch';
    let editingDispatchId = null;
    let editingReceiptId = null;

    function parseDateToComparable(dStr) {
        if (!dStr) return 0;
        const s = String(dStr).trim();
        const parts = s.includes('/') ? s.split('/') : (s.includes('-') ? s.split('-') : null);
        if (!parts || parts.length < 3) return 0;
        let d, m, y;
        if (parts[0].length === 4) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            d = parseInt(parts[2], 10);
        } else {
            d = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            y = parseInt(parts[2], 10);
        }
        if (y > 2400) y -= 543;
        return y * 10000 + m * 100 + d;
    }

    function getTodayThai() {
        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear() + 543;
        return `${d}/${m}/${y}`;
    }

    function switchSubTab(tab) {
        currentSubTab = tab;
        const btnDisp = document.getElementById('subtab-btn-dispatch');
        const btnRec = document.getElementById('subtab-btn-receipt');
        const addIcon = document.getElementById('registryMainAddIcon');
        const addText = document.getElementById('registryMainAddText');
        const statusSelect = document.getElementById('registryFilterStatus');

        if (tab === 'dispatch') {
            if (btnDisp) btnDisp.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 shadow-md transition flex items-center gap-2';
            if (btnRec) btnRec.className = 'px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition flex items-center gap-2';
            if (addIcon) addIcon.className = 'fa-solid fa-paper-plane';
            if (addText) addText.textContent = 'ออกเลขหนังสือส่ง';
            if (statusSelect) {
                statusSelect.innerHTML = `
                    <option value="">สถานะส่งทั้งหมด</option>
                    <option value="ส่งแล้ว (รอผล)">ส่งแล้ว (รอผล)</option>
                    <option value="ตอบกลับแล้ว/เสร็จสิ้น">ตอบกลับแล้ว/เสร็จสิ้น</option>
                    <option value="ยกเลิกการส่ง">ยกเลิกการส่ง</option>
                `;
            }
        } else {
            if (btnRec) btnRec.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-md transition flex items-center gap-2';
            if (btnDisp) btnDisp.className = 'px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition flex items-center gap-2';
            if (addIcon) addIcon.className = 'fa-solid fa-inbox';
            if (addText) addText.textContent = 'ลงทะเบียนหนังสือรับ';
            if (statusSelect) {
                statusSelect.innerHTML = `
                    <option value="">สถานะรับทั้งหมด</option>
                    <option value="รับเรื่องแล้ว">รับเรื่องแล้ว</option>
                    <option value="อยู่ระหว่างสืบสวน">อยู่ระหว่างสืบสวน</option>
                    <option value="ดำเนินการแล้วเสร็จ">ดำเนินการแล้วเสร็จ</option>
                `;
            }
        }
        render();
    }

    function generateAutoDispatchNo() {
        const list = window.CyberState.getDispatchDocs() || [];
        let maxNo = 144;
        list.forEach(d => {
            const match = (d.docNo || '').match(/\/(\d+)/);
            if (match && match[1]) {
                const n = parseInt(match[1], 10);
                if (n > maxNo) maxNo = n;
            }
        });
        const nextNo = maxNo + 1;
        const input = document.getElementById('dispatchDocNo');
        const docNoStr = `ตช.0016.36(อท.)/${nextNo}`;
        if (input) input.value = docNoStr;
        window.CyberUI.showToast(`⚡ ออกเลขหนังสือส่ง: ${docNoStr}`, 'success');
        return docNoStr;
    }

    function generateAutoReceiptNo() {
        const list = window.CyberState.getReceiptDocs() || [];
        let maxNo = 317;
        list.forEach(r => {
            const match = (r.receiptNo || '').match(/(\d+)\//);
            if (match && match[1]) {
                const n = parseInt(match[1], 10);
                if (n > maxNo) maxNo = n;
            }
        });
        const nextNo = maxNo + 1;
        const input = document.getElementById('receiptDocNo');
        const recNoStr = `รับที่ ${nextNo}/2569`;
        if (input) input.value = recNoStr;
        window.CyberUI.showToast(`⚡ ออกเลขทะเบียนรับ: ${recNoStr}`, 'success');
        return recNoStr;
    }

    function resetDateFilters() {
        document.getElementById('registryFilterDateStart').value = '';
        document.getElementById('registryFilterDateEnd').value = '';
        render();
        window.CyberUI.showToast('แสดงเอกสารทั้งหมด', 'info');
    }

    function filterToday() {
        const today = getTodayThai();
        document.getElementById('registryFilterDateStart').value = today;
        document.getElementById('registryFilterDateEnd').value = today;
        render();
        window.CyberUI.showToast('กรองเอกสารเฉพาะวันนี้', 'info');
    }

    function filterDays(days) {
        const today = new Date();
        const past = new Date();
        past.setDate(today.getDate() - (days - 1));

        const pad = n => String(n).padStart(2, '0');
        const fToday = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear() + 543}`;
        const fPast = `${pad(past.getDate())}/${pad(past.getMonth() + 1)}/${past.getFullYear() + 543}`;

        document.getElementById('registryFilterDateStart').value = fPast;
        document.getElementById('registryFilterDateEnd').value = fToday;
        render();
        window.CyberUI.showToast(`กรองเอกสาร ${days} วันล่าสุด (${fPast} ถึง ${fToday})`, 'info');
    }

    function filterMonth() {
        const today = new Date();
        const yearThai = today.getFullYear() + 543;
        const monthStr = String(today.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

        const startStr = `01/${monthStr}/${yearThai}`;
        const endStr = `${String(lastDay).padStart(2, '0')}/${monthStr}/${yearThai}`;

        document.getElementById('registryFilterDateStart').value = startStr;
        document.getElementById('registryFilterDateEnd').value = endStr;
        render();
        window.CyberUI.showToast(`กรองเอกสารประจำเดือนนี้ (${startStr} ถึง ${endStr})`, 'info');
    }

    function toggleDispatchStatus(id) {
        const list = window.CyberState.getDispatchDocs() || [];
        const item = list.find(d => d.id === id);
        if (!item) return;
        const statuses = ['ส่งแล้ว (รอผล)', 'ตอบกลับแล้ว/เสร็จสิ้น', 'ยกเลิกการส่ง'];
        const curIdx = statuses.indexOf(item.status);
        const nextStatus = statuses[(curIdx + 1) % statuses.length];
        item.status = nextStatus;
        window.CyberState.setDispatchDocs(list);
        if (window.CyberState.saveDoc) window.CyberState.saveDoc('cyber_dispatch_docs', item);
        render();
        window.CyberUI.showToast(`🔄 เปลี่ยนสถานะ (${item.docNo}) เป็น: ${nextStatus}`, 'success');
    }

    function toggleReceiptStatus(id) {
        const list = window.CyberState.getReceiptDocs() || [];
        const item = list.find(r => r.id === id);
        if (!item) return;
        const statuses = ['รับเรื่องแล้ว', 'อยู่ระหว่างสืบสวน', 'ดำเนินการแล้วเสร็จ'];
        const curIdx = statuses.indexOf(item.status);
        const nextStatus = statuses[(curIdx + 1) % statuses.length];
        item.status = nextStatus;
        window.CyberState.setReceiptDocs(list);
        if (window.CyberState.saveDoc) window.CyberState.saveDoc('cyber_receipt_docs', item);
        render();
        window.CyberUI.showToast(`🔄 เปลี่ยนสถานะ (${item.receiptNo}) เป็น: ${nextStatus}`, 'success');
    }

    function copyDispatchInfo(id) {
        const list = window.CyberState.getDispatchDocs() || [];
        const item = list.find(d => d.id === id);
        if (!item) return;
        const text = `[หนังสือส่ง สภ.บางพลี]\nเลขที่: ${item.docNo}\nลงวันที่: ${item.date}\nจาก: ${item.from}\nถึง: ${item.to}\nเรื่อง: ${item.subject}${item.caseNo ? `\nอ้างถึงคดี: ${item.caseNo}` : ''}\nเจ้าของเรื่อง: ${item.officer}\nช่องทางส่ง: ${item.channel}${item.trackingNo ? ` (${item.trackingNo})` : ''}\nสถานะ: ${item.status}`;
        navigator.clipboard.writeText(text).then(() => {
            window.CyberUI.showToast(`📋 คัดลอกข้อมูลหนังสือส่ง (${item.docNo}) เรียบร้อยแล้ว`, 'success');
        }).catch(() => {
            window.CyberUI.showToast(`เลขที่หนังสือ: ${item.docNo}`, 'info');
        });
    }

    function copyReceiptInfo(id) {
        const list = window.CyberState.getReceiptDocs() || [];
        const item = list.find(r => r.id === id);
        if (!item) return;
        const text = `[หนังสือรับ สภ.บางพลี]\nเลขทะเบียนรับ: ${item.receiptNo}\nวันที่รับ: ${item.date}\nหนังสือต้นทางที่: ${item.originDocNo} (ลงวันที่ ${item.originDate || '-'})\nจาก: ${item.from}\nถึง: ${item.to}\nเรื่อง: ${item.subject}\nมอบหมายให้: ${item.assignTo}\nการปฏิบัติ: ${item.action || '-'}\nสถานะ: ${item.status}`;
        navigator.clipboard.writeText(text).then(() => {
            window.CyberUI.showToast(`📋 คัดลอกข้อมูลหนังสือรับ (${item.receiptNo}) เรียบร้อยแล้ว`, 'success');
        }).catch(() => {
            window.CyberUI.showToast(`เลขทะเบียนรับ: ${item.receiptNo}`, 'info');
        });
    }

    function populateDropdowns() {
        const investigators = window.CyberState.getInvestigators() || [];
        const detectives = window.CyberState.getDetectives() || [];
        const officers = Array.from(new Set([...investigators, ...detectives]));

        const dispOff = document.getElementById('dispatchOfficer');
        if (dispOff) {
            dispOff.innerHTML = officers.map(o => `<option value="${o}">${o}</option>`).join('');
        }

        const recAssign = document.getElementById('receiptAssignTo');
        if (recAssign) {
            recAssign.innerHTML = officers.map(o => `<option value="${o}">${o}</option>`).join('');
        }

        const caseSelect = document.getElementById('dispatchCaseNo');
        if (caseSelect) {
            const cases = window.CyberState.getCases() || [];
            const caseOpts = cases.map(c => `<option value="${c.caseNo}">${c.caseNo} - ${c.victim}</option>`).join('');
            caseSelect.innerHTML = `<option value="">-- ไม่อ้างถึงคดี หรือ หนังสือทั่วไป --</option>` + caseOpts;
        }
    }

    function render() {
        const dispatchList = window.CyberState.getDispatchDocs() || [];
        const receiptList = window.CyberState.getReceiptDocs() || [];

        const bDisp = document.getElementById('badgeDispatchCount');
        const bRec = document.getElementById('badgeReceiptCount');
        if (bDisp) bDisp.textContent = dispatchList.length;
        if (bRec) bRec.textContent = receiptList.length;

        const summaryEl = document.getElementById('registrySummaryContainer');
        const runningBadgeEl = document.getElementById('registryCurrentRunningBadge');

        if (currentSubTab === 'dispatch') {
            // Outgoing summary
            let maxNo = 0;
            dispatchList.forEach(d => {
                const match = (d.docNo || '').match(/\/(\d+)/);
                if (match && match[1]) {
                    const n = parseInt(match[1], 10);
                    if (n > maxNo) maxNo = n;
                }
            });
            if (maxNo === 0) maxNo = 144;
            const nextNo = maxNo + 1;

            const totalDisp = dispatchList.length;
            const pendingDisp = dispatchList.filter(d => (d.status || '').includes('รอผล')).length;
            const doneDisp = dispatchList.filter(d => (d.status || '').includes('เสร็จสิ้น') || (d.status || '').includes('ตอบกลับ')).length;

            if (runningBadgeEl) {
                runningBadgeEl.innerHTML = `
                    <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <span>ล่าสุด:</span>
                        <span class="font-bold text-amber-500 font-mono">ตช.0016.36(อท.)/${maxNo}</span>
                    </div>
                    <span class="text-slate-300 dark:text-slate-700">|</span>
                    <div class="flex items-center gap-1.5">
                        <span class="text-slate-500 dark:text-slate-400">ถัดไป:</span>
                        <span class="font-bold text-emerald-500 font-mono">ตช.0016.36(อท.)/${nextNo}</span>
                        <button onclick="window.CyberRegistry.openNewDispatch()" class="ml-1 px-2.5 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-navy-950 text-[10px] font-bold transition">⚡ ออกเลขนี้</button>
                    </div>
                `;
            }

            if (summaryEl) {
                summaryEl.innerHTML = `
                    <div onclick="document.getElementById('registryFilterStatus').value=''; window.CyberRegistry.render();" class="cursor-pointer bg-white dark:bg-navy-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 transition shadow-sm">
                        <div class="text-[11px] text-slate-400 font-medium">หนังสือส่งทั้งหมด</div>
                        <div class="text-xl font-bold text-slate-900 dark:text-white mt-0.5">${totalDisp} <span class="text-xs font-normal text-slate-400">ฉบับ</span></div>
                    </div>
                    <div onclick="document.getElementById('registryFilterStatus').value='ส่งแล้ว (รอผล)'; window.CyberRegistry.render();" class="cursor-pointer bg-white dark:bg-navy-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 transition shadow-sm">
                        <div class="text-[11px] text-amber-500 font-medium flex items-center gap-1"><i class="fa-solid fa-hourglass-half"></i> รอการตอบกลับ</div>
                        <div class="text-xl font-bold text-amber-500 mt-0.5">${pendingDisp} <span class="text-xs font-normal text-slate-400">ฉบับ</span></div>
                    </div>
                    <div onclick="document.getElementById('registryFilterStatus').value='ตอบกลับแล้ว/เสร็จสิ้น'; window.CyberRegistry.render();" class="cursor-pointer bg-white dark:bg-navy-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition shadow-sm">
                        <div class="text-[11px] text-emerald-500 font-medium flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> ตอบกลับแล้ว</div>
                        <div class="text-xl font-bold text-emerald-500 mt-0.5">${doneDisp} <span class="text-xs font-normal text-slate-400">ฉบับ</span></div>
                    </div>
                    <div class="bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-4 rounded-2xl border border-amber-500/30 shadow-sm flex flex-col justify-between">
                        <div class="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center justify-between">
                            <span>⚡ เลขส่งถัดไป</span>
                            <button onclick="window.CyberRegistry.openNewDispatch()" class="text-[10px] underline hover:text-amber-300">ออกเลขทันที</button>
                        </div>
                        <div class="text-sm font-extrabold text-amber-600 dark:text-amber-400 font-mono truncate">ตช.0016.36(อท.)/${nextNo}</div>
                    </div>
                `;
            }
        } else {
            // Incoming summary
            let maxNo = 0;
            receiptList.forEach(r => {
                const match = (r.receiptNo || '').match(/(\d+)\//);
                if (match && match[1]) {
                    const n = parseInt(match[1], 10);
                    if (n > maxNo) maxNo = n;
                }
            });
            if (maxNo === 0) maxNo = 317;
            const nextNo = maxNo + 1;

            const totalRec = receiptList.length;
            const receivedRec = receiptList.filter(r => r.status === 'รับเรื่องแล้ว').length;
            const inProgressRec = receiptList.filter(r => r.status === 'อยู่ระหว่างสืบสวน').length;

            if (runningBadgeEl) {
                runningBadgeEl.innerHTML = `
                    <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <span>ล่าสุด:</span>
                        <span class="font-bold text-blue-500 font-mono">รับที่ ${maxNo}/2569</span>
                    </div>
                    <span class="text-slate-300 dark:text-slate-700">|</span>
                    <div class="flex items-center gap-1.5">
                        <span class="text-slate-500 dark:text-slate-400">ถัดไป:</span>
                        <span class="font-bold text-emerald-500 font-mono">รับที่ ${nextNo}/2569</span>
                        <button onclick="window.CyberRegistry.openNewReceipt()" class="ml-1 px-2.5 py-0.5 rounded-lg bg-blue-500/10 hover:bg-blue-500 text-blue-500 hover:text-white text-[10px] font-bold transition">⚡ ออกเลขนี้</button>
                    </div>
                `;
            }

            if (summaryEl) {
                summaryEl.innerHTML = `
                    <div onclick="document.getElementById('registryFilterStatus').value=''; window.CyberRegistry.render();" class="cursor-pointer bg-white dark:bg-navy-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 transition shadow-sm">
                        <div class="text-[11px] text-slate-400 font-medium">หนังสือรับทั้งหมด</div>
                        <div class="text-xl font-bold text-slate-900 dark:text-white mt-0.5">${totalRec} <span class="text-xs font-normal text-slate-400">ฉบับ</span></div>
                    </div>
                    <div onclick="document.getElementById('registryFilterStatus').value='รับเรื่องแล้ว'; window.CyberRegistry.render();" class="cursor-pointer bg-white dark:bg-navy-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 transition shadow-sm">
                        <div class="text-[11px] text-blue-500 font-medium flex items-center gap-1"><i class="fa-solid fa-inbox"></i> รับเรื่องแล้ว</div>
                        <div class="text-xl font-bold text-blue-500 mt-0.5">${receivedRec} <span class="text-xs font-normal text-slate-400">ฉบับ</span></div>
                    </div>
                    <div onclick="document.getElementById('registryFilterStatus').value='อยู่ระหว่างสืบสวน'; window.CyberRegistry.render();" class="cursor-pointer bg-white dark:bg-navy-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 transition shadow-sm">
                        <div class="text-[11px] text-amber-500 font-medium flex items-center gap-1"><i class="fa-solid fa-magnifying-glass"></i> อยู่ระหว่างสืบสวน</div>
                        <div class="text-xl font-bold text-amber-500 mt-0.5">${inProgressRec} <span class="text-xs font-normal text-slate-400">ฉบับ</span></div>
                    </div>
                    <div class="bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-4 rounded-2xl border border-blue-500/30 shadow-sm flex flex-col justify-between">
                        <div class="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center justify-between">
                            <span>⚡ เลขรับถัดไป</span>
                            <button onclick="window.CyberRegistry.openNewReceipt()" class="text-[10px] underline hover:text-blue-300">ออกเลขทันที</button>
                        </div>
                        <div class="text-sm font-extrabold text-blue-600 dark:text-blue-400 font-mono truncate">รับที่ ${nextNo}/2569</div>
                    </div>
                `;
            }
        }

        const thead = document.getElementById('registryTableThead');
        const tbody = document.getElementById('registryTableTbody');
        if (!thead || !tbody) return;

        const q = (document.getElementById('registryFilterQuery')?.value || '').trim().toLowerCase();
        const startVal = parseDateToComparable(document.getElementById('registryFilterDateStart')?.value);
        const endVal = parseDateToComparable(document.getElementById('registryFilterDateEnd')?.value);
        const s = (document.getElementById('registryFilterStatus')?.value || '').trim();

        if (currentSubTab === 'dispatch') {
            thead.innerHTML = `
                <tr>
                    <th class="p-4 text-center w-32">จัดการ</th>
                    <th class="p-4">เลขทะเบียนส่ง / ลงวันที่</th>
                    <th class="p-4">จาก</th>
                    <th class="p-4">ถึง (ผู้รับ)</th>
                    <th class="p-4">เรื่อง / อ้างถึงคดี</th>
                    <th class="p-4">เจ้าของเรื่อง</th>
                    <th class="p-4">ไฟล์แนบ</th>
                    <th class="p-4">สถานะ (คลิกสลับ) / เลขพัสดุ</th>
                </tr>
            `;

            let list = dispatchList.filter(d => {
                if (s && d.status !== s) return false;
                if (q && !`${d.docNo} ${d.from} ${d.to} ${d.subject} ${d.caseNo || ''} ${d.officer} ${d.trackingNo || ''}`.toLowerCase().includes(q)) return false;
                if (startVal || endVal) {
                    const dVal = parseDateToComparable(d.date);
                    if (dVal) {
                        if (startVal && dVal < startVal) return false;
                        if (endVal && dVal > endVal) return false;
                    }
                }
                return true;
            });

            tbody.innerHTML = '';
            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 text-xs">ไม่พบรายการหนังสือส่งตามเงื่อนไขที่เลือก</td></tr>`;
                return;
            }

            list.forEach(d => {
                const statusClass = d.status.includes('เสร็จสิ้น') || d.status.includes('ตอบกลับ') ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : (d.status.includes('ยกเลิก') ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20');
                const fileHtml = d.file ? `
                    <a href="javascript:void(0)" onclick="window.CyberUI.showToast('เปิดเอกสาร: ' + '${d.file}', 'info')" class="inline-flex items-center gap-1 text-blue-500 hover:underline max-w-[140px] truncate" title="${d.file}">
                        <i class="fa-solid fa-file-pdf text-rose-500"></i> <span class="truncate">${d.file}</span>
                    </a>
                ` : '<span class="text-slate-400 text-[11px]">ไม่มีไฟล์</span>';

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50 dark:hover:bg-navy-950/60 transition">
                        <td class="p-4 text-center align-top">
                            <div class="inline-flex items-center gap-1">
                                <button onclick="window.CyberRegistry.openEditDispatch('${d.id}')" class="text-amber-500 hover:text-amber-600 p-1.5 rounded-lg hover:bg-amber-500/10 transition" title="แก้ไขข้อมูล">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button onclick="window.CyberRegistry.printDispatchSlip('${d.id}')" class="text-emerald-500 hover:text-emerald-600 p-1.5 rounded-lg hover:bg-emerald-500/10 transition" title="พิมพ์ใบนำส่งหนังสือ">
                                    <i class="fa-solid fa-print"></i>
                                </button>
                                <button onclick="window.CyberRegistry.copyDispatchInfo('${d.id}')" class="text-sky-500 hover:text-sky-600 p-1.5 rounded-lg hover:bg-sky-500/10 transition" title="คัดลอกข้อความสรุป">
                                    <i class="fa-solid fa-copy"></i>
                                </button>
                                <button onclick="window.CyberRegistry.deleteDispatch('${d.id}')" class="text-rose-500 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-500/10 transition" title="ลบรายการ">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </td>
                        <td class="p-4 align-top">
                            <div class="font-bold text-amber-600 dark:text-amber-400 font-mono flex items-center gap-1.5">
                                <span>${d.docNo}</span>
                                <button type="button" onclick="navigator.clipboard.writeText('${d.docNo}'); window.CyberUI.showToast('คัดลอก ' + '${d.docNo}', 'info');" class="text-slate-400 hover:text-amber-500 text-[10px]" title="คัดลอกเลขที่หนังสือ"><i class="fa-solid fa-copy"></i></button>
                            </div>
                            <div class="text-[11px] text-slate-400 mt-0.5">${d.date}</div>
                        </td>
                        <td class="p-4 align-top font-medium text-slate-800 dark:text-slate-200">${d.from}</td>
                        <td class="p-4 align-top text-slate-700 dark:text-slate-300 font-medium">${d.to}</td>
                        <td class="p-4 align-top">
                            <div class="font-medium text-slate-900 dark:text-white">${d.subject}</div>
                            ${d.caseNo ? `<div class="text-[11px] text-sky-500 mt-1">คดี: ${d.caseNo}</div>` : ''}
                        </td>
                        <td class="p-4 align-top text-slate-600 dark:text-slate-400">${d.officer}</td>
                        <td class="p-4 align-top">${fileHtml}</td>
                        <td class="p-4 align-top">
                            <button type="button" onclick="window.CyberRegistry.toggleDispatchStatus('${d.id}')" title="คลิกเพื่อสลับสถานะด่วน" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer hover:opacity-80 ${statusClass}">
                                <span>${d.status}</span> <i class="fa-solid fa-rotate text-[9px] opacity-70"></i>
                            </button>
                            ${d.trackingNo ? `<div class="text-[10px] text-slate-400 mt-1 font-mono">${d.channel}: ${d.trackingNo}</div>` : `<div class="text-[10px] text-slate-400 mt-1">${d.channel}</div>`}
                        </td>
                    </tr>
                `;
            });
        } else {
            thead.innerHTML = `
                <tr>
                    <th class="p-4 text-center w-28">จัดการ</th>
                    <th class="p-4">เลขทะเบียนรับ / วันที่รับ</th>
                    <th class="p-4">ที่ (หนังสือต้นทาง) / ลงวันที่</th>
                    <th class="p-4">จาก (หน่วยงาน)</th>
                    <th class="p-4">ถึง</th>
                    <th class="p-4">เรื่อง</th>
                    <th class="p-4">มอบหมายให้</th>
                    <th class="p-4">ไฟล์แนบ</th>
                    <th class="p-4">การปฏิบัติ / สถานะ (คลิกสลับ)</th>
                </tr>
            `;

            let list = receiptList.filter(r => {
                if (s && r.status !== s) return false;
                if (q && !`${r.receiptNo} ${r.originDocNo} ${r.from} ${r.to} ${r.subject} ${r.assignTo} ${r.action || ''}`.toLowerCase().includes(q)) return false;
                if (startVal || endVal) {
                    const rVal = parseDateToComparable(r.date);
                    if (rVal) {
                        if (startVal && rVal < startVal) return false;
                        if (endVal && rVal > endVal) return false;
                    }
                }
                return true;
            });

            tbody.innerHTML = '';
            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400 text-xs">ไม่พบรายการหนังสือรับตามเงื่อนไขที่เลือก</td></tr>`;
                return;
            }

            list.forEach(r => {
                const statusClass = r.status.includes('แล้วเสร็จ') ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : (r.status.includes('สืบสวน') ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20');
                const fileHtml = r.file ? `
                    <a href="javascript:void(0)" onclick="window.CyberUI.showToast('เปิดเอกสาร: ' + '${r.file}', 'info')" class="inline-flex items-center gap-1 text-blue-500 hover:underline max-w-[140px] truncate" title="${r.file}">
                        <i class="fa-solid fa-file-pdf text-rose-500"></i> <span class="truncate">${r.file}</span>
                    </a>
                ` : '<span class="text-slate-400 text-[11px]">ไม่มีไฟล์</span>';

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50 dark:hover:bg-navy-950/60 transition">
                        <td class="p-4 text-center align-top">
                            <div class="inline-flex items-center gap-1">
                                <button onclick="window.CyberRegistry.openEditReceipt('${r.id}')" class="text-blue-500 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-500/10 transition" title="แก้ไขข้อมูล">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button onclick="window.CyberRegistry.copyReceiptInfo('${r.id}')" class="text-sky-500 hover:text-sky-600 p-1.5 rounded-lg hover:bg-sky-500/10 transition" title="คัดลอกข้อความสรุป">
                                    <i class="fa-solid fa-copy"></i>
                                </button>
                                <button onclick="window.CyberRegistry.deleteReceipt('${r.id}')" class="text-rose-500 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-500/10 transition" title="ลบรายการ">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </td>
                        <td class="p-4 align-top">
                            <div class="font-bold text-blue-600 dark:text-blue-400 font-mono flex items-center gap-1.5">
                                <span>${r.receiptNo}</span>
                                <button type="button" onclick="navigator.clipboard.writeText('${r.receiptNo}'); window.CyberUI.showToast('คัดลอก ' + '${r.receiptNo}', 'info');" class="text-slate-400 hover:text-blue-500 text-[10px]" title="คัดลอกเลขทะเบียนรับ"><i class="fa-solid fa-copy"></i></button>
                            </div>
                            <div class="text-[11px] text-slate-400 mt-0.5">${r.date}</div>
                        </td>
                        <td class="p-4 align-top">
                            <div class="font-bold text-slate-800 dark:text-slate-200">${r.originDocNo}</div>
                            <div class="text-[11px] text-slate-400">ลงวันที่ ${r.originDate || '-'}</div>
                        </td>
                        <td class="p-4 align-top font-medium text-slate-700 dark:text-slate-300">${r.from}</td>
                        <td class="p-4 align-top text-slate-600 dark:text-slate-400">${r.to}</td>
                        <td class="p-4 align-top font-medium text-slate-900 dark:text-white">${r.subject}</td>
                        <td class="p-4 align-top text-slate-600 dark:text-slate-300">${r.assignTo}</td>
                        <td class="p-4 align-top">${fileHtml}</td>
                        <td class="p-4 align-top">
                            <button type="button" onclick="window.CyberRegistry.toggleReceiptStatus('${r.id}')" title="คลิกเพื่อสลับสถานะด่วน" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer hover:opacity-80 ${statusClass}">
                                <span>${r.status}</span> <i class="fa-solid fa-rotate text-[9px] opacity-70"></i>
                            </button>
                            ${r.action ? `<div class="text-[10px] text-slate-400 mt-1">${r.action}</div>` : ''}
                        </td>
                    </tr>
                `;
            });
        }
    }

    function openNewModal() {
        if (currentSubTab === 'dispatch') openNewDispatch();
        else openNewReceipt();
    }

    function openNewDispatch() {
        editingDispatchId = null;
        populateDropdowns();
        document.getElementById('dispatchEditId').value = '';
        document.getElementById('dispatchModalTitle').textContent = 'ออกเลขหนังสือส่งใหม่';
        document.getElementById('dispatchSubmitBtn').innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกและออกเลขส่ง';
        generateAutoDispatchNo();
        document.getElementById('dispatchDate').value = getTodayThai();
        document.getElementById('dispatchFrom').value = 'สว.สส.สภ.บางพลี';
        document.getElementById('dispatchTo').value = '';
        document.getElementById('dispatchSubject').value = '';
        document.getElementById('dispatchCaseNo').value = '';
        document.getElementById('dispatchChannel').value = 'ส่งทางไปรษณีย์ EMS';
        document.getElementById('dispatchTrackingNo').value = '';
        document.getElementById('dispatchStatus').value = 'ส่งแล้ว (รอผล)';
        document.getElementById('dispatchFileInput').value = '';
        document.getElementById('dispatchFileExisting').textContent = '';
        const m = document.getElementById('dispatchModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
    }

    function openEditDispatch(id) {
        const list = window.CyberState.getDispatchDocs() || [];
        const item = list.find(d => d.id === id);
        if (!item) return;
        editingDispatchId = id;
        populateDropdowns();
        document.getElementById('dispatchEditId').value = item.id;
        document.getElementById('dispatchModalTitle').textContent = `แก้ไขหนังสือส่ง (${item.docNo})`;
        document.getElementById('dispatchSubmitBtn').innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกการแก้ไข';
        document.getElementById('dispatchDocNo').value = item.docNo || '';
        document.getElementById('dispatchDate').value = item.date || '';
        document.getElementById('dispatchFrom').value = item.from || 'สว.สส.สภ.บางพลี';
        document.getElementById('dispatchTo').value = item.to || '';
        document.getElementById('dispatchSubject').value = item.subject || '';
        document.getElementById('dispatchCaseNo').value = item.caseNo || '';
        if (item.officer) {
            const offSel = document.getElementById('dispatchOfficer');
            if (offSel) {
                if (![...offSel.options].some(o => o.value === item.officer)) {
                    const opt = document.createElement('option');
                    opt.value = item.officer;
                    opt.textContent = item.officer;
                    offSel.appendChild(opt);
                }
                offSel.value = item.officer;
            }
        }
        document.getElementById('dispatchChannel').value = item.channel || 'ส่งทางไปรษณีย์ EMS';
        document.getElementById('dispatchTrackingNo').value = item.trackingNo || '';
        document.getElementById('dispatchStatus').value = item.status || 'ส่งแล้ว (รอผล)';
        document.getElementById('dispatchFileInput').value = '';
        document.getElementById('dispatchFileExisting').textContent = item.file ? `ไฟล์เดิม: ${item.file}` : '';
        const m = document.getElementById('dispatchModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
    }

    function handleDispatchSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('dispatchEditId').value;
        const docNo = document.getElementById('dispatchDocNo').value.trim();
        const date = document.getElementById('dispatchDate').value.trim();
        const from = document.getElementById('dispatchFrom').value.trim();
        const to = document.getElementById('dispatchTo').value.trim();
        const subject = document.getElementById('dispatchSubject').value.trim();
        const caseNo = document.getElementById('dispatchCaseNo').value;
        const officer = document.getElementById('dispatchOfficer').value;
        const channel = document.getElementById('dispatchChannel').value;
        const trackingNo = document.getElementById('dispatchTrackingNo').value.trim();
        const status = document.getElementById('dispatchStatus').value;
        const fileInput = document.getElementById('dispatchFileInput');

        let fileName = '';
        if (fileInput.files && fileInput.files[0]) {
            fileName = fileInput.files[0].name;
        }

        const list = [...(window.CyberState.getDispatchDocs() || [])];

        if (id) {
            const idx = list.findIndex(d => d.id === id);
            if (idx !== -1) {
                list[idx] = {
                    ...list[idx],
                    docNo, date, from, to, subject, caseNo, officer, channel, trackingNo, status,
                    file: fileName || list[idx].file || ''
                };
                window.CyberState.setDispatchDocs(list);
                if (window.CyberState.saveDoc) window.CyberState.saveDoc('cyber_dispatch_docs', list[idx]);
                window.CyberUI.showToast(`บันทึกการแก้ไขหนังสือส่ง ${docNo} เรียบร้อยแล้ว`, 'success');
            }
        } else {
            const newDoc = {
                id: 'disp_' + Date.now(),
                docNo, date, from, to, subject, caseNo, officer, channel, trackingNo, status,
                file: fileName || `${docNo.replace(/[\/\s\(\)\.]/g, '_')}.pdf`
            };
            list.unshift(newDoc);
            window.CyberState.setDispatchDocs(list);
            if (window.CyberState.saveDoc) window.CyberState.saveDoc('cyber_dispatch_docs', newDoc);
            window.CyberUI.showToast(`ออกเลขหนังสือส่ง ${docNo} เรียบร้อยแล้ว`, 'success');
        }

        const m = document.getElementById('dispatchModal');
        m.classList.add('hidden');
        m.classList.remove('flex');
        render();
    }

    function deleteDispatch(id) {
        const list = window.CyberState.getDispatchDocs() || [];
        const item = list.find(d => d.id === id);
        if (!item) return;
        if (confirm(`ต้องการลบรายการหนังสือส่งเลขที่:\n"${item.docNo} - ${item.subject}"\nใช่หรือไม่?`)) {
            const updated = list.filter(d => d.id !== id);
            window.CyberState.setDispatchDocs(updated);
            if (window.CyberState.deleteDoc) window.CyberState.deleteDoc('cyber_dispatch_docs', id);
            render();
            window.CyberUI.showToast('ลบรายการหนังสือส่งเรียบร้อยแล้ว', 'info');
        }
    }

    function openNewReceipt() {
        editingReceiptId = null;
        populateDropdowns();
        document.getElementById('receiptEditId').value = '';
        document.getElementById('receiptModalTitle').textContent = 'ลงทะเบียนรับหนังสือใหม่';
        document.getElementById('receiptSubmitBtn').innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกทะเบียนรับ';
        generateAutoReceiptNo();
        document.getElementById('receiptDate').value = getTodayThai();
        document.getElementById('receiptOriginNo').value = '';
        document.getElementById('receiptOriginDate').value = getTodayThai();
        document.getElementById('receiptFrom').value = '';
        document.getElementById('receiptTo').value = 'ผกก.สภ.บางพลี';
        document.getElementById('receiptSubject').value = '';
        document.getElementById('receiptAction').value = 'สว.สส. ตรวจสอบ/รวบรวมเข้าสำนวน';
        document.getElementById('receiptStatus').value = 'รับเรื่องแล้ว';
        document.getElementById('receiptFileInput').value = '';
        document.getElementById('receiptFileExisting').textContent = '';
        const m = document.getElementById('receiptModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
    }

    function openEditReceipt(id) {
        const list = window.CyberState.getReceiptDocs() || [];
        const item = list.find(r => r.id === id);
        if (!item) return;
        editingReceiptId = id;
        populateDropdowns();
        document.getElementById('receiptEditId').value = item.id;
        document.getElementById('receiptModalTitle').textContent = `แก้ไขหนังสือรับ (${item.receiptNo})`;
        document.getElementById('receiptSubmitBtn').innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกการแก้ไข';
        document.getElementById('receiptDocNo').value = item.receiptNo || '';
        document.getElementById('receiptDate').value = item.date || '';
        document.getElementById('receiptOriginNo').value = item.originDocNo || '';
        document.getElementById('receiptOriginDate').value = item.originDate || '';
        document.getElementById('receiptFrom').value = item.from || '';
        document.getElementById('receiptTo').value = item.to || 'ผกก.สภ.บางพลี';
        document.getElementById('receiptSubject').value = item.subject || '';
        if (item.assignTo) {
            const assignSel = document.getElementById('receiptAssignTo');
            if (assignSel) {
                if (![...assignSel.options].some(o => o.value === item.assignTo)) {
                    const opt = document.createElement('option');
                    opt.value = item.assignTo;
                    opt.textContent = item.assignTo;
                    assignSel.appendChild(opt);
                }
                assignSel.value = item.assignTo;
            }
        }
        document.getElementById('receiptAction').value = item.action || '';
        document.getElementById('receiptStatus').value = item.status || 'รับเรื่องแล้ว';
        document.getElementById('receiptFileInput').value = '';
        document.getElementById('receiptFileExisting').textContent = item.file ? `ไฟล์เดิม: ${item.file}` : '';
        const m = document.getElementById('receiptModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
    }

    function handleReceiptSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('receiptEditId').value;
        const receiptNo = document.getElementById('receiptDocNo').value.trim();
        const date = document.getElementById('receiptDate').value.trim();
        const originDocNo = document.getElementById('receiptOriginNo').value.trim();
        const originDate = document.getElementById('receiptOriginDate').value.trim();
        const from = document.getElementById('receiptFrom').value.trim();
        const to = document.getElementById('receiptTo').value.trim();
        const subject = document.getElementById('receiptSubject').value.trim();
        const assignTo = document.getElementById('receiptAssignTo').value;
        const action = document.getElementById('receiptAction').value.trim();
        const status = document.getElementById('receiptStatus').value;
        const fileInput = document.getElementById('receiptFileInput');

        let fileName = '';
        if (fileInput.files && fileInput.files[0]) {
            fileName = fileInput.files[0].name;
        }

        const list = [...(window.CyberState.getReceiptDocs() || [])];

        if (id) {
            const idx = list.findIndex(r => r.id === id);
            if (idx !== -1) {
                list[idx] = {
                    ...list[idx],
                    receiptNo, date, originDocNo, originDate, from, to, subject, assignTo, action, status,
                    file: fileName || list[idx].file || ''
                };
                window.CyberState.setReceiptDocs(list);
                if (window.CyberState.saveDoc) window.CyberState.saveDoc('cyber_receipt_docs', list[idx]);
                window.CyberUI.showToast(`บันทึกการแก้ไขหนังสือรับ ${receiptNo} เรียบร้อยแล้ว`, 'success');
            }
        } else {
            const newDoc = {
                id: 'rec_' + Date.now(),
                receiptNo, date, originDocNo, originDate, from, to, subject, assignTo, action, status,
                file: fileName || `หนังสือรับ_${originDocNo.replace(/[\/\s\(\)\.]/g, '_')}.pdf`
            };
            list.unshift(newDoc);
            window.CyberState.setReceiptDocs(list);
            if (window.CyberState.saveDoc) window.CyberState.saveDoc('cyber_receipt_docs', newDoc);
            window.CyberUI.showToast(`ลงทะเบียนรับหนังสือ ${receiptNo} เรียบร้อยแล้ว`, 'success');
        }

        const m = document.getElementById('receiptModal');
        m.classList.add('hidden');
        m.classList.remove('flex');
        render();
    }

    function deleteReceipt(id) {
        const list = window.CyberState.getReceiptDocs() || [];
        const item = list.find(r => r.id === id);
        if (!item) return;
        if (confirm(`ต้องการลบรายการหนังสือรับ:\n"${item.receiptNo} - ${item.subject}"\nใช่หรือไม่?`)) {
            const updated = list.filter(r => r.id !== id);
            window.CyberState.setReceiptDocs(updated);
            if (window.CyberState.deleteDoc) window.CyberState.deleteDoc('cyber_receipt_docs', id);
            render();
            window.CyberUI.showToast('ลบรายการหนังสือรับเรียบร้อยแล้ว', 'info');
        }
    }

    function printDispatchSlip(id) {
        const list = window.CyberState.getDispatchDocs() || [];
        const item = list.find(d => d.id === id);
        if (!item) return;

        const slipHtml = `
            <div style="font-family: 'Sarabun', sans-serif; font-size: 13px; line-height: 1.6; color: #000; padding: 25px 35px;">
                <style>
                    @page { size: A4 portrait; margin: 20mm; }
                </style>
                <div style="text-align: center; margin-bottom: 25px;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: bold;">ใบนำส่งหนังสือราชการ</h2>
                    <p style="margin: 3px 0 0; font-size: 14px;">สถานีตำรวจภูธรบางพลี กองบังคับการตำรวจภูธรจังหวัดสมุทรปราการ</p>
                </div>

                <div style="border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 15px 0; margin-bottom: 25px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <div><strong>เลขทะเบียนหนังสือส่ง:</strong> <span style="font-size: 15px; color: #b45309; font-weight: bold;">${item.docNo}</span></div>
                        <div><strong>ลงวันที่:</strong> ${item.date}</div>
                    </div>
                    <div style="margin-bottom: 8px;"><strong>จาก:</strong> ${item.from}</div>
                    <div style="margin-bottom: 8px;"><strong>ถึง:</strong> ${item.to}</div>
                    <div style="margin-bottom: 8px;"><strong>เรื่อง:</strong> <span style="font-weight: bold;">${item.subject}</span></div>
                    ${item.caseNo ? `<div style="margin-bottom: 8px;"><strong>อ้างถึงคดีอาญา:</strong> ${item.caseNo}</div>` : ''}
                    <div style="margin-bottom: 8px;"><strong>ช่องทางการส่ง:</strong> ${item.channel}</div>
                    ${item.trackingNo ? `<div><strong>เลขพัสดุ / หมายเลขอ้างอิง:</strong> ${item.trackingNo}</div>` : ''}
                </div>

                <div style="margin-top: 40px; display: flex; justify-content: space-between; text-align: center;">
                    <div style="width: 45%;">
                        <p style="margin-bottom: 60px;">ลงชื่อ......................................................ผู้ส่ง<br>( ${item.officer} )<br>เจ้าของเรื่อง</p>
                        <p>วันที่ .......... / .......... / ............</p>
                    </div>
                    <div style="width: 45%;">
                        <p style="margin-bottom: 60px;">ลงชื่อ......................................................ผู้รับหนังสือ<br>( ...................................................... )<br>ตำแหน่ง..................................................</p>
                        <p>วันที่ .......... / .......... / ............</p>
                    </div>
                </div>
            </div>
        `;

        const title = `ใบนำส่งหนังสือส่ง (${item.docNo})`;
        if (window.CyberExport && window.CyberExport.showDocPreviewModal) {
            window.CyberExport.showDocPreviewModal(title, slipHtml);
        } else if (window.CyberExport && window.CyberExport.triggerDirectPrint) {
            window.CyberExport.triggerDirectPrint(slipHtml, title);
        }
    }

    function exportPrint() {
        const printDate = getTodayThai();
        let tableHtml = '';
        let title = '';

        const q = (document.getElementById('registryFilterQuery')?.value || '').trim().toLowerCase();
        const startVal = parseDateToComparable(document.getElementById('registryFilterDateStart')?.value);
        const endVal = parseDateToComparable(document.getElementById('registryFilterDateEnd')?.value);
        const s = (document.getElementById('registryFilterStatus')?.value || '').trim();

        if (currentSubTab === 'dispatch') {
            title = 'สมุดทะเบียนหนังสือส่ง สถานีตำรวจภูธรบางพลี';
            const list = (window.CyberState.getDispatchDocs() || []).filter(d => {
                if (s && d.status !== s) return false;
                if (q && !`${d.docNo} ${d.from} ${d.to} ${d.subject} ${d.caseNo || ''} ${d.officer}`.toLowerCase().includes(q)) return false;
                if (startVal || endVal) {
                    const dVal = parseDateToComparable(d.date);
                    if (dVal) {
                        if (startVal && dVal < startVal) return false;
                        if (endVal && dVal > endVal) return false;
                    }
                }
                return true;
            });

            if (list.length === 0) {
                window.CyberUI.showToast('ไม่มีรายการหนังสือส่งสำหรับพิมพ์', 'warning');
                return;
            }

            const rows = list.map((d, idx) => `
                <tr>
                    <td style="text-align: center;">${idx + 1}</td>
                    <td><strong style="color: #b45309;">${d.docNo}</strong></td>
                    <td style="text-align: center;">${d.date}</td>
                    <td>${d.from}</td>
                    <td><strong>${d.to}</strong></td>
                    <td>${d.subject}${d.caseNo ? `<br><span style="font-size: 10.5px; color: #0284c7;">คดี: ${d.caseNo}</span>` : ''}</td>
                    <td>${d.officer}</td>
                    <td>${d.status}${d.trackingNo ? `<br><span style="font-size: 10px; color: #64748b;">${d.trackingNo}</span>` : ''}</td>
                </tr>
            `).join('');

            tableHtml = `
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="width: 4%; border: 1px solid #94a3b8; padding: 6px;">ลำดับ</th>
                            <th style="width: 15%; border: 1px solid #94a3b8; padding: 6px;">ทะเบียนที่ส่ง</th>
                            <th style="width: 10%; border: 1px solid #94a3b8; padding: 6px;">ลงวันที่</th>
                            <th style="width: 13%; border: 1px solid #94a3b8; padding: 6px;">จาก</th>
                            <th style="width: 18%; border: 1px solid #94a3b8; padding: 6px;">ถึง</th>
                            <th style="width: 24%; border: 1px solid #94a3b8; padding: 6px;">เรื่อง</th>
                            <th style="width: 16%; border: 1px solid #94a3b8; padding: 6px;">เจ้าของเรื่อง</th>
                            <th style="border: 1px solid #94a3b8; padding: 6px;">การปฏิบัติ / หมายเหตุ</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
        } else {
            title = 'สมุดทะเบียนหนังสือรับ สถานีตำรวจภูธรบางพลี';
            const list = (window.CyberState.getReceiptDocs() || []).filter(r => {
                if (s && r.status !== s) return false;
                if (q && !`${r.receiptNo} ${r.originDocNo} ${r.from} ${r.to} ${r.subject} ${r.assignTo}`.toLowerCase().includes(q)) return false;
                if (startVal || endVal) {
                    const rVal = parseDateToComparable(r.date);
                    if (rVal) {
                        if (startVal && rVal < startVal) return false;
                        if (endVal && rVal > endVal) return false;
                    }
                }
                return true;
            });

            if (list.length === 0) {
                window.CyberUI.showToast('ไม่มีรายการหนังสือรับสำหรับพิมพ์', 'warning');
                return;
            }

            const rows = list.map((r, idx) => `
                <tr>
                    <td style="text-align: center;">${idx + 1}</td>
                    <td><strong style="color: #1d4ed8;">${r.receiptNo}</strong></td>
                    <td style="text-align: center;">${r.date}</td>
                    <td>${r.originDocNo}<br><span style="font-size: 10.5px; color: #64748b;">(${r.originDate || '-'})</span></td>
                    <td>${r.from}</td>
                    <td>${r.to}</td>
                    <td><strong>${r.subject}</strong></td>
                    <td>${r.assignTo}</td>
                    <td>${r.status}${r.action ? `<br><span style="font-size: 10px; color: #64748b;">${r.action}</span>` : ''}</td>
                </tr>
            `).join('');

            tableHtml = `
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="width: 4%; border: 1px solid #94a3b8; padding: 6px;">ลำดับ</th>
                            <th style="width: 12%; border: 1px solid #94a3b8; padding: 6px;">ทะเบียนที่รับ</th>
                            <th style="width: 9%; border: 1px solid #94a3b8; padding: 6px;">วันที่รับ</th>
                            <th style="width: 14%; border: 1px solid #94a3b8; padding: 6px;">ที่ (หนังสือต้นทาง)</th>
                            <th style="width: 16%; border: 1px solid #94a3b8; padding: 6px;">จาก</th>
                            <th style="width: 11%; border: 1px solid #94a3b8; padding: 6px;">ถึง</th>
                            <th style="width: 20%; border: 1px solid #94a3b8; padding: 6px;">เรื่อง</th>
                            <th style="width: 14%; border: 1px solid #94a3b8; padding: 6px;">มอบหมายให้</th>
                            <th style="border: 1px solid #94a3b8; padding: 6px;">การปฏิบัติ</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
        }

        const docHtml = `
            <div style="font-family: 'Sarabun', sans-serif; font-size: 12px; line-height: 1.4; color: #000; padding: 10px;">
                <style>
                    @page { size: A4 landscape; margin: 12mm; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                    th, td { border: 1px solid #94a3b8; padding: 6px 8px; vertical-align: top; }
                </style>
                <div style="text-align: center;">
                    <h2 style="margin: 0; font-size: 17px; font-weight: bold;">${title}</h2>
                    <p style="margin: 2px 0; font-size: 12px;">งานสืบสวนสอบสวนคดีอาชญากรรมทางเทคโนโลยี สถานีตำรวจภูธรบางพลี</p>
                    <p style="margin: 0 0 10px; font-size: 11px; color: #475569;">พิมพ์เมื่อ: ${printDate}</p>
                </div>
                ${tableHtml}
                <div style="display: flex; justify-content: flex-end; margin-top: 35px; text-align: center;">
                    <div>
                        <p style="margin: 0 0 45px 0;">รับรองความถูกต้อง</p>
                        <p style="margin: 0; font-weight: bold;">( ร.ต.ต.ธนกฤต ไทยกมล )</p>
                        <p style="margin: 0; font-size: 11px; color: #475569;">รอง สว.สส.สภ.บางพลี</p>
                    </div>
                </div>
            </div>
        `;

        if (window.CyberExport && window.CyberExport.showDocPreviewModal) {
            window.CyberExport.showDocPreviewModal(title + ' (A4 แนวนอน)', docHtml);
        } else if (window.CyberExport && window.CyberExport.triggerDirectPrint) {
            window.CyberExport.triggerDirectPrint(docHtml, title + ' (A4 แนวนอน)');
        }
    }

    return {
        render,
        switchSubTab,
        generateAutoDispatchNo,
        generateAutoReceiptNo,
        getTodayThai,
        resetDateFilters,
        filterToday,
        filterDays,
        filterMonth,
        toggleDispatchStatus,
        toggleReceiptStatus,
        copyDispatchInfo,
        copyReceiptInfo,
        openNewModal,
        openNewDispatch,
        openEditDispatch,
        handleDispatchSubmit,
        deleteDispatch,
        openNewReceipt,
        openEditReceipt,
        handleReceiptSubmit,
        deleteReceipt,
        printDispatchSlip,
        exportPrint
    };
})();
