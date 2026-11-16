/**
 * User Administration & Sync Module
 */
window.CyberUsers = (function() {
    function render() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        const users = window.CyberState.getUsers();
        const query = (document.getElementById('searchUsersInput')?.value || '').trim().toLowerCase();
        const filtered = users.filter(u => !query || `${u.name} ${u.username} ${u.role}`.toLowerCase().includes(query));

        tbody.innerHTML = '';
        filtered.forEach(u => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-navy-950/60 transition">
                    <td class="p-4 font-bold text-slate-900 dark:text-white">${u.name}</td>
                    <td class="p-4 font-mono text-xs text-slate-600 dark:text-slate-300">${u.username}</td>
                    <td class="p-4 font-mono text-xs text-slate-500 dark:text-slate-400">${u.password}</td>
                    <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">${u.role}</span></td>
                    <td class="p-4 text-center">
                        <button onclick="window.CyberUsers.deleteUser('${u.id}')" class="text-rose-500 hover:text-rose-700 p-2 rounded-xl hover:bg-rose-50 transition" title="ลบบัญชีผู้ใช้">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    function openModal() {
        const m = document.getElementById('newUserModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
    }

    function closeModal() {
        const m = document.getElementById('newUserModal');
        m.classList.add('hidden');
        m.classList.remove('flex');
    }

    function handleAdd(event) {
        event.preventDefault();
        const users = [...window.CyberState.getUsers()];
        const usernameVal = document.getElementById('newUserUsername').value.trim();

        if (users.some(u => u.username.toLowerCase() === usernameVal.toLowerCase())) {
            window.CyberUI.showToast(`ชื่อผู้ใช้งาน "${usernameVal}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`, 'error');
            return;
        }

        const newUser = {
            id: 'u_' + Date.now(),
            name: document.getElementById('newUserFullname').value.trim(),
            username: usernameVal,
            password: document.getElementById('newUserPassword').value.trim(),
            role: document.getElementById('newUserRole').value
        };

        users.push(newUser);
        window.CyberState.setUsers(users);
        window.CyberState.saveDoc('cyber_users', newUser);

        document.getElementById('newUserFullname').value = '';
        document.getElementById('newUserUsername').value = '';
        document.getElementById('newUserPassword').value = '';

        closeModal();
        render();
        window.CyberUI.showToast('สร้างบัญชีผู้ใช้งานเรียบร้อยแล้ว', 'success');
    }

    function deleteUser(id) {
        const users = window.CyberState.getUsers();
        if (users.length <= 1) {
            window.CyberUI.showToast('ไม่สามารถลบบัญชีผู้ใช้งานคนสุดท้ายได้', 'error');
            return;
        }

        window.CyberUI.openConfirmModal('ลบบัญชีผู้ใช้งาน', 'ยืนยันการลบบัญชีผู้ใช้งานนี้ออกจากระบบ?', () => {
            const updated = users.filter(u => u.id !== id);
            window.CyberState.setUsers(updated);
            window.CyberState.deleteDoc('cyber_users', id);
            render();
            window.CyberUI.showToast('ลบบัญชีผู้ใช้แล้ว', 'info');
        });
    }

    function copySyncLink() {
        try {
            const users = window.CyberState.getUsers();
            const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(users))));
            const url = `${window.location.origin}${window.location.pathname}?sync_users=${encoded}`;
            const tempInput = document.createElement('textarea');
            tempInput.value = url;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            window.CyberUI.showToast('คัดลอกลิงก์ซิงค์รายชื่อผู้ใช้แล้ว! ส่งลิงก์นี้ให้เจ้าหน้าที่เปิดเพื่อเข้าสู่ระบบได้ทันที', 'success');
        } catch (e) {
            window.CyberUI.showToast('ไม่สามารถสร้างลิงก์ซิงค์ได้', 'error');
        }
    }

    function syncFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const syncData = params.get('sync_users');
            if (syncData) {
                const decoded = JSON.parse(decodeURIComponent(escape(atob(syncData))));
                if (Array.isArray(decoded) && decoded.length > 0) {
                    const currentUsers = [...window.CyberState.getUsers()];
                    decoded.forEach(incoming => {
                        const idx = currentUsers.findIndex(u => u.username.toLowerCase() === incoming.username.toLowerCase());
                        if (idx !== -1) {
                            currentUsers[idx] = incoming;
                        } else {
                            currentUsers.push(incoming);
                        }
                    });
                    window.CyberState.setUsers(currentUsers);
                    window.history.replaceState({}, document.title, window.location.pathname);
                    window.CyberUI.showToast('ซิงค์รายชื่อผู้ใช้งานเข้าสู่เครื่องนี้เรียบร้อยแล้ว', 'success');
                }
            }
        } catch (e) {
            console.error('Sync users from url error:', e);
        }
    }

    return {
        render,
        openModal,
        closeModal,
        handleAdd,
        deleteUser,
        copySyncLink,
        syncFromUrl
    };
})();
