/**
 * Supabase Zero-Knowledge Cloud & Firebase Configuration
 * สถานีตำรวจภูธรบางพลี (POLICE-STN-BANGPHLI-001)
 */
window.CyberConfig = (function() {
    const supabaseConfig = {
        url: "https://yofvfkfjyndjctoyvgpe.supabase.co",
        anonKey: "sb_publishable_MC3Z6VYA-wFAhAZLfikxDA_DM1W_J4K",
        stationCode: "POLICE-STN-BANGPHLI-001"
    };

    const firebaseConfig = {
        apiKey: "AIzaSyBzATE8CXW0MneaQOOIginihWzpG12cHT0",
        authDomain: "cyber-bangphli.firebaseapp.com",
        projectId: "cyber-bangphli",
        storageBucket: "cyber-bangphli.firebasestorage.app",
        messagingSenderId: "985266461210",
        appId: "1:985266461210:web:9bea811dfdffcd6f5c0fa3",
        measurementId: "G-VKZWQZNXRQ"
    };

    let supabaseClient = null;

    function createPublishableKeySafeFetch(apiKey) {
        return async function(input, init = {}) {
            const headers = new Headers(init.headers || {});
            if (apiKey && !headers.has('apikey')) {
                headers.set('apikey', apiKey);
            }
            if (headers.has('Authorization')) {
                const authVal = (headers.get('Authorization') || '').trim();
                // หากใช้ Key รูปแบบใหม่ (sb_publishable_ / sb_secret_) ห้ามส่งใน Authorization: Bearer (ส่งเฉพาะ apikey ยกเว้นมี User Session JWT จริง)
                if (/^Bearer\s+sb_(publishable|secret)_/i.test(authVal) || (apiKey && apiKey.startsWith('sb_publishable_') && authVal === `Bearer ${apiKey}`)) {
                    headers.delete('Authorization');
                }
            }
            return fetch(input, { ...init, headers });
        };
    }

    function getSupabase(customUrl, customKey) {
        const targetUrl = (customUrl || localStorage.getItem('cyber_zk_supabase_url') || supabaseConfig.url).trim();
        const targetKey = (customKey || localStorage.getItem('cyber_zk_supabase_key') || supabaseConfig.anonKey).trim();
        if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
            if (!supabaseClient || supabaseClient._currentUrl !== targetUrl || supabaseClient._currentKey !== targetKey) {
                supabaseClient = window.supabase.createClient(targetUrl, targetKey, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: false
                    },
                    global: {
                        fetch: createPublishableKeySafeFetch(targetKey)
                    }
                });
                supabaseClient._currentUrl = targetUrl;
                supabaseClient._currentKey = targetKey;
            }
            return supabaseClient;
        }
        return null;
    }

    let db = null;
    try {
        if (typeof firebase !== 'undefined') {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
        }
    } catch (e) {
        console.warn('Firebase initialization error (working in offline mode):', e);
    }

    return {
        supabaseConfig,
        firebaseConfig,
        getSupabase,
        getDb: () => db
    };
})();
