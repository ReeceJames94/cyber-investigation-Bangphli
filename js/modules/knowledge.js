/**
 * Legal Knowledge Base & PDF Repository Module
 */
window.CyberKnowledge = (function() {
    function render() {
        const grid = document.getElementById('knowledgeGrid');
        if (!grid) return;

        let docs = window.CyberState.getKnowledge();
        const query = (document.getElementById('searchKnowledgeInput')?.value || '').trim().toLowerCase();
        if (query) {
            docs = docs.filter(d => `${d.name} ${d.date}`.toLowerCase().includes(query));
        }

        grid.innerHTML = '';
        docs.forEach(doc => {
            grid.innerHTML += `
                <div class="bg-white dark:bg-navy-900 p-5 rounded-3xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between gap-4">
                    <div class="flex items-start gap-3.5">
                        <div class="w-11 h-11 rounded-2xl bg-rose-500/15 text-rose-500 flex items-center justify-center text-xl shrink-0">
                            <i class="fa-solid fa-file-pdf"></i>
                        </div>
                        <div class="min-w-0">
                            <h4 class="font-bold text-sm text-slate-900 dark:text-white line-clamp-2">${doc.name}</h4>
                            <p class="text-[11px] text-slate-400 mt-1">${doc.date}</p>
                        </div>
                    </div>
                    <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onclick="window.CyberUI.downloadAttachedFile('${doc.name.replace(/'/g, "\\'")}', '${doc.data || ''}')" class="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5">
                            <i class="fa-solid fa-download"></i> ดาวน์โหลด PDF
                        </button>
                        <button type="button" onclick="window.CyberKnowledge.deleteDoc('${doc.id}')" class="text-xs text-rose-500 hover:text-rose-700 p-1.5 rounded-lg">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
    }

    async function handleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const data = await window.CyberUI.readFileAsBase64(file);
        const docs = [...window.CyberState.getKnowledge()];
        const newDoc = {
            id: 'k_' + Date.now(),
            name: file.name,
            date: 'อัปโหลดเมื่อ ' + new Date().toLocaleDateString('th-TH'),
            data
        };

        docs.unshift(newDoc);
        window.CyberState.setKnowledge(docs);
        window.CyberState.saveDoc('cyber_knowledge_docs', newDoc);

        render();
        window.CyberUI.showToast('เพิ่มไฟล์เอกสาร PDF เข้าคลังเรียบร้อยแล้ว', 'success');
    }

    function deleteDoc(id) {
        window.CyberUI.openConfirmModal('ลบเอกสาร PDF', 'ต้องการลบเอกสารนี้ออกจากคลังใช่หรือไม่?', () => {
            const docs = window.CyberState.getKnowledge().filter(d => d.id !== id);
            window.CyberState.setKnowledge(docs);
            window.CyberState.deleteDoc('cyber_knowledge_docs', id);
            render();
            window.CyberUI.showToast('ลบเอกสารเรียบร้อยแล้ว', 'info');
        });
    }

    return {
        render,
        handleUpload,
        deleteDoc
    };
})();
