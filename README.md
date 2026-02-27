---

# 🛠 BACKEND README.md

```md
# 🏢 Smart Building Management System – Backend

A scalable REST API built with Express.js and Turso database to power a multi-building property management platform.

The backend handles authentication, building management, tenant tracking, transactions, penalties, reports, and admin authorization.

---

## 🚀 Features

### 🔐 Authentication & Authorization

- JWT authentication
- Session validation middleware
- Admin authorization layer
- Secure cookie handling

### 🏠 Building Management

- Admin building creation
- Unit management
- Tenant assignment
- Building analytics

### 👥 Tenant Management

- Full tenant profile storage
- Payment history tracking
- Penalty tracking
- Admin-controlled updates

### 💰 Transactions

- Rent payment tracking
- Expense recording
- Financial reports
- Monthly summaries

### ⚙️ Automation

- Daily penalty calculation cron job (12:01 AM)
- Automatic migrations on startup
- Table creation on first run

---

## 🧱 Tech Stack

- Node.js
- Express.js
- Turso (LibSQL)
- Cookie-parser
- CORS
- Cron Jobs
- Middleware-based architecture

---

## 📂 API Structure

### Public Routes
