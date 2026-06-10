# BarScan – Barcode & Serial Number Scanner

A mobile-friendly web app that scans barcodes, QR codes, and serial numbers using your device camera. Built with a vanilla HTML5/CSS3/JavaScript frontend and an Express + MySQL backend.

---

## 🌟 Key Features

- **Dual Detection Engines**: Native browser `BarcodeDetector` (where supported) with automatic UMD `@zxing/library` CDN fallback.
- **Manual Capture**: Tap camera viewport to capture and scan a single frame (no battery-draining continuous autofocus scanning).
- **Hardware Scanner Support**: Configurable keystroke-grouping buffer to support USB/Bluetooth barcode guns simulating keyboard input.
- **Sticky Model Name**: Lock/pin a product model name to automatically tag all subsequent scanned records.
- **Offline-First Synchronization**: 
  - Dynamic server pinging to detect connection status.
  - Visual status indicator in UI (🟢 Online / 🟡 Offline Mode).
  - Automated local fallback: when offline, scans are saved to browser `localStorage` and automatically queued for synchronization once connection is restored.
- **CSV Export**: Server-side CSV generation with UTF-8 BOM encoding for seamless Excel support (proper Thai characters display).
- **Dark Mode UI**: Clean, glassmorphism-based dark theme optimized for handheld mobile scanners and warehouse environments.

---

## 📂 Project Structure

```text
barcode_scanner/
├── index.html          # Web app frontend shell & layouts
├── app.js              # Offline-first client-side logic & API sync
├── styles.css          # Glassmorphism dark mode styling
├── README.md           # This documentation
└── server/             # Express.js backend API
    ├── index.js        # Server entry point & static file routing
    ├── db.js           # MySQL connection pool configuration
    ├── schema.sql      # Database initialization schema & seed data
    ├── test-db.js      # Diagnostic script to test DB connection
    ├── .env.example    # Configuration template
    ├── .gitignore      # Prevents committing credentials/modules
    └── routes/         # REST API routes
        ├── scans.js    # CRUD scans and CSV export
        ├── models.js   # Product models CRUD
        └── settings.js # App-wide settings CRUD
```

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, CSS3 Custom Properties, Vanilla JavaScript (ES6+), ZXing Library (CDN fallback)
- **Backend**: Node.js, Express.js
- **Database**: MySQL 8.0+
- **Production Infrastructure (Target)**: AWS RDS (MySQL instance)

---

## 🚀 Local Development Setup

### 1. Database Setup
1. Ensure a MySQL server (version 8.0 or higher) is running locally.
2. Log in to your MySQL terminal and run the following command to create the database:
   ```sql
   CREATE DATABASE barscan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Import the tables and initial configuration seed from `server/schema.sql`:
   ```bash
   mysql -u root -p barscan < server/schema.sql
   ```

### 2. Configure Environment Variables
1. Navigate to the `server/` directory:
   ```bash
   cd server
   ```
2. Copy `.env.example` to create your own configuration file:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and fill in your database credentials:
   ```ini
   PORT=3001
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASS=YOUR_MYSQL_PASSWORD  # Leave empty if you have no password set
   DB_NAME=barscan
   DB_SSL=false
   ```

### 3. Install Dependencies & Run
1. Install the npm packages:
   ```bash
   npm install
   ```
2. (Optional) Test your database connection before starting the server:
   ```bash
   node test-db.js
   ```
3. Start the application:
   - For **Production/Standard** mode:
     ```bash
     npm start
     ```
   - For **Development** auto-reload mode (requires Node.js 18.11+):
     ```bash
     npm run dev
     ```

Once started, the backend server will automatically serve the frontend web page on:
- Web App UI: [http://localhost:3001](http://localhost:3001)
- Health Status: [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

## ☁️ AWS RDS Production Migration

To transition the backend from a local MySQL instance to a cloud-managed AWS RDS MySQL cluster:

1. **Ensure Networking & Ports**: Make sure your AWS RDS instance's Security Group allows inbound TCP traffic on port `3306` from the server's IP address.
2. **Update Environment Configuration**: Open `server/.env` on your hosting server and change the database variables:
   ```ini
   DB_HOST=your-rds-endpoint.xxxxxx.ap-southeast-1.rds.amazonaws.com
   DB_PORT=3306
   DB_USER=admin
   DB_PASS=your_rds_secure_password
   DB_NAME=barscan
   DB_SSL=true  # Set to true to encrypt data in transit to RDS
   ```
3. No code changes are required. The Express server uses the `DB_SSL=true` flag to dynamically initialize SSL certificates when connecting to AWS RDS.

---

## 🗄️ Database Schema Summary

The database contains three tables:

### 1. `scans`
Stores all captured barcode/serial number records.
- `id` (BIGINT, Primary Key, Auto Increment)
- `serial` (VARCHAR(255), Not Null) – The scanned barcode/serial text
- `model` (VARCHAR(255), Nullable) – Scanned/Associated model name
- `type` (VARCHAR(50), Default 'Camera') – Input source (`Camera`, `Manual`, or `Scanner`)
- `ts` (DATETIME, Default current time) – Scan timestamp

### 2. `models`
Maintains the autocomplete dictionary for product model names.
- `id` (INT, Primary Key, Auto Increment)
- `name` (VARCHAR(255), Unique) – Model name (e.g., `iPhone 15`)
- `created_at` (DATETIME, Default current time)

### 3. `settings`
Global configuration settings (contains a single row with `id = 1` using an Upsert model).
- `id` (INT, Primary Key, Default 1)
- `double_scan_ms` (INT, Default 2000) – Minimum delay to filter out duplicate scans
- `hw_group_ms` (INT, Default 500) – Keystroke grouping buffer for hardware guns

---

## 🔌 API Endpoints Reference

| Method | Endpoint | Description | Request Body Example |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/health` | Check backend & database connection status | *None* |
| **GET** | `/api/scans` | Get all scans (supports search & sorting) | *None* |
| **POST** | `/api/scans` | Save new scanned record | `{"serial": "12345", "model": "Model X", "type": "Camera", "ts": "2026-06-10T10:00:00Z"}` |
| **PUT** | `/api/scans/:id` | Edit an existing scanned record | `{"serial": "54321", "model": "Model Y"}` |
| **DELETE** | `/api/scans/:id` | Delete a scanned record | *None* |
| **GET** | `/api/scans/export/csv` | Download scans CSV file (Thai-friendly Excel export) | *None* |
| **GET** | `/api/models` | Get list of all product models | *None* |
| **POST** | `/api/models` | Add a new model to dictionary | `{"name": "Model Z"}` |
| **GET** | `/api/settings` | Get current app settings | *None* |
| **PUT** | `/api/settings` | Update settings configurations | `{"double_scan_ms": 3000, "hw_group_ms": 400}` |

---

## 📶 Offline-First Sync Behavior

- **Detection**: The web application issues a periodic ping to `/api/health`. If the ping fails or times out, the indicator at the top right flips to `Offline Mode` (🟡).
- **Local Cache**: Scans made during network failure are appended to `localStorage` under `local_scans`.
- **Background Sync**: When the ping returns a success code, the app checks if `local_scans` is non-empty. If so, it uploads the queue to the backend server one-by-one in chronological order, then purges the browser storage and updates the indicator to `Online` (🟢).
- **Settings & Autocomplete**: Settings and autocomplete dropdown lists fall back to standard defaults if the database is unreachable on initial launch.
