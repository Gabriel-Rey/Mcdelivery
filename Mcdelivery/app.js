/* ============================================
   McDELIVERY — LOCATION PAGE
   app.js
   ============================================ */

'use strict';

// ── CONFIG ────────────────────────────────
const DEFAULT_LAT  = 14.5995;
const DEFAULT_LNG  = 120.9842;
const DEFAULT_ZOOM = 12;
const NOMINATIM    = 'https://nominatim.openstreetmap.org';

// ── STATE ─────────────────────────────────
let state = {
  lat: DEFAULT_LAT,
  lng: DEFAULT_LNG,
  address: '',
  confirmed: false,
  debounceTimer: null,
};

// ── DOM REFS ──────────────────────────────
const addressInput     = document.getElementById('addressInput');
const autocomplete     = document.getElementById('autocomplete');
const locateBtn        = document.getElementById('locateBtn');
const confirmBtn       = document.getElementById('confirmBtn');
const statusDot        = document.getElementById('statusDot');
const statusText       = document.getElementById('statusText');
const selectedAddress  = document.getElementById('selectedAddress');
const selectedAddrText = document.getElementById('selectedAddressText');
const mapHint          = document.getElementById('mapHint');
const hamburger        = document.getElementById('hamburger');
const mobileMenu       = document.getElementById('mobileMenu');

// ── MAP SETUP ─────────────────────────────
const map = L.map('map', {
  center: [DEFAULT_LAT, DEFAULT_LNG],
  zoom: DEFAULT_ZOOM,
  zoomControl: true,
  attributionControl: true,
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

// Custom pin icon
const pinIcon = L.divIcon({
  className: '',
  iconSize:   [40, 52],
  iconAnchor: [20, 52],
  popupAnchor:[0, -52],
  html: `
    <div style="position:relative;width:40px;height:52px;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.28));">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="40" height="52">
        <path d="M20 0C8.954 0 0 8.954 0 20c0 13.255 20 32 20 32S40 33.255 40 20C40 8.954 31.046 0 20 0z" fill="#DA291C"/>
        <circle cx="20" cy="20" r="9" fill="white" opacity="0.95"/>
        <circle cx="20" cy="20" r="5" fill="#DA291C"/>
      </svg>
      <div style="
        position:absolute;
        bottom:-5px;left:50%;
        transform:translateX(-50%);
        width:12px;height:6px;
        background:rgba(0,0,0,0.15);
        border-radius:50%;
        filter:blur(2px);
      "></div>
    </div>
  `,
});

const marker = L.marker([DEFAULT_LAT, DEFAULT_LNG], {
  draggable: true,
  icon: pinIcon,
}).addTo(map);

// ── MAP EVENTS ────────────────────────────
marker.on('dragstart', () => {
  setStatus('loading', 'Moving pin…');
  hideMapHint();
});

marker.on('dragend', async () => {
  const pos = marker.getLatLng();
  state.lat = pos.lat;
  state.lng = pos.lng;
  await reverseGeocode(pos.lat, pos.lng);
  activateConfirm();
});

map.on('click', async (e) => {
  const { lat, lng } = e.latlng;
  state.lat = lat;
  state.lng = lng;
  marker.setLatLng([lat, lng]);
  setStatus('loading', 'Fetching address…');
  hideMapHint();
  await reverseGeocode(lat, lng);
  activateConfirm();
});

map.on('movestart', () => hideMapHint());

// ── SEARCH ────────────────────────────────
addressInput.addEventListener('input', () => {
  clearTimeout(state.debounceTimer);
  const q = addressInput.value.trim();

  if (q.length < 3) {
    closeAutocomplete();
    return;
  }

  state.debounceTimer = setTimeout(() => fetchSuggestions(q), 380);
});

addressInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAutocomplete();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#searchField') && !e.target.closest('#autocomplete')) {
    closeAutocomplete();
  }
});

async function fetchSuggestions(query) {
  try {
    const res = await fetch(
      `${NOMINATIM}/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=en&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    renderAutocomplete(data);
  } catch {
    closeAutocomplete();
  }
}

function renderAutocomplete(results) {
  if (!results.length) {
    closeAutocomplete();
    return;
  }

  autocomplete.innerHTML = results.map((r) => {
    const parts = r.display_name.split(', ');
    const name   = parts.slice(0, 2).join(', ');
    const detail = parts.slice(2).join(', ');
    return `
      <div class="autocomplete-item"
           data-lat="${r.lat}"
           data-lng="${r.lon}"
           data-name="${escapeHtml(r.display_name)}">
        <div class="autocomplete-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <div class="autocomplete-text">
          <div class="autocomplete-name">${escapeHtml(name)}</div>
          <div class="autocomplete-detail">${escapeHtml(detail)}</div>
        </div>
      </div>
    `;
  }).join('');

  autocomplete.classList.add('open');

  autocomplete.querySelectorAll('.autocomplete-item').forEach((el) => {
    el.addEventListener('click', () => {
      const lat  = parseFloat(el.dataset.lat);
      const lng  = parseFloat(el.dataset.lng);
      const name = el.dataset.name;

      state.lat     = lat;
      state.lng     = lng;
      state.address = name;

      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], 15, { animate: true, duration: 0.8 });
      addressInput.value = name;
      closeAutocomplete();
      setSelectedAddress(name);
      activateConfirm();
    });
  });
}

function closeAutocomplete() {
  autocomplete.classList.remove('open');
}

// ── REVERSE GEOCODE ───────────────────────
async function reverseGeocode(lat, lng) {
  setStatus('loading', 'Identifying address…');
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();

    if (data.display_name) {
      state.address      = data.display_name;
      addressInput.value = data.display_name;
      setSelectedAddress(data.display_name);
      setStatus('active', 'Location found — confirm when ready');
    }
  } catch {
    setStatus('', 'Could not fetch address. Try again.');
  }
}

// ── GPS LOCATE ────────────────────────────
locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('', 'Geolocation is not supported by your browser.');
    return;
  }

  locateBtn.classList.add('loading');
  setStatus('loading', 'Getting your location…');

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      state.lat = lat;
      state.lng = lng;

      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], 16, { animate: true, duration: 1 });

      await reverseGeocode(lat, lng);
      locateBtn.classList.remove('loading');
      activateConfirm();
      hideMapHint();
    },
    (err) => {
      locateBtn.classList.remove('loading');
      const msgs = {
        1: 'Location access denied. Please allow it in your browser settings.',
        2: 'Could not determine your position. Try again.',
        3: 'Location request timed out. Try again.',
      };
      setStatus('', msgs[err.code] || 'Location error.');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ── CONFIRM ───────────────────────────────
confirmBtn.addEventListener('click', () => {
  if (confirmBtn.disabled || !state.address) return;

  // Ripple
  confirmBtn.classList.add('rippling');
  setTimeout(() => confirmBtn.classList.remove('rippling'), 600);

  // Success state
  confirmBtn.classList.add('success');
  confirmBtn.querySelector('.confirm-btn-inner').innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M5 13l4 4L19 7"/>
    </svg>
    Location Confirmed!
  `;

  state.confirmed = true;
  setStatus('active', `Delivering to: ${truncate(state.address, 60)}`);

  // Transition to Step 2 after brief pause
  setTimeout(() => goToStep2(), 900);
});

// ── STEP 2 TRANSITION ─────────────────────
function goToStep2() {
  // Save address so menu.html can display it
  try {
    sessionStorage.setItem('mcAddress', state.address);
    localStorage.setItem('mcAddress', state.address);
  } catch(e) {}

  // Fade out, then redirect to menu page
  const mainEl = document.querySelector('.main');
  if (mainEl) {
    mainEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    mainEl.style.opacity = '0';
    mainEl.style.transform = 'translateY(-16px)';
  }

  setTimeout(() => {
    window.location.href = 'menu.html';
  }, 400);
}

// ── MENU SECTION LOGIC ────────────────────
function initMenuSection() {
  // Category filter
  const catBtns = document.querySelectorAll('.menu-cat');
  const cards   = document.querySelectorAll('.menu-card');

  catBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      catBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const cat = btn.dataset.cat;
      cards.forEach(card => {
        const show = cat === 'all' || card.dataset.cat === cat;
        card.style.display = show ? '' : 'none';
        if (show) {
          card.style.animation = 'none';
          card.offsetHeight; // reflow
          card.style.animation = '';
        }
      });
    });
  });

  // Add to cart
  let cart = { count: 0, total: 0 };
  window._cartItems = [];
  const prices = { 'Big Mac': 249, 'Quarter Pounder': 289, 'McDouble': 199,
    'McChicken': 179, 'Chicken McNuggets (6 pc)': 169, 'Hotcakes & Sausage': 149,
    'Egg McMuffin': 139, 'World Famous Fries': 99, 'Coca-Cola': 69,
    'McCafé Frappe': 159, 'Soft Serve Cone': 39, 'Apple Pie': 59,
    'Hamburger Happy Meal': 199 };

  const cartCount = document.getElementById('cartCount');
  const cartTotal = document.getElementById('cartTotal');
  const cartBar   = document.getElementById('cartBar');

  document.querySelectorAll('.menu-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.menu-card');
      const name = card.querySelector('.menu-card-name').textContent;
      const price = prices[name] || 0;

      cart.count++;
      cart.total += price;

      // Track items for order summary
      const existing = window._cartItems.find(i => i.name === name);
      if (existing) { existing.qty++; } else { window._cartItems.push({ name, price, qty: 1 }); }

      if (cartCount) cartCount.textContent = cart.count;
      if (cartTotal) cartTotal.textContent = `₱${cart.total.toLocaleString()}`;
      if (cartBar) cartBar.classList.add('visible');

      // Button feedback
      btn.classList.add('added');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>`;
      setTimeout(() => {
        btn.classList.remove('added');
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>`;
      }, 1000);
    });
  });

  // Cart bar → Step 3
  const cartBarBtn = document.getElementById('cartBarBtn');
  if (cartBarBtn) {
    cartBarBtn.addEventListener('click', () => {
      if (cart.count === 0) return;
      goToStep3(cart);
    });
  }
}

// ── STEP 3 TRANSITION ─────────────────────
function goToStep3(cart) {
  const menuSection = document.getElementById('menuSection');
  if (menuSection) {
    menuSection.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    menuSection.style.opacity = '0';
    menuSection.style.transform = 'translateY(-16px)';
  }

  setTimeout(() => {
    if (menuSection) menuSection.style.display = 'none';
    const orderSection = document.getElementById('orderSection');
    if (orderSection) {
      orderSection.classList.add('visible');
      orderSection.removeAttribute('aria-hidden');
      orderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    initOrderSection(cart);
  }, 400);
}

// ── ORDER SECTION LOGIC ───────────────────
function initOrderSection(cart) {
  const addrEl  = document.getElementById('orderDeliveryAddr');
  const addrEl2 = document.getElementById('orderAddrDisplay');
  const addrShort = truncate(state.address, 70);
  if (addrEl)  addrEl.textContent  = `Delivering to: ${addrShort}`;
  if (addrEl2) addrEl2.textContent = addrShort || '\u2014';

  const itemsList = document.getElementById('orderItemsList');
  const cartItems = window._cartItems || [];

  if (itemsList) {
    if (cartItems.length === 0) {
      itemsList.innerHTML = `<p style="color:var(--mid);font-size:14px;padding:8px 0;">No items tracked — see total below.</p>`;
    } else {
      itemsList.innerHTML = cartItems.map(item => `
        <div class="order-item-row">
          <div class="order-item-qty">${item.qty}\u00d7</div>
          <div class="order-item-name">${escapeHtml(item.name)}</div>
          <div class="order-item-price">\u20b1${(item.price * item.qty).toLocaleString()}</div>
        </div>
      `).join('');
    }
  }

  const subtotal    = cart.total;
  const deliveryFee = subtotal >= 500 ? 0 : 49;
  const serviceFee  = 15;
  const grandTotal  = subtotal + deliveryFee + serviceFee;
  let   finalTotal  = grandTotal;

  const subtotalEl   = document.getElementById('orderSubtotal');
  const deliveryEl   = document.getElementById('orderDeliveryFee');
  const grandTotalEl = document.getElementById('orderGrandTotal');
  if (subtotalEl)   subtotalEl.textContent   = `\u20b1${subtotal.toLocaleString()}`;
  if (deliveryEl)   deliveryEl.textContent   = deliveryFee === 0 ? 'Free' : `\u20b1${deliveryFee}`;
  if (grandTotalEl) grandTotalEl.textContent = `\u20b1${grandTotal.toLocaleString()}`;

  const promoInput    = document.getElementById('promoInput');
  const promoApplyBtn = document.getElementById('promoApplyBtn');
  const promoMsg      = document.getElementById('promoMsg');
  const VALID_PROMO   = 'MCDO20';
  let promoApplied    = false;

  if (promoApplyBtn) {
    promoApplyBtn.addEventListener('click', () => {
      if (promoApplied) return;
      const code = promoInput.value.trim().toUpperCase();
      if (code === VALID_PROMO) {
        promoApplied = true;
        const discount = Math.round(subtotal * 0.20);
        finalTotal = grandTotal - discount;
        if (grandTotalEl) grandTotalEl.textContent = `\u20b1${finalTotal.toLocaleString()}`;
        promoMsg.textContent = `\u2705 Code applied! \u20b1${discount} off.`;
        promoMsg.style.color = '#22C55E';
        promoApplyBtn.textContent = 'Applied!';
        promoApplyBtn.disabled = true;
        promoInput.disabled = true;
      } else if (!code) {
        promoMsg.textContent = 'Please enter a promo code.';
        promoMsg.style.color = '#EF4444';
      } else {
        promoMsg.textContent = 'Invalid code. Try MCDO20!';
        promoMsg.style.color = '#EF4444';
      }
    });
  }

  document.querySelectorAll('.order-payment-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.order-payment-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input[type=radio]').checked = true;
    });
  });

  const editBtn = document.getElementById('orderEditBtn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const orderSection = document.getElementById('orderSection');
      const menuSection  = document.getElementById('menuSection');
      if (orderSection) orderSection.style.display = 'none';
      if (menuSection) {
        menuSection.style.display   = '';
        menuSection.style.opacity   = '1';
        menuSection.style.transform = '';
        menuSection.classList.add('visible');
        menuSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  const placeBtn     = document.getElementById('placeOrderBtn');
  const contactName  = document.getElementById('contactName');
  const contactPhone = document.getElementById('contactPhone');
  const btnInner     = document.getElementById('placeOrderBtnInner');

  if (placeBtn) {
    placeBtn.addEventListener('click', () => {
      const name  = contactName  ? contactName.value.trim()  : '';
      const phone = contactPhone ? contactPhone.value.trim() : '';
      if (!name) {
        if (contactName) { contactName.focus(); contactName.style.borderColor = '#EF4444'; setTimeout(() => contactName.style.borderColor = '', 1500); }
        return;
      }
      if (phone.length < 9) {
        if (contactPhone) { contactPhone.focus(); contactPhone.style.borderColor = '#EF4444'; setTimeout(() => contactPhone.style.borderColor = '', 1500); }
        return;
      }
      placeBtn.classList.add('rippling');
      setTimeout(() => placeBtn.classList.remove('rippling'), 600);
      placeBtn.disabled = true;
      if (btnInner) btnInner.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><path d="M5 13l4 4L19 7"/></svg> Order Placed!`;
      placeBtn.style.background = '#22C55E';
      setTimeout(() => showOrderSuccess(), 700);
    });
  }
}

function showOrderSuccess() {
  const overlay = document.getElementById('orderSuccessOverlay');
  const idEl    = document.getElementById('orderSuccessId');
  if (idEl) idEl.textContent = 'MCD-' + Math.floor(100000 + Math.random() * 900000);
  if (overlay) {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  const closeBtn = document.getElementById('orderSuccessClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    });
  }
}

// ── MOBILE MENU ───────────────────────────
hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu.classList.toggle('open');
});

// ── HELPERS ───────────────────────────────
function activateConfirm() {
  confirmBtn.disabled = false;
  confirmBtn.removeAttribute('disabled');
}

function setStatus(type, message) {
  statusText.textContent = message;
  statusDot.className    = 'status-dot';
  if (type === 'active')   statusDot.classList.add('active');
  if (type === 'loading')  statusDot.classList.add('loading');
}

function setSelectedAddress(address) {
  selectedAddrText.textContent = truncate(address, 90);
  selectedAddress.classList.add('has-address');
}

function hideMapHint() {
  mapHint.classList.add('hidden');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── INIT ──────────────────────────────────
(function init() {
  setStatus('', 'Move the map or drag the pin to adjust your location');

  // Hide hint on map interaction
  map.on('drag',    hideMapHint);
  map.on('zoom',    hideMapHint);
  map.on('click',   hideMapHint);

  // Close mobile menu on link click
  mobileMenu.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
    });
  });

  // ── RESTORE CART FROM MENU PAGE ───────────
  // If the user came back from menu.html with a saved cart, skip straight to order section
  (function checkReturnFromMenu() {
    let savedCart;
    try { savedCart = JSON.parse(sessionStorage.getItem('mcCart')); } catch(e) {}
    if (!savedCart || !Object.keys(savedCart).length) return;

    // Restore saved address into state
    const savedAddr = sessionStorage.getItem('mcAddress') || localStorage.getItem('mcAddress') || '';
    state.address   = savedAddr;
    state.confirmed = true;

    // Build cart summary the order section expects
    const prices = {
      1:  249, 2:  289, 3:  199, 4:  179, 5:  169,
      6:  149, 7:  139, 8:  99,  9:  69,  10: 159,
      11: 39,  12: 59,  13: 199,
    };
    const names = {
      1: 'Big Mac', 2: 'Quarter Pounder', 3: 'McDouble',
      4: 'McChicken', 5: 'Chicken McNuggets (6 pc)',
      6: 'Hotcakes & Sausage', 7: 'Egg McMuffin',
      8: 'World Famous Fries', 9: 'Coca-Cola', 10: 'McCafé Frappe',
      11: 'Soft Serve Cone', 12: 'Apple Pie', 13: 'Hamburger Happy Meal',
    };

    let totalCount = 0;
    let totalPrice = 0;
    window._cartItems = [];

    Object.entries(savedCart).forEach(([idStr, qty]) => {
      const id    = parseInt(idStr);
      const price = prices[id] || 0;
      const name  = names[id]  || 'Item';
      if (qty > 0) {
        totalCount += qty;
        totalPrice += price * qty;
        window._cartItems.push({ name, price, qty });
      }
    });

    // Clear the saved cart so a page refresh doesn't re-trigger
    try { sessionStorage.removeItem('mcCart'); } catch(e) {}

    // Hide the location card and jump straight to the order section
    const mainEl = document.querySelector('.main');
    if (mainEl) mainEl.style.display = 'none';

    const menuSection = document.getElementById('menuSection');
    if (menuSection) menuSection.style.display = 'none';

    const orderSection = document.getElementById('orderSection');
    if (orderSection) {
      orderSection.classList.add('visible');
      orderSection.removeAttribute('aria-hidden');
      setTimeout(() => orderSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }

    initOrderSection({ count: totalCount, total: totalPrice });
  })();
})();
/* ══════════════════════════════════════════
   McDELIVERY — AUTH HELPERS
   ══════════════════════════════════════════ */

// ── Simple hash (not cryptographic, demo only) ──
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}

// ── User store (localStorage) ──
function getUsers() {
  try { return JSON.parse(localStorage.getItem('mcUsers') || '[]'); } catch { return []; }
}
function saveUsers(users) {
  try { localStorage.setItem('mcUsers', JSON.stringify(users)); } catch {}
}
function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('mcCurrentUser') || 'null'); } catch { return null; }
}
function saveCurrentUser(user) {
  try { localStorage.setItem('mcCurrentUser', user ? JSON.stringify(user) : 'null'); } catch {}
}

// ── Update navbar after login/logout ──
function updateNavAuth() {
  const user = getCurrentUser();
  const signupBtns = [
    document.getElementById('signupNavBtn'),
    document.getElementById('signupMobileBtn'),
  ];
  const loginBtns = [document.getElementById('loginNavBtn')];
  const logoutItem = document.getElementById('logoutNavItem');
  const userGreeting = document.getElementById('navUserGreeting');

  if (user) {
    signupBtns.forEach(b => { if (b) b.closest('li') && (b.closest('li').style.display = 'none'); });
    loginBtns.forEach(b => { if (b) b.closest('li') && (b.closest('li').style.display = 'none'); });
    if (userGreeting) {
      const avatarEl = document.getElementById('navAvatar');
      const greetingTextEl = document.getElementById('navGreetingText');
      if (avatarEl) avatarEl.textContent = (user.firstName[0] + (user.lastName ? user.lastName[0] : '')).toUpperCase();
      if (greetingTextEl) greetingTextEl.textContent = `Hi, ${user.firstName}!`;
      userGreeting.style.display = '';
    }
    if (logoutItem) logoutItem.style.display = '';
  } else {
    signupBtns.forEach(b => { if (b) b.closest('li') && (b.closest('li').style.display = ''); });
    loginBtns.forEach(b => { if (b) b.closest('li') && (b.closest('li').style.display = ''); });
    if (userGreeting) userGreeting.style.display = 'none';
    if (logoutItem) logoutItem.style.display = 'none';
  }
}

// ── Inject greeting + logout link into nav (once) ──
(function injectNavAuthUI() {
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return;

  // Greeting item (clickable → opens profile)
  if (!document.getElementById('navUserGreeting')) {
    const greetLi = document.createElement('li');
    greetLi.id = 'navGreetingItem';
    greetLi.innerHTML = `
      <a href="#" id="navUserGreeting" class="nav-user-greeting" style="display:none;">
        <span class="nav-avatar" id="navAvatar"></span>
        <span id="navGreetingText"></span>
      </a>`;
    navLinks.insertBefore(greetLi, navLinks.querySelector('.divider'));

    document.getElementById('navUserGreeting').addEventListener('click', (e) => {
      e.preventDefault();
      openProfileModal();
    });
  }

  // Logout item
  if (!document.getElementById('logoutNavItem')) {
    const logoutLi = document.createElement('li');
    logoutLi.id = 'logoutNavItem';
    logoutLi.style.display = 'none';
    logoutLi.innerHTML = `<a href="#" id="logoutNavBtn" class="nav-link-login">Log Out</a>`;
    navLinks.appendChild(logoutLi);
    document.getElementById('logoutNavBtn').addEventListener('click', (e) => {
      e.preventDefault();
      saveCurrentUser(null);
      updateNavAuth();
    });
  }

  updateNavAuth();
})();

/* ══════════════════════════════════════════
   McDELIVERY — SIGN UP
   ══════════════════════════════════════════ */
(function initSignup() {
  const submitBtn   = document.getElementById('signupSubmitBtn');
  if (!submitBtn) return;

  const firstNameEl = document.getElementById('suFirstName');
  const lastNameEl  = document.getElementById('suLastName');
  const emailEl     = document.getElementById('suEmail');
  const phoneEl     = document.getElementById('suPhone');
  const passwordEl  = document.getElementById('suPassword');
  const confirmEl   = document.getElementById('suConfirm');
  const chkData     = document.getElementById('suChkData');
  const chkTerms    = document.getElementById('suChkTerms');
  const emailErrEl  = document.getElementById('suEmailErr');
  const bars        = [
    document.getElementById('suBar1'),
    document.getElementById('suBar2'),
    document.getElementById('suBar3'),
    document.getElementById('suBar4'),
  ];
  const pwLabel = document.getElementById('suPwLabel');

  // ── Password toggle ──
  function makeToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const inp = document.getElementById(inputId);
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  }
  makeToggle('suPwToggle1', 'suPassword');
  makeToggle('suPwToggle2', 'suConfirm');

  // ── Password strength ──
  function scorePassword(pw) {
    let s = 0;
    if (pw.length >= 8)  s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(4, s);
  }

  passwordEl.addEventListener('input', () => {
    const val   = passwordEl.value;
    const score = val.length ? scorePassword(val) : 0;
    const labelMap = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const classMap = ['', 'weak', 'fair', 'strong', 'strong'];
    const colorMap = ['', '#EF4444', '#F59E0B', '#22C55E', '#22C55E'];
    bars.forEach((b, i) => {
      b.className = 'pw-bar';
      if (i < score) b.classList.add(classMap[score]);
    });
    pwLabel.textContent = val.length ? labelMap[score] : '';
    pwLabel.style.color = colorMap[score] || '';
    checkForm();
  });

  // ── Inline error helper ──
  function setFieldError(el, msg) {
    el.style.borderColor = msg ? '#EF4444' : '';
    // show message in sibling .lm-field-err if present
    const err = el.parentElement && el.parentElement.querySelector('.lm-field-err');
    if (err) { err.textContent = msg; err.style.display = msg ? 'block' : 'none'; }
  }

  // ── Form validation ──
  function checkForm() {
    const pwMatch = confirmEl.value === passwordEl.value;
    const ok = firstNameEl.value.trim() &&
               lastNameEl.value.trim()  &&
               emailEl.value.includes('@') &&
               phoneEl.value.trim().length >= 9 &&
               passwordEl.value.length >= 6 &&
               pwMatch &&
               chkData.checked &&
               chkTerms.checked;

    if (confirmEl.value.length > 0 && !pwMatch) {
      setFieldError(confirmEl, 'Passwords do not match.');
    } else {
      setFieldError(confirmEl, '');
    }

    submitBtn.disabled = !ok;
    submitBtn.classList.toggle('active', !!ok);
  }

  [firstNameEl, lastNameEl, emailEl, phoneEl, confirmEl].forEach(el =>
    el.addEventListener('input', checkForm)
  );
  [chkData, chkTerms, document.getElementById('suChkPromo')].forEach(el => {
    if (el) el.addEventListener('change', checkForm);
  });

  // ── Submit: register user ──
  submitBtn.addEventListener('click', () => {
    if (submitBtn.disabled) return;

    const email = emailEl.value.trim().toLowerCase();
    const users = getUsers();

    // Check duplicate email
    if (users.find(u => u.email === email)) {
      setFieldError(emailEl, 'An account with this email already exists.');
      emailEl.focus();
      return;
    }

    const newUser = {
      firstName : firstNameEl.value.trim(),
      lastName  : lastNameEl.value.trim(),
      email,
      phone     : phoneEl.value.trim(),
      pwHash    : simpleHash(passwordEl.value),
      promos    : document.getElementById('suChkPromo')?.checked || false,
      createdAt : Date.now(),
    };

    users.push(newUser);
    saveUsers(users);
    saveCurrentUser(newUser);
    updateNavAuth();

    // Success UI
    submitBtn.classList.add('success');
    submitBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
        <path d="M5 13l4 4L19 7"/>
      </svg>
      Account Created!
    `;

    // Close modal after brief celebration
    setTimeout(() => {
      const overlay = document.getElementById('signupModalOverlay');
      if (overlay) overlay.classList.remove('open');
      document.body.style.overflow = '';
    }, 1400);
  });
})();

/* ══════════════════════════════════════════
   McDELIVERY — LOGIN MODAL
   ══════════════════════════════════════════ */
(function initLoginModal() {
  const overlay    = document.getElementById('loginModalOverlay');
  const closeBtn   = document.getElementById('loginModalClose');
  const loginNavBtn= document.getElementById('loginNavBtn');
  const lmEmail    = document.getElementById('lmEmail');
  const lmPassword = document.getElementById('lmPassword');
  const lmLoginBtn = document.getElementById('lmLoginBtn');
  const lmPwToggle = document.getElementById('lmPwToggle');
  const lmGuestBtn = document.getElementById('lmGuestBtn');

  if (!overlay) return;

  // ── Inject error message element under the password field ──
  let lmErrMsg = document.getElementById('lmErrMsg');
  if (!lmErrMsg) {
    lmErrMsg = document.createElement('p');
    lmErrMsg.id = 'lmErrMsg';
    lmErrMsg.style.cssText = 'color:#EF4444;font-size:13px;margin:-4px 0 8px;display:none;';
    lmPassword.parentElement.insertAdjacentElement('afterend', lmErrMsg);
  }

  function showError(msg) {
    lmErrMsg.textContent = msg;
    lmErrMsg.style.display = msg ? 'block' : 'none';
    if (msg) {
      lmPassword.style.borderColor = '#EF4444';
      lmEmail.style.borderColor = '#EF4444';
    } else {
      lmPassword.style.borderColor = '';
      lmEmail.style.borderColor = '';
    }
  }

  function clearError() { showError(''); }

  function openModal() {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    clearError();
    setTimeout(() => lmEmail && lmEmail.focus(), 120);
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    clearError();
  }

  // Triggers
  if (loginNavBtn) {
    loginNavBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
  }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  // Password toggle
  if (lmPwToggle && lmPassword) {
    lmPwToggle.addEventListener('click', () => {
      lmPassword.type = lmPassword.type === 'password' ? 'text' : 'password';
    });
  }

  // Enable button when fields have input
  function checkLogin() {
    clearError();
    const ok = lmEmail.value.includes('@') && lmPassword.value.length >= 1;
    lmLoginBtn.disabled = !ok;
    lmLoginBtn.classList.toggle('active', !!ok);
  }
  lmEmail.addEventListener('input', checkLogin);
  lmPassword.addEventListener('input', checkLogin);

  // ── Submit: authenticate against stored users ──
  if (lmLoginBtn) {
    lmLoginBtn.addEventListener('click', () => {
      if (lmLoginBtn.disabled) return;

      const email  = lmEmail.value.trim().toLowerCase();
      const pwHash = simpleHash(lmPassword.value);
      const users  = getUsers();
      const user   = users.find(u => u.email === email && u.pwHash === pwHash);

      if (!user) {
        showError('Incorrect email or password. Please try again.');
        lmPassword.focus();
        return;
      }

      // Success
      clearError();
      saveCurrentUser(user);
      updateNavAuth();

      lmLoginBtn.classList.add('success');
      lmLoginBtn.textContent = `Welcome back, ${user.firstName}!`;

      setTimeout(closeModal, 1300);
    });
  }

  // Guest
  if (lmGuestBtn) {
    lmGuestBtn.addEventListener('click', closeModal);
  }
})();
/* ══════════════════════════════════════════
   McDELIVERY — PROFILE MODAL
   ══════════════════════════════════════════ */

function openProfileModal() {
  const user = getCurrentUser();
  if (!user) return;

  // Populate fields
  const el = (id) => document.getElementById(id);
  if (el('profileFirstName'))  el('profileFirstName').value  = user.firstName  || '';
  if (el('profileLastName'))   el('profileLastName').value   = user.lastName   || '';
  if (el('profileEmail'))      el('profileEmail').value      = user.email      || '';
  if (el('profilePhone'))      el('profilePhone').value      = user.phone      || '';
  if (el('profileAvatarBig'))  el('profileAvatarBig').textContent =
    (user.firstName[0] + (user.lastName ? user.lastName[0] : '')).toUpperCase();
  if (el('profileDisplayName')) el('profileDisplayName').textContent =
    `${user.firstName} ${user.lastName}`;
  if (el('profileDisplayEmail')) el('profileDisplayEmail').textContent = user.email;

  // Member since
  if (el('profileMemberSince') && user.createdAt) {
    el('profileMemberSince').textContent = new Date(user.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Reset save button
  const saveBtn = el('profileSaveBtn');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.classList.remove('success'); saveBtn.innerHTML = 'Save Changes'; }

  const overlay = el('profileModalOverlay');
  if (overlay) { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closeProfileModal() {
  const overlay = document.getElementById('profileModalOverlay');
  if (overlay) { overlay.classList.remove('open'); document.body.style.overflow = ''; }
}

(function initProfileModal() {
  const overlay  = document.getElementById('profileModalOverlay');
  if (!overlay) return;

  const closeBtn  = document.getElementById('profileModalClose');
  const saveBtn   = document.getElementById('profileSaveBtn');
  const pwOldEl   = document.getElementById('profilePwOld');
  const pwNewEl   = document.getElementById('profilePwNew');
  const pwSaveBtn = document.getElementById('profilePwSaveBtn');
  const pwMsg     = document.getElementById('profilePwMsg');

  if (closeBtn) closeBtn.addEventListener('click', closeProfileModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProfileModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeProfileModal();
  });

  // Tab switching
  document.querySelectorAll('.profile-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.profile-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById('profileTab_' + btn.dataset.tab);
      if (pane) pane.classList.add('active');
    });
  });

  // Save profile info
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const user = getCurrentUser();
      if (!user) return;

      const fn = document.getElementById('profileFirstName')?.value.trim();
      const ln = document.getElementById('profileLastName')?.value.trim();
      const ph = document.getElementById('profilePhone')?.value.trim();

      if (!fn || !ln) {
        alert('First and last name are required.');
        return;
      }

      user.firstName = fn;
      user.lastName  = ln;
      user.phone     = ph;

      // Update in users array
      const users = getUsers();
      const idx   = users.findIndex(u => u.email === user.email);
      if (idx !== -1) users[idx] = user;
      saveUsers(users);
      saveCurrentUser(user);
      updateNavAuth();

      // Update display in modal
      document.getElementById('profileDisplayName').textContent = `${fn} ${ln}`;
      document.getElementById('profileAvatarBig').textContent = (fn[0] + ln[0]).toUpperCase();

      saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M5 13l4 4L19 7"/></svg> Saved!`;
      saveBtn.classList.add('success');
      saveBtn.disabled = true;
      setTimeout(() => { saveBtn.innerHTML = 'Save Changes'; saveBtn.classList.remove('success'); saveBtn.disabled = false; }, 2200);
    });
  }

  // Change password
  if (pwSaveBtn) {
    pwSaveBtn.addEventListener('click', () => {
      const user = getCurrentUser();
      if (!user) return;

      const oldVal = pwOldEl?.value || '';
      const newVal = pwNewEl?.value || '';

      if (simpleHash(oldVal) !== user.pwHash) {
        pwMsg.textContent = 'Current password is incorrect.';
        pwMsg.style.color = '#EF4444';
        return;
      }
      if (newVal.length < 6) {
        pwMsg.textContent = 'New password must be at least 6 characters.';
        pwMsg.style.color = '#EF4444';
        return;
      }

      user.pwHash = simpleHash(newVal);
      const users = getUsers();
      const idx   = users.findIndex(u => u.email === user.email);
      if (idx !== -1) users[idx] = user;
      saveUsers(users);
      saveCurrentUser(user);

      pwMsg.textContent = '✅ Password updated successfully!';
      pwMsg.style.color = '#22C55E';
      if (pwOldEl) pwOldEl.value = '';
      if (pwNewEl) pwNewEl.value = '';
      setTimeout(() => { pwMsg.textContent = ''; }, 3000);
    });
  }

  // Password toggles inside profile
  ['profilePwOldToggle', 'profilePwNewToggle'].forEach((btnId, i) => {
    const btn = document.getElementById(btnId);
    const inp = i === 0 ? pwOldEl : pwNewEl;
    if (btn && inp) btn.addEventListener('click', () => {
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  });
})();