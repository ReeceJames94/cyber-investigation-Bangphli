/**
 * Firebase Cloud Firestore Configuration & Initialization
 */
window.CyberConfig = (function() {
    const firebaseConfig = {
        apiKey: "AIzaSyBzATE8CXW0MneaQOOIginihWzpG12cHT0",
        authDomain: "cyber-bangphli.firebaseapp.com",
        projectId: "cyber-bangphli",
        storageBucket: "cyber-bangphli.firebasestorage.app",
        messagingSenderId: "985266461210",
        appId: "1:985266461210:web:9bea811dfdffcd6f5c0fa3",
        measurementId: "G-VKZWQZNXRQ"
    };

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
        firebaseConfig,
        getDb: () => db
    };
})();
