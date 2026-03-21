/**
 * LylyFit - Main Application Script
 * Pi Network SDK v2.0 - Complete Implementation
 * Features: Pi Auth, Navigation SPA, Pi Payments, i18n (8 langs), Sports Data
 */

// ============================================================
// GLOBAL STATE
// ============================================================
let piUser = null;
let isProcessingPayment = false;
let cart = [];
let currentRoute = 'home';

// ============================================================
// UTILITY: Toast Notifications
// ============================================================
function showToast(message, type = 'info', duration = 4000) {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.2rem">${icons[type] || 'ℹ️'}</span>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ============================================================
// UTILITY: API Helper - routes to Netlify functions
// ============================================================
async function apiPost(path, payload) {
    const functionMap = {
        '/payment/approve': '/.netlify/functions/payment-approve',
        '/payment/complete': '/.netlify/functions/payment-complete',
        '/payment/cancel': '/.netlify/functions/payment-cancel'
    };

    const isNetlify = window.location.hostname.includes('netlify.app') ||
                      window.location.hostname.includes('netlify.live') ||
                      window.location.hostname !== 'localhost';

    const url = (isNetlify && functionMap[path]) ? functionMap[path] : path;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    });

    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (e) {
        data = { raw: text };
    }

    if (!response.ok) {
        throw new Error(typeof data === 'string' ? data : (data?.error || JSON.stringify(data)));
    }
    return data;
}

// ============================================================
// PI NETWORK: Initialization
// ============================================================
function initPiSDK() {
    if (!window.Pi) {
        console.warn('Pi SDK not found. App may not be running inside Pi Browser.');
        return;
    }

    try {
        window.Pi.init({ version: '2.0', sandbox: true });
        console.log('✅ Pi SDK initialized successfully');

        // Handle incomplete payments on startup
        window.Pi.onIncompletePaymentFound(async (payment) => {
            console.log('⚠️ Incomplete payment found:', payment.identifier);
            try {
                const txid = payment.transaction?.txid;
                if (txid) {
                    // Has a txid - try to complete it
                    await apiPost('/payment/complete', {
                        paymentId: payment.identifier,
                        txid: txid
                    });
                    showToast('Paiement précédent complété avec succès ✅', 'success');
                } else {
                    // No txid - cancel it
                    await apiPost('/payment/cancel', { paymentId: payment.identifier });
                    console.log('Incomplete payment cancelled:', payment.identifier);
                }
            } catch (err) {
                console.error('Error handling incomplete payment:', err);
            }
        });
    } catch (err) {
        console.error('Pi SDK init error:', err);
    }
}

// ============================================================
// PI AUTH: Login
// ============================================================
async function loginPi() {
    if (!window.Pi) {
        showToast('Pi Browser requis. Ouvrez cette app dans Pi Browser.', 'error');
        return;
    }

    if (piUser) {
        showToast(`Déjà connecté en tant que @${piUser.username}`, 'info');
        return;
    }

    try {
        showToast('Connexion au wallet Pi...', 'info', 2000);

        const auth = await window.Pi.authenticate(['username', 'payments'],
            // onIncompletePaymentFound callback
            async (payment) => {
                console.log('Incomplete payment during auth:', payment.identifier);
                try {
                    const txid = payment.transaction?.txid;
                    if (txid) {
                        await apiPost('/payment/complete', { paymentId: payment.identifier, txid });
                    } else {
                        await apiPost('/payment/cancel', { paymentId: payment.identifier });
                    }
                } catch (e) {
                    console.error('Incomplete payment handling error:', e);
                }
            }
        );

        piUser = {
            uid: auth.user.uid,
            username: auth.user.username,
            accessToken: auth.accessToken
        };

        console.log('✅ User authenticated:', piUser.username);
        updateUIAfterAuth();
        showDashboard();
        showToast(`Bienvenue @${piUser.username} ! 🎉`, 'success');

    } catch (error) {
        console.error('Authentication failed:', error);
        if (error.message === 'cancelled') {
            showToast('Connexion annulée.', 'warning');
        } else {
            showToast('Échec de la connexion. Réessayez.', 'error');
        }
    }
}

// ============================================================
// PI AUTH: Auto Auth on load
// ============================================================
async function autoAuth() {
    if (!window.Pi || piUser) return;

    try {
        const auth = await window.Pi.authenticate(['username', 'payments'],
            async (payment) => {
                console.log('Incomplete payment during auto-auth:', payment.identifier);
                try {
                    const txid = payment.transaction?.txid;
                    if (txid) {
                        await apiPost('/payment/complete', { paymentId: payment.identifier, txid });
                    } else {
                        await apiPost('/payment/cancel', { paymentId: payment.identifier });
                    }
                } catch (e) { /* silent fail */ }
            }
        );

        if (auth && auth.user) {
            piUser = {
                uid: auth.user.uid,
                username: auth.user.username,
                accessToken: auth.accessToken
            };
            console.log('✅ Auto-authenticated:', piUser.username);
            updateUIAfterAuth();
            showDashboard();
        }
    } catch (err) {
        console.log('Auto-auth skipped (not in Pi Browser or user not logged in).');
    }
}

// ============================================================
// UI: Update after authentication
// ============================================================
function updateUIAfterAuth() {
    if (!piUser) return;

    // Hide connect wallet buttons
    document.getElementById('connectWalletBtn')?.classList.add('hidden');
    document.getElementById('connectWalletBtnMobile')?.classList.add('hidden');
    document.getElementById('heroLoginBtn')?.classList.add('hidden');

    // Show username
    const centerUser = document.getElementById('centerUsernameMobile');
    if (centerUser) {
        centerUser.classList.remove('hidden');
        centerUser.textContent = `@${piUser.username}`;
    }

    // Show dashboard nav links
    document.getElementById('dashboardNavBtn')?.classList.remove('hidden');
    document.getElementById('dashboardNavBtnMobile')?.classList.remove('hidden');

    // Show a Pi connected badge in navbar if exists
    const piConnectedBadge = document.getElementById('piConnectedBadge');
    if (piConnectedBadge) {
        piConnectedBadge.textContent = `@${piUser.username}`;
        piConnectedBadge.parentElement?.classList.remove('hidden');
    }
}

// ============================================================
// UI: Show Dashboard
// ============================================================
function showDashboard() {
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        dashboard.classList.remove('hidden');
        const usernameDisplay = document.getElementById('dashboardUsername');
        if (usernameDisplay && piUser) {
            usernameDisplay.textContent = piUser.username;
        }
        getBalance();
    }
}

// ============================================================
// PI: Get Balance
// ============================================================
async function getBalance() {
    if (!window.Pi) return;
    try {
        const balance = await window.Pi.getBalance();
        console.log('Balance:', balance);

        const balanceEl = document.querySelector('[data-i18n="balance"]');
        if (balanceEl) {
            const lang = localStorage.getItem('selectedLang') || 'en';
            let text = (translations[lang]?.balance || translations.en.balance || 'Balance: {balance} π');
            text = text.replace('{balance}', balance);
            balanceEl.innerText = text;
        }

        // Update balance in competitions/gyms pages
        const balanceSpan = document.getElementById('balance');
        if (balanceSpan) balanceSpan.textContent = balance;

    } catch (error) {
        console.error('Balance fetch error:', error);
    }
}

// ============================================================
// PI PAYMENTS: Main payment function
// ============================================================
async function payPi(amount, memo) {
    if (!piUser) {
        showToast('Veuillez connecter votre wallet Pi d\'abord.', 'warning');
        await loginPi();
        return;
    }

    if (isProcessingPayment) {
        showToast('Un paiement est déjà en cours...', 'warning');
        return;
    }

    if (!window.Pi) {
        showToast('Pi Browser requis pour les paiements.', 'error');
        return;
    }

    const paymentMemo = memo || `LylyFit - ${amount} π`;

    try {
        isProcessingPayment = true;
        setPaymentButtonsState(true);

        const result = await createPiPayment(amount, paymentMemo);
        console.log('Payment result:', result);

        if (result.status === 'completed') {
            showToast(`Paiement de ${amount} π réussi ! ✅`, 'success');
        }

    } catch (error) {
        console.error('Payment failed:', error);
        if (error.message === 'Cancelled') {
            showToast('Paiement annulé.', 'warning');
        } else {
            showToast(`Erreur de paiement: ${error.message}`, 'error');
        }
    } finally {
        isProcessingPayment = false;
        setPaymentButtonsState(false);
    }
}

// ============================================================
// PI PAYMENTS: Create payment with full SDK flow
// ============================================================
function createPiPayment(amount, memo) {
    return new Promise((resolve, reject) => {
        window.Pi.createPayment(
            {
                amount: amount,
                memo: memo || `LylyFit - ${amount} π`,
                metadata: {
                    app: 'LylyFit',
                    version: '2.0',
                    timestamp: Date.now()
                }
            },
            {
                // Step 1: SDK creates payment, sends paymentId to server for approval
                onReadyForServerApproval: async function(paymentId) {
                    console.log('📋 Payment ready for server approval:', paymentId);
                    try {
                        await apiPost('/payment/approve', { paymentId });
                        console.log('✅ Payment approved on server');
                    } catch (err) {
                        console.error('❌ Server approval error:', err);
                        reject(err);
                    }
                },

                // Step 2: User approved in Pi app, txid ready → complete on server
                onReadyForServerCompletion: async function(paymentId, txid) {
                    console.log('🔄 Payment ready for completion:', paymentId, txid);
                    try {
                        const result = await apiPost('/payment/complete', { paymentId, txid });
                        console.log('✅ Payment completed on server:', result);
                        resolve({ status: 'completed', paymentId, txid });
                    } catch (err) {
                        console.error('❌ Server completion error:', err);
                        reject(err);
                    }
                },

                // Step 3: User cancelled payment
                onCancel: function(paymentId) {
                    console.log('❌ Payment cancelled by user:', paymentId);
                    if (paymentId) {
                        apiPost('/payment/cancel', { paymentId }).catch(e => console.error('Cancel error:', e));
                    }
                    reject(new Error('Cancelled'));
                },

                // Error in payment flow
                onError: function(error, payment) {
                    console.error('💥 Payment error:', error, payment);
                    if (payment?.identifier) {
                        apiPost('/payment/cancel', { paymentId: payment.identifier }).catch(() => {});
                    }
                    reject(error);
                }
            }
        );
    });
}

// ============================================================
// UI: Payment button state management
// ============================================================
function setPaymentButtonsState(disabled) {
    document.querySelectorAll('.payment-btn, button[data-pay-amount]').forEach(btn => {
        btn.disabled = disabled;
        if (disabled) {
            btn.setAttribute('data-original-text', btn.dataset.originalText || btn.textContent);
            const lang = localStorage.getItem('selectedLang') || 'en';
            btn.textContent = translations[lang]?.processing || 'Processing...';
        } else {
            const orig = btn.getAttribute('data-original-text');
            if (orig) btn.textContent = orig;
        }
    });
}

// ============================================================
// PI AUTH: Logout
// ============================================================
function logoutPi() {
    piUser = null;
    isProcessingPayment = false;
    cart = [];

    // Show connect wallet buttons
    document.getElementById('connectWalletBtn')?.classList.remove('hidden');
    document.getElementById('connectWalletBtnMobile')?.classList.remove('hidden');
    document.getElementById('heroLoginBtn')?.classList.remove('hidden');

    // Hide username
    document.getElementById('centerUsernameMobile')?.classList.add('hidden');

    // Hide dashboard and nav links
    document.getElementById('dashboard')?.classList.add('hidden');
    document.getElementById('dashboardNavBtn')?.classList.add('hidden');
    document.getElementById('dashboardNavBtnMobile')?.classList.add('hidden');

    showToast('Déconnexion réussie. À bientôt ! 👋', 'info');
    navigateTo('home');
    console.log('User logged out');
}

// ============================================================
// NAVIGATION: SPA Router
// ============================================================
const router = { current: 'home', params: {} };

window.navigateTo = function(route, params = {}) {
    router.current = route;
    router.params = params;

    const appRouter = document.getElementById('app-router');
    const extraContent = document.getElementById('additional-content');
    const dashboard = document.getElementById('dashboard');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Hide dashboard unless on dashboard route
    if (route !== 'dashboard' && dashboard) {
        dashboard.classList.add('hidden');
    }

    switch (route) {
        case 'home':
            if (extraContent) extraContent.classList.remove('hidden');
            if (appRouter) appRouter.innerHTML = '';
            renderHomeSection();
            break;

        case 'categories':
            if (extraContent) extraContent.classList.add('hidden');
            renderCategoriesScreen(appRouter);
            history.pushState({}, '', '#categories');
            break;

        case 'sports':
            if (extraContent) extraContent.classList.add('hidden');
            renderSportsListScreen(appRouter, params.categoryId);
            history.pushState({}, '', `#sports/${params.categoryId}`);
            break;

        case 'detail':
            if (extraContent) extraContent.classList.add('hidden');
            renderSportDetailScreen(appRouter, params.sportId);
            history.pushState({}, '', `#detail/${params.sportId}`);
            break;

        case 'coaches':
            if (extraContent) extraContent.classList.add('hidden');
            renderCoachesScreen(appRouter);
            history.pushState({}, '', '#coaches');
            break;

        case 'marketplace':
            if (extraContent) extraContent.classList.add('hidden');
            renderMarketplaceScreen(appRouter);
            history.pushState({}, '', '#marketplace');
            break;

        case 'dashboard':
            if (extraContent) extraContent.classList.add('hidden');
            if (appRouter) appRouter.innerHTML = '';
            if (dashboard) dashboard.classList.remove('hidden');
            if (piUser) {
                showDashboard();
                document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth' });
            } else {
                showToast('Connectez votre wallet Pi pour accéder au dashboard.', 'warning');
                loginPi();
            }
            break;

        default:
            if (extraContent) extraContent.classList.remove('hidden');
            if (appRouter) appRouter.innerHTML = '';
            break;
    }

    // Re-apply translations after rendering
    setTimeout(() => {
        const lang = localStorage.getItem('selectedLang') || 'en';
        setLanguage(lang);
    }, 50);
};

// ============================================================
// RENDER: Home hero section (SPA restoration)
// ============================================================
function renderHomeSection() {
    const appRouter = document.getElementById('app-router');
    if (!appRouter) return;
    // The home section is already in index.html, just ensure it's visible
    const homeScreen = document.getElementById('home-screen');
    if (!homeScreen) {
        appRouter.innerHTML = `
        <section id="home-screen" class="relative h-screen flex items-center justify-center overflow-hidden">
            <div class="absolute inset-0 z-0">
                <div class="absolute inset-0 bg-gradient-to-b from-silver-900/80 via-silver-900/60 to-silver-900"></div>
                <img src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070"
                     class="w-full h-full object-cover opacity-30" alt="Hero Background" loading="lazy">
            </div>
            <div class="relative z-10 container mx-auto px-4 text-center">
                <h1 class="text-5xl md:text-7xl font-bold text-white mb-6 text-shadow font-display">
                    <span data-i18n="hero_title_1">Transform Your Fitness</span><br>
                    <span class="gradient-text" data-i18n="hero_title_2">Journey with Pi</span>
                </h1>
                <p class="text-xl md:text-2xl text-silver-300 mb-8 max-w-3xl mx-auto" data-i18n="hero_subtitle">
                    The world's first decentralized fitness ecosystem.
                </p>
                <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button onclick="loginPi()" id="heroLoginBtn"
                        class="bg-primary-600 hover:bg-primary-700 text-white font-semibold text-lg px-8 py-4 rounded-lg shadow-lg shadow-primary-500/50 transition-all transform hover:scale-105"
                        data-i18n="login_with_pi">Login with Pi</button>
                    <button onclick="navigateTo('categories')"
                        class="bg-silver-800 hover:bg-silver-700 text-white border border-silver-700 font-semibold text-lg px-8 py-4 rounded-lg transition-all transform hover:scale-105"
                        data-i18n="explore_sports">Explore Sports</button>
                </div>
                <div class="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8">
                    <div class="text-center"><div class="stat-number gradient-text mb-2">50K+</div><div class="text-silver-400" data-i18n="active_users">Active Users</div></div>
                    <div class="text-center"><div class="stat-number gradient-text mb-2">1K+</div><div class="text-silver-400" data-i18n="expert_coaches">Expert Coaches</div></div>
                    <div class="text-center"><div class="stat-number gradient-text mb-2">100+</div><div class="text-silver-400" data-i18n="countries">Countries</div></div>
                    <div class="text-center"><div class="stat-number gradient-text mb-2">1M+</div><div class="text-silver-400" data-i18n="workouts">Workouts</div></div>
                </div>
            </div>
        </section>`;
    }
}

// ============================================================
// RENDER: Categories Screen
// ============================================================
function renderCategoriesScreen(container) {
    if (!container || !window.sportsData) return;

    const effortColors = {
        extreme: 'effort-extreme', very_high: 'effort-high', high: 'effort-high',
        medium_high: 'effort-medium', medium: 'effort-medium', low_medium: 'effort-low', low: 'effort-low'
    };

    container.innerHTML = `
    <section class="py-20 min-h-screen page-enter">
        <div class="container mx-auto px-4">
            <nav class="breadcrumb mb-8">
                <a href="#" onclick="navigateTo('home')" data-i18n="home">Home</a>
                <span class="separator">›</span>
                <span class="current" data-i18n="explore_sports_title">Explore Sports</span>
            </nav>
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-5xl font-bold text-white mb-4 font-display" data-i18n="explore_sports_title">Explore Sports</h2>
                <p class="text-silver-400 text-lg" data-i18n="explore_sports_subtitle">Find your perfect workout style</p>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                ${sportsData.categories.map(cat => `
                    <div class="sport-card h-56 cursor-pointer animate-fadeInUp"
                         onclick="navigateTo('sports', {categoryId: '${cat.id}'})">
                        <img src="${cat.image}" alt="${cat.id}"
                             class="w-full h-full object-cover" loading="lazy"
                             onerror="this.src='https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=400'">
                        <div class="sport-card-overlay"></div>
                        <div class="absolute bottom-0 left-0 right-0 p-4">
                            <div class="text-2xl mb-1">${cat.icon || '🏃'}</div>
                            <h3 class="text-white font-bold text-sm leading-tight" data-i18n="${cat.name}">${cat.id}</h3>
                            <p class="text-silver-300 text-xs mt-1">${cat.sports.length} activités</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </section>`;
}

// ============================================================
// RENDER: Sports List Screen (by category)
// ============================================================
function renderSportsListScreen(container, categoryId) {
    if (!container || !window.sportsData) return;

    const category = sportsData.categories.find(c => c.id === categoryId);
    if (!category) {
        navigateTo('categories');
        return;
    }

    const lang = localStorage.getItem('selectedLang') || 'en';
    const t = translations[lang] || translations.en;
    const effortLabel = { extreme: '🔥🔥🔥', very_high: '🔥🔥', high: '🔥', medium_high: '💪', medium: '💪', low_medium: '🌿', low: '🌿' };

    const sports = category.sports
        .map(id => ({ id, ...sportsData.sports[id] }))
        .filter(s => s.image);

    container.innerHTML = `
    <section class="py-20 min-h-screen page-enter">
        <div class="container mx-auto px-4">
            <nav class="breadcrumb mb-8">
                <a href="#" onclick="navigateTo('home')" data-i18n="home">Home</a>
                <span class="separator">›</span>
                <a href="#" onclick="navigateTo('categories')" data-i18n="explore_sports_title">Sports</a>
                <span class="separator">›</span>
                <span class="current" data-i18n="${category.name}">${categoryId}</span>
            </nav>

            <div class="flex items-center gap-4 mb-12">
                <span class="text-4xl">${category.icon || '🏃'}</span>
                <div>
                    <h2 class="text-3xl md:text-4xl font-bold text-white font-display" data-i18n="${category.name}">${categoryId}</h2>
                    <p class="text-silver-400">${sports.length} activités disponibles</p>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                ${sports.map((sport, i) => {
                    const name = t[sport.name] || sport.id;
                    const effort = sport.specs?.effort || 'medium';
                    const calories = sport.specs?.calories || '--';
                    const effortClass = { extreme: 'effort-extreme', very_high: 'effort-high', high: 'effort-high', medium_high: 'effort-medium', medium: 'effort-medium', low_medium: 'effort-low', low: 'effort-low' }[effort] || 'effort-medium';

                    return `
                    <div class="glass-card rounded-2xl overflow-hidden cursor-pointer animate-fadeInUp delay-${Math.min(i*100, 500)}"
                         onclick="navigateTo('detail', {sportId: '${sport.id}'})">
                        <div class="relative h-48 overflow-hidden">
                            <img src="${sport.image}" alt="${name}"
                                 class="w-full h-full object-cover transition-transform duration-500 hover:scale-110" loading="lazy"
                                 onerror="this.src='https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=400'">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                            <div class="absolute bottom-3 left-3 flex gap-2">
                                <span class="effort-badge ${effortClass}">${effort.replace('_', ' ')}</span>
                                <span class="effort-badge" style="background:rgba(12,146,227,0.2);color:#36acf4;border:1px solid rgba(12,146,227,0.4)">🔥 ${calories} kcal</span>
                            </div>
                        </div>
                        <div class="p-5">
                            <h3 class="text-white font-bold text-lg mb-2">${name}</h3>
                            <div class="flex justify-between items-center">
                                <div class="flex items-center gap-1 text-silver-400 text-sm">
                                    <span>${sport.specs?.type === 'group' ? '👥 Group' : sport.specs?.type === 'individual' ? '👤 Solo' : '👥👤 Mixed'}</span>
                                </div>
                                <span class="text-primary-400 font-bold text-sm">Voir →</span>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>
    </section>`;
}

// ============================================================
// RENDER: Sport Detail Screen (with YouTube video)
// ============================================================
function renderSportDetailScreen(container, sportId) {
    if (!container || !window.sportsData) return;

    const sport = sportsData.sports[sportId];
    if (!sport) {
        navigateTo('categories');
        return;
    }

    const lang = localStorage.getItem('selectedLang') || 'en';
    const t = translations[lang] || translations.en;
    const category = sportsData.categories.find(c => c.id === sport.category_id);

    const name = t[sport.name] || sportId;
    const description = t[sport.description] || 'Description not available.';
    const benefits = t[sport.benefits] || '';
    const target = t[sport.target] || '';
    const goal = t[sport.goal] || '';

    const effort = sport.specs?.effort || 'medium';
    const effortClass = { extreme: 'effort-extreme', very_high: 'effort-high', high: 'effort-high', medium_high: 'effort-medium', medium: 'effort-medium', low_medium: 'effort-low', low: 'effort-low' }[effort] || 'effort-medium';

    // Find coaches for this sport
    const relatedCoaches = (sportsData.coaches || []).filter(c =>
        c.specialty === sportId || c.specialty === sport.category_id
    ).slice(0, 3);

    const videoSection = sport.youtube_id
        ? `<div class="video-container mb-8">
            <iframe
                src="https://www.youtube.com/embed/${sport.youtube_id}?rel=0&modestbranding=1"
                title="${name} video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                loading="lazy">
            </iframe>
           </div>`
        : sport.video
        ? `<div class="video-container mb-8">
            <video controls poster="${sport.image}" preload="none">
                <source src="${sport.video}" type="video/mp4">
            </video>
           </div>`
        : '';

    container.innerHTML = `
    <section class="py-20 min-h-screen page-enter">
        <div class="container mx-auto px-4 max-w-4xl">
            <nav class="breadcrumb mb-8">
                <a href="#" onclick="navigateTo('home')" data-i18n="home">Home</a>
                <span class="separator">›</span>
                <a href="#" onclick="navigateTo('categories')" data-i18n="explore_sports_title">Sports</a>
                <span class="separator">›</span>
                <a href="#" onclick="navigateTo('sports', {categoryId: '${sport.category_id}'})">${category?.id || sport.category_id}</a>
                <span class="separator">›</span>
                <span class="current">${name}</span>
            </nav>

            <!-- Hero Image + Title -->
            <div class="relative rounded-2xl overflow-hidden mb-8 h-72 md:h-96">
                <img src="${sport.image}" alt="${name}"
                     class="w-full h-full object-cover" loading="lazy"
                     onerror="this.src='https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200'">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                <div class="absolute bottom-6 left-6">
                    <div class="flex gap-2 mb-3">
                        <span class="effort-badge ${effortClass}">${effort.replace('_', ' ')}</span>
                        <span class="effort-badge" style="background:rgba(12,146,227,0.2);color:#36acf4;border:1px solid rgba(12,146,227,0.4)">
                            🔥 ${sport.specs?.calories || '--'} kcal/h
                        </span>
                        <span class="effort-badge" style="background:rgba(245,158,11,0.2);color:#f59e0b;border:1px solid rgba(245,158,11,0.4)">
                            👥 ${sport.specs?.type || 'all'}
                        </span>
                    </div>
                    <h1 class="text-3xl md:text-5xl font-bold text-white font-display">${name}</h1>
                </div>
            </div>

            <!-- Video Section -->
            ${videoSection}

            <!-- Info Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div class="glass-card p-6 rounded-2xl">
                    <h3 class="text-primary-400 font-bold mb-3 text-lg">📖 Description</h3>
                    <p class="text-silver-300 leading-relaxed">${description}</p>
                </div>
                <div class="glass-card p-6 rounded-2xl">
                    <h3 class="text-green-400 font-bold mb-3 text-lg">✅ Bénéfices</h3>
                    <p class="text-silver-300 leading-relaxed">${benefits}</p>
                </div>
                <div class="glass-card p-6 rounded-2xl">
                    <h3 class="text-yellow-400 font-bold mb-3 text-lg">🎯 Objectif</h3>
                    <p class="text-silver-300 leading-relaxed">${goal}</p>
                </div>
                <div class="glass-card p-6 rounded-2xl">
                    <h3 class="text-purple-400 font-bold mb-3 text-lg">👥 Public cible</h3>
                    <p class="text-silver-300 leading-relaxed">${target}</p>
                </div>
            </div>

            <!-- Specs -->
            <div class="glass-card p-6 rounded-2xl mb-8">
                <h3 class="text-white font-bold mb-4 text-lg">⚙️ Spécifications</h3>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                    ${sport.specs ? Object.entries(sport.specs).map(([k, v]) => `
                        <div class="text-center p-3 bg-silver-800/50 rounded-xl">
                            <div class="text-silver-400 text-xs uppercase mb-1">${k.replace('_', ' ')}</div>
                            <div class="text-white font-semibold">${String(v).replace('_', ' ')}</div>
                        </div>
                    `).join('') : ''}
                </div>
            </div>

            <!-- Related Coaches -->
            ${relatedCoaches.length > 0 ? `
            <div class="mb-8">
                <h3 class="text-white font-bold text-2xl mb-6">👨‍💼 Coaches Disponibles</h3>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    ${relatedCoaches.map(coach => `
                        <div class="glass-card p-5 rounded-2xl text-center">
                            <img src="${coach.image}" alt="${coach.name}"
                                 class="w-20 h-20 rounded-full object-cover mx-auto mb-3 border-2 border-primary-500" loading="lazy"
                                 onerror="this.src='https://images.unsplash.com/photo-1567013127542-490d757e51fc?q=80&w=200'">
                            <h4 class="text-white font-bold">${coach.name}</h4>
                            <p class="text-primary-400 text-sm mb-2">${coach.specialty_label}</p>
                            <div class="text-yellow-400 text-sm mb-3">⭐ ${coach.rating} (${coach.reviews})</div>
                            <button onclick="payPi(${coach.price}, 'Session avec ${coach.name}')"
                                    class="payment-btn w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm"
                                    data-original-text="${coach.price} π / séance"
                                    data-pay-amount="${coach.price}">
                                ${coach.price} π / séance
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Book a Session CTA -->
            <div class="bg-gradient-to-r from-primary-600/20 to-purple-600/20 border border-primary-500/30 rounded-2xl p-8 text-center">
                <h3 class="text-white font-bold text-2xl mb-2">🚀 Commencer ${name}</h3>
                <p class="text-silver-400 mb-6">Réservez une session avec un coach certifié</p>
                <div class="flex flex-col sm:flex-row gap-4 justify-center">
                    <button onclick="navigateTo('coaches')"
                            class="bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-8 rounded-xl transition-all transform hover:scale-105">
                        Trouver un Coach
                    </button>
                    <button onclick="navigateTo('categories')"
                            class="bg-silver-700 hover:bg-silver-600 text-white font-bold py-3 px-8 rounded-xl transition-all">
                        ← Retour aux Sports
                    </button>
                </div>
            </div>
        </div>
    </section>`;
}

// ============================================================
// RENDER: Coaches Screen
// ============================================================
function renderCoachesScreen(container) {
    if (!container) return;

    const coaches = sportsData.coaches || [];

    container.innerHTML = `
    <section class="py-20 min-h-screen page-enter">
        <div class="container mx-auto px-4">
            <nav class="breadcrumb mb-8">
                <a href="#" onclick="navigateTo('home')" data-i18n="home">Home</a>
                <span class="separator">›</span>
                <span class="current" data-i18n="coaches">Coaches</span>
            </nav>
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-5xl font-bold text-white mb-4 font-display" data-i18n="expert_coaches_title">Expert Coaches</h2>
                <p class="text-silver-400 text-lg" data-i18n="expert_coaches_subtitle">Personalized training from the best</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                ${coaches.map((coach, i) => `
                    <div class="glass-card rounded-2xl overflow-hidden animate-fadeInUp delay-${Math.min(i*100, 500)}">
                        <div class="relative h-64 overflow-hidden">
                            <img src="${coach.image}" alt="${coach.name}"
                                 class="w-full h-full object-cover transition-transform duration-500 hover:scale-110" loading="lazy"
                                 onerror="this.src='https://images.unsplash.com/photo-1567013127542-490d757e51fc?q=80&w=400'">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                            <div class="absolute bottom-4 left-4">
                                <div class="text-yellow-400 text-sm">⭐ ${coach.rating} (${coach.reviews} avis)</div>
                            </div>
                        </div>
                        <div class="p-6">
                            <h3 class="text-xl font-bold text-white mb-1">${coach.name}</h3>
                            <p class="text-primary-400 text-sm mb-3">${coach.specialty_label}</p>
                            <p class="text-silver-400 text-sm mb-4 line-clamp-2">${coach.bio}</p>
                            <div class="flex justify-between items-center">
                                <span class="text-white font-bold text-lg">${coach.price} <span class="gradient-text">π</span> / séance</span>
                                <button onclick="payPi(${coach.price}, 'Session avec ${coach.name}')"
                                        class="payment-btn bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm transition-all"
                                        data-original-text="Réserver" data-i18n="book_now">
                                    Réserver
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </section>`;
}

// ============================================================
// RENDER: Marketplace Screen
// ============================================================
function renderMarketplaceScreen(container) {
    if (!container) return;

    const lang = localStorage.getItem('selectedLang') || 'en';
    const t = translations[lang] || translations.en;
    const products = sportsData.products || [];

    container.innerHTML = `
    <section class="py-20 min-h-screen page-enter">
        <div class="container mx-auto px-4">
            <nav class="breadcrumb mb-8">
                <a href="#" onclick="navigateTo('home')" data-i18n="home">Home</a>
                <span class="separator">›</span>
                <span class="current" data-i18n="marketplace_title">Marketplace</span>
            </nav>
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-5xl font-bold text-white mb-4 font-display" data-i18n="marketplace_title">Marketplace</h2>
                <p class="text-silver-400 text-lg" data-i18n="marketplace_subtitle">Get the best gear with Pi</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                ${products.map((product, i) => {
                    const productName = t[product.name_key] || product.name;
                    return `
                    <div class="glass-card rounded-xl overflow-hidden animate-fadeInUp delay-${Math.min(i*100, 500)}">
                        <div class="h-56 bg-silver-800 overflow-hidden">
                            <img src="${product.image}" alt="${productName}"
                                 class="w-full h-full object-contain p-4 hover:scale-110 transition-transform duration-500" loading="lazy"
                                 onerror="this.src='https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=400'">
                        </div>
                        <div class="p-5">
                            <h3 class="text-white font-bold mb-1 text-sm" data-i18n="${product.name_key}">${productName}</h3>
                            <div class="text-yellow-400 text-xs mb-3">⭐ ${product.rating} (${product.reviews})</div>
                            <div class="flex justify-between items-center">
                                <span class="text-primary-400 font-bold text-lg">${product.price} <span class="gradient-text">π</span></span>
                                <button onclick="payPi(${product.price}, '${productName}')"
                                        class="payment-btn text-white bg-silver-700 hover:bg-primary-600 p-2 rounded-lg transition-colors"
                                        data-original-text="🛒" data-pay-amount="${product.price}">
                                    🛒
                                </button>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>
    </section>`;
}

// ============================================================
// LANGUAGE: Translation Engine
// ============================================================
window.setLanguage = function(lang) {
    if (!translations || !translations[lang]) lang = 'en';
    localStorage.setItem('selectedLang', lang);

    // RTL support
    const isRTL = ['ar', 'ar-islamic'].includes(lang);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;

    // Translate all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        let text = (translations[lang] && translations[lang][key]) || (translations.en && translations.en[key]) || key;

        // Handle placeholders
        if (el.dataset.i18nParams) {
            try {
                const params = JSON.parse(el.dataset.i18nParams);
                Object.keys(params).forEach(param => {
                    text = text.replace(`{${param}}`, params[param]);
                });
            } catch (e) { /* ignore parse error */ }
        }

        // Don't overwrite payment button data-original-text
        if (el.hasAttribute('data-original-text')) {
            el.setAttribute('data-original-text', text);
            if (!el.disabled) el.textContent = text;
        } else {
            el.innerText = text;
        }
    });

    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const text = (translations[lang] && translations[lang][key]) || (translations.en && translations.en[key]) || key;
        el.placeholder = text;
    });

    // Sync selector
    const langSelector = document.getElementById('langSelector');
    if (langSelector && langSelector.value !== lang) {
        langSelector.value = lang;
    }
    const langSelectorComp = document.getElementById('langSelectorComp');
    if (langSelectorComp && langSelectorComp.value !== lang) {
        langSelectorComp.value = lang;
    }

    console.log(`🌍 Language: ${lang} (${isRTL ? 'RTL' : 'LTR'})`);
};

function detectLanguage() {
    const saved = localStorage.getItem('selectedLang');
    if (saved && translations && translations[saved]) return saved;

    let browser = navigator.language || 'en';
    if (translations && translations[browser]) return browser;

    browser = browser.split('-')[0];
    if (translations && translations[browser]) return browser;

    return 'en';
}

// ============================================================
// MOBILE MENU
// ============================================================
function setupMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeMenuBtn = document.getElementById('closeMenuBtn');

    if (!mobileMenu || !mobileMenuBtn) return;

    const toggleMenu = (show) => {
        if (show) {
            mobileMenu.classList.remove('translate-x-full');
        } else {
            mobileMenu.classList.add('translate-x-full');
        }
    };

    mobileMenuBtn.addEventListener('click', () => toggleMenu(true));
    closeMenuBtn?.addEventListener('click', () => toggleMenu(false));

    // Close on link click
    mobileMenu.querySelectorAll('a, button').forEach(el => {
        el.addEventListener('click', () => {
            setTimeout(() => toggleMenu(false), 150);
        });
    });
}

// ============================================================
// CONNECT WALLET BUTTONS
// ============================================================
function setupConnectButtons() {
    ['connectWalletBtn', 'connectWalletBtnMobile'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', loginPi);
    });
}

// ============================================================
// PAYMENT BUTTONS (auto-detect from DOM)
// ============================================================
function setupPaymentButtons() {
    document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent.trim();
        const match = text.match(/(\d+(?:\.\d+)?)\s*π/);

        if (match && !btn.hasAttribute('data-pay-setup')) {
            btn.setAttribute('data-pay-setup', 'true');
            btn.setAttribute('data-original-text', text);
            btn.classList.add('payment-btn');
            const amount = parseFloat(match[1]);
            btn.addEventListener('click', async (e) => {
                if (!btn.onclick && amount > 0) {
                    e.preventDefault();
                    await payPi(amount);
                }
            });
        }
    });
}

// ============================================================
// DOCUMENT READY - Initialize everything
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 LylyFit App Starting...');

    // 1. Init Pi SDK
    initPiSDK();

    // 2. Setup mobile menu
    setupMobileMenu();

    // 3. Setup connect wallet buttons
    setupConnectButtons();

    // 4. Language initialization
    const initialLang = detectLanguage();
    if (typeof setLanguage === 'function') {
        setLanguage(initialLang);
    }

    // 5. Language selector listener
    const langSelector = document.getElementById('langSelector');
    if (langSelector) {
        langSelector.addEventListener('change', (e) => window.setLanguage(e.target.value));
    }

    // 6. Setup payment buttons in static HTML
    setTimeout(setupPaymentButtons, 200);

    // 7. Handle hash-based routing on load
    const hash = window.location.hash.slice(1);
    if (hash && hash !== 'home') {
        const [route, id] = hash.split('/');
        const paramMap = { sports: 'categoryId', detail: 'sportId' };
        const paramKey = paramMap[route];
        navigateTo(route, paramKey && id ? { [paramKey]: id } : {});
    }

    // 8. Auto-authenticate (silent, non-blocking)
    setTimeout(autoAuth, 500);

    console.log('✅ LylyFit initialized');
});

// ============================================================
// EXPORT GLOBAL FUNCTIONS
// ============================================================
window.loginPi = loginPi;
window.logoutPi = logoutPi;
window.payPi = payPi;
window.getBalance = getBalance;
window.showToast = showToast;
window.renderCoachesScreen = renderCoachesScreen;
window.renderMarketplaceScreen = renderMarketplaceScreen;
