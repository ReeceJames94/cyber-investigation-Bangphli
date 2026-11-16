/**
 * Warrants Tracking Module
 */
window.CyberWarrants = (function() {
    let currentFilter = 'all';
    let editingWarrantId = null;

    function setFilter(filter, event) {
        currentFilter = filter;
        document.querySelectorAll('.warrant-filter-btn').forEach(btn => {
            btn.classList.remove('bg-navy-900', 'text-white');
            btn.classList.add('bg-slate-100', 'dark:bg-navy-950', 'text-slate-700', 'dark:text-slate-300');
        });
        if (event && event.target) {
            event.target.classList.remove('bg-slate-100', 'dark:bg-navy-950', 'text-slate-700', 'dark:text-slate-300');
            event.target.classList.add('bg-navy-900', 'text-white');
        }
        render();
    }

    function getFilteredWarrants() {
        let list = [...window.CyberState.getWarrants()];

        if (currentFilter === 'arrested') list = list.filter(w => w.arrested);
        if (currentFilter === 'not_arrested') list = list.filter(w => !w.arrested);
        if (currentFilter === 'filed') list = list.filter(w => w.filed);
        if (currentFilter === 'not_filed') list = list.filter(w => !w.filed);

        const query = (document.getElementById('searchWarrantsInput')?.value || '').trim().toLowerCase();
        if (query) {
            list = list.filter(w => `${w.warrantNo} ${w.court} ${w.suspect} ${w.caseNo || ''} ${w.warrantPdf || ''} ${w.arrestPdf || ''}`.toLowerCase().includes(query));
        }

        return list;
    }

    function render() {
        const tbody = document.getElementById('warrantsTableBody');
        if (!tbody) return;

        const warrantsList = getFilteredWarrants();
        tbody.innerHTML = '';

        if (warrantsList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 text-xs">ไม่พบรายการหมายจับตามเงื่อนไขที่เลือก</td></tr>`;
            return;
        }

        warrantsList.forEach(w => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-navy-950/60 transition">
                    <td class="p-4 align-top text-center">
                        <div class="flex flex-col items-center gap-1.5">
                            <button type="button" onclick="window.CyberWarrants.openEditModal('${w.id}')" class="inline-flex items-center justify-center gap-1.5 w-full px-2.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 font-bold transition text-xs border border-amber-500/20 shadow-sm" title="แก้ไขข้อมูลหมายจับ">
                                <i class="fa-solid fa-pen-to-square"></i> จัดการ
                            </button>
                            <div class="inline-flex items-center gap-1">
                                <button type="button" onclick="window.CyberExport.printIndividualDossier('${w.id}')" class="text-emerald-600 hover:text-emerald-700 p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition" title="พิมพ์รายงานสืบสวน 1 ราย (A4)">
                                    <i class="fa-solid fa-file-invoice"></i>
                                </button>
                                <button type="button" onclick="window.CyberWarrants.deleteWarrant('${w.id}')" class="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition" title="ลบหมายจับ">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </td>
                    <td class="p-4 align-top">
                        <div class="font-bold text-rose-600 dark:text-rose-400 text-xs">${w.warrantNo}</div>
                        <div class="text-xs text-slate-500 mt-0.5">${w.court || 'ศาลจังหวัดสมุทรปราการ'}</div>
                        ${w.date ? `<div class="text-[10px] text-slate-400 mt-0.5">ออกเมื่อ: ${w.date}</div>` : ''}
                    </td>
                    <td class="p-4 align-top font-medium text-slate-800 dark:text-slate-200 max-w-xs whitespace-pre-line text-xs">${w.suspect || (w.suspectName ? `${w.idCard ? w.idCard + ' ' : ''}${w.suspectName} (${w.charges || ''})` : '123456897897 นายไม่ดี ไม่ได้แล้ว (ฉ้อโกงประชาชน)')}</td>
                    <td class="p-4 align-top text-xs">
                        ${w.warrantPdf
                            ? `<button type="button" onclick="window.CyberUI.downloadAttachedFile('${w.warrantPdf.replace(/'/g, "\\'")}', '${w.warrantPdfData || ''}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold transition"><i class="fa-solid fa-file-pdf text-rose-500"></i> ${w.warrantPdf}</button>`
                            : '<span class="text-slate-400">ไม่มีไฟล์แนบ</span>'}
                    </td>
                    <td class="p-4 align-top space-y-1.5 text-xs">
                        <label class="flex items-center gap-2 font-semibold ${w.filed ? 'text-blue-600' : 'text-slate-500'} cursor-pointer">
                            <input type="checkbox" ${w.filed ? 'checked' : ''} onchange="window.CyberWarrants.toggleField('${w.id}', 'filed', this.checked)">
                            <span>${w.filed ? 'ส่งสำนวนแล้ว' : 'ยังไม่ส่งสำนวน'}</span>
                        </label>
                        <input type="date" value="${w.filedDate || ''}" onchange="window.CyberWarrants.updateDate('${w.id}', 'filedDate', this.value)" class="p-1.5 bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
                    </td>
                    <td class="p-4 align-top space-y-1.5 text-xs">
                        <label class="flex items-center gap-2 font-semibold ${w.arrested ? 'text-emerald-600' : 'text-slate-500'} cursor-pointer">
                            <input type="checkbox" ${w.arrested ? 'checked' : ''} onchange="window.CyberWarrants.toggleField('${w.id}', 'arrested', this.checked)">
                            <span>${w.arrested ? 'จับกุมแล้ว' : 'ยังไม่จับกุม'}</span>
                        </label>
                        <input type="date" value="${w.arrestedDate || ''}" onchange="window.CyberWarrants.updateDate('${w.id}', 'arrestedDate', this.value)" class="p-1.5 bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs block">
                        <div class="pt-1">
                            ${w.arrestPdf
                                ? `<button type="button" onclick="window.CyberUI.downloadAttachedFile('${w.arrestPdf.replace(/'/g, "\\'")}', '${w.arrestPdfData || ''}')" class="inline-flex items-center gap-1 text-emerald-600 hover:underline font-semibold"><i class="fa-solid fa-download"></i> ${w.arrestPdf}</button>`
                                : `<label class="cursor-pointer inline-flex items-center gap-1 text-slate-500 hover:text-blue-600"><i class="fa-solid fa-paperclip"></i> แนบบันทึกจับกุม<input type="file" accept=".pdf" class="hidden" onchange="window.CyberWarrants.attachArrestPdf('${w.id}', event)"></label>`}
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    function toggleField(id, field, value) {
        const list = [...window.CyberState.getWarrants()];
        const item = list.find(w => w.id === id);
        if (item) {
            item[field] = value;
            window.CyberState.setWarrants(list);
            window.CyberState.saveDoc('cyber_warrants', item);
            render();
        }
    }

    function updateDate(id, field, value) {
        const list = [...window.CyberState.getWarrants()];
        const item = list.find(w => w.id === id);
        if (item) {
            item[field] = value;
            window.CyberState.setWarrants(list);
            window.CyberState.saveDoc('cyber_warrants', item);
        }
    }

    async function attachArrestPdf(id, event) {
        const file = event.target.files[0];
        if (!file) return;
        const data = await window.CyberUI.readFileAsBase64(file);
        const list = [...window.CyberState.getWarrants()];
        const item = list.find(w => w.id === id);
        if (item) {
            item.arrestPdf = file.name;
            item.arrestPdfData = data;
            window.CyberState.setWarrants(list);
            window.CyberState.saveDoc('cyber_warrants', item);
            render();
            window.CyberUI.showToast('แนบไฟล์บันทึกจับกุมเรียบร้อยแล้ว', 'success');
        }
    }

    function openNewModal() {
        editingWarrantId = null;
        document.getElementById('newWarrantForm').reset();
        const titleEl = document.getElementById('newWarrantModalTitleText');
        if (titleEl) titleEl.textContent = 'บันทึกรายการหมายจับใหม่';
        const submitBtn = document.getElementById('newWarrantSubmitBtn');
        if (submitBtn) submitBtn.textContent = 'บันทึกหมายจับ';

        document.getElementById('warrantDateInput').value = window.CyberCases ? window.CyberCases.getTodayThaiDate() : '';
        document.getElementById('warrantCourtInput').value = 'ศาลจังหวัดสมุทรปราการ';
        const m = document.getElementById('newWarrantModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
    }

    function openEditModal(id) {
        const list = window.CyberState.getWarrants();
        const w = list.find(item => item.id === id);
        if (!w) return;

        editingWarrantId = id;
        document.getElementById('newWarrantForm').reset();

        const titleEl = document.getElementById('newWarrantModalTitleText');
        if (titleEl) titleEl.textContent = `แก้ไขข้อมูลหมายจับ (${w.warrantNo})`;
        const submitBtn = document.getElementById('newWarrantSubmitBtn');
        if (submitBtn) submitBtn.textContent = 'บันทึกการแก้ไข';

        document.getElementById('warrantNoInput').value = w.warrantNo || '';
        document.getElementById('warrantDateInput').value = w.date || '';
        document.getElementById('warrantCourtInput').value = w.court || 'ศาลจังหวัดสมุทรปราการ';
        document.getElementById('warrantSuspectNameInput').value = w.suspectName || '';
        document.getElementById('warrantIdCardInput').value = w.idCard || '';
        document.getElementById('warrantChargesInput').value = w.charges || '';

        const chk = w.trackingChecklist || {};
        document.getElementById('wChkPhone').checked = !!(chk.phone && chk.phone.checked);
        document.getElementById('wChkPhoneNote').value = (chk.phone && chk.phone.note) || '';
        document.getElementById('wChkParcel').checked = !!(chk.parcel && chk.parcel.checked);
        document.getElementById('wChkParcelNote').value = (chk.parcel && chk.parcel.note) || '';
        document.getElementById('wChkPrison').checked = !!(chk.prison && chk.prison.checked);
        document.getElementById('wChkPrisonNote').value = (chk.prison && chk.prison.note) || '';
        document.getElementById('wChkHospital').checked = !!(chk.hospital && chk.hospital.checked);
        document.getElementById('wChkHospitalNote').value = (chk.hospital && chk.hospital.note) || '';
        document.getElementById('wChkDomicile').checked = !!(chk.domicile && chk.domicile.checked);
        document.getElementById('wChkDomicileNote').value = (chk.domicile && chk.domicile.note) || '';

        document.getElementById('warrantFiledCheck').checked = !!w.filed;
        document.getElementById('warrantFiledDate').value = w.filedDate || '';
        document.getElementById('warrantArrestedCheck').checked = !!w.arrested;
        document.getElementById('warrantArrestedDate').value = w.arrestedDate || '';

        const m = document.getElementById('newWarrantModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
    }

    function closeModal() {
        editingWarrantId = null;
        const m = document.getElementById('newWarrantModal');
        m.classList.add('hidden');
        m.classList.remove('flex');
    }

    async function handleSubmit(event) {
        event.preventDefault();
        const warrantNo = document.getElementById('warrantNoInput').value.trim();
        const warrantDate = document.getElementById('warrantDateInput').value.trim();
        const court = document.getElementById('warrantCourtInput').value.trim();
        const suspectName = document.getElementById('warrantSuspectNameInput').value.trim();
        const idCard = document.getElementById('warrantIdCardInput').value.trim();
        const charges = document.getElementById('warrantChargesInput').value.trim();

        const trackingChecklist = {
            phone: {
                checked: document.getElementById('wChkPhone').checked,
                note: document.getElementById('wChkPhoneNote').value.trim()
            },
            parcel: {
                checked: document.getElementById('wChkParcel').checked,
                note: document.getElementById('wChkParcelNote').value.trim()
            },
            prison: {
                checked: document.getElementById('wChkPrison').checked,
                note: document.getElementById('wChkPrisonNote').value.trim()
            },
            hospital: {
                checked: document.getElementById('wChkHospital').checked,
                note: document.getElementById('wChkHospitalNote').value.trim()
            },
            domicile: {
                checked: document.getElementById('wChkDomicile').checked,
                note: document.getElementById('wChkDomicileNote').value.trim()
            }
        };

        const wFile = document.getElementById('warrantPdfFileInput').files[0];
        const aFile = document.getElementById('warrantArrestPdfInput').files[0];

        const list = [...window.CyberState.getWarrants()];

        if (editingWarrantId) {
            const targetW = list.find(w => w.id === editingWarrantId);
            if (targetW) {
                targetW.warrantNo = warrantNo;
                targetW.date = warrantDate;
                targetW.court = court;
                targetW.suspectName = suspectName;
                targetW.idCard = idCard;
                targetW.charges = charges;
                targetW.suspect = `${idCard ? idCard + ' ' : ''}${suspectName} (${charges})`;
                targetW.trackingChecklist = trackingChecklist;
                if (wFile) {
                    targetW.warrantPdf = wFile.name;
                    targetW.warrantPdfData = await window.CyberUI.readFileAsBase64(wFile);
                }
                targetW.filed = document.getElementById('warrantFiledCheck').checked;
                targetW.filedDate = document.getElementById('warrantFiledDate').value;
                targetW.arrested = document.getElementById('warrantArrestedCheck').checked;
                targetW.arrestedDate = document.getElementById('warrantArrestedDate').value;
                if (aFile) {
                    targetW.arrestPdf = aFile.name;
                    targetW.arrestPdfData = await window.CyberUI.readFileAsBase64(aFile);
                }
                window.CyberState.setWarrants(list);
                window.CyberState.saveDoc('cyber_warrants', targetW);
                window.CyberUI.showToast(`แก้ไขข้อมูลหมายจับ (${warrantNo}) เรียบร้อยแล้ว`, 'success');
            }
            editingWarrantId = null;
        } else {
            const newWarrant = {
                id: 'w_' + Date.now(),
                warrantNo,
                date: warrantDate,
                court,
                suspectName,
                idCard,
                charges,
                suspect: `${idCard ? idCard + ' ' : ''}${suspectName} (${charges})`,
                trackingChecklist,
                warrantPdf: wFile ? wFile.name : '',
                warrantPdfData: wFile ? await window.CyberUI.readFileAsBase64(wFile) : '',
                filed: document.getElementById('warrantFiledCheck').checked,
                filedDate: document.getElementById('warrantFiledDate').value,
                arrested: document.getElementById('warrantArrestedCheck').checked,
                arrestedDate: document.getElementById('warrantArrestedDate').value,
                arrestPdf: aFile ? aFile.name : '',
                arrestPdfData: aFile ? await window.CyberUI.readFileAsBase64(aFile) : ''
            };
            list.unshift(newWarrant);
            window.CyberState.setWarrants(list);
            window.CyberState.saveDoc('cyber_warrants', newWarrant);
            window.CyberUI.showToast(`บันทึกหมายจับใหม่ (${warrantNo}) เรียบร้อยแล้ว`, 'success');
        }

        closeModal();
        render();
    }

    function deleteWarrant(id) {
        window.CyberUI.openConfirmModal('ลบรายการหมายจับ', 'คุณแน่ใจหรือไม่ว่าต้องการลบหมายจับรายการนี้?', () => {
            const list = window.CyberState.getWarrants().filter(w => w.id !== id);
            window.CyberState.setWarrants(list);
            window.CyberState.deleteDoc('cyber_warrants', id);
            render();
            window.CyberUI.showToast('ลบรายการหมายจับแล้ว', 'info');
        });
    }

    return {
        setFilter,
        getFilteredWarrants,
        render,
        toggleField,
        updateDate,
        attachArrestPdf,
        openNewModal,
        openEditModal,
        closeModal,
        handleSubmit,
        deleteWarrant
    };
})();
