# 📱 Santhosh Mobiles — Smart Billing System

A complete setup and usage guide for installing, running, deploying, and maintaining the **Santhosh Mobiles Smart Billing System**.

> **Stack:** React (Vite) · Supabase · Netlify
> **Modes:** Local · Online · Hybrid (Offline + Sync)

---

## 1. Installation

Install the following tools before starting the project.

### 1.1 Node.js (required)

- Download from: https://nodejs.org
- Install **LTS version (v20 or above)**
- Verify installation:

```bash
node -v
npm -v
```

### 1.2 Git (required)

- Download from: https://git-scm.com
- Verify installation:

```bash
git --version
```

### 1.3 XAMPP / MySQL (optional)

Only needed if you want a local database for offline testing.

- Download XAMPP: https://www.apachefriends.org
- Start **Apache** and **MySQL** from the XAMPP control panel.
- Open phpMyAdmin: http://localhost/phpmyadmin

### 1.4 VS Code (recommended)

- Download from: https://code.visualstudio.com
- Recommended extensions:
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - GitLens

---

## 2. Project Setup

### 2.1 Clone the repository

```bash
git clone https://github.com/your-username/santhosh-mobiles.git
cd santhosh-mobiles
```

### 2.2 Install dependencies

```bash
npm install
```

### 2.3 Create the `.env` file

In the project root, create a file named `.env` and add:

```env
# Supabase credentials
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id

# Local API URL (optional, used in hybrid mode)
VITE_LOCAL_API_URL=http://localhost:3001
```

> ⚠️ Never commit the `.env` file to Git. It is already listed in `.gitignore`.

---

## 3. Running Locally

### 3.1 Start the frontend

```bash
npm run dev
```

The app runs at: **http://localhost:3000**

### 3.2 Start the backend (optional)

If you have a local backend service running (Node/Express or XAMPP):

```bash
# Example
cd backend
npm install
npm start
```

Backend default URL: **http://localhost:3001**

### 3.3 Access the project

Open the browser and visit:

```
http://localhost:3000
```

Login with the seeded admin account or create a new one from the Sign Up tab.

---

## 4. Online Deployment

### 4.1 Build the project

```bash
npm run build
```

This creates an optimized production build in the `dist/` folder.

### 4.2 Deploy to Netlify

1. Go to https://app.netlify.com
2. Click **Add new site → Import from Git**
3. Connect your GitHub repository
4. Use these build settings:

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Publish directory | `dist` |

### 4.3 Connect Supabase

- Sign in to https://supabase.com
- Create a new project
- Copy the **Project URL** and **anon public key** from **Project Settings → API**

### 4.4 Add environment variables in Netlify

Go to **Site Settings → Environment Variables** and add:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

Click **Deploy Site** — Netlify will build and host your app online.

---

## 5. Offline Mode

The system is designed to keep working even **without internet**.

### 5.1 How it works

- The app loads from the browser cache (Service Worker / PWA).
- All operations save to **local storage / IndexedDB** first.
- When the internet returns, data is automatically pushed to Supabase.

### 5.2 What works offline

- ✅ Billing (create invoices)
- ✅ Sales Return
- ✅ Customer & Product lookup (cached data)
- ✅ Print invoice
- ⚠️ Reports show only locally cached data until sync completes.

### 5.3 Local storage layers

| Layer | Used for |
|-------|----------|
| `localStorage` | Lightweight settings, session data |
| `IndexedDB` | Invoices, products, customers (large data) |
| Local MySQL (optional) | Backup database in hybrid setups |

---

## 6. Data Sync Mechanism

The system uses a simple **sync queue** to handle offline-to-online data transfer.

### 6.1 How it works

1. While offline, every transaction (invoice, return, etc.) is added to a **pending queue** in IndexedDB.
2. When the internet reconnects, the app:
   - Detects connectivity (`navigator.onLine` + ping check)
   - Reads queued items
   - Pushes them to Supabase one by one
   - Marks each as **synced** on success

### 6.2 Conflict handling

- **Last-write-wins** for product stock updates.
- **Unique invoice numbers** are generated using timestamp + device ID to avoid duplicates.
- Failed syncs are retried automatically every few minutes.

---

## 7. Testing

### 7.1 Test billing

- Open `/billing`
- Add a customer and product
- Create an invoice and confirm it prints correctly

### 7.2 Test sales return

- Open `/billing` → click **Sales Return**
- Search by invoice ID or phone number
- Select items, choose refund method, and confirm

### 7.3 Test offline mode

- Open DevTools → **Network tab → Offline**
- Try creating an invoice — it should save locally
- A small indicator should show "Offline – pending sync"

### 7.4 Test sync

- Re-enable the internet
- Verify pending invoices appear in Supabase within a few seconds
- Check the **Reports** page for updated totals

---

## 8. Troubleshooting

### ❌ Port already in use

```bash
# Kill the process using port 3000
npx kill-port 3000
```

### ❌ Supabase connection error

- Verify the URL and anon key in `.env`
- Check that your Supabase project is active (not paused)
- Confirm RLS policies allow the action

### ❌ `.env` not loading

- Ensure variables start with `VITE_`
- Restart the dev server after changes:

```bash
npm run dev
```

### ❌ Netlify 404 on refresh

Add a `_redirects` file inside the `public/` folder:

```
/*    /index.html   200
```

### ❌ Sync not working

- Open DevTools → **Application → IndexedDB** to inspect the queue
- Check console for failed network requests
- Manually trigger sync from the app's status bar

---

## 9. Folder Structure

```
project/
├── frontend/          # React (Vite) app
│   ├── src/
│   │   ├── components/
│   │   ├── routes/
│   │   ├── lib/
│   │   └── integrations/
│   └── public/
├── backend/           # Optional local API server
├── database/          # SQL scripts / local DB backups
├── .env               # Environment variables
├── package.json
└── steps.md           # This guide
```

---

## 10. Notes

- Keep your `.env` file private — never share or commit it.
- Always run `npm install` after pulling new changes.
- Use the **same Supabase project** for both local and Netlify deployments to keep data consistent.
- For a smooth offline experience, open the app **at least once online** so cache and data are loaded.
- Beginners: don't worry about advanced terms — just follow each section step-by-step.

---

© 2026 **Santhosh Mobiles** — Smart Billing System. All rights reserved.