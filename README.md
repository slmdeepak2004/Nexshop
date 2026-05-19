# NexShop — Setup & Credentials

## Quick Start

1. **Seed the database first** → Open `seed.html` in a browser and click "Seed Database Now"
2. **Open the store** → Open `index.html`
3. **Admin panel** → Open `admin.html` directly, or log in as admin then click "Admin"

---

## Test Credentials

### Admin Accounts
| Email | Password |
|-------|----------|
| jane@example.com | admin123 |
| diana@example.com | superadmin |

### Regular User Accounts
| Email | Password |
|-------|----------|
| john@example.com | password123 |
| alice@example.com | password123 |
| bob@example.com | password123 |

---

## File Structure

```
nexshop/
├── index.html        — Main storefront (shopping, cart, checkout, profile)
├── app.js            — Storefront logic
├── admin.html        — Admin console (inventory, orders, customers)
├── admin.js          — Admin logic
├── seed.html         — Database seeder (run once)
├── firebase-config.js — Shared Firebase connection
├── style.css         — Unified design system
└── README.md         — This file
```

---

## Features

### Storefront (index.html)
- Product grid with images, discounts, stock badges
- Category filter bar + live search
- Sliding cart drawer with quantity controls
- Login / Register modal with tab switching
- Checkout modal: delivery address + 4 payment methods
- Tax calculation (8%)
- Order confirmation with printable PDF receipt
- My Account page: profile info + full purchase history grouped by invoice
- Session persistence (survives page refresh in same tab)

### Admin Console (admin.html)
- Login gate — only admin role users can enter
- Dashboard stats: product count, customer count, order count, total revenue
- **Inventory tab**: live table, add/edit/delete products with modal form
- **Orders tab**: all purchases grouped by invoice, searchable
- **Customers tab**: all non-admin users with account details
- Real-time updates via Firestore `onSnapshot`

### Seeder (seed.html)
- Seeds all 5 collections with progress indicators
- Adds `image_url` fields to products (Unsplash photos)
- Fixes `quantity` field (original had typo `qunatity`)
- Admin credentials seeded with plain-text passwords for dev use

---

## Notes
- Passwords are stored as plain text — **for demo/learning only**, not production
- Firebase config is embedded — for production, use environment variables or Firebase App Check
- The `quantity` field in orders uses `quantity` (fixed typo from original `qunatity`)
- History records from seed.html use `quantity`; old records may use `qunatity` — admin.js handles both
