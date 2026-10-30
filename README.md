# IATA Air Waybill (AWB) Management Server

A high-performance **Node.js + Fastify + MongoDB** backend engine compliant with the **International Air Transport Association (IATA) Resolution 600b standard**, e-AWB Cargo-IMP/XML messaging protocols, and CASS settlement clearing.

This server powers the [ita-web-frontend](../ita-web-frontend) platform according to the `AWB Software – Phase-wise Flow` blueprint.

---

## ⚡ Tech Stack & Architecture

- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules)
- **Web Framework**: [Fastify](https://fastify.dev/) (Ultra-low overhead, native schema validation)
- **Database & ODM**: [MongoDB](https://www.mongodb.com/) via [Mongoose](https://mongoosejs.com/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Documentation**: [Fastify Swagger](https://github.com/fastify/fastify-swagger) & [Swagger UI](https://github.com/fastify/fastify-swagger-ui) (Served at `/documentation`)
- **Security & Auth**: `@fastify/jwt` and `bcryptjs` for Role-Based Access Control (Admin, User / Operations, Accounts)
- **CORS**: `@fastify/cors` configured for seamless frontend communication

---

## 📐 IATA Domain Specifications

### 1. IATA Resolution 600b Modulo-7 Engine
AWB serial numbers strictly adhere to the IATA Resolution 600b check-digit rule:
$$\text{Check Digit} = \text{Serial}_{1..7} \pmod 7$$
The 8-digit serial is formed as: `Serial[1..7] + CheckDigit`. Duplicate serials and voided serials are permanently blocked from reuse.

### 2. Dimensional Cubing & Volumetric Calculation
Chargeable weight is strictly locked to the greater of Actual Gross Weight and Volumetric Weight:
$$\text{Volumetric Weight (kg)} = \frac{\text{Length (cm)} \times \text{Width (cm)} \times \text{Height (cm)} \times \text{Pieces}}{6000}$$
$$\text{Chargeable Weight} = \max(\text{Actual Weight}, \text{Volumetric Weight})$$

### 3. Cargo-IMP Teletype Messaging
Automated generation and tracking of standard IATA teletype EDI messages:
- **FWB**: Freight Waybill transmission containing complete MAWB data.
- **FHL**: Freight House List containing consolidated HAWBs linked to MAWB.
- **FFM**: Flight Forward Manifest sent to destination stations.
- **FSU**: Flight Status Updates (`RCS` received, `MAN` manifested, `DEP` departed, `ARR` arrived, `DLV` delivered).

---

## 📁 Repository Structure

```
iata-server/
├── src/
│   ├── app.ts                  # Fastify application factory & route registration
│   ├── server.ts               # Server bootstrap, MongoDB connect & graceful shutdown
│   ├── config/
│   │   ├── env.ts              # Typed environment variables
│   │   └── database.ts         # Mongoose connection & lifecycle handlers
│   ├── models/
│   │   ├── User.ts             # Station users, roles & tab permissions
│   │   ├── AwbStock.ts         # Resolution 600b AWB stock & void lock
│   │   ├── Docket.ts           # Consignment dockets & dimensional cubing
│   │   ├── Booking.ts          # Cargo bookings
│   │   ├── Mawb.ts             # Master AWB & nested House AWBs (HAWB)
│   │   ├── FlightManifest.ts   # Flight manifests (FFM) & ramp lock
│   │   ├── EawbMessage.ts      # Cargo-IMP teletype EDI messages
│   │   ├── CassInvoice.ts      # Invoices, 18% GST & CASS reconciliation
│   │   ├── MasterData.ts       # Airlines, Airports, Partners, Agent Profile
│   │   └── AuditLog.ts         # Audit trail for all lifecycle transitions
│   ├── plugins/
│   │   ├── cors.ts             # Fastify CORS
│   │   ├── jwt.ts              # JWT token generation & auth guard
│   │   └── swagger.ts          # OpenAPI / Swagger UI (/documentation)
│   ├── routes/
│   │   ├── auth.routes.ts      # /api/auth (login, register, me)
│   │   ├── user.routes.ts      # /api/users (user CRUD & RBAC permissions)
│   │   ├── stock.routes.ts     # /api/stock (Mod-7 generation, check-digit, void)
│   │   ├── docket.routes.ts    # /api/dockets (cubing, assign AWB, billing)
│   │   ├── booking.routes.ts   # /api/bookings (create, assign AWB)
│   │   ├── mawb.routes.ts      # /api/mawbs (consolidation, HAWBs, void)
│   │   ├── manifest.routes.ts  # /api/manifests (FFM flight manifest, ramp lock)
│   │   ├── eawb.routes.ts      # /api/eawb (dispatch FWB, FHL, FFM, FSU)
│   │   ├── billing.routes.ts   # /api/invoices (CASS reconciliation, payments)
│   │   ├── master.routes.ts    # /api/master (airlines, airports, partners, profile)
│   │   ├── dashboard.routes.ts # /api/dashboard/stats (KPIs & pipeline)
│   │   └── health.routes.ts    # /api/health (system status & DB health)
│   ├── seeds/
│   │   ├── seedData.ts         # Default seed data matching frontend
│   │   └── seeder.ts           # Automatic database seeder
│   └── utils/
│       ├── iataMod7.ts         # Resolution 600b Mod-7 calculator & generator
│       ├── volumetric.ts       # IATA volumetric formula & freight charges
│       └── cargoImp.ts         # Cargo-IMP teletype formatters (FWB, FHL, FFM, FSU)
├── .env.example
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```env
PORT=5000
HOST=0.0.0.0
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/iata-cargo
JWT_SECRET=your-secure-jwt-secret-key
CORS_ORIGIN=*
```

### 3. Seed Database (Optional / Automatic on first run)
Populates initial airlines, airports, trading partners, Resolution 600b stock, default users (`admin`/`admin`), and agent profile:
```bash
npm run seed
```

### 4. Run Development Server
```bash
npm run dev
```

### 5. Build & Run for Production
```bash
npm run build
npm start
```

---

## 📚 API Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Server welcome and status |
| `GET` | `/api/health` | Health check & MongoDB connection status |
| `GET` | `/documentation` | Interactive Swagger / OpenAPI documentation UI |
| `POST` | `/api/auth/login` | Authenticate station user / admin |
| `GET` | `/api/auth/me` | Current user profile |
| `GET` | `/api/users` | List station users and permission matrix |
| `POST` | `/api/users` | Create new station user |
| `PUT` | `/api/users/:id/permissions` | Update individual user tab permissions |
| `PUT` | `/api/users/:id/role` | Update user role (`admin` / `user`) |
| `PATCH` | `/api/users/:id/status` | Toggle user active/inactive status |
| `GET` | `/api/stock` | Query AWB stock inventory |
| `POST` | `/api/stock/series` | Generate Resolution 600b Mod-7 series |
| `POST` | `/api/stock/validate` | Verify 8-digit serial Mod-7 check digit |
| `POST` | `/api/stock/:id/void` | Permanently void AWB number with audit reason |
| `GET` | `/api/stock/next-available` | Fetch next available verified AWB number |
| `GET` | `/api/dockets` | List cargo consignment dockets |
| `POST` | `/api/dockets` | Register docket with cubing & GST |
| `POST` | `/api/dockets/:id/assign-awb` | Issue MAWB & GST Invoice from available stock |
| `GET` | `/api/bookings` | List cargo bookings |
| `POST` | `/api/bookings` | Create booking with volumetric weight |
| `POST` | `/api/bookings/:id/assign-awb` | Issue MAWB and invoice for booking |
| `GET` | `/api/mawbs` | List Master AWBs with nested House AWBs |
| `GET` | `/api/mawbs/:id` | Full MAWB details |
| `POST` | `/api/mawbs/:id/hawbs` | Add HAWB with piece/weight parity validation |
| `DELETE`| `/api/mawbs/:id/hawbs/:hawbId`| Remove HAWB (if not manifested) |
| `POST` | `/api/mawbs/:id/void` | Permanently void MAWB and retire stock serial |
| `GET` | `/api/manifests` | List flight cargo manifests |
| `POST` | `/api/manifests` | Create manifest linking MAWBs |
| `POST` | `/api/manifests/:id/finalize` | Finalize & lock manifest for ramp handover |
| `GET` | `/api/eawb` | List Cargo-IMP teletype EDI messages |
| `POST` | `/api/eawb/dispatch-fwb` | Transmit Cargo-IMP FWB message to airline |
| `POST` | `/api/eawb/dispatch-fhl` | Transmit Cargo-IMP FHL house manifest |
| `POST` | `/api/eawb/dispatch-ffm` | Transmit Cargo-IMP FFM teletype |
| `POST` | `/api/eawb/dispatch-fsu` | Send status update (RCS/MAN/DEP/ARR/DLV) |
| `GET` | `/api/invoices` | List invoices and CASS settlements |
| `PATCH`| `/api/invoices/:id/payment` | Update payment status (PAID/UNPAID/PARTIAL) |
| `PATCH`| `/api/invoices/:id/cass-reconcile` | Reconcile airline CASS clearing match |
| `GET` | `/api/master/airlines` | IATA carriers with 3-digit prefix |
| `GET` | `/api/master/airports` | IATA 3-letter cargo airports |
| `GET` | `/api/master/partners` | Shippers & Consignees directory |
| `GET` | `/api/master/agent-profile`| Accredited IATA issuing agent profile |
| `GET` | `/api/dashboard/stats` | Live tonnage, operational KPIs & pipeline |


