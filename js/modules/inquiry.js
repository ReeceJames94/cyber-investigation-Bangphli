/**
 * 14 Inquiry Categories & Questions Checklist Module
 * Only Admin has permission to add / delete inquiry points within each category.
 */
window.CyberInquiry = (function() {
    function isCurrentUserAdmin() {
        const u = window.CyberState ? window.CyberState.getCurrentUser() : null;
        if (!u) return false;
        if (u.isAdmin === true) return true;
        if (typeof u.role === 'string' && u.role.toLowerCase().includes('admin')) return true;
        if (u.username === 'thanakrit') return true;
        return false;
    }

    function render() {
        const container = document.getElementById('inquiryCardsContainer');
        if (!container) return;

        const inquiryData = window.CyberState.getInquiry();
        const query = (document.getElementById('searchInquiryInput')?.value || '').trim().toLowerCase();
        const admin = isCurrentUserAdmin();
        container.innerHTML = '';

        // Update inquiry header badge if exists
        const badgeContainer = document.getElementById('inquiryRoleStatusBadge');
        if (badgeContainer) {
            badgeContainer.innerHTML = admin ? `
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <i class="fa-solid fa-shield-halved text-amber-400"></i> สิทธิ์: Admin (สามารถเพิ่ม-ลบประเด็นได้)
                </span>
            ` : `
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    <i class="fa-solid fa-lock text-blue-400"></i> สิทธิ์: เจ้าหน้าที่ทั่วไป (อ่านอย่างเดียว)
                </span>
            `;
        }

        let matchedCount = 0;

        inquiryData.forEach((cat, catIndex) => {
            const matchCat = cat.title.toLowerCase().includes(query) || (cat.points || []).some(p => p.toLowerCase().includes(query));
            if (query && !matchCat) return;
            matchedCount++;

            const pointsHtml = (cat.points || []).map((pt, ptIndex) => {
                if (admin) {
                    return `
                        <li class="flex items-start justify-between gap-2 bg-slate-50 dark:bg-navy-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 group hover:border-slate-300 dark:hover:border-slate-700 transition">
                            <span class="flex-1 leading-relaxed break-words">• ${pt}</span>
                            <button type="button" onclick="window.CyberInquiry.deleteQuestion(${catIndex}, ${ptIndex})" class="text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 p-1.5 rounded-lg transition shrink-0 opacity-70 group-hover:opacity-100" title="ลบประเด็นนี้ (เฉพาะ Admin)">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </li>
                    `;
                } else {
                    return `
                        <li class="flex items-start gap-2 bg-slate-50 dark:bg-navy-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            <span class="text-amber-500 shrink-0">•</span>
                            <span class="flex-1 break-words">${pt}</span>
                        </li>
                    `;
                }
            }).join('');

            const headerBtn = admin ? `
                <button type="button" onclick="window.CyberInquiry.openAddModal(${catIndex})" class="shrink-0 bg-amber-500/10 hover:bg-amber-500 hover:text-navy-950 text-amber-500 px-3 py-1 rounded-xl text-xs font-bold transition border border-amber-500/20 shadow-sm flex items-center gap-1.5">
                    <i class="fa-solid fa-plus text-[10px]"></i> เพิ่มประเด็น
                </button>
            ` : `
                <span class="text-[11px] text-slate-400 bg-slate-100 dark:bg-navy-950 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shrink-0 flex items-center gap-1">
                    <i class="fa-solid fa-lock text-[10px]"></i> เฉพาะ Admin
                </span>
            `;

            container.innerHTML += `
                <div class="bg-white dark:bg-navy-900 p-5 rounded-3xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-4 hover:shadow-md transition">
                    <div class="space-y-3">
                        <div class="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                            <h3 class="font-bold text-sm sm:text-base text-navy-900 dark:text-amber-400 flex items-center gap-2">
                                <i class="fa-solid fa-folder-open text-amber-500"></i> ${cat.title}
                            </h3>
                            ${headerBtn}
                        </div>
                        <ul class="space-y-1.5">${pointsHtml || '<li class="text-xs text-slate-400 text-center py-3 bg-slate-50/50 dark:bg-navy-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">ยังไม่มีประเด็นสอบสวนในหัวข้อนี้</li>'}</ul>
                    </div>
                </div>
            `;
        });

        if (matchedCount === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-slate-400 text-xs bg-white dark:bg-navy-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
                    <i class="fa-solid fa-magnifying-glass text-2xl mb-2 text-slate-500"></i>
                    <p class="font-semibold text-sm">ไม่พบหัวข้อหรือประเด็นคำถามที่ค้นหา</p>
                    <p class="text-slate-500 mt-1">ลองเปลี่ยนคำค้นหา เช่น "กู้เงิน", "สลิป", "พัสดุ", "บัญชีม้า"</p>
                </div>
            `;
        }
    }

    function openAddModal(catIndex) {
        if (!isCurrentUserAdmin()) {
            window.CyberUI.showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์เพิ่มประเด็นสอบสวน', 'error');
            return;
        }
        const inquiryData = window.CyberState.getInquiry();
        const cat = inquiryData[catIndex];
        if (!cat) return;

        document.getElementById('addInquiryCatIndex').value = catIndex;
        document.getElementById('addInquiryCategoryTitle').textContent = cat.title;
        document.getElementById('newInquiryQuestionText').value = '';
        const m = document.getElementById('addInquiryModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
        setTimeout(() => document.getElementById('newInquiryQuestionText').focus(), 100);
    }

    function closeAddModal() {
        const m = document.getElementById('addInquiryModal');
        m.classList.add('hidden');
        m.classList.remove('flex');
    }

    function saveNewQuestion() {
        if (!isCurrentUserAdmin()) {
            window.CyberUI.showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์เพิ่มประเด็นสอบสวน', 'error');
            return;
        }
        const catIndex = parseInt(document.getElementById('addInquiryCatIndex').value, 10);
        const text = (document.getElementById('newInquiryQuestionText').value || '').trim();
        if (!text) {
            window.CyberUI.showToast('กรุณาระบุข้อความประเด็นคำถามสอบสวน', 'warning');
            return;
        }

        const inquiryData = [...window.CyberState.getInquiry()];
        if (inquiryData[catIndex]) {
            if (!inquiryData[catIndex].points) inquiryData[catIndex].points = [];
            inquiryData[catIndex].points.push(text);
            window.CyberState.setInquiry(inquiryData);

            const db = window.CyberConfig ? window.CyberConfig.getDb() : null;
            if (db) db.collection('cyber_settings').doc('inquiry_data').set({ categories: inquiryData }).catch(e => console.warn(e));

            closeAddModal();
            render();
            window.CyberUI.showToast('เพิ่มประเด็นคำถามสอบสวนในหัวข้อเรียบร้อยแล้ว', 'success');
        }
    }

    function deleteQuestion(catIndex, ptIndex) {
        if (!isCurrentUserAdmin()) {
            window.CyberUI.showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลบประเด็นสอบสวน', 'error');
            return;
        }
        const inquiryData = [...window.CyberState.getInquiry()];
        const targetPoint = inquiryData[catIndex]?.points?.[ptIndex];
        if (!targetPoint) return;

        if (confirm(`ยืนยันการลบประเด็นสอบสวนนี้ใช่หรือไม่?\n\n"${targetPoint}"\n\n(สิทธิ์ Admin)`)) {
            inquiryData[catIndex].points.splice(ptIndex, 1);
            window.CyberState.setInquiry(inquiryData);

            const db = window.CyberConfig ? window.CyberConfig.getDb() : null;
            if (db) db.collection('cyber_settings').doc('inquiry_data').set({ categories: inquiryData }).catch(e => console.warn(e));

            render();
            window.CyberUI.showToast('ลบประเด็นคำถามเรียบร้อยแล้ว', 'info');
        }
    }

    return {
        render,
        openAddModal,
        closeAddModal,
        saveNewQuestion,
        deleteQuestion,
        isCurrentUserAdmin
    };
})();
