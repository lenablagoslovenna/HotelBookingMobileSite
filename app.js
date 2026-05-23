// =============================================
//  SANCTUARY STAY — App Logic + API Integration
// =============================================

const API_BASE = 'https://hotelbookingapi-production-437c.up.railway.app';

let authToken    = null;
let currentUser  = null;
let allHotels    = [];
let selectedHotel = null;

const AVATAR_URL = 'https://vvrxgzxuolhnpqlerixf.supabase.co/storage/v1/object/public/hotel-images/profile.png';

const history_stack = [];

const TAB_MAP = {
  'page-explore':   0,
  'page-map':       0,
  'page-hotel':     0,
  'page-search':    0,
  'page-filters':   0,
  'page-bookings':  1,
  'page-payment':   1,
  'page-addcard':   1,
  'page-favorites': 2,
  'page-profile':   3,
};

function syncTabBar(pageId) {
  const tabIndex = TAB_MAP[pageId] ?? -1;
  if (tabIndex === -1) return;
  const activePage = document.getElementById(pageId);
  const tabBar = activePage?.querySelector('.tab-bar');
  if (!tabBar) return;
  tabBar.querySelectorAll('.tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === tabIndex);
  });
}

function navigate(pageId) {
  const current = document.querySelector('.page.active');
  if (current) {
    history_stack.push(current.id);
    current.classList.remove('active');
  }
  const target = document.getElementById(pageId);
  if (target) target.classList.add('active');
  const scroll = target?.querySelector('.page-scroll, .auth-container, .filters-container');
  if (scroll) scroll.scrollTop = 0;

  syncTabBar(pageId);

  if (pageId === 'page-explore')   loadHotels();
  if (pageId === 'page-bookings')  loadBookings();
  if (pageId === 'page-profile')   loadProfile();
  if (pageId === 'page-search')    loadSearchHotels();
  if (pageId === 'page-favorites') renderFavorites();
  if (pageId === 'page-payment')   renderPaymentPage();
}

window.history.go = function(n) {
  if (n === -1 && history_stack.length > 0) {
    const prev = history_stack.pop();
    const current = document.querySelector('.page.active');
    if (current) current.classList.remove('active');
    const target = document.getElementById(prev);
    if (target) target.classList.add('active');
    syncTabBar(prev);
  }
};

function setTab(btn, pageId) {
  const tabBar = btn.closest('.tab-bar');
  tabBar?.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  navigate(pageId);
}

function showError(msg) {
  alert('❌ ' + msg);
}

function showSuccess(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#22c55e;color:white;padding:10px 20px;border-radius:20px;z-index:9999;font-weight:600;font-size:14px';
  toast.textContent = '✓ ' + msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function showLoading(containerId, msg = 'Загрузка...') {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<div style="text-align:center;padding:40px;color:#9ca3af;">${msg}</div>`;
}

function saveToken(token, user) {
  authToken   = token;
  currentUser = user;
  localStorage.setItem('ss_token', token);
  localStorage.setItem('ss_user',  JSON.stringify(user));
}

function loadSavedToken() {
  const t = localStorage.getItem('ss_token');
  const u = localStorage.getItem('ss_user');
  if (t && u) {
    authToken   = t;
    currentUser = JSON.parse(u);
    return true;
  }
  return false;
}

function logout() {
  authToken   = null;
  currentUser = null;
  localStorage.removeItem('ss_token');
  localStorage.removeItem('ss_user');
  navigate('page-login');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };
}

// ── РЕГИСТРАЦИЯ ───────────────────────────────
async function doRegister() {
  const fullName = document.getElementById('reg-fullname')?.value.trim() || '';
  const email    = document.getElementById('reg-email')?.value.trim() || '';
  const password = document.getElementById('reg-pass')?.value || '';

  if (!fullName) { showError('Введите полное имя'); return; }
  if (!email || !email.includes('@')) { showError('Введите корректный email'); return; }
  if (!password || password.length < 8) { showError('Пароль должен быть не менее 8 символов'); return; }

  const termsCheck = document.getElementById('terms-check');
  if (termsCheck && !termsCheck.checked) {
    const wrap = termsCheck.closest('.checkbox-wrap');
    if (wrap) {
      wrap.classList.add('checkbox-error');
      setTimeout(() => wrap.classList.remove('checkbox-error'), 2500);
    }
    return;
  }

  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || fullName;
  const lastName  = nameParts.slice(1).join(' ') || 'User';
  const username  = email.split('@')[0] + '_' + Date.now().toString().slice(-4);

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName, lastName,
        idnp: '0000000000000',
        email, phone: '000000000',
        username, password
      })
    });

    if (res.ok) {
      const data = await res.json();
      saveToken(data.token, { guestId: data.guestId, firstName, lastName, email });
      showSuccess('Аккаунт создан!');
      navigate('page-explore');
    } else {
      const err = await res.json();
      showError(err.message || 'Ошибка регистрации');
    }
  } catch (e) {
    showError('Нет соединения с сервером: ' + e.message);
  }
}

// ── ЛОГИН ─────────────────────────────────────
async function doLogin() {
  const emailInput = document.getElementById('login-identifier');
  const passInput  = document.getElementById('login-pass');

  const email    = emailInput?.value.trim() || '';
  const password = passInput?.value || '';

  if (!email || !email.includes('@')) {
    showError('Введите корректный email адрес'); return;
  }
  if (!password) {
    showError('Введите пароль'); return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email, password })
    });

    if (res.ok) {
      const data = await res.json();
      saveToken(data.token, {
        guestId:   data.guestId,
        firstName: data.firstName,
        lastName:  data.lastName,
        email:     data.email
      });
      showSuccess('Добро пожаловать, ' + data.firstName + '!');
      navigate('page-explore');
    } else {
      showError('Неверный email или пароль');
    }
  } catch (e) {
    showError('Нет соединения с сервером. Убедитесь что API запущен.');
  }
}

// ── ВОССТАНОВЛЕНИЕ ПАРОЛЯ ─────────────────────
let _otpTimerInterval = null;
let _generatedOtp     = null;
let _forgotContact    = null;

function doSendCode() {
  const contact = document.getElementById('forgot-contact')?.value.trim() || '';
  if (!contact) { showError('Введите email или номер телефона'); return; }

  const isEmail = contact.includes('@');
  const isPhone = /^\+?\d{7,15}$/.test(contact.replace(/\s/g, ''));
  if (!isEmail && !isPhone) {
    showError('Введите корректный email или номер телефона');
    return;
  }

  _forgotContact = contact;
  _generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

  const subtitle = document.getElementById('verify-subtitle');
  if (subtitle) {
    const masked = isEmail
      ? contact.replace(/(.{2}).+(@.+)/, '$1***$2')
      : contact.slice(0, -4).replace(/./g, '•') + contact.slice(-4);
    subtitle.textContent = `We sent a 6-digit code to ${masked}`;
  }

  for (let i = 0; i < 6; i++) {
    const inp = document.getElementById('otp' + i);
    if (inp) { inp.value = ''; inp.classList.remove('filled'); }
  }

  navigate('page-verify');
  startOtpTimer();

  console.log('%c[DEV] Verification code: ' + _generatedOtp, 'color:#1a56db;font-weight:bold;font-size:16px');
  showSuccess(`Код отправлен на ${contact}`);
}

function startOtpTimer(seconds = 120) {
  clearInterval(_otpTimerInterval);
  const resendBtn   = document.getElementById('resend-btn');
  const countdown   = document.getElementById('otp-countdown');
  if (resendBtn) resendBtn.disabled = true;
  let remaining = seconds;
  _otpTimerInterval = setInterval(() => {
    remaining--;
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    if (countdown) countdown.textContent = `${m}:${s}`;
    if (remaining <= 0) {
      clearInterval(_otpTimerInterval);
      if (resendBtn) resendBtn.disabled = false;
      if (countdown) countdown.textContent = '00:00';
    }
  }, 1000);
}

function otpNext(input, idx) {
  input.value = input.value.replace(/\D/g, '').slice(0, 1);
  input.classList.toggle('filled', input.value !== '');
  input.classList.remove('error');
  if (input.value && idx < 5) {
    document.getElementById('otp' + (idx + 1))?.focus();
  }
}

function otpBackspace(e, idx) {
  if (e.key === 'Backspace') {
    const cur = document.getElementById('otp' + idx);
    if (cur && cur.value === '' && idx > 0) {
      const prev = document.getElementById('otp' + (idx - 1));
      if (prev) { prev.value = ''; prev.classList.remove('filled'); prev.focus(); }
    }
  }
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Backspace' && e.target.classList.contains('otp-input')) {
    const idx = parseInt(e.target.id.replace('otp', ''));
    if (e.target.value === '' && idx > 0) {
      const prev = document.getElementById('otp' + (idx - 1));
      if (prev) { prev.value = ''; prev.classList.remove('filled'); prev.focus(); }
    }
  }
});

function getOtpValue() {
  let code = '';
  for (let i = 0; i < 6; i++) code += document.getElementById('otp' + i)?.value || '';
  return code;
}

function doVerifyCode() {
  const code = getOtpValue();
  if (code.length !== 6) { showError('Введите все 6 цифр кода'); return; }
  if (code !== _generatedOtp) {
    showError('Неверный код. Попробуйте снова.');
    for (let i = 0; i < 6; i++) {
      const inp = document.getElementById('otp' + i);
      if (inp) { inp.classList.add('error'); inp.classList.remove('filled'); }
    }
    setTimeout(() => {
      for (let i = 0; i < 6; i++) {
        const inp = document.getElementById('otp' + i);
        if (inp) inp.classList.remove('error');
      }
    }, 900);
    return;
  }
  clearInterval(_otpTimerInterval);
  showSuccess('Код подтверждён!');
  navigate('page-newpass');
}

function doResendCode() {
  if (!_forgotContact) return;
  _generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('%c[DEV] New verification code: ' + _generatedOtp, 'color:#1a56db;font-weight:bold;font-size:16px');
  startOtpTimer();
  showSuccess('Новый код отправлен!');
}

function doResetPassword() {
  const p1 = document.getElementById('newpass1')?.value || '';
  const p2 = document.getElementById('newpass2')?.value || '';
  if (p1.length < 8) { showError('Пароль должен быть не менее 8 символов'); return; }
  if (p1 !== p2) { showError('Пароли не совпадают'); return; }
  showSuccess('Пароль успешно изменён!');
  setTimeout(() => navigate('page-login'), 1200);
}

// ── ЗАГРУЗКА ОТЕЛЕЙ (Explore) ─────────────────
async function loadHotels() {
  try {
    const res  = await fetch(`${API_BASE}/api/hotels`);
    const data = await res.json();
    allHotels  = data;
    renderHotelsExplore(data);
  } catch (e) {
    console.error('Не удалось загрузить отели:', e);
  }
}

function renderHotelsExplore(hotels) {
  const container = document.querySelector('#page-explore .page-scroll');
  if (!container) return;

  container.querySelectorAll('.hotel-card-big').forEach(c => c.remove());

  hotels.slice(0, 5).forEach(h => {
    const card = document.createElement('div');
    card.className = 'hotel-card-big';
    card.onclick = () => openHotelDetail(h);
    card.innerHTML = `
      <div class="hotel-card-img hotel-bg-${h.hotelId}" style="background:linear-gradient(180deg,rgba(0,0,0,0.1) 0%,rgba(0,0,0,0.5) 100%) center/cover no-repeat">
        <button class="fav-btn" data-hotel-id="${h.hotelId}">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        </button>
      </div>
      <div class="hotel-card-info">
        <div class="hotel-card-row">
          <div>
            <h3 class="hotel-name">${h.nazvanie || h.name}</h3>
            <p class="hotel-location">${(h.adres || h.address || '').trim()}</p>
            <p class="hotel-review"><span class="review-good">Rating</span> • ★ ${h.rating}</p>
          </div>
          <div class="hotel-score">${h.rating}</div>
        </div>
        <div class="hotel-price-row">
          <span class="nights-label">per night</span>
          <div class="price-block">
            <span class="new-price">$${h.priceStandard || h.price_standard} — $${h.priceLux || h.price_lux}</span>
          </div>
        </div>
      </div>`;
    container.appendChild(card);
    const bgEl = card.querySelector(`.hotel-bg-${h.hotelId}`);
    if (bgEl) setHotelBg(bgEl, h.nazvanie || h.name);
  });

  bindFavButtons();
}

// ── ЗАГРУЗКА ОТЕЛЕЙ (Search) ──────────────────
async function loadSearchHotels(query = '') {
  const container = document.querySelector('#page-search .hotel-list');
  if (!container) return;

  if (allHotels.length === 0) {
    try {
      const res = await fetch(`${API_BASE}/api/hotels`);
      allHotels = await res.json();
    } catch (e) { return; }
  }

  const filtered = query
    ? allHotels.filter(h =>
        (h.nazvanie || h.name || '').toLowerCase().includes(query.toLowerCase()) ||
        (h.adres || h.address || '').toLowerCase().includes(query.toLowerCase()))
    : allHotels;

  const count = document.querySelector('.results-count');
  if (count) count.textContent = `Found ${filtered.length} stays`;

  container.innerHTML = '';
  filtered.forEach(h => {
    const hotelName = h.nazvanie || h.name;
    const hotelAddr = (h.adres || h.address || '').trim();
    const item = document.createElement('div');
    item.className = 'hotel-list-item';
    item.onclick = () => openHotelDetail(h);
    item.innerHTML = `
      <div class="list-img hotel-search-bg-${h.hotelId}" style="background: center/cover no-repeat">
        <span class="star-badge">★ ${h.rating}</span>
      </div>
      <div class="list-info">
        <h3 class="list-name">${hotelName}</h3>
        <p class="list-loc">📍 ${hotelAddr}</p>
        <div class="tag-row">
          <span class="tag">Standard $${h.priceStandard || h.price_standard}</span>
          <span class="tag">Lux $${h.priceLux || h.price_lux}</span>
        </div>
        <div class="list-price-row">
          <span class="list-price">$${h.priceEconom || h.price_econom}<small>/night from</small></span>
        </div>
      </div>`;
    const bgEl2 = item.querySelector(`.hotel-search-bg-${h.hotelId}`);
    if (bgEl2) setHotelBg(bgEl2, hotelName);
    container.appendChild(item);
  });
}

// ── ДЕТАЛЬНАЯ СТРАНИЦА ОТЕЛЯ ──────────────────
function openHotelDetail(hotel) {
  selectedHotel = hotel;

  const nameEl  = document.querySelector('.hotel-detail-name');
  const locEl   = document.querySelector('.hotel-detail-loc');
  const priceEl = document.querySelector('.res-price');
  const heroEl  = document.querySelector('.hotel-hero');

  if (nameEl)  nameEl.textContent  = hotel.nazvanie || hotel.name;
  if (locEl)   locEl.textContent   = '📍 ' + (hotel.adres || hotel.address || '').trim();
  if (priceEl) priceEl.textContent = `$${hotel.priceStandard || hotel.price_standard} / night`;
  if (heroEl)  setHotelBg(heroEl, hotel.nazvanie || hotel.name);

  const resBox = document.querySelector('.reservation-box');
  if (resBox) {
    resBox.innerHTML = `
      <div class="reservation-header">
        <span class="res-title">Room Types & Prices</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
        <div class="date-box" onclick="selectRoomType('Стандарт')" id="rt-standard" style="cursor:pointer;border:2px solid var(--blue,#1a56db);border-radius:10px;padding:10px">
          <small>STANDARD</small><strong>$${hotel.priceStandard || hotel.price_standard}/night</strong>
        </div>
        <div class="date-box" onclick="selectRoomType('Люкс')" id="rt-lux" style="cursor:pointer;border:2px solid #e5e7eb;border-radius:10px;padding:10px">
          <small>LUX</small><strong>$${hotel.priceLux || hotel.price_lux}/night</strong>
        </div>
        <div class="date-box" onclick="selectRoomType('Эконом')" id="rt-econom" style="cursor:pointer;border:2px solid #e5e7eb;border-radius:10px;padding:10px">
          <small>ECONOM</small><strong>$${hotel.priceEconom || hotel.price_econom}/night</strong>
        </div>
        <div class="date-box" onclick="selectRoomType('Семейный')" id="rt-family" style="cursor:pointer;border:2px solid #e5e7eb;border-radius:10px;padding:10px">
          <small>FAMILY</small><strong>$${hotel.priceFamily || hotel.price_family}/night</strong>
        </div>
      </div>
      <div style="margin-top:12px">
        <label style="font-size:12px;font-weight:700;color:#6b7280">CHECK-IN</label>
        <input type="date" id="book-checkin" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin-top:4px;font-family:inherit">
        <label style="font-size:12px;font-weight:700;color:#6b7280;margin-top:8px;display:block">CHECK-OUT</label>
        <input type="date" id="book-checkout" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin-top:4px;font-family:inherit">
        <div style="display:flex;gap:8px;margin-top:8px">
          <div style="flex:1">
            <label style="font-size:12px;font-weight:700;color:#6b7280">ADULTS</label>
            <input type="number" id="book-adults" value="2" min="1" max="10" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin-top:4px;font-family:inherit">
          </div>
          <div style="flex:1">
            <label style="font-size:12px;font-weight:700;color:#6b7280">CHILDREN</label>
            <input type="number" id="book-children" value="0" min="0" max="10" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin-top:4px;font-family:inherit">
          </div>
        </div>
      </div>`;
  }

  window._selectedRoomType = 'Стандарт';
  navigate('page-hotel');
}

let _selectedRoomType = 'Стандарт';
function selectRoomType(type) {
  _selectedRoomType = type;
  ['standard','lux','econom','family'].forEach(t => {
    const el = document.getElementById('rt-' + t);
    if (el) el.style.border = '2px solid #e5e7eb';
  });
  const map = { 'Стандарт':'standard','Люкс':'lux','Эконом':'econom','Семейный':'family' };
  const el = document.getElementById('rt-' + map[type]);
  if (el) el.style.border = '2px solid var(--blue,#1a56db)';
}

// ── СОЗДАНИЕ БРОНИ ────────────────────────────
async function doBooking() {
  if (!authToken) {
    showError('Сначала войдите в аккаунт');
    navigate('page-login');
    return;
  }
  if (!selectedHotel) {
    showError('Отель не выбран'); return;
  }

  const checkIn  = document.getElementById('book-checkin')?.value;
  const checkOut = document.getElementById('book-checkout')?.value;
  const adults   = parseInt(document.getElementById('book-adults')?.value || '2');
  const children = parseInt(document.getElementById('book-children')?.value || '0');

  if (!checkIn || !checkOut) {
    showError('Выберите даты заезда и выезда'); return;
  }
  if (checkIn >= checkOut) {
    showError('Дата выезда должна быть позже заезда'); return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/bookings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        hotelId:  selectedHotel.hotelId,
        adults, children,
        roomType: _selectedRoomType,
        checkIn, checkOut
      })
    });

    if (res.ok) {
      const data = await res.json();
      showSuccess(`Бронь создана! Сумма: $${data.summa}`);
      navigate('page-bookings');
    } else {
      const err = await res.json();
      showError(err.message || 'Ошибка бронирования');
    }
  } catch (e) {
    showError('Нет соединения с сервером');
  }
}

// ── МОИ БРОНИ ─────────────────────────────────
async function loadBookings() {
  if (!authToken) return;

  const container = document.querySelector('#page-bookings .page-scroll');
  if (!container) return;

  container.querySelectorAll('.booking-card').forEach(c => c.remove());

  const loader = document.createElement('div');
  loader.id = 'bookings-loader';
  loader.style.cssText = 'text-align:center;padding:40px;color:#9ca3af';
  loader.textContent = 'Загрузка броней...';
  container.appendChild(loader);

  try {
    const res  = await fetch(`${API_BASE}/api/bookings`, { headers: authHeaders() });
    const list = await res.json();
    loader.remove();

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:60px 20px;color:#9ca3af';
      empty.innerHTML = '<div style="font-size:48px">🏨</div><p style="margin-top:12px">У вас пока нет броней</p><button class="btn-primary" style="margin-top:16px" onclick="navigate(\'page-explore\')">Найти отель</button>';
      container.appendChild(empty);
      return;
    }

    list.forEach(b => {
      const card = document.createElement('div');
      card.className = 'booking-card';
      const nights = Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000);
      const statusClass = new Date(b.checkIn) > new Date() ? 'upcoming' : 'confirmed';
      const statusText  = statusClass === 'upcoming' ? 'Upcoming' : 'Confirmed';
      card.innerHTML = `
        <div class="booking-img booking-bg-${b.bookingId}" style="background: center/cover"></div>
        <div class="booking-info">
          <div class="booking-status ${statusClass}">${statusText}</div>
          <h3>${b.hotelName}</h3>
          <p class="hotel-location">🛏 ${b.roomType}</p>
          <p class="booking-dates">${b.checkIn} – ${b.checkOut} · ${nights} nights</p>
          <p class="booking-total"><strong>$${b.summa}</strong> total</p>
          <button onclick="cancelBooking(${b.bookingId})" style="margin-top:8px;background:none;border:1px solid #e74c3c;color:#e74c3c;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer">Cancel</button>
        </div>`;
      const bEl = card.querySelector(`.booking-bg-${b.bookingId}`);
      if (bEl) setHotelBg(bEl, b.hotelName);
      container.appendChild(card);
    });
  } catch (e) {
    loader.textContent = 'Ошибка загрузки броней';
  }
}

async function cancelBooking(bookingId) {
  if (!confirm('Отменить бронирование?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/bookings/${bookingId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (res.ok) {
      showSuccess('Бронь отменена');
      loadBookings();
    }
  } catch (e) {
    showError('Ошибка при отмене');
  }
}

// ── ПРОФИЛЬ ───────────────────────────────────
async function loadProfile() {
  if (!authToken) return;

  try {
    const res  = await fetch(`${API_BASE}/api/guests/me`, { headers: authHeaders() });
    const user = await res.json();

    const nameEl  = document.querySelector('#page-profile h2');
    const emailEl = document.querySelector('#page-profile .profile-email');

    if (nameEl)  nameEl.textContent  = user.firstName + ' ' + user.lastName;
    if (emailEl) emailEl.textContent = user.email;

    const bRes  = await fetch(`${API_BASE}/api/bookings`, { headers: authHeaders() });
    const bList = await bRes.json();
    const bookingCountEl = document.querySelector('#page-profile .stat:first-child strong');
    if (bookingCountEl) bookingCountEl.textContent = bList.length;

  } catch (e) {
    console.error('Ошибка загрузки профиля:', e);
  }
}

// ── ПОИСК ─────────────────────────────────────
function checkEmpty(input) {
  const query = input.value.trim();
  loadSearchHotels(query);
}

function clearSearch() {
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  loadSearchHotels('');
}

// ── КАРТИНКИ ОТЕЛЕЙ ───────────────────────────
const SUPABASE_IMG = 'https://vvrxgzxuolhnpqlerixf.supabase.co/storage/v1/object/public/hotel-images/';

function hotelImageUrl(name) {
  if (!name) name = 'Burj Al Arab';
  return `${SUPABASE_IMG}${encodeURIComponent(name)}.jpg`;
}

function setHotelBg(el, name) {
  if (!name) name = 'Burj Al Arab';
  const url = `${SUPABASE_IMG}${encodeURIComponent(name)}.jpg`;
  el.style.backgroundImage = `url('${url}')`;
}

// ── UI УТИЛИТЫ ────────────────────────────────
function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text'; btn.style.color = '#1a56db';
  } else {
    input.type = 'password'; btn.style.color = '#9ca3af';
  }
}

function updatePriceLabel(slider) {
  const label = document.querySelector('.price-range-label');
  if (label) label.textContent = `$${slider.value} — $850+`;
  const pct = (slider.value / slider.max) * 100;
  slider.style.background = `linear-gradient(to right, var(--blue) ${pct}%, #e5e7eb ${pct}%)`;
}

// ── FAVORITES SYSTEM ──────────────────────────
function favKey() {
  const uid = currentUser?.guestId || 'guest';
  return `ss_favs_${uid}`;
}

function loadFavs() {
  try { return JSON.parse(localStorage.getItem(favKey()) || '[]'); } catch { return []; }
}

function saveFavs(favs) {
  localStorage.setItem(favKey(), JSON.stringify(favs));
}

function isFav(hotelId) {
  return loadFavs().some(f => f.hotelId === hotelId);
}

function toggleFav(hotel) {
  let favs = loadFavs();
  const idx = favs.findIndex(f => f.hotelId === hotel.hotelId);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push(hotel);
  }
  saveFavs(favs);
  renderFavorites();
  document.querySelectorAll(`.fav-btn[data-hotel-id="${hotel.hotelId}"]`).forEach(btn => {
    updateFavBtnState(btn, isFav(hotel.hotelId));
  });
}

function updateFavBtnState(btn, active) {
  const svg = btn.querySelector('svg');
  if (!svg) return;
  svg.setAttribute('fill', active ? '#e74c3c' : 'none');
  svg.setAttribute('stroke', active ? '#e74c3c' : 'white');
}

function renderFavorites() {
  const list  = document.getElementById('favorites-list');
  const empty = document.getElementById('favorites-empty');
  if (!list) return;
  const favs = loadFavs();
  list.innerHTML = '';
  if (favs.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  favs.forEach(h => {
    const name  = h.nazvanie  || h.name  || h.hotelName  || h.title || '—';
    const addr  = h.adres     || h.address || h.location  || '';
    const price = h.priceStandard || h.price_standard || h.pricePerNight || h.price || '';
    const id    = h.hotelId   || h.hotel_id || h.id || 0;
    const item = document.createElement('div');
    item.className = 'hotel-list-item';
    item.onclick = () => openHotelDetail(h);
    item.innerHTML = `
      <div class="list-img fav-list-img-${id}" style="background:center/cover no-repeat">
        <span class="star-badge">★ ${h.rating ?? ''}</span>
      </div>
      <div class="list-info">
        <h3 class="list-name">${name}</h3>
        <p class="list-loc">📍 ${addr.trim()}</p>
        <div class="list-price-row"><span class="list-price">$${price}<small>/night</small></span></div>
      </div>`;
    const imgEl = item.querySelector(`.fav-list-img-${id}`);
    if (imgEl) setHotelBg(imgEl, name);
    list.appendChild(item);
  });
  const favCountEl = document.querySelector('#page-profile .stat:nth-child(2) strong');
  if (favCountEl) favCountEl.textContent = favs.length;
}

function bindFavButtons() {
  document.querySelectorAll('.fav-btn[data-hotel-id]').forEach(btn => {
    const id = parseInt(btn.dataset.hotelId);
    updateFavBtnState(btn, isFav(id));
    btn.onclick = function(e) {
      e.stopPropagation();
      const hotel = allHotels.find(h => h.hotelId === id);
      if (hotel) toggleFav(hotel);
    };
  });
}

// ── CARD STORAGE ─────────────────────────────
function cardKey() {
  const uid = currentUser?.guestId || 'guest';
  return `ss_cards_${uid}`;
}

function loadCards() {
  try { return JSON.parse(localStorage.getItem(cardKey()) || '[]'); } catch { return []; }
}

function saveCards(cards) {
  localStorage.setItem(cardKey(), JSON.stringify(cards));
}

// ── ADD CARD ──────────────────────────────────
function doAddCard() {
  const rawNumber = (document.getElementById('card-number-input')?.value || '').replace(/\s/g, '');
  const name      = (document.getElementById('card-name-input')?.value || '').trim();
  const mm        = parseInt(document.getElementById('card-mm')?.value || '0', 10);
  const yy        = parseInt(document.getElementById('card-yy')?.value || '0', 10);
  const cvv       = (document.getElementById('card-cvv')?.value || '').trim();

  if (rawNumber.length < 13) { showError('Введите корректный номер карты'); return; }
  if (!name)                  { showError('Введите имя держателя карты'); return; }
  if (!mm || mm < 1 || mm > 12) { showError('Введите корректный месяц (01–12)'); return; }
  if (!yy || yy < 1)          { showError('Введите год истечения срока'); return; }
  if (!cvv || cvv.length < 3) { showError('Введите CVV код (3–4 цифры)'); return; }

  const now = new Date();
  const fullYear = 2000 + yy;
  const expDate  = new Date(fullYear, mm - 1, 1);
  expDate.setMonth(expDate.getMonth() + 1);
  if (expDate <= now) {
    showError('Срок действия карты истёк. Пожалуйста, используйте действующую карту.');
    return;
  }

  let type = 'VISA';
  if (/^5[1-5]|^2[2-7]/.test(rawNumber)) type = 'MC';
  else if (/^3[47]/.test(rawNumber))       type = 'AMEX';
  else if (/^4/.test(rawNumber))            type = 'VISA';

  const last4 = rawNumber.slice(-4);
  const cards = loadCards();
  const card  = {
    id:   Date.now(),
    type,
    last4,
    name: name.toUpperCase(),
    mm:   String(mm).padStart(2, '0'),
    yy:   String(yy).padStart(2, '0'),
  };
  cards.push(card);
  saveCards(cards);

  showSuccess('Карта добавлена!');

  // Сброс формы
  ['card-number-input','card-name-input','card-mm','card-yy','card-cvv'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const last4El = document.getElementById('preview-last4');
  if (last4El) last4El.textContent = '0000';
  const nameEl = document.getElementById('preview-name');
  if (nameEl) nameEl.textContent = 'FULL NAME';
  const expEl = document.getElementById('preview-exp');
  if (expEl) expEl.textContent = 'MM/YY';
  const logoEl = document.getElementById('card-type-logo');
  if (logoEl) logoEl.textContent = 'VISA';
  const preview = document.getElementById('card-preview');
  if (preview) preview.style.background = 'linear-gradient(135deg, #1a56db 0%, #1446b8 60%, #0f3490 100%)';

  navigate('page-payment');
}

// ── RENDER PAYMENT PAGE ───────────────────────
function renderPaymentPage() {
  const cards = loadCards();
  const container = document.getElementById('payment-cards-section');
  if (!container) return;

  const payFooter = document.getElementById('pay-footer-area');

  if (cards.length === 0) {
    // Пустое состояние — показываем кнопку добавить карту
    container.innerHTML = `
      <div class="pay-empty-state">
        <div class="pay-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#1a56db" stroke-width="1.5" width="36" height="36">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
        </div>
        <p class="pay-empty-title">No saved cards</p>
        <p class="pay-empty-sub">Add a card to continue with payment</p>
        <button class="add-card-row" style="margin-top:12px" onclick="navigate('page-addcard')">
          <div class="add-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#1a56db" stroke-width="2.5" width="18" height="18">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span>Add New Card</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" width="16" height="16" style="margin-left:auto">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>`;
    if (payFooter) payFooter.style.display = 'none';
    return;
  }

  // Есть карты
  if (payFooter) payFooter.style.display = '';

  let html = `
    <div class="pay-section-title">Select Card</div>
    <div class="pay-section-sub">Choose a saved card for payment.</div>
    <div class="card-options" id="card-options-list">`;

  cards.forEach((c, idx) => {
    const active = idx === 0 ? 'active' : '';
    const radioSvg = idx === 0
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="#1a56db" stroke-width="2.5" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/></svg>`;
    const logoSvg = c.type === 'MC'
      ? `<svg viewBox="0 0 38 24" width="28" height="18"><rect width="38" height="24" rx="4" fill="#f3f4f6"/><circle cx="15" cy="12" r="7" fill="#eb001b" opacity="0.9"/><circle cx="23" cy="12" r="7" fill="#f79e1b" opacity="0.9"/></svg>`
      : c.type === 'AMEX'
      ? `<svg viewBox="0 0 38 24" width="28" height="18"><rect width="38" height="24" rx="4" fill="#2E77BC"/><text x="19" y="16" text-anchor="middle" fill="white" font-family="Arial" font-size="9" font-weight="bold">AMEX</text></svg>`
      : `<svg viewBox="0 0 38 24" width="28" height="18"><rect width="38" height="24" rx="4" fill="#1a56db"/><text x="19" y="16" text-anchor="middle" fill="white" font-family="Arial" font-size="11" font-weight="bold">VISA</text></svg>`;
    const typeName = c.type === 'MC' ? 'Mastercard' : c.type === 'AMEX' ? 'Amex' : 'Visa';

    html += `
      <label class="card-option ${active}" onclick="selectCard(this)" data-card-id="${c.id}">
        <div class="card-option-icon">${logoSvg}</div>
        <div class="card-option-info">
          <strong>${typeName} •••• ${c.last4}</strong>
          <span>Expires ${c.mm}/${c.yy}</span>
        </div>
        <div class="radio-dot">${radioSvg}</div>
      </label>`;
  });

  html += `</div>
    <button class="add-card-row" onclick="navigate('page-addcard')">
      <div class="add-card-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="#1a56db" stroke-width="2.5" width="18" height="18">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </div>
      <span>Add New Card</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" width="16" height="16" style="margin-left:auto">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </button>`;

  container.innerHTML = html;
}

function selectCard(el) {
  document.querySelectorAll('#card-options-list .card-option').forEach(o => {
    o.classList.remove('active');
    const dot = o.querySelector('.radio-dot');
    if (dot) dot.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/></svg>`;
  });
  el.classList.add('active');
  const dot = el.querySelector('.radio-dot');
  if (dot) dot.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#1a56db" stroke-width="2.5" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`;
}

function doPayNow() {
  showSuccess('Payment successful!');
  navigate('page-bookings');
}

// ── EXPIRY VALIDATION ────────────────────────
function validateExpiry() {
  const mm = parseInt(document.getElementById('card-mm')?.value || '0', 10);
  const yy = parseInt(document.getElementById('card-yy')?.value || '0', 10);
  const errEl = document.getElementById('expiry-error');
  if (!mm || !yy) { if (errEl) errEl.textContent = ''; return; }

  const now = new Date();
  const fullYear = 2000 + yy;
  const expDate  = new Date(fullYear, mm - 1, 1);
  expDate.setMonth(expDate.getMonth() + 1);

  if (mm < 1 || mm > 12) {
    if (errEl) { errEl.textContent = 'Enter month 01–12'; errEl.style.color = '#ef4444'; }
    return;
  }
  if (expDate <= now) {
    if (errEl) { errEl.textContent = '❌ Card has expired'; errEl.style.color = '#ef4444'; }
    const mmEl = document.getElementById('card-mm');
    const yyEl = document.getElementById('card-yy');
    if (mmEl) mmEl.style.borderColor = '#ef4444';
    if (yyEl) yyEl.style.borderColor = '#ef4444';
  } else {
    if (errEl) { errEl.textContent = '✓ Valid'; errEl.style.color = '#22c55e'; }
    const mmEl = document.getElementById('card-mm');
    const yyEl = document.getElementById('card-yy');
    if (mmEl) mmEl.style.borderColor = '';
    if (yyEl) yyEl.style.borderColor = '';
  }
}

function formatCardNumber(input) {
  let val = input.value.replace(/\D/g, '').slice(0, 16);
  input.value = val.replace(/(.{4})/g, '$1 ').trim();

  const last4El = document.getElementById('preview-last4');
  if (last4El) last4El.textContent = val.length >= 4 ? val.slice(-4) : (val + '0000').slice(0, 4);

  const logo = document.getElementById('card-type-logo');
  if (logo) {
    if (/^5[1-5]|^2[2-7]/.test(val))  logo.textContent = 'MC';
    else if (/^3[47]/.test(val))        logo.textContent = 'AMEX';
    else if (/^4/.test(val))            logo.textContent = 'VISA';
    else                                logo.textContent = 'VISA';
  }

  const preview = document.getElementById('card-preview');
  if (preview) {
    if (/^5[1-5]|^2[2-7]/.test(val)) {
      preview.style.background = 'linear-gradient(135deg, #1d1d1d 0%, #3d3d3d 60%, #111 100%)';
    } else {
      preview.style.background = 'linear-gradient(135deg, #1a56db 0%, #1446b8 60%, #0f3490 100%)';
    }
  }
}

function updateCardName(input) {
  const el = document.getElementById('preview-name');
  if (el) el.textContent = input.value.toUpperCase() || 'FULL NAME';
}

function updateExpiry() {
  const mm = document.getElementById('card-mm')?.value || 'MM';
  const yy = document.getElementById('card-yy')?.value || 'YY';
  const el = document.getElementById('preview-exp');
  if (el) el.textContent = mm + '/' + yy;
}

// ── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img.avatar, img.profile-avatar').forEach(img => {
    img.src = AVATAR_URL;
    img.onerror = function() { this.style.background = '#e5e7eb'; this.style.display = 'none'; };
  });

  if (loadSavedToken()) {
    navigate('page-explore');
  } else {
    navigate('page-register');
  }

  const regBtn = document.getElementById('reg-btn') || document.querySelector('#page-register .btn-primary');
  if (regBtn) regBtn.onclick = doRegister;

  const loginBtn = document.getElementById('login-btn') || document.querySelector('#page-login .btn-primary');
  if (loginBtn) loginBtn.onclick = doLogin;

  const bookBtn = document.querySelector('.book-btn');
  if (bookBtn) bookBtn.onclick = doBooking;

  const signOutBtn = document.querySelector('#page-profile .profile-menu button:last-child');
  if (signOutBtn) signOutBtn.onclick = logout;

  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      this.closest('.star-rating-row')?.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });

  document.querySelectorAll('.amenity-btn').forEach(btn => {
    btn.addEventListener('click', function() { this.classList.toggle('active'); });
  });

  document.querySelectorAll('.filter-chips .chip, .sort-chips .chip').forEach(chip => {
    chip.addEventListener('click', function() {
      this.closest('.filter-chips, .sort-chips')?.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
    });
  });

  document.querySelectorAll('.property-card').forEach(card => {
    card.addEventListener('click', function(e) {
      e.stopPropagation();
      document.querySelectorAll('.property-card').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
    });
  });

  bindFavButtons();

  const termsCheck = document.getElementById('terms-check');
  if (termsCheck) {
    termsCheck.addEventListener('change', function() {
      const btn = document.querySelector('#page-register .btn-primary');
      if (btn) btn.style.opacity = this.checked ? '1' : '0.6';
    });
  }
});
