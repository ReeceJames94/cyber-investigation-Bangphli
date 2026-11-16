/**
 * UI Utilities, Modals, Toasts, Theme, and Tabs
 */
window.CyberUI = (function() {
    let confirmCallback = null;

    function showToast(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const colors = {
            success: 'bg-emerald-600 text-white border-emerald-400/30',
            error: 'bg-rose-600 text-white border-rose-400/30',
            info: 'bg-navy-900 text-white border-amber-500/40'
        };
        const icons = {
            success: 'fa-circle-check text-emerald-200',
            error: 'fa-circle-exclamation text-rose-200',
            info: 'fa-shield-halved text-amber-400'
        };

        const el = document.createElement('div');
        el.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-xs sm:text-sm font-medium transition-all transform translate-y-2 opacity-0 ${colors[type] || colors.info}`;
        el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
        container.appendChild(el);

        requestAnimationFrame(() => el.classList.remove('translate-y-2', 'opacity-0'));
        setTimeout(() => {
            el.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => el.remove(), 300);
        }, 3200);
    }

    function openConfirmModal(title, message, onConfirm) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        confirmCallback = onConfirm;
        const modal = document.getElementById('confirm-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeConfirmModal() {
        const modal = document.getElementById('confirm-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        confirmCallback = null;
    }

    function initConfirmModal() {
        const yesBtn = document.getElementById('confirm-yes-btn');
        if (yesBtn) {
            yesBtn.onclick = () => {
                if (confirmCallback) confirmCallback();
                closeConfirmModal();
            };
        }
    }

    function toggleTheme() {
        document.documentElement.classList.toggle('dark');
    }

    function switchTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById('content-' + tabName);
        if (target) target.classList.remove('hidden');

        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.remove('bg-gradient-to-r', 'from-amber-500', 'to-amber-600', 'text-navy-950', 'font-bold', 'shadow-gold');
            btn.classList.add('text-slate-300', 'hover:text-white', 'hover:bg-white/5');
        });

        const activeBtn = document.getElementById('nav-' + tabName);
        if (activeBtn) {
            activeBtn.classList.remove('text-slate-300', 'hover:text-white', 'hover:bg-white/5');
            activeBtn.classList.add('bg-gradient-to-r', 'from-amber-500', 'to-amber-600', 'text-navy-950', 'font-bold', 'shadow-gold');
        }

        if (tabName === 'inquiry' && window.CyberInquiry) {
            window.CyberInquiry.render();
        }
        if (tabName === 'registry' && window.CyberRegistry) {
            window.CyberRegistry.render();
        }
    }

    function readFileAsBase64(file) {
        return new Promise((resolve) => {
            if (!file) return resolve('');
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
        });
    }

    function downloadAttachedFile(fileName, base64Data) {
        if (!base64Data) {
            showToast(`ไม่พบข้อมูลไฟล์ต้นฉบับสำหรับ "${fileName}"`, 'error');
            return;
        }
        const link = document.createElement('a');
        link.href = base64Data;
        link.download = fileName || 'document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`กำลังดาวน์โหลดไฟล์ ${fileName}`, 'success');
    }

    return {
        showToast,
        openConfirmModal,
        closeConfirmModal,
        initConfirmModal,
        toggleTheme,
        switchTab,
        readFileAsBase64,
        downloadAttachedFile
    };
})();
