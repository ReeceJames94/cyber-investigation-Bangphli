/**
 * Main Application Bootstrap & Entry Point
 */
window.CyberApp = (function() {
    async function handleLogin(event) {
        event.preventDefault();
        const uInput = document.getElementById('login-username').value.trim().toLowerCase();
        const pInput = document.getElementById('login-password').value.trim();

        const db = window.CyberConfig ? window.CyberConfig.getDb() : null;
        if (db) {
            try {
                const snap = await db.collection('cyber_users').get();
                if (!snap.empty) {
                    const cloudUsers = [];
                    snap.forEach(doc => cloudUsers.push({ id: doc.id, ...doc.data() }));
                    window.CyberState.setUsers(cloudUsers);
                }
            } catch (e) {
                console.warn('Cloud fetch on login failed, using local cache:', e);
            }
        }

        const users = window.CyberState.getUsers();
        const foundUser = users.find(u => u.username.trim().toLowerCase() === uInput && u.password.trim() === pInput);

        if (foundUser) {
            window.CyberState.setCurrentUser(foundUser);
            initApp();
            window.CyberUI.showToast(`ยินดีต้อนรับ ${foundUser.name} เข้าสู่ระบบ`, 'success');
        } else {
            window.CyberUI.showToast('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง', 'error');
        }
    }

    function handleLogout() {
        window.CyberState.setCurrentUser(null);
        document.getElementById('app-wrapper').classList.add('hidden');
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('login-form').reset();
        window.CyberUI.showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    }

    function initApp() {
        const currentUser = window.CyberState.getCurrentUser();
        if (!currentUser) return;

        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-wrapper').classList.remove('hidden');
        document.getElementById('user-display-name').textContent = currentUser.name;
        document.getElementById('user-display-role').textContent = currentUser.role;
        document.getElementById('header-date-display').textContent = 'สถานีตำรวจภูธรบางพลี • ' + new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

        // Initial module renders
        window.CyberCases.render();
        window.CyberWarrants.render();
        if (window.CyberRegistry) window.CyberRegistry.render();
        window.CyberInquiry.render();
        window.CyberReports.updatePreview();
        window.CyberKnowledge.render();
        window.CyberUsers.render();
    }

    function bootstrap() {
        window.CyberUI.initConfirmModal();
        window.CyberState.setupCloudListeners();
        window.CyberUsers.syncFromUrl();

        const currentUser = window.CyberState.getCurrentUser();
        if (currentUser) {
            initApp();
        } else {
            document.getElementById('auth-screen').classList.remove('hidden');
            document.getElementById('app-wrapper').classList.add('hidden');
        }
    }

    return {
        handleLogin,
        handleLogout,
        initApp,
        bootstrap
    };
})();

// Legacy Global Shims (Keeps HTML inline onclick/onsubmit handler references working cleanly)
window.handleLogin = (e) => window.CyberApp.handleLogin(e);
window.handleLogout = () => window.CyberApp.handleLogout();
window.switchTab = (tab) => window.CyberUI.switchTab(tab);
window.toggleTheme = () => window.CyberUI.toggleTheme();
window.openNewCaseModal = () => window.CyberCases.openNewModal();
window.openEditCaseModal = (id) => window.CyberCases.openEditModal(id);
window.closeNewCaseModal = () => window.CyberCases.closeModal();
window.addAccountInput = (acc) => window.CyberCases.addAccountInput(acc);
window.toggleCaseDocStatus = (id, f, c) => window.CyberCases.toggleDocStatus(id, f, c);
window.handleCaseSubmit = (e) => window.CyberCases.handleSubmit(e);
window.deleteCase = (id) => window.CyberCases.deleteCase(id);
window.resetCasesFilters = () => window.CyberCases.resetFilters();
window.loadCases = () => window.CyberCases.render();

window.exportCasesToPrint = () => window.CyberExport.exportCases();
window.exportWarrantsToPrint = () => window.CyberExport.openPrintModal();

window.setWarrantFilter = (f) => window.CyberWarrants.setFilter(f, window.event);
window.openNewWarrantModal = () => window.CyberWarrants.openNewModal();
window.openEditWarrantModal = (id) => window.CyberWarrants.openEditModal(id);
window.closeNewWarrantModal = () => window.CyberWarrants.closeModal();
window.handleWarrantSubmit = (e) => window.CyberWarrants.handleSubmit(e);
window.deleteWarrant = (id) => window.CyberWarrants.deleteWarrant(id);
window.toggleWarrantField = (id, f, v) => window.CyberWarrants.toggleField(id, f, v);
window.updateWarrantDate = (id, f, v) => window.CyberWarrants.updateDate(id, f, v);
window.attachArrestPdfToRow = (id, e) => window.CyberWarrants.attachArrestPdf(id, e);
window.loadWarrants = () => window.CyberWarrants.render();

window.renderInquiryCards = () => window.CyberInquiry.render();
window.openAddInquiryModal = (idx) => window.CyberInquiry.openAddModal(idx);
window.closeAddInquiryModal = () => window.CyberInquiry.closeAddModal();
window.saveNewInquiryQuestion = () => window.CyberInquiry.saveNewQuestion();
window.deleteInquiryQuestion = (c, p) => window.CyberInquiry.deleteQuestion(c, p);

window.updateReportPreview = () => window.CyberReports.updatePreview();
window.copyReportText = () => window.CyberReports.copyText();

window.renderKnowledgeList = () => window.CyberKnowledge.render();
window.handleKnowledgePdfUpload = (e) => window.CyberKnowledge.handleUpload(e);
window.deleteKnowledgeDoc = (id) => window.CyberKnowledge.deleteDoc(id);

window.renderUsersTable = () => window.CyberUsers.render();
window.openNewUserModal = () => window.CyberUsers.openModal();
window.closeNewUserModal = () => window.CyberUsers.closeModal();
window.handleAddUser = (e) => window.CyberUsers.handleAdd(e);
window.deleteUser = (id) => window.CyberUsers.deleteUser(id);
window.copyUsersSyncLink = () => window.CyberUsers.copySyncLink();

window.closeConfirmModal = () => window.CyberUI.closeConfirmModal();
window.downloadAttachedFile = (name, data) => window.CyberUI.downloadAttachedFile(name, data);
window.triggerDirectPrint = () => window.CyberExport.triggerDirectPrint();
window.closeDocPreviewModal = () => window.CyberExport.closeDocPreviewModal();

window.switchRegistrySubTab = (t) => window.CyberRegistry && window.CyberRegistry.switchSubTab(t);
window.openNewRegistryModal = () => window.CyberRegistry && window.CyberRegistry.openNewModal();
window.openNewDispatchModal = () => window.CyberRegistry && window.CyberRegistry.openNewDispatch();
window.openNewReceiptModal = () => window.CyberRegistry && window.CyberRegistry.openNewReceipt();
window.openEditDispatchModal = (id) => window.CyberRegistry && window.CyberRegistry.openEditDispatch(id);
window.openEditReceiptModal = (id) => window.CyberRegistry && window.CyberRegistry.openEditReceipt(id);
window.deleteDispatchDoc = (id) => window.CyberRegistry && window.CyberRegistry.deleteDispatch(id);
window.deleteReceiptDoc = (id) => window.CyberRegistry && window.CyberRegistry.deleteReceipt(id);
window.handleDispatchSubmit = (e) => window.CyberRegistry && window.CyberRegistry.handleDispatchSubmit(e);
window.handleReceiptSubmit = (e) => window.CyberRegistry && window.CyberRegistry.handleReceiptSubmit(e);
window.exportRegistryPrint = () => window.CyberRegistry && window.CyberRegistry.exportPrint();
window.printDispatchSlip = (id) => window.CyberRegistry && window.CyberRegistry.printDispatchSlip(id);
window.toggleDispatchStatus = (id) => window.CyberRegistry && window.CyberRegistry.toggleDispatchStatus(id);
window.toggleReceiptStatus = (id) => window.CyberRegistry && window.CyberRegistry.toggleReceiptStatus(id);
window.copyDispatchInfo = (id) => window.CyberRegistry && window.CyberRegistry.copyDispatchInfo(id);
window.copyReceiptInfo = (id) => window.CyberRegistry && window.CyberRegistry.copyReceiptInfo(id);
window.resetRegistryDateFilters = () => window.CyberRegistry && window.CyberRegistry.resetDateFilters();
window.setRegistryFilterToday = () => window.CyberRegistry && window.CyberRegistry.filterToday();
window.setRegistryFilterDays = (days) => window.CyberRegistry && window.CyberRegistry.filterDays(days);
window.setRegistryFilterMonth = () => window.CyberRegistry && window.CyberRegistry.filterMonth();

// Run bootstrap when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.CyberApp.bootstrap();
});
