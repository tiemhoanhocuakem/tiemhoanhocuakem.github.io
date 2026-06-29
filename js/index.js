const GOOGLE_API_URL = 'https://script.google.com/macros/s/AKfycbweTa1Nu5Zx0QFskNE4I-VVow5ED9QKhn2mtHSUemMb96yplYnwKPBhtXaQZu8kl9nUiw/exec';

let ALL_PRODUCTS = []; let ALL_VOUCHERS = [];
// --- KHỞI TẠO GIỎ HÀNG VỚI CƠ CHẾ TỰ HỦY (15 PHÚT) ---
let cart = [];
try {
    const guestCartRaw = localStorage.getItem('kem_guest_cart');
    if (guestCartRaw) {
        const parsedData = JSON.parse(guestCartRaw);

        // Kiểm tra xem dữ liệu có tem thời gian hay không
        if (parsedData && typeof parsedData.timestamp === 'number') {
            const now = new Date().getTime();
            const diffMinutes = (now - parsedData.timestamp) / (1000 * 60); // Đổi ra phút

            if (diffMinutes <= 15) {
                cart = parsedData.data || []; // Còn hạn 15 phút -> Nạp lại giỏ
            } else {
                localStorage.removeItem('kem_guest_cart'); // Quá hạn -> Tiêu diệt!
            }
        }
        // Cơ chế tương thích ngược (Tránh lỗi nếu trình duyệt đang lưu mảng cũ)
        else if (Array.isArray(parsedData)) {
            cart = parsedData;
        }
    }
} catch (e) {
    cart = [];
}
let appliedVoucherCode = "";
let appliedDiscountAmount = 0;
let cartSubTotal = 0;

window.saveCartState = async function () {
    cart.forEach(item => { if (item.selected === undefined) item.selected = true; });

    if (LOGGED_USER && LOGGED_USER.uid) {
        // [CÁCH LY 1] Đã đăng nhập: Lưu vào phân vùng riêng biệt theo UID
        localStorage.setItem('kem_user_cart_' + LOGGED_USER.uid, JSON.stringify(cart));

        // Đồng bộ lên Cloud
        try {
            await fetch(GOOGLE_API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'syncCart', payload: { token: sessionStorage.getItem('kem_token'), cart: cart } })
            });
        } catch (e) { }
    } else {
        // [CÁCH LY 2] Chưa đăng nhập (Guest): Lưu vào giỏ vãng lai kèm Time-To-Live (15 phút)
        const guestPayload = {
            data: cart,
            timestamp: new Date().getTime() // Đóng dấu thời điểm lưu
        };
        localStorage.setItem('kem_guest_cart', JSON.stringify(guestPayload));
    }
}
let LOGGED_USER = null;
let USED_VOUCHERS = [];
let tempResetPhone = "";

// LUXURY NOTIFICATION SYSTEM (Hệ thống thông báo hàng hiệu)
function luxuryToast(msg, isError = false) {
    const container = document.getElementById('luxury-toast-container');
    const id = 'toast-' + Date.now();
    const html = `<div id="${id}" class="toast-card ${isError ? 'error' : ''}">
                <div class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isError ? 'bg-red-100 text-red-500' : 'bg-green-100 text-green-600'}">
                    ${isError ? '✕' : '✓'}
                </div>
                <div><p class="text-[10px] font-bold uppercase tracking-widest text-primary">${isError ? 'Hệ thống' : 'Thông báo'}</p><p class="text-xs text-secondary mt-0.5">${msg}</p></div>
            </div>`;
    container.insertAdjacentHTML('beforeend', html);
    setTimeout(() => { const el = document.getElementById(id); if (el) el.classList.add('show'); }, 10);
    setTimeout(() => { const el = document.getElementById(id); if (el) { el.classList.remove('show'); setTimeout(() => el.remove(), 500); } }, 4000);
}

// BỘ CÔNG CỤ UI: HIỆU ỨNG SPINNER TRÊN NÚT BẤM
window.setBtnLoading = function (btnId, isLoading, loadingText = 'ĐANG XỬ LÝ...') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>${loadingText}`;
        btn.classList.add('opacity-70', 'cursor-not-allowed');
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}

// BỘ CÔNG CỤ UI: HỘP THOẠI XÁC NHẬN SANG TRỌNG
let activeConfirmCallback = null;
window.showConfirmModal = function (title, message, callback) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerText = message;
    const modal = document.getElementById('confirm-modal');
    const content = document.getElementById('confirm-content');
    modal.classList.remove('pointer-events-none', 'opacity-0');
    setTimeout(() => { content.classList.remove('scale-95', 'opacity-0'); }, 10);
    activeConfirmCallback = callback;
}
window.closeConfirmModal = function () {
    const modal = document.getElementById('confirm-modal');
    const content = document.getElementById('confirm-content');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { modal.classList.add('pointer-events-none', 'opacity-0'); activeConfirmCallback = null; }, 400);
}
window.executeConfirmAction = function () {
    if (activeConfirmCallback) {
        setBtnLoading('btn-confirm-action', true, 'ĐANG HỦY...');
        activeConfirmCallback();
    }
}

// BĂM MẬT KHẨU BẢO MẬT (SHA-256)
async function sha256(message) {
    if (!message) return "";
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// XỬ LÝ ẢNH GOOGLE DRIVE
function processDriveImage(url) {
    if (!url) return '';
    const match = url.match(/\/file\/d\/(.+?)\//) || url.match(/\/d\/(.+?)\//) || url.match(/id=(.+?)(&|$)/);
    // SỬ DỤNG CỔNG LH3 VÀ THAM SỐ =s0 ĐỂ LẤY ẢNH CHẤT LƯỢNG GỐC 100% (KHÔNG NÉN)
    return match && match[1] ? `https://lh3.googleusercontent.com/d/${match[1]}=s0` : url;
}

// XỬ LÝ FORMAT TIỀN TỆ (KHÔNG LỖI 0k)
function formatVND(value) {
    let num = Number(value) || 0;
    // Loại bỏ hoàn toàn điều kiện tự nhân 1000 để phản ánh chính xác 100% dữ liệu gốc từ Sheets
    return num === 0 ? "0 VNĐ" : num.toLocaleString('vi-VN') + ' VNĐ';
}

// LẤY DỮ LIỆU TỪ SHEET
// Bổ sung isSilent = false, và thêm timestamp (new Date().getTime()) để phá Cache của trình duyệt
async function fetchStoreData(isSilent = false) {
    try {
        // Cache-Busting: Buộc trình duyệt phải lấy data mới nhất từ máy chủ
        const response = await fetch(GOOGLE_API_URL + '?action=getStorefront&_t=' + new Date().getTime());
        const data = await response.json();

        if (data.status === 'success') {
            ALL_PRODUCTS = data.products.map(p => ({ ...p, price: Number(p.price) }));
            ALL_VOUCHERS = data.vouchers.map(v => ({
                ...v,
                value: Number(v.value),
                usedCount: Number(v.usedCount),
                maxUsage: Number(v.maxUsage),
                minOrderValue: Number(v.minOrderValue) || 0
            }));

            if (ALL_PRODUCTS.length === 0) {
                document.getElementById('product-loading').innerHTML = "Cửa hàng tạm thời chưa có sản phẩm nào.";
                return;
            }

            // XỬ LÝ CHÍNH KHÔNG GÂY NHÁY:
            if (isSilent) {
                // Nếu update ngầm (khi đặt đơn/hủy đơn), CHỈ render lại Voucher, KHÔNG render lại lưới sản phẩm
                renderVouchersOnly();
            } else {
                // Nếu là lần tải trang đầu tiên
                initStorefront();
            }
        } else {
            throw new Error("API Error");
        }
    } catch (error) {
        console.error("Lỗi đồng bộ Sheets:", error);
        if (!isSilent) {
            document.getElementById('product-loading').innerHTML = "Hệ thống đang bảo trì. Vui lòng quay lại sau ít phút.";
        }
    }
}

function initStorefront() {
    document.getElementById('product-loading').style.display = 'none';
    document.getElementById('product-grid').classList.remove('hidden');
    document.getElementById('master-filter-container').classList.remove('hidden');

    // Dùng hàm mới để render Voucher
    renderVouchersOnly();

    // Gọi filterCategory lần đầu tải trang
    filterCategory('all');
}

// ==========================================
// QUẢN LÝ TÀI KHOẢN (AUTH & OTP)
// ==========================================
window.toggleAuthDrawer = function () {
    const d = document.getElementById('auth-drawer'); const b = document.getElementById('auth-backdrop');
    if (d.classList.contains('open')) { d.classList.remove('open'); b.classList.remove('open'); }
    else { d.classList.add('open'); b.classList.add('open'); LOGGED_USER ? switchAuthView('dashboard') : switchAuthView('login'); }
}

window.switchAuthView = function (view) {
    document.querySelectorAll('.auth-panel').forEach(p => { p.classList.remove('active'); p.classList.add('hide'); });
    const titles = { login: "Đăng nhập.", register: "Tạo tài khoản.", otp: "Xác thực.", dashboard: "Tài khoản.", forgot: "Khôi phục.", reset: "Mật khẩu mới." };
    document.getElementById('auth-drawer-title').innerText = titles[view] || "Tài khoản.";
    const targetView = document.getElementById(`auth-${view}-view`);
    targetView.classList.remove('hide');
    setTimeout(() => { targetView.classList.add('active'); }, 10);
}

window.requestPasswordReset = async function () {
    const phone = document.getElementById('forgot-phone').value.trim();
    if (!phone) return luxuryToast("Vui lòng nhập số điện thoại!", true);

    setBtnLoading('btn-forgot-trigger', true, 'ĐANG TÌM KIẾM...');
    try {
        const res = await fetch(GOOGLE_API_URL, { method: 'POST', body: JSON.stringify({ action: 'forgotPasswordStep1', payload: { phone: phone } }) }).then(r => r.json());
        if (res.status === 'success') {
            tempResetPhone = phone;
            luxuryToast(res.message);
            document.getElementById('reset-email-msg').innerHTML = `Mã xác thực đã được gửi đến:<br><span class="text-sm font-bold mt-1 block tracking-widest text-primary">${res.email}</span>`;

            // Reset lại giao diện Bước 1: Mở ô OTP, Khóa ô Mật khẩu
            document.getElementById('reset-otp').disabled = false;
            document.getElementById('reset-otp').value = '';
            document.getElementById('btn-verify-otp-reset').classList.remove('hide');
            const step2 = document.getElementById('reset-step-2');
            step2.classList.add('hide', 'opacity-0', 'translate-y-4');
            document.getElementById('reset-new-pass').value = '';

            switchAuthView('reset');
        } else { luxuryToast(res.message, true); }
    } catch (e) { luxuryToast("Lỗi kết nối máy chủ", true); }
    setBtnLoading('btn-forgot-trigger', false);
}

// HÀM MỚI: CHỈ KIỂM TRA OTP ĐỂ MỞ KHÓA MẬT KHẨU
window.verifyOTPForReset = async function () {
    const otp = document.getElementById('reset-otp').value.trim();
    if (!otp || otp.length < 6) return luxuryToast("Vui lòng nhập đủ 6 số OTP!", true);

    setBtnLoading('btn-verify-otp-reset', true, 'ĐANG KIỂM TRA...');
    try {
        const res = await fetch(GOOGLE_API_URL, { method: 'POST', body: JSON.stringify({ action: 'checkOTPValid', payload: { phone: tempResetPhone, otp: otp } }) }).then(r => r.json());

        if (res.status === 'success') {
            luxuryToast(res.message);

            // UX Magic: Khóa ô OTP lại, hiển thị ô nhập Mật khẩu với hiệu ứng trượt mượt mà
            document.getElementById('reset-otp').disabled = true;
            document.getElementById('btn-verify-otp-reset').classList.add('hide');

            const step2 = document.getElementById('reset-step-2');
            step2.classList.remove('hide');
            setTimeout(() => { step2.classList.remove('opacity-0', 'translate-y-4'); }, 50);
        } else {
            luxuryToast(res.message, true);
        }
    } catch (e) { luxuryToast("Lỗi kết nối", true); }
    setBtnLoading('btn-verify-otp-reset', false);
}

window.confirmPasswordReset = async function () {
    const otp = document.getElementById('reset-otp').value.trim();
    const newPass = document.getElementById('reset-new-pass').value;
    if (!otp || !newPass) return luxuryToast("Vui lòng nhập mật khẩu mới!", true);

    setBtnLoading('btn-reset-trigger', true, 'ĐANG KHÔI PHỤC...');
    try {
        const res = await fetch(GOOGLE_API_URL, { method: 'POST', body: JSON.stringify({ action: 'forgotPasswordStep2', payload: { phone: tempResetPhone, otp: otp, newPasswordRaw: newPass } }) }).then(r => r.json());
        if (res.status === 'success') {
            luxuryToast(res.message);
            document.getElementById('forgot-phone').value = ''; tempResetPhone = "";
            switchAuthView('login');
        } else { luxuryToast(res.message, true); }
    } catch (e) { luxuryToast("Lỗi kết nối khôi phục", true); }
    setBtnLoading('btn-reset-trigger', false);
}

window.initiateOTPFlow = async function () {
    const email = document.getElementById('user-email').value.trim();
    const name = document.getElementById('user-name').value.trim();
    const phone = document.getElementById('user-phone').value.trim();
    const address = document.getElementById('user-address').value.trim();
    const uid = document.getElementById('user-uid').value;

    if (!email || !name || !phone) return luxuryToast("Vui lòng điền đủ Họ tên, SĐT và Email!", true);

    // [UX & PERFORMANCE UPGRADE] Tránh lãng phí OTP nếu khách không thay đổi thông tin
    if (uid && LOGGED_USER) {
        const pass = document.getElementById('user-pass').value; // Kiểm tra xem khách có gõ mật khẩu mới không
        const currentAddress = LOGGED_USER.address || '';

        if (name === LOGGED_USER.name && phone === LOGGED_USER.phone && email === LOGGED_USER.email && address === currentAddress && !pass) {
            luxuryToast("Thông tin không có thay đổi nào.");
            switchAuthView('dashboard'); // Thoát ra Dashboard thanh lịch, giữ nguyên thông tin
            return;
        }
    }

    setBtnLoading('btn-save-account', true, 'ĐANG KIỂM TRA...');

    // Truyền thêm uid vào payload để Backend biết đường loại trừ chính khách hàng này khi quét trùng lặp
    const payload = {
        action: 'sendOTP',
        payload: {
            email: email,
            phone: phone,
            type: uid ? 'update' : 'register',
            uid: uid
        }
    };

    try {
        const res = await fetch(GOOGLE_API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json());
        if (res.status === 'success') {
            luxuryToast("Mã OTP đã được gửi về Email.");
            switchAuthView('otp');
        } else {
            luxuryToast(res.message, true); // Hiện lỗi trùng SĐT hoặc Email riêng biệt từ Server
        }
    } catch (e) { luxuryToast("Lỗi kết nối máy chủ dữ liệu", true); }
    setBtnLoading('btn-save-account', false);
}

window.finalUserAction = async function () {
    setBtnLoading('btn-verify-otp', true, 'ĐANG XỬ LÝ...');
    const uid = document.getElementById('user-uid').value; const pass = document.getElementById('user-pass').value;
    const clientHash = pass ? await sha256(pass) : "";
    const isEdit = uid ? true : false;
    // Nếu là update, cần gửi kèm token thay vì uid
    const payload = {
        action: isEdit ? 'updateUser' : 'registerUser',
        payload: {
            token: isEdit ? sessionStorage.getItem('kem_token') : null, // Gửi token nếu đang update
            uid: uid,
            name: document.getElementById('user-name').value,
            phone: document.getElementById('user-phone').value,
            email: document.getElementById('user-email').value,
            passwordRaw: clientHash,
            address: document.getElementById('user-address').value,
            otp: document.getElementById('user-otp').value
        }
    };
    try {
        const res = await fetch(GOOGLE_API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json());
        if (res.status === 'success') {
            luxuryToast(res.message); document.getElementById('auth-register-view').querySelectorAll('input').forEach(i => i.value = ''); document.getElementById('user-otp').value = ''; isEdit ? logoutUser() : switchAuthView('login');
        } else { luxuryToast(res.message, true); }
    } catch (e) { luxuryToast("Mã xác thực không hợp lệ!", true); }
    setBtnLoading('btn-verify-otp', false);
}

window.loginUser = async function () {
    const phone = document.getElementById('login-phone').value;
    const pass = document.getElementById('login-pass').value;
    if (!phone || !pass) return luxuryToast("Vui lòng nhập đầy đủ SĐT và Mật khẩu!", true);
    setBtnLoading('btn-login-trigger', true, 'ĐANG ĐĂNG NHẬP...');
    try {
        const clientHash = await sha256(pass); // Băm lần 1 tại Client
        const res = await fetch(GOOGLE_API_URL, { method: 'POST', body: JSON.stringify({ action: 'loginUser', payload: { email: phone, passwordRaw: clientHash } }) }).then(r => r.json());

        if (res.status === 'success') {
            LOGGED_USER = res.user;
            sessionStorage.setItem('kem_token', res.token); // Lưu Token bảo mật

            // --- GỘP GIỎ HÀNG (MERGE CART) NÂNG CAO ---
            let serverCart = [];
            try { serverCart = JSON.parse(res.user.cartData || "[]"); } catch (e) { }

            let guestCart = [...cart]; // Lấy giỏ Guest hiện tại
            let localUserCart = JSON.parse(localStorage.getItem('kem_user_cart_' + res.user.uid)) || []; // Lấy giỏ User ở Local

            // Trộn cả 3 giỏ: Server + Local User + Guest (Ưu tiên giữ lại món mới nhất)
            let mergedCart = [...serverCart];

            localUserCart.forEach(localItem => {
                if (!mergedCart.find(i => i.id === localItem.id)) mergedCart.push(localItem);
            });

            guestCart.forEach(guestItem => {
                if (!mergedCart.find(i => i.id === guestItem.id)) mergedCart.push(guestItem);
            });

            cart = mergedCart;
            cart.forEach(item => { if (item.selected === undefined) item.selected = true; });

            // [CHỐT CHẶN TỐI THƯỢNG]: Sát nhập xong, PHẢI XÓA SẠCH giỏ Guest
            localStorage.removeItem('kem_guest_cart');

            saveCartState(); // Lúc này hàm saveCartState sẽ lưu vào kem_user_cart_UID
            document.getElementById('cart-badge').innerText = cart.reduce((s, i) => s + i.qty, 0);
            renderCartUI();
            // ---------------------------------

            luxuryToast(`Đăng nhập thành công. Chào bạn ${LOGGED_USER.name.split(' ').pop()}!`);
            document.getElementById('nav-user-name').innerText = LOGGED_USER.name.split(' ').pop(); document.getElementById('form-name').value = LOGGED_USER.name; document.getElementById('form-phone').value = LOGGED_USER.phone; document.getElementById('form-address').value = LOGGED_USER.address || ''; document.getElementById('dash-welcome-title').innerText = LOGGED_USER.name + '.';
            renderUserOrdersList(res.orders || []); switchAuthView('dashboard');
            USED_VOUCHERS = res.usedVouchers || []; initStorefront(); autoApplyBestVoucher();
        } else { luxuryToast(res.message, true); }
    } catch (e) { luxuryToast("Lỗi kết nối máy chủ dữ liệu", true); }
    setBtnLoading('btn-login-trigger', false);
}

function renderUserOrdersList(orders) {
    const container = document.getElementById('dashboard-orders-list');
    if (orders.length === 0) { container.innerHTML = `<p class="italic text-secondary text-sm">Bạn chưa có sản phẩm nào.</p>`; return; }
    let html = '';
    orders.reverse().forEach(o => {
        const statusColor = o.status === 'ĐƠN HỦY' ? 'text-red-500' : (o.status === 'ĐÃ XÁC NHẬN' ? 'text-green-600' : 'text-blue-600');

        // Trích xuất Tên tuyệt tác từ cột cartDetails JSON
        let itemsHtml = '';
        if (o.cartDetails) {
            try {
                const items = JSON.parse(o.cartDetails);
                // Thay đổi cấu trúc list để tôn vinh tên sản phẩm
                itemsHtml = `<ul class="space-y-3 mb-4 border-t border-primary/10 pt-4">`;
                items.forEach(i => {
                    itemsHtml += `
                            <li class="flex flex-col bg-surface/50 p-3 rounded-lg border border-primary/5">
                                <span class="text-sm md:text-base font-bold text-primary tracking-tight leading-snug mb-1">${i.name}</span>
                                <span class="text-[10px] font-medium text-secondary uppercase tracking-widest">Số lượng: <span class="font-bold text-primary text-xs">x${i.qty}</span></span>
                            </li>`;
                });
                itemsHtml += `</ul>`;
            } catch (e) { }
        }

        // Hiển thị Mã Voucher đã dùng nếu có
        const voucherHtml = (o.voucher && o.voucher !== 'KHÔNG DÙNG' && o.voucher !== 'Không')
            ? `<p class="text-[9px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100 mt-2 w-max shadow-sm uppercase tracking-widest">MÃ ĐÃ DÙNG: ${o.voucher}</p>` : '';

        html += `<div class="border border-primary/10 p-5 rounded-2xl bg-surface hover:shadow-lg transition-shadow duration-300">
                    <div class="flex justify-between items-center font-bold text-primary mb-1">
                        <span class="tracking-widest text-[11px]">${o.orderId}</span>
                        <span class="text-[10px] uppercase tracking-widest ${statusColor} bg-slate-50 px-2 py-1 rounded">${o.status}</span>
                    </div>
                    <p class="text-[10px] text-secondary font-medium mb-2">${o.createdAt}</p>
                    ${itemsHtml}
                    <div class="flex flex-col border-t border-primary/5 pt-3 mt-1">
                        <div class="flex justify-between items-end">
                            <span class="font-serif font-bold text-primary text-xl">${formatVND(o.totalPrice)}</span>
                            ${o.status === 'CHƯA XÁC NHẬN' ? `<button onclick="cancelOrderCustomer('${o.orderId}')" class="text-[9px] text-red-500 uppercase tracking-widest font-bold border border-red-200 bg-red-50 px-3 py-1.5 rounded hover:bg-red-500 hover:text-white transition-colors">Hủy đơn</button>` : ''}
                        </div>
                        ${voucherHtml}
                    </div>
                </div>`;
    });
    container.innerHTML = html;
}

// HÀM MỚI: ĐỒNG BỘ DỮ LIỆU NGẦM XUYÊN SUỐT HỆ THỐNG
window.refreshAllData = async function () {
    if (!LOGGED_USER) return;
    try {
        const res = await fetch(GOOGLE_API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'refreshUserData', payload: { token: sessionStorage.getItem('kem_token') } })
        }).then(r => r.json());

        if (res.status === 'success') {
            USED_VOUCHERS = res.usedVouchers || [];
            renderUserOrdersList(res.orders || []);
        }

        await fetchStoreData(true); // Cập nhật ngầm danh sách Voucher & Sản phẩm

        // --- ĐOẠN CODE BỔ SUNG: TỰ ĐỘNG ÁP DỤNG MÃ TỐT NHẤT ---
        // Nếu bạn có hàm tự động áp dụng voucher (ví dụ: autoApplyBestVoucher)
        // hoặc hàm tính toán lại giỏ hàng, hãy gọi nó ở đây.
        const voucherInput = document.getElementById('voucher-input');

        // Nếu ô input đang trống, thử tự động tìm và áp mã
        if (voucherInput && !voucherInput.value) {
            if (typeof autoApplyBestVoucher === 'function') {
                autoApplyBestVoucher();
            }
        } else if (voucherInput && voucherInput.value) {
            // Nếu đang có sẵn mã, bắt hệ thống validate lại mã đó với data mới
            if (typeof validateVoucherCode === 'function') {
                validateVoucherCode();
            }
        }

        // Render lại giỏ hàng để cập nhật số tiền
        if (typeof renderCartUI === 'function') renderCartUI();

    } catch (e) {
        console.error("Lỗi đồng bộ ngầm:", e);
    }
}

window.cancelOrderCustomer = async function (orderId) {
    showConfirmModal('Hủy đơn hàng', `Bạn thực sự muốn hủy đơn hàng [${orderId}]?`, async () => {
        try {
            // Lấy Token từ Session Storage
            const currentToken = sessionStorage.getItem('kem_token');
            if (!currentToken) {
                luxuryToast("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!", true);
                closeConfirmModal();
                return;
            }

            // Gửi API kèm Payload chứa Token bảo mật
            const payloadData = {
                action: 'cancelOrderCustomer',
                payload: {
                    orderId: orderId,
                    token: currentToken // THÊM CHÌA KHÓA VÀO ĐÂY
                }
            };

            const res = await fetch(GOOGLE_API_URL, {
                method: 'POST',
                body: JSON.stringify(payloadData)
            }).then(r => r.json());

            if (res.status === 'success') {
                luxuryToast("Đã hủy đơn hàng thành công.");
                refreshAllData(); // Load lại UI
            } else {
                luxuryToast(res.message, true); // Hiển thị lỗi từ Backend (ví dụ: cấm hủy hộ người khác)
            }
        } catch (e) {
            luxuryToast("Lỗi kết nối đến máy chủ", true);
        }
        closeConfirmModal();
        setBtnLoading('btn-confirm-action', false);
    });
}

window.openEditProfile = function () {
    switchAuthView('register');
    document.getElementById('auth-drawer-title').innerText = "Cập nhật.";
    document.getElementById('btn-save-account').innerText = "Lưu thay đổi";
    document.getElementById('reg-back-msg').classList.add('hide');
    document.getElementById('user-uid').value = LOGGED_USER.uid;
    document.getElementById('user-name').value = LOGGED_USER.name;
    document.getElementById('user-phone').value = LOGGED_USER.phone;
    document.getElementById('user-email').value = LOGGED_USER.email;
    document.getElementById('user-address').value = LOGGED_USER.address || '';

    // Xóa disable để cho phép người dùng tự do sửa lại Email nhận OTP
    document.getElementById('user-email').disabled = false;
}

// HÀM MỚI: ẨN/HIỆN MẬT KHẨU BẰNG ICON CON MẮT
window.togglePassword = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    } else {
        input.type = "password";
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    }
}

window.logoutUser = function () {
    // 1. Xóa trạng thái định danh người dùng (Giao diện)
    LOGGED_USER = null;
    document.getElementById('nav-user-name').innerText = "Tài khoản";

    // 2. Dọn dẹp các form nhập liệu
    document.getElementById('checkout-form').reset();
    document.getElementById('login-phone').value = '';
    document.getElementById('login-pass').value = '';

    // 3. BẢO MẬT CỐT LÕI: Hủy phiên làm việc (Token)
    sessionStorage.removeItem('kem_token');

    // 4. TIÊU DIỆT "CART BLEED" TẬN GỐC (Kiến trúc phân vùng)
    // Đưa cart về rỗng để ép người dùng trở lại thân phận Guest trắng tinh
    cart = [];
    localStorage.removeItem('kem_guest_cart'); // Đảm bảo tủ đồ Guest cũng sạch sẽ

    // 5. Reset luôn trạng thái Voucher (Tuyệt đối không để rò rỉ mã đang áp dụng)
    appliedVoucherCode = "";
    appliedDiscountAmount = 0;
    const voucherInput = document.getElementById('voucher-input');
    if (voucherInput) voucherInput.value = "";

    // 6. Ép render lại giao diện Giỏ hàng ngay lập tức
    const badge = document.getElementById('cart-badge');
    if (badge) {
        badge.innerText = "0";
        badge.classList.remove('pop');
    }
    if (typeof renderCartUI === 'function') renderCartUI();

    // 7. Thông báo và chuyển hướng
    luxuryToast("Đã đăng xuất an toàn.");
    switchAuthView('login');
}

// ==========================================
// QUẢN LÝ GIỎ HÀNG (CART LOGIC)
// ==========================================

window.toggleItemSelection = function (id) {
    const item = cart.find(i => i.id == id);
    if (item) {
        item.selected = !item.selected;
        saveCartState();

        // Reset Voucher nếu thay đổi lựa chọn để tránh lỗi logic tiền
        if (appliedVoucherCode !== "") {
            appliedVoucherCode = ""; appliedDiscountAmount = 0;
            document.getElementById('voucher-input').value = "";
            luxuryToast("Số lượng hoặc lựa chọn vừa thay đổi, vui lòng áp dụng lại mã ưu đãi.", true);
        }
        renderCartUI();
        autoApplyBestVoucher();
    }
}

// Cập nhật addToCart và changeQty để gọi saveCartState
window.addToCart = function (id) {
    const p = ALL_PRODUCTS.find(x => x.id == id);
    const ex = cart.find(item => item.id == id);
    ex ? ex.qty++ : cart.push({ ...p, qty: 1, selected: true }); // Mặc định chọn khi thêm
    const badge = document.getElementById('cart-badge'); badge.innerText = cart.reduce((s, i) => s + i.qty, 0);
    badge.classList.add('pop'); setTimeout(() => badge.classList.remove('pop'), 300);
    luxuryToast(`Đã thêm "${p.name}" vào giỏ.`);
    if (appliedVoucherCode !== "") { appliedVoucherCode = ""; appliedDiscountAmount = 0; document.getElementById('voucher-input').value = ""; }
    saveCartState();
    renderCartUI(); autoApplyBestVoucher();
}

window.changeQty = function (id, delta) {
    const item = cart.find(i => i.id == id); if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.id != id);
    document.getElementById('cart-badge').innerText = cart.reduce((s, i) => s + i.qty, 0);
    if (appliedVoucherCode !== "") { appliedVoucherCode = ""; appliedDiscountAmount = 0; document.getElementById('voucher-input').value = ""; }
    saveCartState();
    renderCartUI(); autoApplyBestVoucher();
}

function renderCartUI() {
    const container = document.getElementById('cart-items-container');
    const subTotalEl = document.getElementById('cart-total-price');

    if (cart.length === 0) {
        container.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-primary/40 font-serif italic">Giỏ hàng trống.</div>`;
        document.getElementById('btn-to-checkout').classList.add('opacity-50', 'pointer-events-none');
        subTotalEl.innerHTML = formatVND(0);
        document.getElementById('final-total-price').innerHTML = formatVND(0);
        document.getElementById('btn-to-checkout').innerText = "Thanh Toán";
        return;
    }

    let html = ''; cartSubTotal = 0; let selectedCount = 0;

    cart.forEach(item => {
        if (item.selected === undefined) item.selected = true; // Fix dữ liệu cũ
        const isSelectedStr = item.selected ? 'checked' : '';
        const rowClass = item.selected ? '' : 'deselected';

        // Chỉ tính tiền những item được chọn
        if (item.selected) {
            cartSubTotal += item.price * item.qty;
            selectedCount += item.qty;
        }

        html += `
            <div class="flex gap-4 cart-item-row ${rowClass} items-center">
                <label class="luxury-checkbox-wrapper shrink-0">
                    <input type="checkbox" class="luxury-checkbox" ${isSelectedStr} onchange="toggleItemSelection(${item.id})">
                </label>
                <img src="${processDriveImage(item.image)}" class="cart-item-img shrink-0">
                <div class="flex-1 flex flex-col justify-between py-1">
                    <div>
                        <h4 class="font-serif text-lg text-primary leading-tight line-clamp-1">${item.name}</h4>
                        <p class="text-[11px] text-secondary mt-1">${formatVND(item.price)}</p>
                    </div>
                    <div class="flex items-center gap-3 mt-2">
                        <button onclick="changeQty(${item.id},-1)" class="qty-btn">-</button>
                        <span class="font-medium text-sm w-4 text-center">${item.qty}</span>
                        <button onclick="changeQty(${item.id},1)" class="qty-btn">+</button>
                    </div>
                </div>
            </div>`;
    });

    container.innerHTML = html;
    subTotalEl.innerHTML = formatVND(cartSubTotal);

    let finalPrice = Math.max(0, cartSubTotal - appliedDiscountAmount);
    document.getElementById('final-total-price').innerHTML = formatVND(finalPrice);

    const finalDiscountEl = document.getElementById('final-discount-text');
    if (appliedDiscountAmount > 0) {
        finalDiscountEl.innerHTML = `Mã [${appliedVoucherCode}] giảm: <span class="font-bold">${formatVND(appliedDiscountAmount)}</span> <button onclick="removeVoucher()" class="ml-1.5 text-red-500 hover:text-red-700 font-black transition-colors" title="Gỡ mã này">✕</button>`;
        finalDiscountEl.classList.remove('hidden');
    } else { finalDiscountEl.classList.add('hidden'); }

    // Logic Khóa/Mở nút thanh toán
    const btnCheckout = document.getElementById('btn-to-checkout');
    if (selectedCount === 0) {
        btnCheckout.classList.add('opacity-50', 'pointer-events-none');
        btnCheckout.innerText = "Vui lòng chọn sản phẩm";
    } else {
        btnCheckout.classList.remove('opacity-50', 'pointer-events-none');
        btnCheckout.innerText = `Thanh Toán (${selectedCount} SP)`;
    }
}

window.removeVoucher = function () {
    appliedVoucherCode = ""; appliedDiscountAmount = 0;
    document.getElementById('voucher-input').value = "";
    luxuryToast("Đã gỡ mã ưu đãi.");
    renderCartUI();
}

window.autoApplyBestVoucher = function () {
    if (cart.length === 0 || !LOGGED_USER) return;

    let bestCode = "";
    let bestDiscount = 0;

    ALL_VOUCHERS.forEach(v => {
        if (USED_VOUCHERS.includes(v.code.toUpperCase())) return;
        if (Number(v.usedCount) >= Number(v.maxUsage)) return; // Bỏ qua nếu mã đã hết lượt

        let eligibleAmount = 0;
        cart.forEach(item => {
            if (v.scope === 'ALL' || item.category === v.scope) {
                eligibleAmount += item.price * item.qty;
            }
        });

        // [CẬP NHẬT LOGIC] Kiểm tra chốt chặn Đơn hàng tối thiểu (MOV)
        const minRequired = Number(v.minOrderValue) || 0;
        if (eligibleAmount > 0 && eligibleAmount >= minRequired) {
            // Thực hiện tính toán mức giảm dựa trên định dạng PERCENT hoặc FIXED
            let calcDiscount = v.type === 'PERCENT' ? eligibleAmount * (Number(v.value) / 100) : Number(v.value);
            calcDiscount = Math.min(calcDiscount, eligibleAmount);

            if (calcDiscount > bestDiscount) {
                bestDiscount = calcDiscount;
                bestCode = v.code;
            }
        }
    });

    // CHỐT CHẶN KHẮT KHE: Chỉ tự động kích hoạt điền ô nhập khi mức giảm thực tế lớn hơn 0 và tối ưu hơn mã cũ
    if (bestDiscount > 0 && bestDiscount > appliedDiscountAmount) {
        appliedVoucherCode = bestCode;
        appliedDiscountAmount = bestDiscount;
        document.getElementById('voucher-input').value = bestCode;
        luxuryToast(`✨ Trợ lý hệ thống đã tự động áp dụng mã tốt nhất: [${bestCode}]`);
        renderCartUI();
    }
}

window.validateVoucherCode = async function () {
    if (!LOGGED_USER) return luxuryToast("Vui lòng đăng nhập để sử dụng mã ưu đãi!", true);
    const codeInput = document.getElementById('voucher-input').value.trim().toUpperCase();
    if (!codeInput) return luxuryToast("Vui lòng nhập hoặc chọn một mã ưu đãi!", true);
    if (cart.length === 0) return luxuryToast("Hãy chọn một sản phẩm vào giỏ hàng trước!", true);

    const btn = document.getElementById('btn-apply-voucher');
    const originalText = btn.innerText;
    btn.innerText = "ĐANG XÉT..."; btn.disabled = true;

    try {
        // Gửi dữ liệu về Backend để phân xử giá tiền
        const payload = { action: 'validateVoucher', payload: { token: sessionStorage.getItem('kem_token'), voucherCode: codeInput, cart: cart } };
        const res = await fetch(GOOGLE_API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json());

        if (res.status === 'success') {
            appliedVoucherCode = codeInput;
            appliedDiscountAmount = res.discount; // Backend báo giảm bao nhiêu thì lấy bấy nhiêu
            luxuryToast(`Mã hợp lệ! Đã giảm ${formatVND(appliedDiscountAmount)}.`);
            renderCartUI();
        } else {
            appliedVoucherCode = ""; appliedDiscountAmount = 0;
            luxuryToast(res.message, true);
            renderCartUI();
        }
    } catch (e) { luxuryToast("Lỗi kết nối khi kiểm tra mã.", true); }

    btn.innerText = originalText; btn.disabled = false;
}

window.toggleCart = function () { const d = document.getElementById('cart-drawer'); const b = document.getElementById('cart-backdrop'); d.classList.contains('open') ? (d.classList.remove('open'), b.classList.remove('open'), setTimeout(() => switchView('cart-view'), 500)) : (d.classList.add('open'), b.classList.add('open')); }
window.switchView = function (id) { document.querySelectorAll('.drawer-section').forEach(s => s.classList.remove('active')); document.getElementById(id).classList.add('active'); }

window.handleCheckoutNext = function () {
    if (!LOGGED_USER) { luxuryToast("Vui lòng đăng nhập để thanh toán an toàn.", true); toggleCart(); setTimeout(toggleAuthDrawer, 300); return; }
    switchView('checkout-view');
}

window.submitOrder = async function (e) {
    e.preventDefault();
    if (!LOGGED_USER) return luxuryToast("Vui lòng đăng nhập trước khi thanh toán!", true);

    const itemsToBuy = cart.filter(item => item.selected === true);
    if (itemsToBuy.length === 0) return luxuryToast("Chưa có sản phẩm nào được chọn!", true);

    setBtnLoading('btn-submit-order', true, 'ĐANG XÁC NHẬN ĐƠN...');
    const orderData = { action: 'createOrder', payload: { token: sessionStorage.getItem('kem_token'), customerName: document.getElementById('form-name').value, phone: document.getElementById('form-phone').value, address: document.getElementById('form-address').value, note: document.getElementById('form-note').value, voucher: appliedVoucherCode || "KHÔNG DÙNG", cart: itemsToBuy } };
    try {
        const res = await fetch(GOOGLE_API_URL, { method: 'POST', body: JSON.stringify(orderData) }).then(r => r.json());
        if (res.status === 'success') {
            // 1. Giữ lại các món chưa mua, dọn dẹp giao diện
            cart = cart.filter(item => item.selected === false);
            saveCartState();
            document.getElementById('cart-badge').innerText = cart.reduce((s, i) => s + i.qty, 0);
            appliedVoucherCode = "";
            appliedDiscountAmount = 0;
            document.getElementById('voucher-input').value = "";
            renderCartUI();
            switchView('success-view');
            e.target.reset();
            document.getElementById('form-name').value = LOGGED_USER.name;
            document.getElementById('form-phone').value = LOGGED_USER.phone;
            document.getElementById('form-address').value = LOGGED_USER.address || '';
            luxuryToast("🎉 Gửi đơn hàng thành công!");

            // TẠM BIỆT DÒNG NÀY: setTimeout(() => loginUser(), 1500);

            // 2. CẬP NHẬT GIAO DIỆN LỊCH SỬ ĐƠN HÀNG "SLYTH" (ÂM THẦM)
            const dashboardList = document.getElementById('dashboard-orders-list');

            // Nếu danh sách đang trống, xóa chữ "Bạn chưa có sản phẩm nào"
            if (dashboardList.innerHTML.includes("Bạn chưa có sản phẩm nào")) {
                dashboardList.innerHTML = '';
            }

            // Render danh sách sản phẩm vừa mua
            let itemsHtml = '<ul class="space-y-3 mb-4 border-t border-primary/10 pt-4">';
            orderData.payload.cart.forEach(i => {
                itemsHtml += `<li class="flex flex-col bg-surface/50 p-3 rounded-lg border border-primary/5">
            <span class="text-sm md:text-base font-bold text-primary tracking-tight leading-snug mb-1">${i.name}</span>
            <span class="text-[10px] font-medium text-secondary uppercase tracking-widest">Số lượng: <span class="font-bold text-primary text-xs">x${i.qty}</span></span>
        </li>`;
            });
            itemsHtml += '</ul>';

            // Render thông tin Voucher (Nếu có)
            const voucherHtml = (orderData.payload.voucher && orderData.payload.voucher !== 'KHÔNG DÙNG')
                ? `<p class="text-[9px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100 mt-2 w-max shadow-sm uppercase tracking-widest">MÃ ĐÃ DÙNG: ${orderData.payload.voucher}</p>` : '';

            // Lắp ráp thẻ (Card) Đơn hàng mới
            const newOrderCard = `
    <div class="border border-primary/10 p-5 rounded-2xl bg-surface hover:shadow-lg transition-shadow duration-300">
        <div class="flex justify-between items-center font-bold text-primary mb-1">
            <span class="tracking-widest text-[11px]">${res.orderId}</span>
            <span class="text-[10px] uppercase tracking-widest text-blue-600 bg-slate-50 px-2 py-1 rounded">CHƯA XÁC NHẬN</span>
        </div>
        <p class="text-[10px] text-secondary font-medium mb-2">Vừa xong</p>
        ${itemsHtml}
        <div class="flex flex-col border-t border-primary/5 pt-3 mt-1">
            <div class="flex justify-between items-end">
                <span class="font-serif font-bold text-primary text-xl">${formatVND(res.finalTotal)}</span>
                <button onclick="cancelOrderCustomer('${res.orderId}')" class="text-[9px] text-red-500 uppercase tracking-widest font-bold border border-red-200 bg-red-50 px-3 py-1.5 rounded hover:bg-red-500 hover:text-white transition-colors">Hủy đơn</button>
            </div>
            ${voucherHtml}
        </div>
    </div>`;

            // Chèn đơn hàng mới lên trên cùng của danh sách
            dashboardList.insertAdjacentHTML('afterbegin', newOrderCard);
            refreshAllData();
        } else { luxuryToast(res.message, true); }
    } catch (error) { luxuryToast("Lỗi kết nối CSDL", true); }
    setBtnLoading('btn-submit-order', false);
}

window.openContact = function () { const m = document.getElementById('contact-modal'); m.classList.remove('hidden'); m.classList.add('flex'); setTimeout(() => { m.classList.remove('opacity-0'); document.getElementById('contact-modal-content').classList.remove('scale-95', 'opacity-0'); }, 10); }
window.closeContact = function () { const m = document.getElementById('contact-modal'); m.classList.add('opacity-0'); document.getElementById('contact-modal-content').classList.add('scale-95', 'opacity-0'); setTimeout(() => m.classList.add('hidden'), 400); }
window.openLightbox = function (imgSrc) {
    // Giới hạn: Chỉ phóng to khi dùng trên điện thoại (màn hình < 768px). 
    // Lời khuyên thiết kế: Nếu bạn muốn PC cũng phóng to được (tính năng rất sang trọng), hãy XÓA dòng if bên dưới đi!
    if (window.innerWidth > 768) return;

    const lb = document.getElementById('image-lightbox');
    const lbImg = document.getElementById('lightbox-img');
    lbImg.src = imgSrc;
    lb.classList.remove('pointer-events-none');

    // Kích hoạt hiệu ứng Reflow (Trượt và Zoom)
    setTimeout(() => {
        lb.classList.remove('opacity-0');
        lbImg.classList.remove('scale-90');
        lbImg.classList.add('scale-100');
    }, 10);
}

window.closeLightbox = function () {
    const lb = document.getElementById('image-lightbox');
    const lbImg = document.getElementById('lightbox-img');

    // Kích hoạt hiệu ứng thu nhỏ
    lb.classList.add('opacity-0');
    lbImg.classList.remove('scale-100');
    lbImg.classList.add('scale-90');

    // Trả lại tài nguyên sau khi hiệu ứng kết thúc
    setTimeout(() => {
        lb.classList.add('pointer-events-none');
        lbImg.src = "";
    }, 400);
}

// ==========================================
// RENDER GIAO DIỆN (LƯỚI SẢN PHẨM & SLIDER)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    fetchStoreData();

    const badge = document.getElementById('cart-badge');
    if (badge) {
        badge.innerText = cart.reduce((s, i) => s + i.qty, 0);
        // if (cart.length > 0) badge.classList.add('pop'); // Tạo hiệu ứng nảy nhẹ nếu có hàng
    }
    if (typeof renderCartUI === 'function') renderCartUI();

    const ITEMS_PER_PAGE = 12; let currentCategory = 'all'; let currentPage = 1; let filteredProducts = [];
    const gridElement = document.getElementById("product-grid"); const paginationContainer = document.getElementById("pagination-controls"); const pageIndicator = document.getElementById("page-indicator"); const btnPrev = document.getElementById("page-prev"); const btnNext = document.getElementById("page-next");

    const revealObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); obs.unobserve(entry.target); } });
    }, { root: null, rootMargin: '0px', threshold: 0.1 });

    window.renderProductsList = function () {
        gridElement.style.opacity = 0;
        setTimeout(() => {
            gridElement.innerHTML = '';
            if (filteredProducts.length === 0) { gridElement.innerHTML = `<div class="col-span-full text-center py-10 font-serif italic text-primary/50">Danh mục này hiện chưa có sản phẩm nào.</div>`; paginationContainer.style.opacity = 0; paginationContainer.style.pointerEvents = 'none'; gridElement.style.opacity = 1; return; }

            const startIndex = (currentPage - 1) * ITEMS_PER_PAGE; const endIndex = startIndex + ITEMS_PER_PAGE; const productsToShow = filteredProducts.slice(startIndex, endIndex); const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);

            productsToShow.forEach((p, index) => {
                const delayStr = (index % 4) * 0.1 + 's';
                // TOÀN BỘ HIỆU ỨNG HOVER, NÚT DUAL ACTION ĐƯỢC GIỮ NGUYÊN VÀ THÊM BTN-HOVER
                const cardHTML = `<div class="product-card group" style="transition-delay: ${delayStr}"><div class="card-img-wrapper"><img src="${processDriveImage(p.image)}" alt="${p.name}" onclick="openLightbox('${processDriveImage(p.image)}')" class="cursor-pointer"><div class="quick-action-bar">
                                        <button onclick="addToCart(${p.id})" class="flex-1 bg-white/90 backdrop-blur-md text-primary text-[10px] font-semibold tracking-[0.2em] uppercase py-3 lg:py-4 rounded-full border border-white/50 shadow-xl hover-scale hover:bg-primary hover:text-white transition-all duration-300 ease-in-out max-md:w-10 max-md:h-10 max-md:p-0 max-md:flex max-md:justify-center max-md:items-center max-md:flex-none">
                                            <span class="max-md:hidden">Thêm Giỏ</span><svg class="quick-btn-icon max-md:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                                        </button>
                                        <button onclick="openContact()" class="flex-1 bg-primary/90 backdrop-blur-md text-white text-[10px] font-semibold tracking-[0.2em] uppercase py-3 lg:py-4 rounded-full border border-primary/50 shadow-xl hover-scale hover:bg-white hover:text-primary transition-all duration-300 ease-in-out max-md:w-10 max-md:h-10 max-md:p-0 max-md:flex max-md:justify-center max-md:items-center max-md:flex-none">
                                            <span class="max-md:hidden">Liên Hệ</span><svg class="quick-btn-icon max-md:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="mt-4 md:mt-6">
                                    <p class="text-[8px] md:text-[9px] font-medium uppercase tracking-widest text-secondary mb-1">${p.tag}</p>
                                    <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-1 md:gap-0">
                                        <h4 class="font-serif text-base md:text-xl text-primary pr-2 font-medium">${p.name}</h4>
                                        <span class="font-serif text-sm md:text-lg text-primary font-medium">${formatVND(p.price)}</span>
                                    </div>
                                </div>
                            </div>`;
                gridElement.insertAdjacentHTML('beforeend', cardHTML);
            });

            document.querySelectorAll('.product-card').forEach(card => revealObserver.observe(card));
            if (totalPages <= 1) { paginationContainer.style.opacity = 0; paginationContainer.style.pointerEvents = 'none'; } else { paginationContainer.style.opacity = 1; paginationContainer.style.pointerEvents = 'auto'; pageIndicator.innerText = `${currentPage} / ${totalPages}`; btnPrev.disabled = (currentPage === 1); btnNext.disabled = (currentPage === totalPages); }
            gridElement.style.opacity = 1; if (startIndex > 0) window.scrollTo({ top: document.getElementById('boutique-section').offsetTop - 80, behavior: 'smooth' });
        }, 400);
    }

    // CỖ MÁY LỌC TỐI THƯỢNG (DANH MỤC + KHOẢNG GIÁ + SẮP XẾP)
    window.filterCategory = function (cat) {
        currentCategory = cat;
        applyMasterFilter();
    }

    window.applyMasterFilter = function () {
        // 1. Lọc theo danh mục trước
        let tempProducts = currentCategory === 'all' ? [...ALL_PRODUCTS] : ALL_PRODUCTS.filter(p => p.category === currentCategory);

        // 2. Lọc theo khoảng giá
        const minStr = document.getElementById('min-price-filter').value;
        const maxStr = document.getElementById('max-price-filter').value;
        const minPrice = minStr ? parseFloat(minStr) : 0;
        const maxPrice = maxStr ? parseFloat(maxStr) : Infinity;

        tempProducts = tempProducts.filter(p => {
            const price = parseFloat(p.price) || 0;
            return price >= minPrice && price <= maxPrice;
        });

        // 3. Xử lý sắp xếp (Sort)
        const sortValue = document.getElementById('price-sort-filter').value;
        if (sortValue === 'asc') {
            tempProducts.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
        } else if (sortValue === 'desc') {
            tempProducts.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
        }

        // 4. Render lại giao diện
        filteredProducts = tempProducts;
        currentPage = 1;
        renderProductsList();
    }
    document.querySelectorAll('.cat-btn').forEach(btn => { btn.addEventListener('click', function () { if (this.classList.contains('active')) return; document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active', 'text-primary')); this.classList.add('active', 'text-primary'); filterCategory(this.getAttribute('data-cat')); }); });
    btnPrev.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderProductsList(); } }); btnNext.addEventListener('click', () => { const total = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE); if (currentPage < total) { currentPage++; renderProductsList(); } });

    // KHỞI ĐỘNG PRELOADER VÀ SLIDER
    const intro = document.getElementById("luxury-intro");
    setTimeout(() => document.getElementById("intro-text").style.opacity = 1, 300);
    setTimeout(() => document.getElementById("intro-text").style.opacity = 0, 1500);
    setTimeout(() => document.getElementById("bloom-container").classList.add("blooming"), 1800);
    setTimeout(() => document.getElementById("light-burst").classList.add("expand"), 3000);
    setTimeout(() => intro.style.opacity = 0, 3700);

    // [INFINITY EDGE UX] Thay đổi màu thanh trình duyệt (Status Bar) theo thời gian thực khi cuộn
    window.addEventListener('scroll', () => {
      const h = document.getElementById('main-header');
      const themeMeta = document.getElementById('meta-theme-color');
      
      if (window.scrollY > 50) {
        h.classList.add('scrolled');
        h.classList.remove('hero-mode');
        // Khi cuộn xuống: Thanh trình duyệt tiệp màu với nền Web (#EBF2F6)
        if (themeMeta.getAttribute('content') !== '#EBF2F6') themeMeta.setAttribute('content', '#EBF2F6');
      } else {
        h.classList.remove('scrolled');
        h.classList.add('hero-mode');
        // Khi ở đỉnh trang: Thanh trình duyệt tiệp màu với ảnh tối (#142534)
        if (themeMeta.getAttribute('content') !== '#142534') themeMeta.setAttribute('content', '#142534');
      }
    });

    const slides = document.querySelectorAll('.slide');
    let active = 0;
    let slideInterval;

    // 3. THỜI KHẮC MÀN CHÀO KẾT THÚC (4200ms)
    setTimeout(() => {
        document.body.classList.add("is-loaded");
        intro.remove();

        // CHÍNH LÀ LÚC NÀY: Bơm sự sống (class active) vào Slide đầu tiên!
        // Lập tức, bức ảnh nền sẽ bắt đầu zoom từ từ (scale 1.1 -> 1) ĐỒNG THỜI với lúc chữ bay lên.
        slides[0].classList.add('active');

        // Khởi động động cơ 11 giây tự động chuyển
        resetSlideInterval();
    }, 4200);

    window.goToSlide = (i) => {
        slides[active].classList.remove('active');
        active = (i + 6) % 6;
        slides[active].classList.add('active');
        document.getElementById('current-slide').innerText = `0${active + 1}`;
        document.getElementById('progress-bar').style.width = `${((active + 1) / 6) * 100}%`;
        resetSlideInterval(); // Reset lại thời gian khi có thao tác chuyển
    };

    document.getElementById('btn-next').onclick = () => goToSlide(active + 1);
    document.getElementById('btn-prev').onclick = () => goToSlide(active - 1);

    // ĐỘNG CƠ TỰ ĐỘNG CHUYỂN SLIDE MỖI 11 GIÂY (11000 mili-giây)
    function resetSlideInterval() {
        if (slideInterval) clearInterval(slideInterval);
        slideInterval = setInterval(() => {
            // Tự động chuyển sang slide tiếp theo
            goToSlide(active + 1);
        }, 11000);
    }

    // Kích hoạt động cơ ngay khi tải trang
    resetSlideInterval();
    let tsX = 0, teX = 0; document.getElementById('hero-section').addEventListener('touchstart', e => { tsX = e.changedTouches[0].screenX; }, { passive: true }); document.getElementById('hero-section').addEventListener('touchend', e => { teX = e.changedTouches[0].screenX; if (tsX - teX > 50) goToSlide(active + 1); if (teX - tsX > 50) goToSlide(active - 1); }, { passive: true });
});

// ==========================================
// CUSTOM FILTER UI LOGIC - MONOLITHIC EDITION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const trigger = document.getElementById('custom-sort-trigger');
    const menu = document.getElementById('custom-sort-menu');
    const icon = document.getElementById('custom-sort-icon');
    const textDisplay = document.getElementById('custom-sort-text');
    const hiddenSelect = document.getElementById('price-sort-filter');
    const options = document.querySelectorAll('.sort-option');

    if (!trigger) return;

    // Mở/Đóng menu mượt mà
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('open');
        icon.classList.toggle('rotate');
    });

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !trigger.contains(e.target)) {
            menu.classList.remove('open');
            icon.classList.remove('rotate');
        }
    });

    // Lựa chọn option
    options.forEach(option => {
        option.addEventListener('click', () => {
            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');

            const val = option.getAttribute('data-value');

            // Cập nhật text nhưng CỐ ĐỊNH font chữ, không làm gãy trải nghiệm thị giác
            textDisplay.innerText = option.innerText.trim();

            // Đồng bộ dữ liệu ngầm
            hiddenSelect.value = val;
            menu.classList.remove('open');
            icon.classList.remove('rotate');

            if (typeof applyMasterFilter === 'function') {
                applyMasterFilter();
            }
        });
    });

    // Trạng thái mặc định
    document.querySelector('.sort-option[data-value="default"]').classList.add('selected');
});

// HÀM MỚI: Tách riêng việc render Voucher để không làm nháy lưới sản phẩm
function renderVouchersOnly() {
    const vContainer = document.getElementById('public-vouchers-container');
    if (!vContainer) return;

    if (ALL_VOUCHERS.length > 0) {
        let vHtml = '';
        ALL_VOUCHERS.forEach(v => {
            // Kiểm tra khách đã dùng mã chưa
            if (USED_VOUCHERS.includes(v.code.toUpperCase())) return;

            // Xử lý hiển thị phần trăm hoặc tiền
            let displayValue = v.type === 'PERCENT' ? `Giảm ${v.value}%` : `Giảm ${formatVND(v.value)}`;

            // [UX DESIGN] Xử lý hiển thị điều kiện đơn tối thiểu tinh tế
            let minOrderText = (Number(v.minOrderValue) > 0) ? ` - Đơn từ ${formatVND(v.minOrderValue)}` : ``;

            vHtml += `<span onclick="document.getElementById('voucher-input').value='${v.code}'; validateVoucherCode()" class="cursor-pointer px-3 py-1.5 bg-primary/5 text-primary text-[9px] font-bold tracking-[0.2em] uppercase rounded hover:bg-primary hover:text-white transition-all hover-scale border border-primary/10 shadow-sm" title="${v.description}">${v.code} - ${displayValue}${minOrderText}</span>`;
        });
        vContainer.innerHTML = vHtml;
    } else {
        vContainer.innerHTML = '';
    }
}
