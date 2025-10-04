# Retail Billing Management System (Saree Shop)
Full-stack project: React (Vite) + Node.js (Express) + MySQL.

## Quick Start
### 1) Database
- Create a MySQL database `retail_billing` and run `sql/schema.sql`.

### 2) Backend
```bash
cd backend
cp .env.example .env   # fill DB creds + JWT secret
npm install
npm run dev            # starts http://localhost:4000
```

### 3) Frontend
```bash
cd frontend
npm install
npm run dev            # starts http://localhost:5173
```

### Default Flow
- Register as `Owner` → create shop (auto 6-digit code) → you get Owner Dashboard.
- Register as `Manager`/`Cashier` → must enter shop code → redirected to respective dashboards.
- Owner/Manager can manage inventory; Cashier can bill and print invoices.

Based on the spec you shared. See the doc included in this repo.
