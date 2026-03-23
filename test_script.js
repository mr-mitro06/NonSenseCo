
        // Import Supabase SDK (Used in production for DB & Auth)
        import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

        /*
        =======================================================================
        READ THIS BEFORE COMPLAINING THE APP IS BROKEN!
        =======================================================================
        Supabase uses strict security (RLS). If you get an error when creating
        an account or inserting an item, you MUST run this SQL in your 
        Supabase Dashboard -> SQL Editor:

        -- 1. Create the tables
        create table if not exists profiles (id uuid primary key, alias text);
        create table if not exists auctions (id uuid default gen_random_uuid() primary key, title text, description text, image_url text, starting_price numeric, current_bid numeric, highest_bidder_id uuid, highest_bidder_name text, seller_id uuid, seller_name text, status text default 'active', created_at timestamp with time zone default now());

        -- 2. DISABLE RLS FOR TESTING (VITAL!)
        alter table profiles disable row level security;
        alter table auctions disable row level security;

        -- 3. ENABLE REALTIME
        alter publication supabase_realtime add table auctions;
        =======================================================================
        */

        // ==========================================
        // GLOBAL STATE & CONFIG
        // ==========================================
        const State = {
            supabase: null,
            user: null,            // Auth object
            profile: null,         // Database profile (alias, etc)
            auctions: [],          // Array of all items
            filter: 'all',         // Current view filter
            searchQuery: '',
            isLoginMode: true,     // UI toggle for Auth form
            selectedItem: null     // For details modal
        };

        // Expose functions to window for HTML onClick handlers
        window.handleAuthAction = handleAuthAction;
        window.toggleAuthMode = toggleAuthMode;
        window.handleLogout = handleLogout;
        window.toggleSidebar = toggleSidebar;
        window.toggleAddModal = toggleAddModal;
        window.toggleDetailsModal = toggleDetailsModal;
        window.handleImageUpload = handleImageUpload;
        window.handleAuctionSubmit = handleAuctionSubmit;
        window.placeBid = placeBid;
        window.acceptBid = acceptBid;
        window.setFilter = setFilter;
        window.openItemDetails = openItemDetails;
        window.deleteAdminAsset = deleteAdminAsset;
        window.handleAgree = handleAgree;
        window.handleDisagree = handleDisagree;
        window.toggleAdminPanel = toggleAdminPanel;
        window.switchAdminTab = switchAdminTab;
        window.adminAddBalance = adminAddBalance;
        window.adminBanUser = adminBanUser;
        window.postComment = postComment;
        window.setupOTPInputs = setupOTPInputs;
        window.cancelOTP = cancelOTP;
        window.verifyOTP = verifyOTP;

        // ==========================================
        // SYSTEM INITIALIZATION
        // ==========================================
        async function bootSystem() {
            initMatrixBackground();
            await playTerminalBootSequence();

            // Initialize Icons safely
            try { lucide.createIcons(); } catch(e){}

            // Bind specialized DOM listeners
            bindDOMEvents();

            // Intercept boot sequence to show disclaimer first
            showDisclaimerScreen();
        }

        // ==========================================
        // DISCLAIMER LOGIC
        // ==========================================
        function showDisclaimerScreen() {
            const disc = document.getElementById('disclaimer-screen');
            disc.classList.remove('hidden');
            setTimeout(() => {
                disc.classList.remove('hidden-state');
                disc.classList.add('visible-state');
            }, 100);
        }

        function handleDisagree() {
            window.location.href = "https://mr-mitro06.github.io/NonSence.co/";
        }

        async function handleAgree() {
            const disc = document.getElementById('disclaimer-screen');
            disc.classList.remove('visible-state');
            disc.classList.add('hidden-state');
            
            setTimeout(async () => {
                disc.classList.add('hidden');
                // User agreed, now attempt Database connection which handles auth routing
                await initDatabase();
            }, 500);
        }

        function bindDOMEvents() {
            // Upload Box Click Handler
            const uploadBox = document.getElementById('upload-box');
            const fileInput = document.getElementById('image-upload-input');
            if(uploadBox && fileInput) {
                uploadBox.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', handleImageUpload);
            }

            // Debounced search logic
            let searchTimeout;
            document.getElementById('search-input').addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    State.searchQuery = e.target.value.toLowerCase();
                    processAndRenderAuctions();
                }, 300); // 300ms debounce
            });
        }

        // ==========================================
        // DATABASE CONNECTION
        // ==========================================
        async function initDatabase() {
            const supabaseUrl = 'https://qjlvymojlvibalquktvs.supabase.co';
            const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqbHZ5bW9qbHZpYmFscXVrdHZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTM2NDMsImV4cCI6MjA4OTMyOTY0M30.mQy8dg1d-7H-xiIkrbN9AqYT95uc24vaAZQErWIfTi0';

            try {
                State.supabase = createClient(supabaseUrl, supabaseKey);
                
                const { data: { session }, error } = await State.supabase.auth.getSession();
                if (error) throw error;

                State.supabase.auth.onAuthStateChange(async (event, session) => {
                    if (session) {
                        State.user = session.user;
                        await fetchProfile();
                    } else {
                        State.user = null;
                        State.profile = null;
                        showAuthScreen();
                    }
                });

                if (session) {
                    State.user = session.user;
                    await fetchProfile();
                } else {
                    showAuthScreen();
                }

            } catch (err) {
                console.error("CRITICAL DB FAILURE.", err);
                showToast("DB Unreachable. Please check your network.", "error");
                showAuthScreen();
            }
        }

        // ==========================================
        // AUTHENTICATION & OTP
        // ==========================================
        let currentAuthEmail = "";
        let currentAuthAlias = "";

        function setupOTPInputs() {
            const inputs = document.querySelectorAll('.otp-input');
            inputs.forEach((input, index) => {
                input.addEventListener('input', (e) => {
                    if (e.target.value.length === 1 && index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace' && !e.target.value && index > 0) {
                        inputs[index - 1].focus();
                    }
                });
            });
        }

        function cancelOTP() {
            document.getElementById('otp-screen').classList.replace('visible-state', 'hidden-state');
            document.getElementById('auth-form').classList.replace('hidden-state', 'visible-state');
            document.querySelectorAll('.otp-input').forEach(i => i.value = '');
            const btnEl = document.getElementById('auth-submit-btn');
            btnEl.innerHTML = `Request Authentication Token <i data-lucide="cpu" class="w-4 h-4"></i>`;
            btnEl.disabled = false;
        }

        async function verifyOTP() {
            const inputs = document.querySelectorAll('.otp-input');
            let enteredOTP = "";
            inputs.forEach(i => enteredOTP += i.value);

            if (enteredOTP.length !== 6) {
                inputs.forEach(i => {
                    i.classList.add('border-red-500', 'bg-red-950/20');
                    setTimeout(() => i.classList.remove('border-red-500', 'bg-red-950/20'), 1000);
                });
                return;
            }

            const verifyBtn = document.getElementById('verify-otp-btn');
            verifyBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Initializing...`;
            verifyBtn.disabled = true;

            try {
                const { data, error } = await State.supabase.auth.verifyOtp({
                    email: currentAuthEmail,
                    token: enteredOTP,
                    type: 'email'
                });

                if (error) throw error;
                
                // Check if profile exists, if not create it
                if (data.user) {
                    const { data: profileCheck, error: pErr } = await State.supabase
                        .from('profiles')
                        .select('id')
                        .eq('id', data.user.id)
                        .single();
                        
                    if (pErr && pErr.code === 'PGRST116') {
                        // Profile doesn't exist. Create it with 0 balance.
                        await State.supabase.from('profiles').upsert({
                            id: data.user.id,
                            alias: currentAuthAlias || 'Node_' + Math.floor(Math.random() * 9999),
                            balance: 0
                        });
                    }
                }

                // OTP Success
                document.getElementById('otp-screen').classList.replace('visible-state', 'hidden-state');
                
                // Re-show processing screen for final boot
                const processingScreenEl = document.getElementById('auth-processing');
                const processingText = document.getElementById('auth-processing-text');
                processingScreenEl.classList.remove('hidden');
                processingScreenEl.classList.replace('opacity-0', 'opacity-100');
                processingText.textContent = "VERIFICATION COMPLETE."; 
                
                // fetchProfile and bootMainApp will be called by onAuthStateChange listener
                
            } catch (err) {
                console.error("OTP Error:", err);
                verifyBtn.innerHTML = `Establish Link <i data-lucide="zap" class="w-4 h-4"></i>`;
                verifyBtn.disabled = false;
                showToast("Invalid code or expired. Try again.", "error");
                inputs.forEach(i => {
                    i.classList.add('border-red-500', 'bg-red-950/20');
                    setTimeout(() => i.classList.remove('border-red-500', 'bg-red-950/20'), 1000);
                });
            }
        }

        async function handleAuthAction() {
            const email = document.getElementById('auth-email').value.trim();
            const alias = document.getElementById('auth-alias').value.trim();
            const errorEl = document.getElementById('auth-error');
            const btn = document.getElementById('auth-submit-btn');
            
            errorEl.classList.add('hidden');

            if (!email) {
                showAuthError("ERR: Valid email address required.");
                return;
            }

            if (!State.isLoginMode && !alias) {
                showAuthError("ERR: Criminal Alias is required for new nodes.");
                return;
            }

            currentAuthEmail = email;
            currentAuthAlias = alias;

            // Visual Processing State
            btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Processing...`;
            btn.disabled = true;

            try {
                // Send OTP Magic Link
                const { error } = await State.supabase.auth.signInWithOtp({
                    email: email,
                    options: {
                        shouldCreateUser: !State.isLoginMode
                    }
                });

                if (error) throw error;

                // Show OTP input screen
                document.getElementById('auth-form').classList.add('hidden-state');
                document.getElementById('auth-form').classList.remove('visible-state');
                
                setupOTPInputs();
                const otpScreen = document.getElementById('otp-screen');
                otpScreen.classList.remove('hidden-state');
                otpScreen.classList.add('visible-state');
                setTimeout(() => document.querySelector('.otp-input').focus(), 100);

            } catch (err) {
                console.error("Auth Fail:", err);
                showAuthError(`ERR: ${err.message || 'Transmission failed.'}`);
                btn.innerHTML = `Request Authentication Token <i data-lucide="cpu" class="w-4 h-4"></i>`;
                btn.disabled = false;
            }
        }

        function showAuthError(msg) {
            const err = document.getElementById('auth-error');
            err.textContent = msg;
            err.classList.remove('hidden');
            
            // Shake animation
            const form = document.getElementById('auth-form');
            form.style.transform = 'translateX(10px)';
            setTimeout(() => form.style.transform = 'translateX(-10px)', 100);
            setTimeout(() => form.style.transform = 'translateX(10px)', 200);
            setTimeout(() => form.style.transform = 'translateX(0)', 300);
        }

        async function handleLogout() {
            try {
                if (State.supabase) {
                    await State.supabase.auth.signOut();
                }
            } catch(e) { console.warn('SignOut error (non-critical):', e); }
            
            localStorage.removeItem('bm_local_user');
            State.user = null;
            State.profile = null;
            State.auctions = [];
            State.selectedItem = null;
            
            // Hide marketplace, show auth screen
            const app = document.getElementById('main-app');
            if (app) {
                app.classList.add('hidden-state');
                app.classList.remove('visible-state');
                setTimeout(() => {
                    showAuthScreen();
                }, 400);
            } else {
                window.location.reload();
            }
        }

        // ==========================================
        // APP NAVIGATION & BOOT
        // ==========================================
        function showAuthScreen() {
            const auth = document.getElementById('auth-screen');
            auth.classList.remove('hidden');
            setTimeout(() => {
                auth.classList.remove('hidden-state');
                auth.classList.add('visible-state');
                const form = document.getElementById('auth-form');
                form.classList.remove('opacity-0', 'hidden');
            }, 100);
        }

        function bootMainApp() {
            // Check if user is banned
            if (State.profile.is_banned) {
                document.body.innerHTML = `<div class='h-screen w-screen bg-black flex flex-col items-center justify-center text-red-500 font-mono p-8'><i data-lucide="skull" class="w-16 h-16 animate-pulse mb-6"></i><h1 class='text-4xl font-black uppercase tracking-tighter mb-4'>NODE TERMINATED</h1><p class='text-center text-sm max-w-md'>Your identity has been flagged and permanently banned from The Pit network due to malicious activity.</p></div>`;
                try{lucide.createIcons();}catch(e){}
                return;
            }

            // Update Sidebar details
            document.getElementById('sidebar-alias').textContent = State.profile.alias || 'Unknown';
            document.getElementById('sidebar-id').textContent = `ID: ${State.profile.id.substring(0,8)}...`;
            
            const bal = State.profile.balance !== undefined ? State.profile.balance : 10000;
            document.getElementById('sidebar-balance').textContent = `$${bal.toLocaleString()}`;
            
            const userDisplay = document.getElementById('user-display');
            if (userDisplay) userDisplay.textContent = State.profile.alias || 'Unknown';

            // Check Admin Status
            const isAdmin = State.profile.alias === 'Admin' || State.user?.email === 'abhinavdas2600@gmail.com' || localStorage.getItem('bm_is_admin') === 'true';
            if(isAdmin) {
                document.getElementById('admin-nav-section').classList.remove('hidden');
                document.getElementById('admin-nav-section').classList.add('block');
            }

            // Populate live ticker
            populateTicker();

            // Hide Auth, Show Main
            const auth = document.getElementById('auth-screen');
            auth.classList.remove('visible-state');
            auth.classList.add('fade-out');
            
            setTimeout(() => {
                auth.classList.add('hidden');
                
                const app = document.getElementById('main-app');
                app.classList.remove('hidden-state');
                app.classList.add('visible-state');
                
                // Load the data
                loadAuctionsData();
            }, 500);
        }

        let sidebarOpen = false;
        function toggleSidebar() {
            const sb = document.getElementById('sidebar');
            if (sidebarOpen) {
                sb.classList.remove('translate-x-0');
                sb.classList.add('-translate-x-full');
            } else {
                sb.classList.remove('-translate-x-full');
                sb.classList.add('translate-x-0');
            }
            sidebarOpen = !sidebarOpen;
        }

        // ==========================================
        // DATA FETCHING & REALTIME SUBSCRIPTION
        // ==========================================
        async function loadAuctionsData() {
            if (State.isFallbackMode) {
                // MOCK DATA SYSTEM
                const localData = localStorage.getItem('bm_mock_auctions');
                if (localData) {
                    State.auctions = JSON.parse(localData);
                } else {
                    State.auctions = generateMockData();
                    localStorage.setItem('bm_mock_auctions', JSON.stringify(State.auctions));
                }
                processAndRenderAuctions();
                return;
            }

            // REAL SUPABASE FETCH
            try {
                const { data, error } = await State.supabase.from('auctions').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                
                // Map snake_case to camelCase
                State.auctions = data.map(item => ({
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    imageUrl: item.image_url,
                    category: item.category || 'misc',
                    startingPrice: item.starting_price,
                    currentBid: item.current_bid,
                    highestBidderId: item.highest_bidder_id,
                    highestBidderName: item.highest_bidder_name,
                    sellerId: item.seller_id,
                    sellerName: item.seller_name,
                    status: item.status,
                    createdAt: item.created_at
                }));

                processAndRenderAuctions();

                // Start Realtime Listener
                State.supabase.channel('public:auctions')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions' }, payload => {
                        // Optimistic minimal update could go here, but re-fetching is safer for sync
                        softRefreshAuctions();
                    })
                    .subscribe();

            } catch (err) {
                console.error("Data fetch error — activating fallback:", err);
                // SILENT FAILOVER: Switch to local mode and load mock data
                activateFallback();
                const localData = localStorage.getItem('bm_mock_auctions');
                if (localData) {
                    State.auctions = JSON.parse(localData);
                } else {
                    State.auctions = generateMockData();
                    localStorage.setItem('bm_mock_auctions', JSON.stringify(State.auctions));
                }
                processAndRenderAuctions();
            }
        }

        // Lightweight re-fetch for realtime updates
        async function softRefreshAuctions() {
            if (State.isFallbackMode) return;
            const { data } = await State.supabase.from('auctions').select('*').order('created_at', { ascending: false });
            if (data) {
                State.auctions = data.map(item => ({
                    id: item.id, title: item.title, description: item.description, imageUrl: item.image_url,
                    category: item.category || 'misc',
                    startingPrice: item.starting_price, currentBid: item.current_bid,
                    highestBidderId: item.highest_bidder_id, highestBidderName: item.highest_bidder_name,
                    sellerId: item.seller_id, sellerName: item.seller_name, status: item.status, createdAt: item.created_at
                }));
                
                // If details modal is open, update it live
                if (State.selectedItem) {
                    const updatedItem = State.auctions.find(a => a.id === State.selectedItem.id);
                    if (updatedItem) {
                        State.selectedItem = updatedItem;
                        updateDetailsModalUI(); 
                    }
                }
                processAndRenderAuctions(true); // true = no skeleton loading flash
            }
        }

        function generateMockData() {
            return [
                { id: '1', title: 'Encrypted Hard Drive', description: 'Recovered from a sunken vessel off the coast of Iceland. 256-bit encryption intact. Contents unknown. High probability of lethality if tracked.', imageUrl: 'https://images.unsplash.com/photo-1597852074816-d933c7d2b988?auto=format&fit=crop&w=600&q=80', category: 'intel', startingPrice: 500, currentBid: 1200, highestBidderId: 'mock1', highestBidderName: 'Cipher_99', sellerId: 'mock2', sellerName: 'DeepWater', status: 'active', createdAt: new Date().toISOString() },
                { id: '2', title: 'Prototype Cyber-Optic', description: 'Military grade ocular implant. Missing the neural-link cable. Slight blood stains on the casing.', imageUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=600&q=80', category: 'cyber', startingPrice: 2000, currentBid: 2500, highestBidderId: null, highestBidderName: null, sellerId: 'mock3', sellerName: 'RipperDoc', status: 'active', createdAt: new Date().toISOString() },
                { id: '3', title: 'Classified Drone Core', description: 'Logic core from a downed surveillance drone. Memory banks partially wiped, but flight algorithms are intact.', imageUrl: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=600&q=80', category: 'weapon', startingPrice: 800, currentBid: 3200, highestBidderId: 'mock4', highestBidderName: 'SkyJack', sellerId: 'mock5', sellerName: 'Scavenger_Actual', status: 'sold', createdAt: new Date().toISOString() }
            ];
        }

        function getCategoryLabel(cat) {
            const map = { artifact: 'Artifact', cyber: 'Cyber', intel: 'Intel', weapon: 'Hazmat', misc: 'Unclassified' };
            return map[cat] || 'Unclassified';
        }

        function populateTicker() {
            const track = document.getElementById('ticker-track');
            if (!track) return;
            const messages = [
                { text: 'SECTOR-7 VOLATILE', value: '+14.2%', cls: 'ticker-up' },
                { text: 'NODE_44 CONNECTED', value: '', cls: 'ticker-neutral' },
                { text: 'BOUNTY FLUX', value: 'UNSTABLE', cls: 'ticker-down' },
                { text: 'CRYPTO_BRIDGE', value: 'ONLINE', cls: 'ticker-up' },
                { text: 'SECTOR-12 CRASH', value: '-8.7%', cls: 'ticker-down' },
                { text: 'NODE_91 DISCONNECTED', value: '', cls: 'ticker-down' },
                { text: 'ASSET LIQUIDITY', value: '+22.1%', cls: 'ticker-up' },
                { text: 'PROXY CHAIN', value: '7 NODES', cls: 'ticker-neutral' },
                { text: 'DARK POOL', value: 'SATURATED', cls: 'ticker-down' },
                { text: 'SECTOR-3 BULLISH', value: '+5.9%', cls: 'ticker-up' },
                { text: 'FIREWALL BREACH', value: 'LVL 4', cls: 'ticker-down' },
                { text: 'NODE_12 SYNCED', value: '', cls: 'ticker-neutral' },
                { text: 'MARKET CAP', value: '$4.2M', cls: 'ticker-up' },
                { text: 'SURVEILLANCE', value: 'EVADED', cls: 'ticker-up' },
            ];
            // Duplicate for seamless loop
            let html = '';
            for (let r = 0; r < 2; r++) {
                messages.forEach(m => {
                    html += `<span class="ticker-item"><span class="${m.cls}">▎${m.text}</span>${m.value ? `<span class="${m.cls} font-bold">${m.value}</span>` : ''}</span><span class="ticker-separator"></span>`;
                });
            }
            track.innerHTML = html;
        }

        // ==========================================
        // FILTERING & RENDERING
        // ==========================================
        function setFilter(type) {
            State.filter = type;
            
            // Update UI Sidebar styles
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.remove('bg-zinc-800', 'text-white', 'border-zinc-700');
                btn.classList.add('text-zinc-400', 'border-transparent');
            });
            const activeBtn = document.getElementById('nav-' + type);
            if (activeBtn) {
                activeBtn.classList.remove('text-zinc-400', 'border-transparent');
                activeBtn.classList.add('bg-zinc-800', 'text-white', 'border-zinc-700');
            }
            
            if(window.innerWidth < 768) toggleSidebar(); // auto close on mobile
            
            processAndRenderAuctions();
        }

        function processAndRenderAuctions(skipSkeletons = false) {
            const grid = document.getElementById('auction-grid');
            
            if (!skipSkeletons) {
                grid.innerHTML = `
                    <div class="glass-panel h-[420px] rounded-2xl animate-pulse"></div>
                    <div class="glass-panel h-[420px] rounded-2xl animate-pulse"></div>
                    <div class="glass-panel h-[420px] rounded-2xl animate-pulse"></div>
                `;
            }

            // 1. Apply Filters
            let filtered = State.auctions.filter(item => {
                if (State.filter === 'active') return item.status === 'active';
                if (State.filter === 'sold') return item.status === 'sold';
                if (State.filter === 'my_listings') return item.sellerId === State.profile.id;
                if (State.filter === 'my_bids') return item.highestBidderId === State.profile.id;
                return true; // 'all'
            });

            // 2. Apply Search
            if (State.searchQuery) {
                filtered = filtered.filter(item => 
                    item.title.toLowerCase().includes(State.searchQuery) || 
                    item.description.toLowerCase().includes(State.searchQuery)
                );
            }

            // 3. Sort: Active > Sold, then by highest bid
            filtered.sort((a, b) => {
                if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
                return b.currentBid - a.currentBid;
            });

            // Update Header Stats
            updateDashboardStats();

            // Render
            if (filtered.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full py-24 flex flex-col items-center justify-center text-zinc-600 glass-panel rounded-2xl border border-dashed border-zinc-700">
                        <i data-lucide="ghost" class="w-12 h-12 mb-4 opacity-30"></i>
                        <p class="text-xl font-mono font-bold text-zinc-500 mb-1 uppercase tracking-widest">No Intel Found</p>
                        <p class="text-xs font-mono">Adjust search parameters or inject new assets.</p>
                    </div>`;
                try { lucide.createIcons(); } catch(e){}
                return;
            }

            let html = '';
            filtered.forEach(item => {
                const isSeller = item.sellerId === State.profile.id;
                const isSold = item.status === 'sold';
                const iAmWinning = item.highestBidderId === State.profile.id;
                
                const imgUrl = item.imageUrl || "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&auto=format&fit=crop&q=80";
                const catLabel = getCategoryLabel(item.category);
                const catClass = 'cat-' + (item.category || 'misc');

                // Card Template
                html += `
                    <div onclick="openItemDetails('${item.id}')" class="glass-panel rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover-card relative h-[420px] group ${isSold ? 'opacity-60 border-zinc-800' : iAmWinning ? 'border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.1)]' : 'border-zinc-800'}">
                        
                        ${isSold ? `<div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-black/60 backdrop-blur-sm"><div class="border border-red-600 text-red-600 font-mono font-black text-2xl py-2 px-6 rounded uppercase tracking-widest bg-black/90 shadow-neon-red transform -rotate-12">LOCKED</div></div>` : ''}
                        
                        <!-- Badges -->
                        <div class="absolute top-4 left-4 right-4 z-20 flex justify-between items-center pointer-events-none">
                            <span class="bg-black/90 backdrop-blur-md px-2.5 py-1 rounded text-[9px] font-mono font-bold tracking-widest uppercase text-zinc-400 border border-zinc-700 flex items-center gap-1.5 shadow-lg">
                                <i data-lucide="${isSeller ? 'shield' : 'user'}" class="w-3 h-3 ${isSeller ? 'text-blue-400' : 'text-red-500'}"></i> 
                                ${isSeller ? 'Your Asset' : item.sellerName}
                            </span>
                            <span class="category-badge ${catClass}">${catLabel}</span>
                            ${iAmWinning && !isSold ? `<span class="bg-green-950/80 border border-green-500 text-green-400 px-2 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-widest shadow-neon-green animate-pulse">Winning</span>` : ''}
                        </div>

                        <!-- Image -->
                        <div class="h-48 w-full relative bg-marketBg shrink-0 flex items-center justify-center overflow-hidden border-b border-zinc-800 p-4">
                            <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40 z-10 pointer-events-none"></div>
                            <img src="${imgUrl}" class="w-full h-full object-contain opacity-80 z-0 group-hover:scale-110 spring-transition grayscale hover:grayscale-0 transition-all duration-500">
                        </div>

                        <!-- Data -->
                        <div class="p-5 flex-1 flex flex-col justify-between relative z-10 bg-gradient-to-b from-black to-marketPanel">
                            <div class="mb-2">
                                <h3 class="text-lg font-mono text-white font-bold leading-tight line-clamp-1 mb-1 uppercase tracking-tight group-hover:text-red-400 transition-colors">${item.title}</h3>
                                <p class="text-[10px] text-zinc-500 line-clamp-2 font-mono leading-relaxed pl-2 border-l border-zinc-700/50">>&nbsp;${item.description}</p>
                            </div>
                            
                            <div class="bg-marketBg rounded-lg p-3 border border-zinc-800/50 mt-auto flex-shrink-0 shadow-glass-inset">
                                <div class="flex justify-between items-end mb-1.5 overflow-hidden">
                                    <span class="text-[9px] uppercase tracking-widest font-mono font-bold text-zinc-600 shrink-0 mr-2">Bounty</span>
                                    <span class="bid-amount-auto text-lg font-mono font-bold ${isSold ? 'text-red-500' : 'text-green-400'} min-w-0" title="$${item.currentBid.toLocaleString()}">$${item.currentBid.toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between items-center text-[9px] pt-1.5 border-t border-zinc-900 font-mono uppercase tracking-wider mt-1">
                                    <span class="text-zinc-600 font-bold shrink-0">Top Node:</span>
                                    <span class="${iAmWinning ? 'text-green-500' : 'text-zinc-400'} truncate text-right pl-2">${item.highestBidderName || 'Awaiting Bids'}</span>
                                </div>
                                ${isSold ? `<div class="flex justify-between items-center text-[9px] pt-1 font-mono uppercase tracking-wider mt-0.5"><span class="text-zinc-600 font-bold shrink-0">Winner:</span><span class="text-red-400 truncate text-right pl-2">${item.highestBidderName || 'UNKNOWN'}</span></div>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });

            grid.innerHTML = html;
            try { lucide.createIcons(); } catch(e){}
        }

        function updateDashboardStats() {
            let volume = 0;
            let active = 0;
            let exposure = 0;

            State.auctions.forEach(item => {
                if(item.status === 'sold') volume += item.currentBid;
                if(item.status === 'active') active++;
                if(item.status === 'active' && item.highestBidderId === State.profile.id) {
                    exposure += item.currentBid;
                }
            });

            document.getElementById('stat-volume').textContent = `$${volume.toLocaleString()}`;
            document.getElementById('stat-active').textContent = active;
            document.getElementById('stat-exposure').textContent = `$${exposure.toLocaleString()}`;
        }

        // ==========================================
        // ITEM DETAILS MODAL SYSTEM
        // ==========================================
        function openItemDetails(id) {
            const item = State.auctions.find(a => a.id === id);
            if (!item) return;
            
            State.selectedItem = item;
            updateDetailsModalUI();
            loadComments(id);

            const modal = document.getElementById('details-modal');
            modal.classList.remove('hidden-state');
            modal.classList.add('visible-state');
        }

        function toggleDetailsModal(show) {
            const modal = document.getElementById('details-modal');
            if (show) {
                modal.classList.remove('hidden-state');
                modal.classList.add('visible-state');
            } else {
                modal.classList.remove('visible-state');
                modal.classList.add('hidden-state');
                State.selectedItem = null;
            }
        }

        function updateDetailsModalUI() {
            const item = State.selectedItem;
            if(!item) return;

            const isSeller = item.sellerId === State.profile.id;
            const isSold = item.status === 'sold';
            const hasBids = item.highestBidderId !== null;
            const iAmWinning = item.highestBidderId === State.profile.id;

            // Populate Text/Images
            document.getElementById('detail-id').textContent = item.id.split('-')[0] || item.id;
            
            // Category in details
            const detailCatEl = document.getElementById('detail-category');
            if (detailCatEl) {
                detailCatEl.className = 'category-badge cat-' + (item.category || 'misc');
                detailCatEl.textContent = getCategoryLabel(item.category);
            }
            
            const date = new Date(item.createdAt);
            document.getElementById('detail-time').textContent = isNaN(date.getTime()) ? "TIME UNKNOWN" : date.toLocaleDateString() + " " + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            document.getElementById('detail-title').textContent = item.title;
            document.getElementById('detail-desc').textContent = item.description;
            document.getElementById('detail-seller').textContent = isSeller ? 'YOU (LOCAL NODE)' : item.sellerName;
            document.getElementById('detail-price').textContent = `$${item.currentBid.toLocaleString()}`;
            document.getElementById('detail-winner').textContent = item.highestBidderName || 'AWAITING INPUT';
            
            const imgEl = document.getElementById('detail-image');
            imgEl.src = item.imageUrl || "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600";
            if(isSold) imgEl.classList.add('grayscale', 'opacity-50');
            else imgEl.classList.remove('grayscale', 'opacity-50');

            // Badge
            const badge = document.getElementById('detail-status-badge');
            if (isSold) {
                badge.className = "absolute top-6 left-6 z-30 px-3 py-1.5 rounded text-[10px] font-mono font-bold tracking-widest uppercase border backdrop-blur-md shadow-lg bg-red-900/80 border-red-500 text-white";
                badge.innerHTML = '<i data-lucide="lock" class="w-3 h-3 inline mr-1"></i> LOCKED (SOLD)';
            } else if (iAmWinning) {
                badge.className = "absolute top-6 left-6 z-30 px-3 py-1.5 rounded text-[10px] font-mono font-bold tracking-widest uppercase border backdrop-blur-md shadow-lg bg-green-900/80 border-green-500 text-green-400 animate-pulse";
                badge.innerHTML = '<i data-lucide="crosshair" class="w-3 h-3 inline mr-1"></i> WINNING TARGET';
            } else {
                badge.className = "absolute top-6 left-6 z-30 px-3 py-1.5 rounded text-[10px] font-mono font-bold tracking-widest uppercase border backdrop-blur-md shadow-lg bg-blue-900/80 border-blue-500 text-blue-400";
                badge.innerHTML = '<i data-lucide="radio" class="w-3 h-3 inline mr-1"></i> ACTIVE LISTING';
            }

            // Action Area Assembly
            const actionArea = document.getElementById('detail-action-area');
            let actionHtml = '';

            if (isSold) {
                actionHtml = `
                    <div class="w-full py-4 bg-red-950/30 border border-red-900 rounded-xl text-center flex flex-col items-center justify-center gap-2 text-red-500 font-mono">
                        <i data-lucide="shield-alert" class="w-6 h-6"></i>
                        <span class="text-xs uppercase tracking-widest font-bold">Asset Transfer Complete. Records Sealed.</span>
                    </div>
                `;
            } else if (isSeller) {
                actionHtml = `
                    <div class="flex flex-col gap-3">
                        <p class="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-center">You are the distributor of this asset.</p>
                        <button onclick="acceptBid('${item.id}')" ${!hasBids ? 'disabled' : ''} class="w-full py-4 rounded-xl font-mono font-bold text-sm transition-all uppercase tracking-widest flex items-center justify-center gap-2 ${hasBids ? 'bg-red-900 hover:bg-red-800 border border-red-500 text-white shadow-neon-red active:scale-95' : 'bg-black border border-zinc-800 text-zinc-600 cursor-not-allowed'}">
                            <i data-lucide="gavel" class="w-4 h-4"></i> ${hasBids ? 'Execute Sale & Erase Data' : 'Awaiting Bounties...'}
                        </button>
                    </div>
                `;
            } else {
                const minBid = item.currentBid + 1;
                const defaultBid = item.currentBid + Math.ceil(item.currentBid * 0.1); // suggest 10% higher
                actionHtml = `
                    <div class="flex flex-col gap-4 font-mono">
                        <div>
                            <label class="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 font-bold block">Submit Overbid</label>
                            <div class="relative">
                                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-green-500 font-bold">$</span>
                                <input type="number" id="detail-bid-input" min="${minBid}" step="1" value="${defaultBid}" class="w-full p-4 pl-8 bg-black border border-zinc-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 rounded-xl text-green-400 font-bold text-xl shadow-glass-inset transition-colors outline-none">
                            </div>
                        </div>
                        <button onclick="placeBid('${item.id}', ${item.currentBid}, true)" class="w-full bg-zinc-100 hover:bg-white text-black py-4 rounded-xl font-bold text-sm active:scale-95 transition-all uppercase tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.2)] flex justify-center items-center gap-2">
                            <i data-lucide="crosshair" class="w-4 h-4"></i> Lock Target Bid
                        </button>
                    </div>
                `;
            }

            // Admin Terminate Button
            const isAdmin = State.user && State.user.email === 'abhinavdas2600@gmail.com';
            if (isAdmin) {
                actionHtml += `
                    <div class="mt-4 pt-4 border-t border-red-900/50">
                        <button onclick="deleteAdminAsset('${item.id}')" class="w-full py-3 rounded-xl font-mono font-bold text-xs transition-all uppercase tracking-widest flex items-center justify-center gap-2 bg-red-950 hover:bg-red-900 border border-red-800 text-red-500 hover:text-white active:scale-95 shadow-neon-red">
                            <i data-lucide="trash-2" class="w-4 h-4"></i> Admin Terminate Asset
                        </button>
                    </div>
                `;
            }

            // Share button (always visible)
            actionHtml += `
                <div class="mt-4 pt-4 border-t border-zinc-800/50">
                    <button onclick="shareScreencard()" class="w-full py-3 rounded-xl font-mono font-bold text-xs transition-all uppercase tracking-widest flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-cyan-600 text-zinc-400 hover:text-cyan-400 active:scale-95">
                        <i data-lucide="share-2" class="w-4 h-4"></i> Share Intel Card
                    </button>
                </div>
            `;

            actionArea.innerHTML = actionHtml;
            try { lucide.createIcons(); } catch(e){}
        }

        // ==========================================
        // ADMIN OPERATIONS
        // ==========================================
        let currentAdminTab = 'users';

        function toggleAdminPanel(show) {
            const modal = document.getElementById('admin-modal');
            if (show) {
                // Fetch simulated user list
                if (State.isFallbackMode) {
                    document.getElementById('admin-user-list-container').classList.remove('hidden');
                    const localProfiles = [State.profile]; // In a real app we'd fetch all local users, but we only have 1 active here
                    const ul = document.getElementById('admin-user-list');
                    ul.innerHTML = localProfiles.map(p => `
                        <div class="flex justify-between items-center bg-zinc-900 border border-zinc-700 p-2 rounded">
                            <span class="text-xs text-white">${p.alias} <span class="text-zinc-500">(${p.id.substring(0,6)})</span></span>
                            <span class="text-xs text-green-400">$${p.balance?.toLocaleString() || 10000}</span>
                        </div>
                    `).join('');
                } else {
                    document.getElementById('admin-user-list-container').classList.add('hidden'); // We won't fetch all users in prod to save requests for this demo
                }
                modal.classList.remove('hidden-state');
                modal.classList.add('visible-state');
            } else {
                modal.classList.remove('visible-state');
                modal.classList.add('hidden-state');
            }
        }

        function switchAdminTab(tab) {
            currentAdminTab = tab;
            ['users', 'reports', 'system'].forEach(t => {
                const b = document.getElementById('tab-' + t);
                const c = document.getElementById('admin-tab-' + t);
                if (t === tab) {
                    b.classList.add('bg-red-900/40', 'text-red-400', 'border-red-900/50');
                    b.classList.remove('text-zinc-500', 'border-transparent', 'hover:bg-zinc-900');
                    c.classList.remove('hidden');
                } else {
                    b.classList.remove('bg-red-900/40', 'text-red-400', 'border-red-900/50');
                    b.classList.add('text-zinc-500', 'border-transparent', 'hover:bg-zinc-900');
                    c.classList.add('hidden');
                }
            });
        }

        async function adminAddBalance() {
            const aliasOrId = document.getElementById('admin-target-user').value.trim();
            const amount = parseFloat(document.getElementById('admin-target-amount').value);

            if (!aliasOrId || isNaN(amount) || amount <= 0) {
                showToast("ERR: Invalid target or amount.", "error");
                return;
            }

            try {
                // Production Supabase
                const { data: users, error: findErr } = await State.supabase
                    .from('profiles')
                    .select('*')
                    .or(`alias.eq.${aliasOrId},id.eq.${aliasOrId}`)
                    .limit(1);

                if (findErr || !users || users.length === 0) throw new Error("Node not found");
                
                const targetUser = users[0];
                const newBal = (targetUser.balance || 0) + amount;
                
                const { error: updateErr } = await State.supabase
                    .from('profiles')
                    .update({ balance: newBal })
                    .eq('id', targetUser.id);
                    
                if (updateErr) throw updateErr;

                showToast(`SUCCESS: $${amount.toLocaleString()} injected to ${targetUser.alias}.`);
                
                // If we updated ourselves, update UI
                if(targetUser.id === State.profile.id) {
                    State.profile.balance = newBal;
                    document.getElementById('sidebar-balance').textContent = `$${State.profile.balance.toLocaleString()}`;
                }
                toggleAdminPanel(false);
            } catch (err) {
                console.error("Admin balance error:", err);
                showToast("Admin Action Failed: " + err.message, "error");
            }
        }

        async function adminBanUser() {
            const alias = document.getElementById('admin-ban-user').value.trim();
            if (!alias) return;

            if (!confirm(`CRITICAL: Confirm permanent termination of node [${alias}]?`)) return;

            try {
                const { data: users, error: findErr } = await State.supabase
                    .from('profiles')
                    .select('id')
                    .eq('alias', alias)
                    .limit(1);

                if (findErr || !users || users.length === 0) throw new Error("Node not found");
                
                const { error: updateErr } = await State.supabase
                    .from('profiles')
                    .update({ is_banned: true })
                    .eq('id', users[0].id);
                    
                if (updateErr) throw updateErr;

                showToast(`Node ${alias} flagged for termination.`);
                if(users[0].id === State.profile.id) {
                    setTimeout(() => window.location.reload(), 1500);
                }
                document.getElementById('admin-ban-user').value = '';
            } catch (err) {
                showToast("Execute Ban Failed: " + err.message, "error");
            }
        }

        async function deleteAdminAsset(id) {
            if (!confirm("ADMIN PURGE: Are you sure you want to permanently delete this asset from the database?")) return;

            // Visual feedback handled by updateDetailsModalUI button re-render usually, but we could add inline here
            try {
                const { error } = await State.supabase.from('auctions').delete().eq('id', id);
                if (error) throw error;
                
                showToast("Admin Force Delete: Network Asset Terminated.", "success");
                toggleDetailsModal(false);
                softRefreshAuctions();
            } catch (err) {
                console.error("Delete failed:", err);
                showToast("Admin Action Failed: " + err.message, "error");
            }
        }

        // ==========================================
        // COMMENTS (SOCIAL FEATURES)
        // ==========================================
        function loadComments(itemId) {
            const listEl = document.getElementById('detail-comments-list');
            const countEl = document.getElementById('detail-comment-count');
            if(!listEl || !countEl) return;
            
            const commentsMap = JSON.parse(localStorage.getItem('bm_comments') || '{}');
            const itemComments = commentsMap[itemId] || [];
            
            countEl.textContent = itemComments.length;
            
            if (itemComments.length === 0) {
                listEl.innerHTML = `<p class="text-[10px] text-zinc-600 font-mono italic p-2 uppercase tracking-widest">No transmissions intercepted yet. Be the first.</p>`;
                return;
            }
            
            listEl.innerHTML = itemComments.map(c => `
                <div class="comment-item">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-mono font-bold text-red-400 capitalize">${c.authorAlias}</span>
                        <span class="text-[9px] text-zinc-600 font-mono">${new Date(c.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p class="text-xs text-zinc-300 font-mono leading-relaxed">${c.text.replace(/</g, "&lt;")}</p>
                </div>
            `).join('');
            
            listEl.scrollTop = listEl.scrollHeight;
        }

        function postComment() {
            if(!State.selectedItem) return;
            const inputEl = document.getElementById('new-comment-input');
            if(!inputEl) return;
            const text = inputEl.value.trim();
            if(!text) return;
            
            const itemId = State.selectedItem.id;
            const commentsMap = JSON.parse(localStorage.getItem('bm_comments') || '{}');
            if(!commentsMap[itemId]) commentsMap[itemId] = [];
            
            commentsMap[itemId].push({
                authorId: State.profile.id,
                authorAlias: State.profile.alias || 'Ghost',
                text: text,
                timestamp: new Date().toISOString()
            });
            
            localStorage.setItem('bm_comments', JSON.stringify(commentsMap));
            inputEl.value = '';
            inputEl.style.height = 'auto'; // reset height
            
            showToast("Transmission sent.");
            loadComments(itemId);
        }

        // Auto-expand textarea
        document.addEventListener('input', function (e) {
            if(e.target.id === 'new-comment-input') {
                e.target.style.height = 'auto';
                e.target.style.height = (e.target.scrollHeight) + 'px';
            }
        }, false);

        // ==========================================
        // AUCTION LOGIC (Bidding)
        // ==========================================

        // ==========================================
        // SHARE SCREENCARD GENERATOR
        // ==========================================
        async function shareScreencard() {
            const item = State.selectedItem;
            if (!item) return;

            const W = 600, H = 400;
            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');

            // Background gradient
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#0a0a0f');
            bg.addColorStop(0.5, '#111118');
            bg.addColorStop(1, '#0a0a0f');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);

            // Grid pattern overlay
            ctx.strokeStyle = 'rgba(255,255,255,0.02)';
            ctx.lineWidth = 1;
            for (let i = 0; i < W; i += 30) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
            for (let i = 0; i < H; i += 30) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke(); }

            // Top accent line
            const accent = ctx.createLinearGradient(0, 0, W, 0);
            accent.addColorStop(0, 'rgba(220,38,38,0)');
            accent.addColorStop(0.5, 'rgba(220,38,38,0.8)');
            accent.addColorStop(1, 'rgba(220,38,38,0)');
            ctx.fillStyle = accent;
            ctx.fillRect(0, 0, W, 3);

            // Brand badge
            ctx.fillStyle = '#dc2626';
            roundRect(ctx, 30, 25, 40, 22, 4); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
            ctx.fillText('BM', 39, 40);

            // Title "THE PIT"
            ctx.fillStyle = '#a1a1aa'; ctx.font = 'bold 10px monospace';
            ctx.fillText('THE INFINITE PIT', 80, 40);

            // Status badge
            const isSold = item.status === 'sold';
            ctx.fillStyle = isSold ? 'rgba(127,29,29,0.6)' : 'rgba(6,78,59,0.6)';
            roundRect(ctx, 430, 25, isSold ? 80 : 70, 22, 4); ctx.fill();
            ctx.fillStyle = isSold ? '#fca5a5' : '#86efac'; ctx.font = 'bold 9px monospace';
            ctx.fillText(isSold ? '⊘ SEALED' : '◉ ACTIVE', 440, 40);

            // Divider
            ctx.strokeStyle = 'rgba(63,63,70,0.5)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(30, 60); ctx.lineTo(W - 30, 60); ctx.stroke();

            // Item Title
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px monospace';
            const titleText = item.title.length > 22 ? item.title.substring(0, 22) + '...' : item.title;
            ctx.fillText(titleText.toUpperCase(), 30, 100);

            // Red accent bar under title
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(30, 112, 60, 3);

            // Description (truncated)
            ctx.fillStyle = '#a1a1aa'; ctx.font = '13px monospace';
            const descText = item.description.length > 70 ? '> ' + item.description.substring(0, 70) + '...' : '> ' + item.description;
            ctx.fillText(descText, 30, 145);

            // Category badge
            const catLabel = getCategoryLabel(item.category);
            ctx.fillStyle = 'rgba(245,158,11,0.15)';
            roundRect(ctx, 30, 165, ctx.measureText(catLabel).width + 20, 22, 4); ctx.fill();
            ctx.fillStyle = '#f59e0b'; ctx.font = 'bold 10px monospace';
            ctx.fillText(catLabel, 40, 180);

            // Price box
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.strokeStyle = 'rgba(63,63,70,0.5)'; ctx.lineWidth = 1;
            roundRect(ctx, 30, 210, W - 60, 80, 8); ctx.fill(); ctx.stroke();

            ctx.fillStyle = '#71717a'; ctx.font = 'bold 9px monospace';
            ctx.fillText('CURRENT BOUNTY', 50, 236);
            ctx.fillStyle = '#4ade80'; ctx.font = 'bold 36px monospace';
            ctx.fillText('$' + item.currentBid.toLocaleString(), 50, 275);

            ctx.fillStyle = '#71717a'; ctx.font = 'bold 9px monospace';
            ctx.fillText('TOP NODE', 380, 236);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace';
            const bidder = item.highestBidderName || 'NONE';
            ctx.fillText(bidder.length > 12 ? bidder.substring(0, 12) + '..' : bidder, 380, 258);

            ctx.fillStyle = '#71717a'; ctx.font = 'bold 9px monospace';
            ctx.fillText('SOURCE NODE', 380, 278);
            ctx.fillStyle = '#e4e4e7'; ctx.font = 'bold 11px monospace';
            ctx.fillText(item.sellerName || 'UNKNOWN', 380, 292);

            // Footer
            ctx.fillStyle = 'rgba(63,63,70,0.3)';
            ctx.fillRect(0, H - 50, W, 50);
            ctx.strokeStyle = 'rgba(63,63,70,0.5)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, H - 50); ctx.lineTo(W, H - 50); ctx.stroke();

            ctx.fillStyle = '#52525b'; ctx.font = '10px monospace';
            ctx.fillText('NONSENCE BLACK MARKET · THE INFINITE PIT', 30, H - 22);
            const ts = new Date().toLocaleString();
            ctx.fillText(ts, W - ctx.measureText(ts).width - 30, H - 22);

            // Bottom accent
            const bottomAccent = ctx.createLinearGradient(0, 0, W, 0);
            bottomAccent.addColorStop(0, 'rgba(6,182,212,0)');
            bottomAccent.addColorStop(0.5, 'rgba(6,182,212,0.6)');
            bottomAccent.addColorStop(1, 'rgba(6,182,212,0)');
            ctx.fillStyle = bottomAccent;
            ctx.fillRect(0, H - 2, W, 2);

            // Convert to blob and share/download
            canvas.toBlob(async (blob) => {
                const fileName = `BM_${item.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
                
                // Try native share if available
                if (navigator.share && navigator.canShare) {
                    try {
                        const file = new File([blob], fileName, { type: 'image/png' });
                        if (navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                title: `${item.title} - Black Market Intel`,
                                text: `Bounty: $${item.currentBid.toLocaleString()} | ${item.description.substring(0, 80)}`,
                                files: [file]
                            });
                            showToast('Intel shared via secure channel.');
                            return;
                        }
                    } catch(e) { if (e.name !== 'AbortError') console.warn('Share failed:', e); }
                }
                
                // Fallback: download the image
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = fileName;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Intel card downloaded. Distribute with caution.');
            }, 'image/png');
        }

        function roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }

        // ==========================================
        // DATA MUTATION (UPLOAD, BID, ACCEPT)
        // ==========================================

        // Advanced Image Uploader with Aggressive Compression
        function handleImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const uploadUI = document.getElementById('upload-ui');
            const processingUI = document.getElementById('upload-processing');
            const preview = document.getElementById('image-preview');
            const b64Input = document.getElementById('new-image-b64');
            
            // Show processing state
            uploadUI.classList.add('opacity-0');
            processingUI.classList.remove('hidden');
            setTimeout(() => processingUI.classList.remove('opacity-0'), 10);
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    // Heavy constraint to ensure base64 string fits standard DB text constraints perfectly
                    const MAX_WIDTH = 350; const MAX_HEIGHT = 350;
                    let width = img.width; let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                    } else {
                        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                    }
                    canvas.width = width; canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // High compression JPEG (0.4)
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.3); 
                    
                    b64Input.value = dataUrl;
                    preview.src = dataUrl;
                    
                    // Hide processing, show preview
                    processingUI.classList.add('opacity-0');
                    setTimeout(() => {
                        processingUI.classList.add('hidden');
                        preview.classList.remove('opacity-0');
                    }, 300);
                }
                img.src = e.target.result;
            }
            reader.readAsDataURL(file);
        }

        function toggleAddModal(show) {
            const modal = document.getElementById('add-modal');
            if (show) {
                modal.classList.remove('hidden-state');
                modal.classList.add('visible-state');
            } else {
                modal.classList.remove('visible-state');
                modal.classList.add('hidden-state');
            }
        }

        async function handleAuctionSubmit() {
            const title = document.getElementById('new-title').value.trim();
            const desc = document.getElementById('new-desc').value.trim();
            let image = document.getElementById('new-image-b64').value.trim();
            const price = parseFloat(document.getElementById('new-price').value);

            if (!title || !desc || isNaN(price) || price < 0) {
                showToast("ERR: Data payload incomplete or malformed.", "error");
                return;
            }

            if(!image) {
                // Procedurally generated dark placeholder to save space if no image is uploaded
                image = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3Ctext x='50%25' y='50%25' font-family='monospace' font-size='16' fill='%233f3f46' text-anchor='middle' dominant-baseline='middle'%3ECLASSIFIED VISUAL%3C/text%3E%3C/svg%3E`;
            }

            const category = document.getElementById('new-category').value;

            // Supabase-safe payload (no 'category' column in remote DB)
            const supabaseData = {
                title: title,
                description: desc,
                image_url: image,
                starting_price: price,
                current_bid: price,
                highest_bidder_id: null,
                highest_bidder_name: null,
                seller_id: State.profile.id,
                seller_name: State.profile.alias,
                status: 'active'
            };

            const btn = document.getElementById('submit-auction-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> INJECTING...`;
            btn.disabled = true;

            try {
                // REAL SUPABASE INSERT
                const { error } = await State.supabase.from('auctions').insert([supabaseData]);
                if (error) throw error;

                toggleAddModal(false);
                resetAddForm();
                showToast("Asset successfully injected into network.");

            } catch (err) {
                console.error("Injection error:", err);
                showToast("Injection Failed: " + err.message, "error");
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
                try { lucide.createIcons(); } catch(e){}
            }
        }

        function resetAddForm() {
            document.getElementById('new-title').value = '';
            document.getElementById('new-desc').value = '';
            document.getElementById('new-image-b64').value = '';
            document.getElementById('new-price').value = '';
            
            const preview = document.getElementById('image-preview');
            const ui = document.getElementById('upload-ui');
            preview.classList.add('opacity-0');
            preview.src = '';
            ui.classList.remove('opacity-0');
        }

        async function placeBid(itemId, currentBid, isFromDetails = false) {
            const inputId = isFromDetails ? 'detail-bid-input' : `bid-input-${itemId}`;
            const input = document.getElementById(inputId);
            if(!input) return;
            
            const bidAmount = parseFloat(input.value);

            // Calculate minimum increment: $1 or 5% of current bid, whichever is greater
            const minIncrement = Math.max(1, Math.ceil(currentBid * 0.05));
            const minBid = currentBid + minIncrement;

            if (isNaN(bidAmount) || bidAmount < minBid) {
                showToast(`ERR: Bounty must be at least $${minBid.toLocaleString()} (current + ${minIncrement}).`, "error");
                input.classList.add('ring-1', 'ring-red-500', 'border-red-500');
                // Shake the input
                input.style.transform = 'translateX(8px)';
                setTimeout(() => input.style.transform = 'translateX(-8px)', 80);
                setTimeout(() => input.style.transform = 'translateX(4px)', 160);
                setTimeout(() => { input.style.transform = ''; input.classList.remove('ring-1', 'ring-red-500', 'border-red-500'); }, 800);
                return;
            }

            // Check user balance
            if (State.profile.balance !== undefined && bidAmount > State.profile.balance) {
                showToast(`ERR: Insufficient funds. Your balance: $${State.profile.balance.toLocaleString()}.`, "error");
                return;
            }

            try {
                // Re-fetch latest bid from server to prevent race condition
                const { data: freshItem, error: fetchErr } = await State.supabase
                    .from('auctions')
                    .select('current_bid, status')
                    .eq('id', itemId)
                    .single();
                
                if (fetchErr) throw fetchErr;
                
                if (freshItem.status === 'sold') {
                    showToast("ERR: This asset has already been sold.", "error");
                    return;
                }
                
                if (bidAmount <= freshItem.current_bid) {
                    showToast(`ERR: Bid already surpassed. Current bounty is $${freshItem.current_bid.toLocaleString()}.`, "error");
                    if(isFromDetails) softRefreshAuctions();
                    return;
                }

                const { error } = await State.supabase
                    .from('auctions')
                    .update({
                        current_bid: bidAmount,
                        highest_bidder_id: State.profile.id,
                        highest_bidder_name: State.profile.alias
                    })
                    .eq('id', itemId);
                    
                if(error) throw error;
                
                // Deduct balance from DB
                const newBal = State.profile.balance - bidAmount;
                await State.supabase.from('profiles').update({ balance: newBal }).eq('id', State.profile.id).then();
                State.profile.balance = newBal;
                document.getElementById('sidebar-balance').textContent = `$${State.profile.balance.toLocaleString()}`;
                
                showToast("Bounty confirmed. Target locked. Balance updated.");
            } catch (err) {
                console.error("Bid error:", err);
                showToast("Bid Processing Failed: " + err.message, "error");
            }
        }

        async function acceptBid(itemId) {
            try {
                const { error } = await State.supabase
                    .from('auctions')
                    .update({ status: 'sold' })
                    .eq('id', itemId);
                    
                if(error) throw error;
                
                showToast("Execution complete. Asset sealed.");
            } catch (err) {
                console.error("Accept error:", err);
                showToast("Execution Failed: " + err.message, "error");
            }
        }

        // ==========================================
        // UTILITIES & VISUAL EFFECTS
        // ==========================================
        
        // ==========================================
        // SILENT FAILOVER HELPER
        // ==========================================
        function activateFallback() {
            if (State.isFallbackMode) return; // Already in fallback
            State.isFallbackMode = true;
            console.warn('⚠ FALLBACK ACTIVATED — All operations rerouted to localStorage.');
            showToast('DB Unreachable. Running in Local Simulation Mode.', 'error');
            
            // Update UI indicators
            try {
                const badge = document.getElementById('offline-badge');
                if (badge) badge.classList.remove('hidden');
                
                const connStatus = document.getElementById('connection-status');
                if (connStatus) {
                    connStatus.className = 'px-2 py-1 bg-amber-900/30 border border-amber-500/50 text-amber-400 text-[10px] rounded animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.3)] flex items-center gap-1';
                    connStatus.innerHTML = '<span class="w-1.5 h-1.5 bg-amber-400 rounded-full"></span> LOCAL CACHE';
                }
            } catch(e) {} // UI may not be ready yet
        }

        // Advanced Custom Toast System (Stacks multiple notifications)
        let toastQueue = [];
        let isToasting = false;

        function showToast(msg, type = "info") {
            const container = document.getElementById('toast-container');
            const el = document.createElement('div');
            el.className = `toast-message ${type === 'error' ? 'error' : ''}`;
            
            const icon = type === 'error' ? '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' 
                                          : '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
            
            el.innerHTML = `${icon} <span>${msg}</span>`;
            container.appendChild(el);
            
            // Trigger reflow for animation
            void el.offsetWidth;
            el.classList.add('show');

            setTimeout(() => {
                el.classList.remove('show');
                setTimeout(() => el.remove(), 400);
            }, 4000);
        }

        // Terminal Boot Sequence Animation
        async function playTerminalBootSequence() {
            const bootContainer = document.getElementById('boot-sequence');
            const bootText = document.getElementById('boot-text');
            
            const lines = [
                "INITIALIZING NEURAL LINK...",
                "LOADING ENCRYPTION PROTOCOLS [OK]",
                "BYPASSING ISP FIREWALLS [OK]",
                "ESTABLISHING CONNECTION TO 'THE PIT'...",
                "WARNING: UNREGISTERED SIGNATURE DETECTED.",
                "REROUTING THROUGH PROXY CHAIN...",
                "CONNECTION SECURE. WELCOME TO THE BLACK MARKET."
            ];

            for (let i = 0; i < lines.length; i++) {
                const lineObj = document.createElement('div');
                bootText.appendChild(lineObj);
                
                // Typing effect
                for(let char of lines[i]) {
                    lineObj.textContent += char;
                    await new Promise(r => setTimeout(r, 15)); // Typing speed
                }
                await new Promise(r => setTimeout(r, 200)); // Pause between lines
            }

            await new Promise(r => setTimeout(r, 600)); // Final pause

            // Fade out boot screen
            bootContainer.style.opacity = '0';
            setTimeout(() => {
                bootContainer.remove();
            }, 1000);
        }

        // Matrix Digital Rain Background
        function initMatrixBackground() {
            const canvas = document.getElementById('matrix-canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            
            // Matrix characters (Katakana + Latin + Digits)
            const katakana = 'アァカサタナハマヤャラワワヰヱヲンヴッヂヅヅヅツテトダヂヅデドバビブベボパピプペポ';
            const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const nums = '0123456789';
            const alphabet = katakana + latin + nums;
            
            const fontSize = 14;
            const columns = canvas.width / fontSize;
            const drops = [];
            for(let x = 0; x < columns; x++) drops[x] = 1;
            
            function draw() {
                // Translucent black background creates the trail effect
                ctx.fillStyle = 'rgba(3, 3, 3, 0.05)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.fillStyle = '#dc2626'; // Dark Red Hacker Rain
                ctx.font = fontSize + 'px monospace';
                
                for(let i = 0; i < drops.length; i++) {
                    const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
                    ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                    
                    if(drops[i] * fontSize > canvas.height && Math.random() > 0.975)
                        drops[i] = 0;
                    
                    drops[i]++;
                }
            }
            
            setInterval(draw, 30);
            
            window.addEventListener('resize', () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            });
        }

        // PWA & Device Integration Initialization
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            const installBtn = document.getElementById('install-app-btn');
            if (installBtn) {
                installBtn.classList.remove('hidden');
                installBtn.classList.add('flex');
                installBtn.addEventListener('click', async () => {
                    if (deferredPrompt) {
                        deferredPrompt.prompt();
                        const { outcome } = await deferredPrompt.userChoice;
                        if (outcome === 'accepted') {
                            console.log('User accepted the install prompt');
                        } else {
                            console.log('User dismissed the install prompt');
                        }
                        deferredPrompt = null;
                        installBtn.classList.add('hidden');
                        installBtn.classList.remove('flex');
                    }
                });
            }
        });

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker Registered!', reg.scope))
                .catch(err => console.error('Service Worker Registration Failed:', err));
            });
        }

        // ==========================================
        // UI & EFFECTS LOGIC
        // ==========================================
        const MEME_TAGLINES = [
            "Bro just one more bid trust me.", "Low bid = instant embarrassment.", "No guts, no bids.", "Skill issue if you lose.", "Auction but toxic.",
            "Blink and it’s gone.", "Outbid or get humbled.", "You hesitated. It’s mine now.", "That was your chance btw.", "Bro fumbled the bid 😭",
            "Wallet vs ego. Choose fast.", "You really gonna let that slide?", "One more bid won’t hurt (it will).", "Too slow. Try again.", "You watching or winning?",
            "If you lost, just say that.", "This ain’t for the weak.", "Second place is just first loser.", "You bid… and still lost?", "Pressure makes diamonds… or losers.",
            "Think fast. Bid faster.", "Calculated risk. Emotional damage.", "Strategic until you panic bid.", "Logic left the chat.", "Welcome to bad decisions."
        ];

        function initTaglineRotator() {
            const container = document.getElementById('meme-tagline-container');
            if(!container) return;
            
            setInterval(() => {
                const randomLine = MEME_TAGLINES[Math.floor(Math.random() * MEME_TAGLINES.length)];
                container.classList.remove('tagline-fade');
                void container.offsetWidth; // trigger reflow
                container.textContent = `"${randomLine}"`;
                container.classList.add('tagline-fade');
            }, 6000);
            
            // Initial load
            container.textContent = `"${MEME_TAGLINES[Math.floor(Math.random() * MEME_TAGLINES.length)]}"`;
        }

        function createRipple(event) {
            const button = event.currentTarget;
            const circle = document.createElement("span");
            const diameter = Math.max(button.clientWidth, button.clientHeight);
            const radius = diameter / 2;

            circle.style.width = circle.style.height = `${diameter}px`;
            
            // Adjust for button's bounding rect
            const rect = button.getBoundingClientRect();
            circle.style.left = `${event.clientX - rect.left - radius}px`;
            circle.style.top = `${event.clientY - rect.top - radius}px`;
            circle.classList.add("ripple");

            const ripple = button.getElementsByClassName("ripple")[0];
            if (ripple) ripple.remove();

            button.appendChild(circle);
        }

        function bindRipples() {
            const buttons = document.querySelectorAll('.ripple-btn, button:not(.no-ripple)');
            buttons.forEach(btn => {
                btn.classList.add('ripple-btn');
                btn.addEventListener('click', createRipple);
            });
        }

        // Catch dynamic elements for ripples
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if(mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if(node.nodeType === 1) { // Element node
                            if(node.tagName === 'BUTTON' && !node.classList.contains('no-ripple')) {
                                node.classList.add('ripple-btn');
                                node.addEventListener('click', createRipple);
                            }
                            const btns = node.querySelectorAll('button:not(.no-ripple)');
                            btns.forEach(btn => {
                                btn.classList.add('ripple-btn');
                                btn.addEventListener('click', createRipple);
                            });
                        }
                    });
                }
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Kick off the whole system
        document.addEventListener('DOMContentLoaded', () => {
            bootSystem();
            initTaglineRotator();
            bindRipples();
        });

    
