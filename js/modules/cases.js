/**
 * Case Management Module
 */
window.CyberCases = (function() {
    function parseDateToComparable(str) {
        if (!str) return '';
        const trimmed = str.trim();
        if (trimmed.includes('/')) {
            const parts = trimmed.split('/');
            if (parts.length === 3) {
                let year = parseInt(parts[2], 10);
                if (year > 2400) year -= 543;
                const month = parts[1].padStart(2, '0');
                const day = parts[0].padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        }
        return trimmed;
    }

    function getShortDate(str) {
        if (!str) return '';
        const trimmed = str.trim();
        if (trimmed.includes('/')) {
            const parts = trimmed.split('/');
            if (parts.length === 3) {
                const yy = parts[2].slice(-2);
                return `${parts[0]}/${parts[1]}/${yy}`;
            }
        }
        return trimmed;
    }

    function getFilteredCases() {
        const casesList = window.CyberState.getCases();
        const query = (document.getElementById('searchCasesInput')?.value || '').trim().toLowerCase();
        const startDateFilter = document.getElementById('filterCaseDateStartInput')?.value || '';
        const endDateFilter = document.getElementById('filterCaseDateEndInput')?.value || '';
        const statusFilter = document.getElementById('filterCaseStatusInput')?.value || '';

        const startComp = parseDateToComparable(startDateFilter);
        const endComp = parseDateToComparable(endDateFilter);

        return casesList.filter(c => {
            const caseDateComp = parseDateToComparable(c.date);
            if (startComp && caseDateComp && caseDateComp < startComp) return false;
            if (endComp && caseDateComp && caseDateComp > endComp) return false;
            if (statusFilter && c.status !== statusFilter) return false;
            if (query) {
                const accText = (c.accounts || []).map(a => `${a.bank} ${a.no} ${a.name}`).join(' ');
                const hay = `${c.caseNo} ${c.date} ${c.victim} ${c.type} ${c.status} ${c.investigator || ''} ${c.detective || ''} ${accText}`.toLowerCase();
                if (!hay.includes(query)) return false;
            }
            return true;
        });
    }

    function filterToday() {
        const today = getTodayThaiDate();
        const startInput = document.getElementById('filterCaseDateStartInput');
        const endInput = document.getElementById('filterCaseDateEndInput');
        if (startInput) startInput.value = today;
        if (endInput) endInput.value = today;
        render();
        window.CyberUI.showToast(`กรองเฉพาะคดีของวันนี้ (${today}) เรียบร้อยแล้ว`, 'info');
    }

    function resetFilters() {
        if (document.getElementById('searchCasesInput')) document.getElementById('searchCasesInput').value = '';
        if (document.getElementById('filterCaseDateStartInput')) document.getElementById('filterCaseDateStartInput').value = '';
        if (document.getElementById('filterCaseDateEndInput')) document.getElementById('filterCaseDateEndInput').value = '';
        if (document.getElementById('filterCaseStatusInput')) document.getElementById('filterCaseStatusInput').value = '';
        render();
    }

    function syncCaseToWarrant(c) {
        if (!c.warrant) return;
        const warrantsList = [...window.CyberState.getWarrants()];
        const existingWarrant = warrantsList.find(w => w.caseId === c.id || (w.warrantNo && w.warrantNo.includes(c.caseNo)));

        const suspectNames = (c.accounts || []).map(a => a.name).filter(Boolean).join(', ') || c.victim;
        const warrantData = {
            id: existingWarrant ? existingWarrant.id : ('w_' + Date.now()),
            caseId: c.id,
            caseNo: c.caseNo,
            warrantNo: existingWarrant ? existingWarrant.warrantNo : `จ.${Math.floor(100 + Math.random() * 900)}/${new Date().getFullYear() + 543} (คดี ${c.caseNo})`,
            court: existingWarrant ? existingWarrant.court : 'ศาลจังหวัดสมุทรปราการ',
            suspect: `${suspectNames} - ${c.type}`,
            warrantPdf: c.warrantPdf || (existingWarrant ? existingWarrant.warrantPdf : ''),
            warrantPdfData: c.warrantPdfData || (existingWarrant ? existingWarrant.warrantPdfData : ''),
            filed: existingWarrant ? existingWarrant.filed : false,
            filedDate: existingWarrant ? existingWarrant.filedDate : '',
            arrested: existingWarrant ? existingWarrant.arrested : false,
            arrestedDate: existingWarrant ? existingWarrant.arrestedDate : '',
            arrestPdf: existingWarrant ? existingWarrant.arrestPdf : '',
            arrestPdfData: existingWarrant ? existingWarrant.arrestPdfData : ''
        };

        if (existingWarrant) {
            const idx = warrantsList.findIndex(w => w.id === existingWarrant.id);
            warrantsList[idx] = warrantData;
        } else {
            warrantsList.unshift(warrantData);
        }

        window.CyberState.setWarrants(warrantsList);
        window.CyberState.saveDoc('cyber_warrants', warrantData);
    }

    function goWarrant(caseNo) {
        window.CyberUI.switchTab('warrants');
        const searchInput = document.getElementById('searchWarrantsInput');
        if (searchInput) {
            searchInput.value = caseNo;
            if (window.CyberWarrants) window.CyberWarrants.render();
        }
        window.CyberUI.showToast(`เชื่อมโยงไปยังหมายจับของคดี ${caseNo}`, 'info');
    }

    function toggleDocStatus(id, field, checked) {
        const casesList = [...window.CyberState.getCases()];
        const item = casesList.find(c => c.id === id);
        if (item) {
            item[field] = checked;
            if (field === 'summons1' && checked && !item.summons1Date) {
                item.summons1Date = getTodayThaiDate();
            }
            if (field === 'summons2' && checked && !item.summons2Date) {
                item.summons2Date = getTodayThaiDate();
            }
            if (field === 'warrant' && checked) {
                syncCaseToWarrant(item);
            }
            window.CyberState.setCases(casesList);
            window.CyberState.saveDoc('cyber_cases', item);
            render();
            if (field === 'warrant' && checked) {
                window.CyberUI.showToast('ออกหมายจับแล้ว! ระบบเชื่อมโยงข้อมูลไปยังหน้าลิสต์หมายจับอัตโนมัติ', 'success');
            } else {
                window.CyberUI.showToast('อัปเดตสถานะหมายเรียบร้อยแล้ว', 'success');
            }
        }
    }

    function syncPickerToThaiDate(pickerId, targetId) {
        const picker = document.getElementById(pickerId);
        const target = document.getElementById(targetId);
        if (!picker || !target || !picker.value) return;
        const parts = picker.value.split('-'); // [YYYY, MM, DD]
        if (parts.length === 3) {
            const beYear = parseInt(parts[0], 10) + 543;
            target.value = `${parts[2]}/${parts[1]}/${beYear}`;
        }
    }

    function getTodayThaiDate() {
        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear() + 543;
        return `${d}/${m}/${y}`;
    }

    function setFieldToToday(inputId) {
        const el = document.getElementById(inputId);
        if (!el) return;
        el.value = getTodayThaiDate();
        window.CyberUI.showToast(`ใส่วันที่ปัจจุบัน (${el.value}) เรียบร้อยแล้ว`, 'info');
    }

    function populateOfficerDropdowns(selectedInvestigator = '', selectedDetective = '') {
        const invSelect = document.getElementById('caseInvestigatorInput');
        const detSelect = document.getElementById('caseDetectiveInput');
        if (!invSelect || !detSelect) return;

        const investigators = window.CyberState.getInvestigators();
        const detectives = window.CyberState.getDetectives();

        invSelect.innerHTML = '<option value="">-- เลือกพนักงานสอบสวน --</option>';
        investigators.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === selectedInvestigator) opt.selected = true;
            invSelect.appendChild(opt);
        });

        detSelect.innerHTML = '<option value="">-- เลือกชุดสืบสวน --</option>';
        detectives.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === selectedDetective) opt.selected = true;
            detSelect.appendChild(opt);
        });
    }

    function promptAddOfficer(roleType) {
        document.getElementById('addOfficerRoleType').value = roleType;
        const titleEl = document.getElementById('addOfficerModalTitle');
        if (titleEl) {
            titleEl.textContent = roleType === 'investigator' ? 'เพิ่มรายชื่อพนักงานสอบสวน (พงส.)' : 'เพิ่มรายชื่อชุดสืบสวน';
        }
        document.getElementById('newOfficerNameInput').value = '';
        const m = document.getElementById('addOfficerModal');
        if (m) {
            m.classList.remove('hidden');
            m.classList.add('flex');
        }
    }

    function closeAddOfficerModal() {
        const m = document.getElementById('addOfficerModal');
        if (m) {
            m.classList.add('hidden');
            m.classList.remove('flex');
        }
    }

    function saveNewOfficer() {
        const roleType = document.getElementById('addOfficerRoleType').value;
        const name = document.getElementById('newOfficerNameInput').value.trim();
        if (!name) return;

        const curInv = document.getElementById('caseInvestigatorInput') ? document.getElementById('caseInvestigatorInput').value : '';
        const curDet = document.getElementById('caseDetectiveInput') ? document.getElementById('caseDetectiveInput').value : '';

        if (roleType === 'investigator') {
            window.CyberState.addInvestigator(name);
            populateOfficerDropdowns(name, curDet);
        } else {
            window.CyberState.addDetective(name);
            populateOfficerDropdowns(curInv, name);
        }

        closeAddOfficerModal();
        window.CyberUI.showToast(`เพิ่มรายชื่อ "${name}" เข้าระบบเรียบร้อยแล้ว`, 'success');
    }

    function render() {
        const tbody = document.getElementById('casesTableBody');
        if (!tbody) return;

        const casesList = getFilteredCases();
        tbody.innerHTML = '';

        if (casesList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 text-xs">ไม่พบข้อมูลคดีตามเงื่อนไขที่ค้นหา/กรอง</td></tr>`;
            return;
        }

        const statusColors = {
            'นัดหมาย': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
            'พบพงส.': 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300/40',
            'สิ้นสุด': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
            'ติดต่อไม่ได้': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
        };

        casesList.forEach(c => {
            const accountsHtml = (c.accounts || []).map(acc => `
                <div class="text-[11px] bg-slate-50 dark:bg-navy-950 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 mb-1 font-sans">
                    <span class="font-bold text-slate-800 dark:text-slate-200">${acc.bank}</span>: <span class="font-mono text-slate-700 dark:text-slate-300">${acc.no}</span> <span class="text-slate-500">(${acc.name})</span>
                </div>
            `).join('');

            const s1Short = c.summons1Date ? ` (${getShortDate(c.summons1Date)})` : '';
            const s2Short = c.summons2Date ? ` (${getShortDate(c.summons2Date)})` : '';

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-navy-950/60 transition">
                    <td class="p-4 align-top">
                        <div onclick="window.CyberCases.openEditModal('${c.id}')" class="font-bold text-slate-900 dark:text-white text-xs cursor-pointer hover:text-amber-500 transition">${c.caseNo}</div>
                        <div class="text-xs text-slate-500 mt-0.5">${c.date}</div>
                    </td>
                    <td class="p-4 align-top font-medium text-slate-800 dark:text-slate-200">${c.victim}</td>
                    <td class="p-4 align-top text-xs text-slate-600 dark:text-slate-300">${c.type}</td>
                    <td class="p-4 align-top">
                        <div class="font-bold text-rose-600 dark:text-rose-400 mb-1">${Number(c.amount).toLocaleString()} ฿</div>
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[c.status] || 'bg-slate-100 text-slate-700'}">${c.status}</span>
                    </td>
                    <td class="p-4 align-top max-w-xs">${accountsHtml || '<span class="text-xs text-slate-400">-</span>'}</td>
                    <td class="p-4 align-top text-xs space-y-1">
                        <div class="text-slate-700 dark:text-slate-300"><span class="font-bold text-blue-900 dark:text-blue-400">พงส.:</span> ${c.investigator || '-'}</div>
                        <div class="text-slate-700 dark:text-slate-300"><span class="font-bold text-amber-600 dark:text-amber-400">สืบสวน:</span> ${c.detective || '-'}</div>
                    </td>
                    <td class="p-4 align-top text-left space-y-1.5 text-xs">
                        <div>
                            <label class="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" ${c.summons1 ? 'checked' : ''} onchange="window.CyberCases.toggleDocStatus('${c.id}', 'summons1', this.checked)" class="rounded text-amber-500">
                                <span class="${c.summons1 ? 'text-emerald-600 font-bold' : 'text-slate-500'}">หมายเรียก 1${s1Short}</span>
                            </label>
                            ${c.summons1Pdf ? `<div class="mt-0.5 pl-5"><button type="button" onclick="window.CyberUI.downloadAttachedFile('${c.summons1Pdf.replace(/'/g, "\\'")}', '${c.summons1PdfData || ''}')" class="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 underline cursor-pointer"><i class="fa-solid fa-file-pdf text-rose-500"></i> ${c.summons1Pdf}</button></div>` : ''}
                        </div>
                        <div>
                            <label class="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" ${c.summons2 ? 'checked' : ''} onchange="window.CyberCases.toggleDocStatus('${c.id}', 'summons2', this.checked)" class="rounded text-amber-500">
                                <span class="${c.summons2 ? 'text-emerald-600 font-bold' : 'text-slate-500'}">หมายเรียก 2${s2Short}</span>
                            </label>
                            ${c.summons2Pdf ? `<div class="mt-0.5 pl-5"><button type="button" onclick="window.CyberUI.downloadAttachedFile('${c.summons2Pdf.replace(/'/g, "\\'")}', '${c.summons2PdfData || ''}')" class="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 underline cursor-pointer"><i class="fa-solid fa-file-pdf text-rose-500"></i> ${c.summons2Pdf}</button></div>` : ''}
                        </div>
                        <div>
                            <label class="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" ${c.warrant ? 'checked' : ''} onchange="window.CyberCases.toggleDocStatus('${c.id}', 'warrant', this.checked)" class="rounded text-rose-600">
                                <span class="${c.warrant ? 'text-rose-600 font-bold' : 'text-slate-500'}">ออกหมายจับแล้ว</span>
                            </label>
                            ${c.warrantPdf ? `<div class="mt-0.5 pl-5"><button type="button" onclick="window.CyberUI.downloadAttachedFile('${c.warrantPdf.replace(/'/g, "\\'")}', '${c.warrantPdfData || ''}')" class="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 underline cursor-pointer"><i class="fa-solid fa-file-pdf text-rose-500"></i> ${c.warrantPdf}</button></div>` : ''}
                            ${c.warrant ? `<div class="mt-0.5 pl-5"><button type="button" onclick="window.CyberCases.goWarrant('${c.caseNo}')" class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500 hover:text-amber-400 hover:underline cursor-pointer"><i class="fa-solid fa-arrow-up-right-from-square"></i> ไปที่ลิสต์หมายจับ</button></div>` : ''}
                        </div>
                    </td>
                    <td class="p-4 align-top text-center">
                        <div class="inline-flex items-center gap-1">
                            <button onclick="window.CyberCases.openEditModal('${c.id}')" class="text-amber-600 hover:text-amber-700 p-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/40 transition" title="แก้ไขข้อมูลคดี">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button onclick="window.CyberCases.deleteCase('${c.id}')" class="text-rose-500 hover:text-rose-700 p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition" title="ลบคดี">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    function addAccountInput(acc = { bank: '', no: '', name: '' }) {
        const container = document.getElementById('suspectAccountsContainer');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'grid grid-cols-1 sm:grid-cols-3 gap-2 account-row items-center';
        row.innerHTML = `
            <input type="text" placeholder="ธนาคาร (เช่น กสิกร)" value="${acc.bank || ''}" class="acc-bank p-2.5 bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
            <input type="text" placeholder="เลขที่บัญชี" value="${acc.no || ''}" class="acc-no p-2.5 bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono">
            <div class="flex gap-1.5 items-center">
                <input type="text" placeholder="ชื่อเจ้าของบัญชี" value="${acc.name || ''}" class="acc-name flex-1 p-2.5 bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
                <button type="button" onclick="this.closest('.account-row').remove()" class="px-2.5 py-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl font-bold"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
        container.appendChild(row);
    }

    function openNewModal() {
        document.getElementById('newCaseForm').reset();
        document.getElementById('editCaseIdInput').value = '';
        document.getElementById('caseModalTitle').innerHTML = `<i class="fa-solid fa-folder-plus text-amber-500"></i> บันทึกคดีใหม่`;
        document.getElementById('caseDateInput').value = getTodayThaiDate();
        document.getElementById('existingSummons1PdfLabel').textContent = '';
        document.getElementById('existingSummons2PdfLabel').textContent = '';
        document.getElementById('existingWarrantPdfLabel').textContent = '';
        document.getElementById('suspectAccountsContainer').innerHTML = '';
        populateOfficerDropdowns();
        addAccountInput();
        const m = document.getElementById('newCaseModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
    }

    function openEditModal(id) {
        const casesList = window.CyberState.getCases();
        const c = casesList.find(item => item.id === id);
        if (!c) return;

        document.getElementById('newCaseForm').reset();
        document.getElementById('editCaseIdInput').value = c.id;
        document.getElementById('caseModalTitle').innerHTML = `<i class="fa-solid fa-pen-to-square text-amber-500"></i> แก้ไขข้อมูลคดี (${c.caseNo})`;

        document.getElementById('caseNoInput').value = c.caseNo || '';
        document.getElementById('caseDateInput').value = c.date || getTodayThaiDate();
        document.getElementById('caseVictimInput').value = c.victim || '';
        document.getElementById('caseTypeInput').value = c.type || '';
        document.getElementById('caseAmountInput').value = c.amount || '';
        document.getElementById('caseStatusInput').value = c.status || 'นัดหมาย';

        populateOfficerDropdowns(c.investigator || '', c.detective || '');

        document.getElementById('summons1Check').checked = !!c.summons1;
        document.getElementById('summons1Date').value = c.summons1Date || '';
        document.getElementById('existingSummons1PdfLabel').textContent = c.summons1Pdf ? `ไฟล์: ${c.summons1Pdf}` : '';

        document.getElementById('summons2Check').checked = !!c.summons2;
        document.getElementById('summons2Date').value = c.summons2Date || '';
        document.getElementById('existingSummons2PdfLabel').textContent = c.summons2Pdf ? `ไฟล์: ${c.summons2Pdf}` : '';

        document.getElementById('warrantCheck').checked = !!c.warrant;
        document.getElementById('existingWarrantPdfLabel').textContent = c.warrantPdf ? `ไฟล์: ${c.warrantPdf}` : '';

        const container = document.getElementById('suspectAccountsContainer');
        container.innerHTML = '';
        if (c.accounts && c.accounts.length > 0) {
            c.accounts.forEach(acc => addAccountInput(acc));
        } else {
            addAccountInput();
        }

        const m = document.getElementById('newCaseModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
    }

    function closeModal() {
        const m = document.getElementById('newCaseModal');
        m.classList.add('hidden');
        m.classList.remove('flex');
    }

    async function handleSubmit(event) {
        event.preventDefault();
        const accounts = [];
        document.querySelectorAll('#suspectAccountsContainer .account-row').forEach(row => {
            const bank = row.querySelector('.acc-bank').value.trim();
            const no = row.querySelector('.acc-no').value.trim();
            const name = row.querySelector('.acc-name').value.trim();
            if (bank || no || name) accounts.push({ bank, no, name });
        });

        const editId = document.getElementById('editCaseIdInput').value;
        const casesList = [...window.CyberState.getCases()];
        const existingCase = editId ? casesList.find(item => item.id === editId) : null;

        // Summons 1 PDF
        const s1File = document.getElementById('summons1PdfInput')?.files[0];
        const s1PdfName = s1File ? s1File.name : (existingCase ? existingCase.summons1Pdf : '');
        const s1PdfData = s1File ? await window.CyberUI.readFileAsBase64(s1File) : (existingCase ? existingCase.summons1PdfData : '');

        // Summons 2 PDF
        const s2File = document.getElementById('summons2PdfInput')?.files[0];
        const s2PdfName = s2File ? s2File.name : (existingCase ? existingCase.summons2Pdf : '');
        const s2PdfData = s2File ? await window.CyberUI.readFileAsBase64(s2File) : (existingCase ? existingCase.summons2PdfData : '');

        // Warrant PDF
        const pdfFile = document.getElementById('caseWarrantPdfInput')?.files[0];
        const warrantPdfName = pdfFile ? pdfFile.name : (existingCase ? existingCase.warrantPdf : '');
        const warrantPdfData = pdfFile ? await window.CyberUI.readFileAsBase64(pdfFile) : (existingCase ? existingCase.warrantPdfData : '');

        const isWarrantChecked = document.getElementById('warrantCheck').checked;

        const caseData = {
            id: editId || ('c_' + Date.now()),
            caseNo: document.getElementById('caseNoInput').value.trim(),
            date: document.getElementById('caseDateInput').value.trim(),
            victim: document.getElementById('caseVictimInput').value.trim(),
            type: document.getElementById('caseTypeInput').value,
            amount: document.getElementById('caseAmountInput').value,
            status: document.getElementById('caseStatusInput').value,
            investigator: document.getElementById('caseInvestigatorInput').value.trim(),
            detective: document.getElementById('caseDetectiveInput').value.trim(),
            accounts,
            summons1: document.getElementById('summons1Check').checked,
            summons1Date: document.getElementById('summons1Date').value.trim(),
            summons1Pdf: s1PdfName,
            summons1PdfData: s1PdfData,
            summons2: document.getElementById('summons2Check').checked,
            summons2Date: document.getElementById('summons2Date').value.trim(),
            summons2Pdf: s2PdfName,
            summons2PdfData: s2PdfData,
            warrant: isWarrantChecked,
            warrantPdf: warrantPdfName,
            warrantPdfData: warrantPdfData
        };

        if (editId) {
            const idx = casesList.findIndex(item => item.id === editId);
            if (idx !== -1) casesList[idx] = caseData;
            window.CyberUI.showToast('อัปเดตแก้ไขข้อมูลคดีเรียบร้อยแล้ว', 'success');
        } else {
            casesList.unshift(caseData);
            window.CyberUI.showToast('บันทึกข้อมูลคดีเรียบร้อยแล้ว', 'success');
        }

        window.CyberState.setCases(casesList);
        window.CyberState.saveDoc('cyber_cases', caseData);

        // Auto-sync to Warrants tracker if warrant is checked
        if (isWarrantChecked) {
            syncCaseToWarrant(caseData);
            window.CyberUI.showToast('ออกหมายจับแล้ว! ระบบเชื่อมโยงข้อมูลไปยังหน้าลิสต์หมายจับอัตโนมัติ', 'success');
        }

        closeModal();
        render();
    }

    function deleteCase(id) {
        window.CyberUI.openConfirmModal('ลบคดี', 'คุณต้องการลบข้อมูลคดีนี้ใช่หรือไม่?', () => {
            let casesList = window.CyberState.getCases().filter(c => c.id !== id);
            window.CyberState.setCases(casesList);
            window.CyberState.deleteDoc('cyber_cases', id);
            render();
            window.CyberUI.showToast('ลบข้อมูลคดีเรียบร้อยแล้ว', 'info');
        });
    }

    return {
        getFilteredCases,
        filterToday,
        resetFilters,
        toggleDocStatus,
        syncPickerToThaiDate,
        getTodayThaiDate,
        setFieldToToday,
        populateOfficerDropdowns,
        promptAddOfficer,
        closeAddOfficerModal,
        saveNewOfficer,
        goWarrant,
        render,
        addAccountInput,
        openNewModal,
        openEditModal,
        closeModal,
        handleSubmit,
        deleteCase
    };
})();
