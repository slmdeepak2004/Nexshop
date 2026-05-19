// app.js — NexShop Storefront Logic
import { db } from "./firebase-config.js";
import {
  collection, getDocs, addDoc, doc, setDoc, updateDoc, increment, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ─── State ────────────────────────────────────────────────
let products = [];
let categories = [];
let cart = [];
let currentUser = null;
let currentBillData = null;

// ─── DOM refs ─────────────────────────────────────────────
const productsGrid    = document.getElementById("productsGrid");
const categoryBar     = document.getElementById("categoryBar");
const cartBody        = document.getElementById("cartBody");
const cartBadge       = document.getElementById("cartBadge");
const cartTotal       = document.getElementById("cartTotal");
const cartDrawer      = document.getElementById("cartDrawer");
const cartOverlay     = document.getElementById("cartOverlay");
const authModal       = document.getElementById("authModal");
const paymentModal    = document.getElementById("paymentModal");
const billModal       = document.getElementById("billModal");
const userGreeting    = document.getElementById("userGreeting");
const profileBtn      = document.getElementById("profileBtn");
const adminPanelBtn   = document.getElementById("adminPanelBtn");
const authNavBtn      = document.getElementById("authNavBtn");
const storefrontView  = document.getElementById("storefrontView");
const profileView     = document.getElementById("profileView");
const historyContainer= document.getElementById("historyContainer");
const searchInput     = document.getElementById("searchInput");

// ─── Init ─────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  await loadStoreData();
  renderCategories();
  renderProducts("all");
  setupPaymentMethods();
  restoreSession();
});

// ─── Data Loading ──────────────────────────────────────────
async function loadStoreData() {
  try {
    const [catSnap, prodSnap] = await Promise.all([
      getDocs(collection(db, "categories")),
      getDocs(collection(db, "products"))
    ]);
    categories = catSnap.docs.map(d => d.data());
    products   = prodSnap.docs.map(d => d.data());
  } catch (err) {
    showToast("Failed to load products. Check your connection.", "error");
  }
}

// ─── Session Persistence ──────────────────────────────────
function restoreSession() {
  const saved = sessionStorage.getItem("nexshop_user");
  if (saved) {
    try {
      const u = JSON.parse(saved);
      loginUser(u, false);
    } catch (_) { sessionStorage.removeItem("nexshop_user"); }
  }
}

// ─── Categories ────────────────────────────────────────────
function renderCategories() {
  categories.forEach(cat => {
    const chip = document.createElement("div");
    chip.className = "cat-chip";
    chip.textContent = cat.category_name;
    chip.dataset.id = cat.category_id;
    chip.addEventListener("click", () => {
      document.querySelectorAll(".cat-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderProducts(cat.category_id);
    });
    categoryBar.appendChild(chip);
  });

  // "All" chip click
  categoryBar.firstElementChild.addEventListener("click", () => {
    document.querySelectorAll(".cat-chip").forEach(c => c.classList.remove("active"));
    categoryBar.firstElementChild.classList.add("active");
    renderProducts("all");
  });
}

// ─── Products ──────────────────────────────────────────────
function renderProducts(filterCatId, searchTerm = "") {
  let list = filterCatId === "all" ? products : products.filter(p => p.category_id === filterCatId);
  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    list = list.filter(p =>
      p.product_name.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q)
    );
  }

  if (list.length === 0) {
    productsGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <span class="icon">🔍</span>
      <h3>No products found</h3>
      <p>Try a different category or search term.</p>
    </div>`;
    return;
  }

  productsGrid.innerHTML = "";
  list.forEach(p => {
    const salePrice = p.discount > 0
      ? (p.price - p.price * p.discount / 100).toFixed(2)
      : null;
    const displayPrice = salePrice || p.price.toFixed(2);
    const catName = categories.find(c => c.category_id === p.category_id)?.category_name || "";
    const stockClass = p.stock <= 0 ? "out" : p.stock < 10 ? "low" : "ok";
    const stockLabel = p.stock <= 0 ? "Out of Stock" : p.stock < 10 ? `Only ${p.stock} left!` : `${p.stock} in stock`;

    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      ${p.discount > 0 ? `<div class="prod-discount-badge">-${p.discount}% OFF</div>` : ""}
      ${p.image_url ? `<img class="prod-image" src="${p.image_url}" alt="${p.product_name}" onerror="this.style.display='none'" />` : ""}
      <div class="prod-cat-badge">${catName}</div>
      <div class="prod-title">${p.product_name}</div>
      <div class="prod-desc">${p.description || ""}</div>
      <div class="prod-price-row">
        <span class="prod-price">₹${displayPrice}</span>
        ${salePrice ? `<span class="prod-orig-price">₹${p.price.toFixed(2)}</span>` : ""}
      </div>
      <div class="prod-stock stock-${stockClass}">${stockLabel}</div>
      <button class="btn btn-primary btn-full" ${p.stock <= 0 ? "disabled" : ""} data-pid="${p.product_id}">
        ${p.stock <= 0 ? "Out of Stock" : "Add to Cart"}
      </button>
    `;
    card.querySelector("button[data-pid]")?.addEventListener("click", () => addToCart(p));
    productsGrid.appendChild(card);
  });
}

// Search
let activeCatFilter = "all";
categoryBar.addEventListener("click", e => {
  const chip = e.target.closest(".cat-chip");
  if (chip) activeCatFilter = chip.dataset.id;
});
searchInput.addEventListener("input", () => {
  renderProducts(activeCatFilter, searchInput.value);
});

// ─── Cart Logic ────────────────────────────────────────────
function addToCart(product) {
  // Check current stock vs quantity already in cart
  const alreadyInCart = cart.find(i => i.product_id === product.product_id);
  const cartQty = alreadyInCart ? alreadyInCart.quantity : 0;
  if (product.stock <= 0) {
    showToast(`"${product.product_name}" is out of stock.`, "error");
    return;
  }
  if (cartQty >= product.stock) {
    showToast(`Only ${product.stock} unit(s) available — you already have ${cartQty} in cart.`, "error");
    return;
  }
  const price = product.discount > 0
    ? parseFloat((product.price - product.price * product.discount / 100).toFixed(2))
    : product.price;

  const existing = cart.find(i => i.product_id === product.product_id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ product_id: product.product_id, product_name: product.product_name, price, image_url: product.image_url || "", quantity: 1 });
  }
  syncCart();
  showToast(`"${product.product_name}" added to cart ✓`, "success");
}

function syncCart() {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  cartBadge.textContent = count;
  cartTotal.textContent = `₹${total.toFixed(2)}`;

  if (cart.length === 0) {
    cartBody.innerHTML = `<div class="cart-empty"><span class="icon">🛍️</span><p>Your cart is empty</p></div>`;
    return;
  }

  cartBody.innerHTML = "";
  cart.forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = "cart-item";
    el.innerHTML = `
      ${item.image_url ? `<img class="cart-item-img" src="${item.image_url}" alt="${item.product_name}" onerror="this.style.display='none'" />` : `<div class="cart-item-img" style="background:var(--gray-lt);display:flex;align-items:center;justify-content:center;font-size:22px;">📦</div>`}
      <div class="cart-item-info">
        <div class="cart-item-name">${item.product_name}</div>
        <div class="cart-item-price">₹${item.price.toFixed(2)} each</div>
        <div class="qty-controls">
          <button class="qty-btn" data-action="dec" data-idx="${idx}">−</button>
          <span class="qty-display">${item.quantity}</span>
          <button class="qty-btn" data-action="inc" data-idx="${idx}">+</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
        <span class="cart-item-total">₹${(item.price * item.quantity).toFixed(2)}</span>
        <button class="btn-cart-remove" data-idx="${idx}" title="Remove">🗑</button>
      </div>
    `;
    el.querySelector("[data-action='inc']").addEventListener("click", () => {
      const prod = products.find(p => p.product_id === cart[idx].product_id);
      const maxStock = prod ? prod.stock : Infinity;
      if (cart[idx].quantity >= maxStock) {
        showToast(`Only ${maxStock} unit(s) in stock`, "error");
        return;
      }
      cart[idx].quantity += 1; syncCart();
    });
    el.querySelector("[data-action='dec']").addEventListener("click", () => {
      if (cart[idx].quantity > 1) { cart[idx].quantity -= 1; } else { cart.splice(idx, 1); }
      syncCart();
    });
    el.querySelector(".btn-cart-remove").addEventListener("click", () => {
      cart.splice(idx, 1); syncCart();
      showToast("Item removed from cart.");
    });
    cartBody.appendChild(el);
  });
}

// Cart open/close
document.getElementById("openCartBtn").addEventListener("click", () => { cartDrawer.classList.add("open"); cartOverlay.classList.add("open"); });
document.getElementById("closeCartBtn").addEventListener("click", closeCart);
cartOverlay.addEventListener("click", closeCart);
function closeCart() { cartDrawer.classList.remove("open"); cartOverlay.classList.remove("open"); }

// ─── Auth ──────────────────────────────────────────────────
document.getElementById("authNavBtn").addEventListener("click", () => {
  if (currentUser) {
    logoutUser();
  } else {
    authModal.classList.add("open");
  }
});
document.getElementById("closeAuthBtn").addEventListener("click", () => authModal.classList.remove("open"));

// Auth tabs
document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".auth-tab-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`${tab.dataset.tab}Panel`).classList.add("active");
  });
});

// Login
document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const pass  = document.getElementById("loginPassword").value;
  try {
    const snap = await getDocs(collection(db, "users"));
    const match = snap.docs.map(d => d.data()).find(u => u.email.toLowerCase() === email && u.password === pass);
    if (match) {
      loginUser(match, true);
      authModal.classList.remove("open");
      document.getElementById("loginForm").reset();
    } else {
      showToast("Invalid email or password.", "error");
    }
  } catch (err) {
    showToast("Login failed. Try again.", "error");
  }
});

// Register
document.getElementById("registerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const uid = "usr_" + Date.now();
  const payload = {
    userid:     uid,
    first_name: document.getElementById("regFirst").value.trim(),
    last_name:  document.getElementById("regLast").value.trim(),
    mobile:     document.getElementById("regMobile").value.trim(),
    email:      document.getElementById("regEmail").value.trim().toLowerCase(),
    password:   document.getElementById("regPassword").value,
    credit_limit: 5000,
    user_admin: "user",
    created_at: new Date().toISOString()
  };
  try {
    await setDoc(doc(db, "users", uid), payload);
    loginUser(payload, true);
    authModal.classList.remove("open");
    document.getElementById("registerForm").reset();
    showToast("Account created! Welcome to NexShop.", "success");
  } catch (err) {
    showToast("Registration failed. Try again.", "error");
  }
});

function loginUser(user, persist = true) {
  currentUser = user;
  if (persist) sessionStorage.setItem("nexshop_user", JSON.stringify(user));
  userGreeting.innerHTML = `Signed in: <b>${user.first_name}</b>`;
  authNavBtn.textContent = "Logout";
  profileBtn.style.display = "inline-flex";
  if (user.user_admin === "admin" || user.role === "admin") {
    adminPanelBtn.style.display = "inline-flex";
  }
}

function logoutUser() {
  currentUser = null;
  sessionStorage.removeItem("nexshop_user");
  userGreeting.textContent = "Welcome, Guest";
  authNavBtn.textContent = "Login / Register";
  profileBtn.style.display = "none";
  adminPanelBtn.style.display = "none";
  showView("storefront");
  showToast("You've been logged out.");
}

// ─── View Switching ────────────────────────────────────────
function showView(view) {
  storefrontView.classList.remove("active");
  profileView.classList.remove("active");
  if (view === "storefront") storefrontView.classList.add("active");
  else if (view === "profile") profileView.classList.add("active");
}

document.getElementById("homeLogo").addEventListener("click", () => showView("storefront"));
document.getElementById("backToStoreBtn").addEventListener("click", () => showView("storefront"));
profileBtn.addEventListener("click", () => { showView("profile"); loadProfileData(); });
adminPanelBtn.addEventListener("click", () => { window.location.href = "admin.html"; });

// ─── Profile & History ─────────────────────────────────────
async function loadProfileData() {
  if (!currentUser) return;
  const av = document.getElementById("profileAvatar");
  av.textContent = currentUser.first_name.charAt(0).toUpperCase();
  document.getElementById("profileName").innerHTML =
    `${currentUser.first_name} ${currentUser.last_name}
     <span class="profile-badge">${currentUser.user_admin === "admin" ? "Admin" : "Member"}</span>`;
  document.getElementById("profileMeta").textContent =
    `${currentUser.email} · ${currentUser.mobile}`;

  historyContainer.innerHTML = `<div class="empty-state"><span class="icon">⏳</span><p>Loading orders…</p></div>`;

  try {
    const snap = await getDocs(collection(db, "history"));
    const all  = snap.docs.map(d => d.data());
    const mine = all.filter(i => i.userid === currentUser.userid);

    if (mine.length === 0) {
      historyContainer.innerHTML = `<div class="empty-state"><span class="icon">📦</span><h3>No orders yet</h3><p>Your purchase history will appear here.</p></div>`;
      return;
    }

    // Group by bill_no
    const groups = {};
    mine.forEach(i => {
      if (!groups[i.bill_no]) groups[i.bill_no] = { meta: i, items: [] };
      groups[i.bill_no].items.push(i);
    });

    historyContainer.innerHTML = "";
    Object.entries(groups).sort(([,a],[,b]) => new Date(b.meta.timestamp) - new Date(a.meta.timestamp)).forEach(([billNo, grp]) => {
      const total = grp.items.reduce((s, i) => s + i.cost, 0);
      const date  = new Date(grp.meta.timestamp).toLocaleString();
      const card  = document.createElement("div");
      card.className = "history-card";
      card.innerHTML = `
        <div class="history-card-header">
          <div>
            <div class="bill-id">Invoice #${billNo}</div>
            <div class="bill-date">${date}</div>
          </div>
          <div>
            <span style="background:var(--amber);color:var(--navy);padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;">
              ₹${total.toFixed(2)}
            </span>
          </div>
        </div>
        <div class="history-card-body">
          <div class="history-meta-row">
            <span>💳 <b>${grp.meta.mode_of_payment}</b></span>
            <span>🚚 Est. Delivery: <b>${grp.meta.estimated_delivery_date}</b></span>
            <span>📍 ${grp.meta.address || "—"}</span>
          </div>
          <table class="inv-table">
            <thead><tr><th>Product</th><th>Qty</th><th>Amount</th></tr></thead>
            <tbody>
              ${grp.items.map(i => `<tr><td>${i.product_name} <code>${i.product_id}</code></td><td>${i.quantity}</td><td>₹${i.cost.toFixed(2)}</td></tr>`).join("")}
              <tr class="inv-total-row"><td colspan="2"><b>Total</b></td><td><b>₹${total.toFixed(2)}</b></td></tr>
            </tbody>
          </table>
          <button class="btn btn-ghost btn-sm download-inv-btn" onclick="window.viewInvoice('${billNo}')">🧾 View Invoice</button>
        </div>
      `;
      historyContainer.appendChild(card);
    });
  } catch (err) {
    historyContainer.innerHTML = `<div class="empty-state"><span class="icon">⚠️</span><p>Error loading history.</p></div>`;
  }
}

// ─── Payment Flow ──────────────────────────────────────────
function setupPaymentMethods() {
  document.querySelectorAll(".pay-method").forEach(m => {
    m.addEventListener("click", () => {
      document.querySelectorAll(".pay-method").forEach(x => x.classList.remove("selected"));
      m.classList.add("selected");
      m.querySelector("input").checked = true;
    });
  });
}

document.getElementById("checkoutBtn").addEventListener("click", () => {
  if (cart.length === 0) { showToast("Your cart is empty!", "error"); return; }
  if (!currentUser) { showToast("Please sign in to checkout.", "error"); authModal.classList.add("open"); return; }

  closeCart();
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  document.getElementById("paySummary").innerHTML = `
    ${cart.map(i => `<div class="pay-row"><span>${i.product_name} × ${i.quantity}</span><span>₹${(i.price * i.quantity).toFixed(2)}</span></div>`).join("")}
    <div class="pay-row"><span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
    <div class="pay-row"><span>Tax (8%)</span><span>₹${tax.toFixed(2)}</span></div>
    <div class="pay-row"><span>Total</span><span>₹${total.toFixed(2)}</span></div>
  `;

  paymentModal.classList.add("open");
});

document.getElementById("closePaymentBtn").addEventListener("click", () => paymentModal.classList.remove("open"));
document.getElementById("cancelPaymentBtn").addEventListener("click", () => paymentModal.classList.remove("open"));

document.getElementById("paymentForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Processing…";

  const billNo   = "BILL_" + Math.floor(100000 + Math.random() * 900000);
  const method   = document.querySelector('input[name="payMethod"]:checked').value;
  const address  = document.getElementById("payAddress").value;
  const delivery = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
  const now      = new Date().toISOString();
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax      = subtotal * 0.08;
  const grandTotal = subtotal + tax;

  try {
    for (const item of cart) {
      await addDoc(collection(db, "history"), {
        bill_no: billNo,
        userid:  currentUser.userid,
        product_id:   item.product_id,
        product_name: item.product_name,
        quantity:     item.quantity,
        cost:         parseFloat((item.price * item.quantity).toFixed(2)),
        mode_of_payment: method,
        estimated_delivery_date: delivery,
        address,
        timestamp: now
      });
      // Reduce stock in Firestore
      await updateDoc(doc(db, "products", item.product_id), {
        stock: increment(-item.quantity)
      });
      // Also update local products array so UI reflects new stock immediately
      const localProd = products.find(p => p.product_id === item.product_id);
      if (localProd) localProd.stock -= item.quantity;
    }

    currentBillData = { billNo, method, address, delivery, now, cart: [...cart], subtotal, tax, grandTotal };

    cart = [];
    syncCart();
    paymentModal.classList.remove("open");
    renderBill();
    renderProducts(activeCatFilter, searchInput.value); // refresh stock labels & buttons
    showToast("Order placed successfully! 🎉", "success");
  } catch (err) {
    showToast("Payment failed. Try again.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Order & Pay →";
  }
});

// ─── Bill / Receipt ────────────────────────────────────────
function renderBill() {
  const d = currentBillData;
  if (!d) return;

  document.getElementById("billContent").innerHTML = `
    <div class="bill-meta">
      <div class="bill-meta-item"><div class="label">Invoice #</div><div class="val">${d.billNo}</div></div>
      <div class="bill-meta-item"><div class="label">Date</div><div class="val">${new Date(d.now).toLocaleString()}</div></div>
      <div class="bill-meta-item"><div class="label">Payment</div><div class="val">${d.method}</div></div>
      <div class="bill-meta-item"><div class="label">Est. Delivery</div><div class="val">${d.delivery}</div></div>
      <div class="bill-meta-item" style="grid-column:1/-1"><div class="label">Delivery Address</div><div class="val">${d.address}</div></div>
    </div>
    <div class="bill-meta" style="grid-template-columns:1fr">
      <div class="bill-meta-item"><div class="label">Customer</div><div class="val">${currentUser.first_name} ${currentUser.last_name}</div></div>
    </div>
    <table class="bill-table">
      <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
      <tbody>
        ${d.cart.map(i => `<tr><td>${i.product_name}</td><td>${i.quantity}</td><td>₹${i.price.toFixed(2)}</td><td>₹${(i.price * i.quantity).toFixed(2)}</td></tr>`).join("")}
        <tr class="bill-total-row"><td colspan="3">Subtotal</td><td>₹${d.subtotal.toFixed(2)}</td></tr>
        <tr class="bill-total-row"><td colspan="3">Tax (8%)</td><td>₹${d.tax.toFixed(2)}</td></tr>
        <tr class="bill-total-row" style="font-size:16px;"><td colspan="3"><b>TOTAL PAID</b></td><td><b>₹${d.grandTotal.toFixed(2)}</b></td></tr>
      </tbody>
    </table>
  `;

  billModal.classList.add("open");
}

window.viewInvoice = (billNo) => {
  showToast(`Invoice ${billNo} — visit My Account → Purchase History to view details.`, "");
};

document.getElementById("closeBillBtn").addEventListener("click",  () => billModal.classList.remove("open"));
document.getElementById("closeBillBtn2").addEventListener("click", () => billModal.classList.remove("open"));
billModal.addEventListener("click", (e) => { if (e.target === billModal) billModal.classList.remove("open"); });

// ─── Toast Utility ─────────────────────────────────────────
function showToast(msg, type = "") {
  const c = document.getElementById("toastContainer");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
