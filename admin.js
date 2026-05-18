// admin.js — NexShop Admin Console Logic
import { db } from "./firebase-config.js";
import {
  collection, getDocs, doc, setDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ─── State ────────────────────────────────────────────────
let allProducts    = [];
let allCategories  = [];
let allOrders      = [];
let allUsers       = [];
let editingId      = null;   // null = new, string = editing
let adminUser      = null;

// ─── DOM ──────────────────────────────────────────────────
const authOverlay    = document.getElementById("authOverlay");
const productModal   = document.getElementById("productModal");
const productForm    = document.getElementById("productForm");
const inventoryBody  = document.getElementById("inventoryBody");
const ordersContainer= document.getElementById("ordersContainer");
const customersBody  = document.getElementById("customersBody");

// ─── Login ────────────────────────────────────────────────
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("adminEmail").value.trim().toLowerCase();
  const pass  = document.getElementById("adminPass").value;
  const errEl = document.getElementById("loginError");
  errEl.style.display = "none";

  try {
    const snap = await getDocs(collection(db, "users"));
    const match = snap.docs.map(d => d.data()).find(u =>
      u.email.toLowerCase() === email &&
      u.password === pass &&
      (u.user_admin === "admin" || u.role === "admin")
    );

    if (match) {
      adminUser = match;
      document.getElementById("adminGreeting").innerHTML = `Signed in as <b>${match.first_name} ${match.last_name}</b>`;
      authOverlay.style.display = "none";
      startDashboard();
    } else {
      errEl.style.display = "block";
    }
  } catch (err) {
    errEl.textContent = "Connection error: " + err.message;
    errEl.style.display = "block";
  }
});

// ─── Logout ───────────────────────────────────────────────
document.getElementById("logoutBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});

// ─── Dashboard Init ────────────────────────────────────────
async function startDashboard() {
  await Promise.all([loadCategories(), loadProducts(), loadOrders(), loadUsers()]);
  updateStats();
  renderInventory();
  renderOrders();
  renderCustomers();

  // Live product updates
  onSnapshot(collection(db, "products"), snap => {
    allProducts = snap.docs.map(d => d.data());
    renderInventory();
    updateStats();
  });
}

// ─── Data Loaders ─────────────────────────────────────────
async function loadCategories() {
  const snap = await getDocs(collection(db, "categories"));
  allCategories = snap.docs.map(d => d.data());
}
async function loadProducts() {
  const snap = await getDocs(collection(db, "products"));
  allProducts = snap.docs.map(d => d.data());
}
async function loadOrders() {
  const snap = await getDocs(collection(db, "history"));
  allOrders = snap.docs.map(d => d.data());
}
async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  allUsers = snap.docs.map(d => d.data());
}

// ─── Stats ────────────────────────────────────────────────
function updateStats() {
  document.getElementById("statProducts").textContent = allProducts.length;
  document.getElementById("statUsers").textContent = allUsers.filter(u => u.user_admin !== "admin").length;

  const billNos = new Set(allOrders.map(o => o.bill_no));
  document.getElementById("statOrders").textContent = billNos.size;

  const revenue = allOrders.reduce((s, o) => s + (o.cost || 0), 0);
  document.getElementById("statRevenue").textContent = `$${revenue.toFixed(0)}`;
}

// ─── Inventory Table ──────────────────────────────────────
let inventorySearchTerm = "";
document.getElementById("inventorySearch").addEventListener("input", e => {
  inventorySearchTerm = e.target.value.toLowerCase();
  renderInventory();
});

function renderInventory() {
  let list = allProducts;
  if (inventorySearchTerm) {
    list = list.filter(p =>
      p.product_id?.toLowerCase().includes(inventorySearchTerm) ||
      p.product_name?.toLowerCase().includes(inventorySearchTerm) ||
      p.category_id?.toLowerCase().includes(inventorySearchTerm)
    );
  }

  if (list.length === 0) {
    inventoryBody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--gray);">No products found.</td></tr>`;
    return;
  }

  inventoryBody.innerHTML = list.map(p => {
    const catName = allCategories.find(c => c.category_id === p.category_id)?.category_name || p.category_id || "—";
    const stockClass = p.stock <= 0 ? "out" : p.stock < 10 ? "low" : "ok";
    const stockLabel = p.stock <= 0 ? "Out of Stock" : p.stock < 10 ? `⚠ ${p.stock}` : p.stock;
    return `
      <tr>
        <td>${p.image_url ? `<img src="${p.image_url}" alt="${p.product_name}" onerror="this.style.display='none'" />` : "📦"}</td>
        <td><code>${p.product_id}</code></td>
        <td><b>${p.product_name}</b></td>
        <td>${catName}</td>
        <td>$${parseFloat(p.price).toFixed(2)}</td>
        <td>${p.discount > 0 ? `<span style="color:var(--red);font-weight:700;">-${p.discount}%</span>` : "—"}</td>
        <td><span class="stock-badge stock-${stockClass}">${stockLabel}</span></td>
        <td>⭐ ${p.rating || "—"}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-amber btn-sm" onclick="window.editProduct('${p.product_id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="window.deleteProduct('${p.product_id}', '${p.product_name.replace(/'/g,"\\'")}')">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

// ─── Orders / History ─────────────────────────────────────
let ordersSearchTerm = "";
document.getElementById("ordersSearch").addEventListener("input", e => {
  ordersSearchTerm = e.target.value.toLowerCase();
  renderOrders();
});

function renderOrders() {
  const container = ordersContainer;

  let orders = [...allOrders];
  if (ordersSearchTerm) {
    orders = orders.filter(o =>
      o.bill_no?.toLowerCase().includes(ordersSearchTerm) ||
      o.userid?.toLowerCase().includes(ordersSearchTerm) ||
      o.product_name?.toLowerCase().includes(ordersSearchTerm) ||
      o.product_id?.toLowerCase().includes(ordersSearchTerm)
    );
  }

  if (orders.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="icon">📋</span><h3>No orders found</h3></div>`;
    return;
  }

  // Group by bill_no
  const groups = {};
  orders.forEach(o => {
    if (!groups[o.bill_no]) groups[o.bill_no] = { meta: o, items: [] };
    groups[o.bill_no].items.push(o);
  });

  container.innerHTML = "";
  Object.entries(groups)
    .sort(([,a],[,b]) => new Date(b.meta.timestamp) - new Date(a.meta.timestamp))
    .forEach(([billNo, grp]) => {
      const total = grp.items.reduce((s, i) => s + i.cost, 0);
      const date  = new Date(grp.meta.timestamp).toLocaleString();
      const user  = allUsers.find(u => u.userid === grp.meta.userid);
      const userName = user ? `${user.first_name} ${user.last_name}` : grp.meta.userid;

      const el = document.createElement("div");
      el.className = "history-card";
      el.innerHTML = `
        <div class="history-card-header">
          <div>
            <div class="bill-id">Invoice #${billNo}</div>
            <div class="bill-date">${date}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:13px;opacity:0.8;">👤 ${userName}</span>
            <span style="background:var(--amber);color:var(--navy);padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;">$${total.toFixed(2)}</span>
          </div>
        </div>
        <div class="history-card-body">
          <div class="history-meta-row">
            <span>💳 <b>${grp.meta.mode_of_payment}</b></span>
            <span>🚚 Est. Delivery: <b>${grp.meta.estimated_delivery_date}</b></span>
            ${grp.meta.address ? `<span>📍 ${grp.meta.address}</span>` : ""}
          </div>
          <table class="inv-table">
            <thead><tr><th>Product</th><th>Qty</th><th>Amount</th></tr></thead>
            <tbody>
              ${grp.items.map(i => `<tr><td>${i.product_name} <code>${i.product_id}</code></td><td>${i.quantity || i.qunatity || 1}</td><td>$${i.cost.toFixed(2)}</td></tr>`).join("")}
              <tr class="inv-total-row"><td colspan="2"><b>Total</b></td><td><b>$${total.toFixed(2)}</b></td></tr>
            </tbody>
          </table>
        </div>
      `;
      container.appendChild(el);
    });
}

// ─── Customers Table ──────────────────────────────────────
function renderCustomers() {
  const regular = allUsers.filter(u => u.user_admin !== "admin" && u.role !== "admin");

  if (regular.length === 0) {
    customersBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gray);">No customers found.</td></tr>`;
    return;
  }

  customersBody.innerHTML = regular.map(u => {
    const joined = u.created_at ? new Date(u.created_at).toLocaleDateString() : "—";
    return `
      <tr>
        <td><code>${u.userid}</code></td>
        <td><b>${u.first_name} ${u.last_name}</b></td>
        <td>${u.email}</td>
        <td>${u.mobile || "—"}</td>
        <td><span class="stock-badge stock-ok">${u.user_admin || "user"}</span></td>
        <td>${joined}</td>
        <td>$${(u.credit_limit || 0).toLocaleString()}</td>
      </tr>
    `;
  }).join("");
}

// ─── Admin Tabs ───────────────────────────────────────────
document.querySelectorAll(".admin-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.panel}`).classList.add("active");
  });
});

// ─── Product CRUD ─────────────────────────────────────────
window.openAddModal = () => {
  editingId = null;
  productForm.reset();
  document.getElementById("fieldId").disabled = false;
  document.getElementById("productModalTitle").textContent = "Add New Product";
  productModal.classList.add("open");
};

window.editProduct = (id) => {
  const p = allProducts.find(x => x.product_id === id);
  if (!p) return;
  editingId = id;
  document.getElementById("fieldId").value       = p.product_id;
  document.getElementById("fieldId").disabled    = true;
  document.getElementById("fieldName").value     = p.product_name;
  document.getElementById("fieldDesc").value     = p.description || "";
  document.getElementById("fieldImage").value    = p.image_url || "";
  document.getElementById("fieldPrice").value    = p.price;
  document.getElementById("fieldDiscount").value = p.discount || 0;
  document.getElementById("fieldStock").value    = p.stock;
  document.getElementById("fieldCat").value      = p.category_id || "";
  document.getElementById("fieldRating").value   = p.rating || 5;
  document.getElementById("productModalTitle").textContent = "Edit Product";
  productModal.classList.add("open");
};

window.closeModal = () => {
  productModal.classList.remove("open");
  productForm.reset();
};

productForm.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const id = document.getElementById("fieldId").value.trim();
  const data = {
    product_id:   id,
    product_name: document.getElementById("fieldName").value.trim(),
    description:  document.getElementById("fieldDesc").value.trim(),
    image_url:    document.getElementById("fieldImage").value.trim(),
    price:        parseFloat(document.getElementById("fieldPrice").value),
    discount:     parseInt(document.getElementById("fieldDiscount").value) || 0,
    stock:        parseInt(document.getElementById("fieldStock").value),
    category_id:  document.getElementById("fieldCat").value.trim(),
    rating:       parseFloat(document.getElementById("fieldRating").value) || 5
  };

  try {
    await setDoc(doc(db, "products", id), data);
    window.closeModal();
    showToast(editingId ? "Product updated!" : "Product added!", "success");
  } catch (err) {
    showToast("Save failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Product";
  }
});

window.deleteProduct = async (id, name) => {
  if (!confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "products", id));
    showToast(`"${name}" deleted.`);
  } catch (err) {
    showToast("Delete failed: " + err.message, "error");
  }
};

// ─── Toast ────────────────────────────────────────────────
function showToast(msg, type = "") {
  const c = document.getElementById("toastContainer");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
