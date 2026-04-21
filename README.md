# 📱 Santhosh Mobiles — Billing Management System

A modern, full-stack **Billing Management System** built for a mobile retail shop. It handles products, customers, invoices (with GST), inventory tracking, and role-based access — all wrapped in a clean, responsive UI with light & dark themes.

> **Live Preview:** https://santhosh-bills-smart.lovable.app

---

## ✨ Features

- 🔐 **Authentication & Roles** — Email/password login with **Admin** and **Staff** roles (RLS-secured).
- 📊 **Dashboard** — Daily sales, total revenue, invoice count, and low-stock alerts at a glance.
- 📦 **Product Management** — Add, edit, delete products with brand, category, price, GST %, stock & low-stock threshold.
- 👥 **Customer Management** — Manage customer profiles (name, phone, address) with search.
- 🧾 **Billing & Invoicing** — Create invoices with multiple items, auto GST calculation, and **print-to-PDF** support.
- 📉 **Inventory Tracking** — Stock auto-decrements on invoice creation; low-stock badges everywhere.
- 📈 **Reports** — Filterable sales reports by date range.
- 🌗 **Light & Dark Theme** — Persistent theme toggle.
- 📱 **Responsive Design** — Works on desktop, tablet, and mobile.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19 + TypeScript + Vite 7 |
| **Routing** | TanStack Router (file-based, SSR-ready) |
| **Framework** | TanStack Start v1 |
| **Styling** | Tailwind CSS v4 + shadcn/ui |
| **Backend** | Lovable Cloud (managed Postgres + Auth + Edge Functions) |
| **Database** | PostgreSQL with Row-Level Security (RLS) |
| **Auth** | JWT-based session auth (Lovable Cloud Auth) |
| **PDF Export** | Browser print-to-PDF (clean print stylesheet) |
| **Deployment** | Cloudflare Workers (via Lovable) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **Bun** (recommended) or **npm** / **pnpm**
- A modern browser (Chrome, Edge, Firefox, Safari)

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd santhosh-mobiles
```

### 2. Install dependencies

```bash
bun install
# or
npm install
```

### 3. Environment variables

The project ships with a pre-configured `.env` (auto-managed by Lovable Cloud):

```env
VITE_SUPABASE_URL="https://<your-project>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon-key>"
VITE_SUPABASE_PROJECT_ID="<project-id>"
```

> ⚠️ Do **not** commit `.env` to source control. It is already in `.gitignore`.

### 4. Run the development server

```bash
bun run dev
# or
npm run dev
```

The app will be available at **http://localhost:3000**.

### 5. Build for production

```bash
bun run build
bun run start
```

---

## 👤 First-Time Setup — Create Admin Account

The system seeds the first admin via a database trigger. The configured admin email is:

```
Email:    aknoobkutty@gmail.com
Password: Password@123
```

### Steps:

1. Open the app and go to the **Sign Up** tab on the login page.
2. Enter the admin email and password above.
3. You'll be auto-promoted to **Admin** role and redirected to the Dashboard.
4. All future signups will default to the **Staff** role.

> 💡 To change the admin email, update the `handle_new_user()` trigger in a new migration file.

---

## 🔄 Application Workflow

End-to-end flow for daily shop operations:

### 🟦 Step 1 — Login
- Staff/Admin signs in via `/login`.
- Session is stored as a JWT; protected routes redirect unauthenticated users.

### 🟦 Step 2 — Dashboard Overview
- Lands on `/dashboard` showing:
  - Today's revenue & invoice count
  - Total products & customers
  - **Low-stock alerts** for products at/below threshold

### 🟦 Step 3 — Add Products (Admin)
- Navigate to `/products`.
- Click **Add Product** → fill in name, brand, category, price, GST %, stock qty.
- Edit or delete products as inventory changes.

### 🟦 Step 4 — Add Customers
- Navigate to `/customers`.
- Save name, phone, and address. Used for repeat-buyer lookup during billing.

### 🟦 Step 5 — Create Invoice (Billing)
- Navigate to `/billing`.
- Select or add a customer.
- Add line items (product, qty) — prices and GST auto-calculated.
- Click **Create Invoice** → the system:
  1. Inserts the invoice + items atomically (via the `create_invoice` DB function).
  2. **Decrements stock** for each product.
  3. Generates a unique invoice number.
  4. Redirects to the invoice page.

### 🟦 Step 6 — Print / Export Invoice
- On `/invoice/$id`, click **Print** → use browser's "Save as PDF".
- The print stylesheet hides UI chrome and renders a clean, branded invoice.

### 🟦 Step 7 — Reports & Analytics
- Navigate to `/reports` for date-filtered sales summaries.

---

## 📁 Project Structure

```
├── src/
│   ├── routes/                # File-based routes (TanStack Router)
│   │   ├── __root.tsx         # Root layout (theme + auth providers)
│   │   ├── index.tsx          # Landing → redirects to /dashboard
│   │   ├── login.tsx          # Auth page
│   │   ├── _app.tsx           # Authenticated layout (sidebar + header)
│   │   ├── _app.dashboard.tsx
│   │   ├── _app.products.tsx
│   │   ├── _app.customers.tsx
│   │   ├── _app.billing.tsx
│   │   ├── _app.reports.tsx
│   │   └── invoice.$id.tsx    # Printable invoice
│   ├── components/
│   │   ├── AppLayout.tsx      # Sidebar + topbar
│   │   └── ui/                # shadcn/ui primitives
│   ├── lib/
│   │   ├── auth-context.tsx   # Auth state + role helpers
│   │   └── theme.tsx          # Light/dark theme provider
│   ├── integrations/supabase/ # Auto-generated Cloud client + types
│   └── styles.css             # Tailwind v4 + design tokens (oklch)
├── supabase/
│   ├── migrations/            # Versioned SQL migrations
│   └── config.toml
├── vite.config.ts
├── wrangler.jsonc             # Cloudflare Workers config
└── package.json
```

---

## 🗄️ Database Schema (Overview)

| Table | Purpose |
|-------|---------|
| `profiles` | User profile (mirrors `auth.users`) |
| `user_roles` | Role assignments (`admin` / `staff`) — **separate table to prevent privilege escalation** |
| `products` | Inventory: name, brand, category, price, GST %, stock |
| `customers` | Customer directory |
| `invoices` | Invoice headers (number, customer, totals) |
| `invoice_items` | Line items per invoice |

**Security:**
- All tables use **Row-Level Security (RLS)**.
- Roles checked via the `has_role(_user_id, _role)` `SECURITY DEFINER` function (avoids recursive RLS).
- The `create_invoice(...)` function inserts header + items + decrements stock atomically.

---

## 🔐 Roles & Permissions

| Action | Admin | Staff |
|--------|:-----:|:-----:|
| View dashboard | ✅ | ✅ |
| Manage products (CRUD) | ✅ | 👁️ View only |
| Manage customers | ✅ | ✅ |
| Create invoices | ✅ | ✅ |
| View reports | ✅ | ✅ |
| Delete records | ✅ | ❌ |

---

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server with HMR |
| `bun run build` | Build for production (Cloudflare Workers) |
| `bun run start` | Preview the production build |
| `bun run lint` | Run ESLint |

---

## 🚢 Deployment

This project is deployed via **Lovable** to Cloudflare Workers automatically on publish.

- **Production URL:** https://santhosh-bills-smart.lovable.app

To publish your own version, click **Publish** in the Lovable editor.

---

## 🤝 Contributing

1. Create a feature branch.
2. Make your changes (run `bun run lint` before commit).
3. For DB changes, add a new migration in `supabase/migrations/` — **never edit existing migrations**.
4. Open a pull request.

---

## 📄 License

© 2026 Santhosh Mobiles. All rights reserved.

---

## 🙏 Acknowledgements

- Built with [Lovable](https://lovable.dev) — AI-powered full-stack app builder.
- UI primitives by [shadcn/ui](https://ui.shadcn.com).
- Icons by [Lucide](https://lucide.dev).
