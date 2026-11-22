# Foodies — Online Food Ordering

A full-stack implementation of the lab requirement:

> **Online Food Ordering:** restaurant menu, cart, order tracking, admin panel

The original Foodies storefront design is kept, and the whole ordering flow is now backed by **Express.js + MongoDB**
instead of the static placeholder buttons.

---

## Features

### Customer storefront

- **Restaurant menu** loaded from MongoDB, with category filters, live search, ratings, prices and offer badges.
- **Cart** with quantity controls, persistent storage in `localStorage`, live subtotal / delivery / total and a
  free-delivery threshold. Prices are recalculated on the server when the order is placed.
- **Checkout** with customer name, phone, optional email, delivery address and a note for the kitchen.
- **Order confirmation** with a unique order number (for example `FD-7K3M9Q`), copy button and a direct tracking link.
- **Order tracking** page (`/track.html`) with a five-step progress timeline, order items, totals, delivery details,
  status history, a 15-second live refresh and customer-side cancellation while the order is still `placed` or
  `confirmed`.
- **Customer accounts** with sign up / sign in, a profile page, saved delivery details and a personal order history
  (`/signup.html`, `/signin.html`, `/account.html`). The account links live in the header **profile icon menu**, which
  switches between *Sign in / Create account* and *My account / Track an order / Sign out* based on the session.
- **Special offers** managed from the admin panel and rendered on the storefront.

### Admin panel (`/admin/`)

- Session-based staff sign-in (bcrypt password hashes, rate-limited login).
- **Dashboard**: total orders, today's orders, active orders, revenue, delivered revenue, customers, menu size,
  recent orders and a status breakdown.
- **Orders**: search by order number / customer / phone, filter by status, pagination, inline status changes,
  a full order detail modal (items, totals, customer, history) and delete.
- **Menu management**: create, edit, delete menu items, toggle availability and mark items as offers.
- Mobile-friendly layout with an off-canvas sidebar.

---

## Tech stack

| Layer      | Technology                                                         |
| ---------- | ------------------------------------------------------------------ |
| Server     | Node.js, Express 4                                                  |
| Database   | MongoDB (official `mongodb` Node.js driver)                       |
| Sessions   | express-session + connect-mongo                                     |
| Passwords  | bcryptjs                                                            |
| Frontend   | Vanilla HTML, CSS and JavaScript (the existing Foodies design)      |
| Dev helper | nodemon, mongodb-memory-server (zero-setup demo database)           |

---

## Requirements

- Node.js **20.19 or newer** (developed with Node 25)
- MongoDB **6+** — either a local server or a free MongoDB Atlas cluster
- Internet access on the first run if you use the in-memory fallback (it downloads a MongoDB binary)

---

## Getting started

```bash
npm install
copy .env.example .env     # Windows (PowerShell/cmd)
# cp .env.example .env     # macOS / Linux
npm start
```

Open:

- Storefront — <http://localhost:3000>
- Order tracking — <http://localhost:3000/track.html>
- Admin panel — <http://localhost:3000/admin/>

**Default admin credentials** (created automatically on first run):

```
Email:    admin@foodies.com
Password: Admin@123
```

Change these in `.env` before deploying, then run `npm run admin:reset` to update (or create) the account.

### MongoDB configuration

Set `MONGODB_URI` in `.env`:

```env
# Local MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/foodies

# MongoDB Atlas
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/foodies
```

If MongoDB cannot be reached and `NODE_ENV` is not `production`, the server starts a temporary in-memory MongoDB,
seeds it with the starter menu and prints a warning. That makes the project demoable with zero database setup, but
**all data disappears when the server stops**. Disable the fallback with `USE_MEMORY_DB=false`, or set
`NODE_ENV=production` so the server fails fast instead.

### Useful scripts

| Command                  | What it does                                                    |
| ------------------------ | --------------------------------------------------------------- |
| `npm start`              | Start the server                                                |
| `npm run dev`            | Start with nodemon (auto-restart)                               |
| `npm run seed`           | Insert the starter menu / first admin if the database is empty  |
| `npm run seed -- --force`| Replace the menu with the starter menu                          |
| `npm run admin:reset`    | Create or update the admin account from `.env`                  |

---

## Project structure

```
food-ecommerce-site/
├─ server.js                  # Express app, session config, static hosting
├─ .env.example               # Environment template
├─ src/
│  ├─ db.js                   # MongoDB connection + in-memory development fallback
│  ├─ config.js               # Delivery fee, free-delivery threshold, ETA
│  ├─ seedData.js             # Starter menu + first-run admin
│  ├─ seed.js                 # CLI seeding
│  ├─ resetAdmin.js           # CLI admin password reset
│  ├─ models/
│  │  ├─ Food.js              # Menu item helpers
│  │  ├─ Order.js             # Order + status history helpers
│  │  ├─ Admin.js             # Admin account (bcrypt)
│  │  ├─ Customer.js          # Customer account (bcrypt)
│  │  └─ indexes.js           # Index creation for all collections
│  ├─ routes/
│  │  ├─ menu.js              # Public menu API
│  │  ├─ orders.js            # Place / track / cancel orders
│  │  ├─ customers.js         # Customer sign up / sign in / profile / orders
│  │  ├─ auth.js              # Admin login, logout, session check
│  │  └─ admin.js             # Dashboard, orders and menu management
│  ├─ middleware/requireAdmin.js
│  └─ utils/                  # Validation, order numbers, food payloads
└─ public/
   ├─ index.html              # Storefront (menu, cart, checkout)
   ├─ my.css / ordering.css   # Storefront design
   ├─ script.js               # Menu, cart, checkout logic
   ├─ nav.js / auth-nav.js    # Shared header menu + account links
   ├─ track.html / track.js   # Public order tracking
   ├─ signin.html             # Customer sign in
   ├─ signup.html             # Customer sign up
   ├─ account.html            # Profile + order history
   ├─ auth.css / auth.js      # Customer auth/account design + logic
   ├─ admin/
   │  ├─ index.html
   │  ├─ admin.css
   │  └─ admin.js             # Dashboard, orders, menu CRUD
   └─ image/                  # Food and brand images
```

This project is **Node.js only** — there is no PHP and no MySQL anywhere in the codebase. The legacy PHP/MySQL
template folders (`authentication/`, `dashboard/`, `database/`, `main/`, `master/`, `logout/`) and their unused
assets (`bootstrap/`, `backgrounds/`, `flags/`) have been removed.

---

## API overview

### Public

| Method | Endpoint                               | Description                                      |
| ------ | -------------------------------------- | ------------------------------------------------ |
| GET    | `/api/config`                          | Delivery fee, free-delivery threshold, ETA       |
| GET    | `/api/health`                          | Server / database health                         |
| GET    | `/api/menu`                            | Available menu (`?category=`, `?q=`, `?offers=`) |
| GET    | `/api/menu/categories`                 | Available categories                             |
| GET    | `/api/menu/:id`                        | Single menu item                                 |
| POST   | `/api/orders`                          | Place an order                                   |
| GET    | `/api/orders/track/:orderNumber`       | Track an order (`?phone=`; optional for the signed-in owner) |
| PATCH  | `/api/orders/:orderNumber/cancel`      | Cancel before preparation (`{ phone }`; optional for the signed-in owner) |
| POST   | `/api/customers/signup`                | Create a customer account                        |
| POST   | `/api/customers/signin`                | Sign in as a customer                            |
| POST   | `/api/customers/signout`               | Sign out                                         |
| GET    | `/api/customers/me`                    | Current customer or `null`                       |
| PATCH  | `/api/customers/me`                    | Update name, phone and delivery address          |
| GET    | `/api/customers/orders`                | Orders placed by the signed-in customer          |

`POST /api/orders` example:

```json
{
  "items": [{ "foodId": "<mongo id>", "qty": 2 }],
  "customer": {
    "name": "Ayesha Rahman",
    "phone": "01712345678",
    "email": "ayesha@example.com",
    "address": "House 4, Road 7, Dhanmondi, Dhaka"
  },
  "note": "Extra spicy"
}
```

The server looks up every food item, verifies it is available, recalculates all prices and totals, and generates a
unique order number. Client-side prices are never trusted.

### Admin (requires a signed-in session)

| Method | Endpoint                          | Description                                   |
| ------ | --------------------------------- | --------------------------------------------- |
| POST   | `/api/auth/login`                 | Sign in (`{ email, password }`)               |
| POST   | `/api/auth/logout`                | Sign out                                      |
| GET    | `/api/auth/me`                    | Current admin or `null`                       |
| GET    | `/api/admin/stats`                | Dashboard metrics and recent orders           |
| GET    | `/api/admin/orders`               | Orders (`?status=&q=&page=&limit=`)           |
| GET    | `/api/admin/orders/:id`           | Single order                                  |
| PATCH  | `/api/admin/orders/:id/status`    | Update status (`{ status, note? }`)           |
| DELETE | `/api/admin/orders/:id`           | Delete an order                               |
| GET    | `/api/admin/menu`                 | All menu items (including unavailable)        |
| POST   | `/api/admin/menu`                 | Create a menu item                            |
| PUT    | `/api/admin/menu/:id`             | Update a menu item (full payload)             |
| DELETE | `/api/admin/menu/:id`             | Delete a menu item                            |

---

## Order lifecycle

```
placed → confirmed → preparing → out_for_delivery → delivered
   └────────────── cancelled (customer or admin) ──────────────┘
```

- New orders start as `placed` and get an estimated delivery time of 45 minutes.
- Admins can move an order to any status; every change is appended to the order's status history.
- Customers can cancel only while the order is `placed` or `confirmed`.

### Business rules

- Delivery fee: **$2.99**, free on orders of **$35.00** or more.
- Maximum 20 units per item and 50 units per order.
- Payment method: cash on delivery (no payment integration).
- Free delivery and totals shown in the browser come from `/api/config` and are re-verified on the server.

---

## Environment variables

| Variable         | Default                             | Purpose                                              |
| ---------------- | ----------------------------------- | ---------------------------------------------------- |
| `PORT`           | `3000`                              | HTTP port                                            |
| `MONGODB_URI`    | `mongodb://127.0.0.1:27017/foodies` | MongoDB connection string                            |
| `DNS_SERVERS`    | `8.8.8.8,1.1.1.1`                   | Fallback DNS used only if the system DNS cannot resolve an Atlas SRV record |
| `SESSION_SECRET` | dev fallback                        | Session cookie signing secret (set in production)    |
| `ADMIN_EMAIL`    | `admin@foodies.com`                 | Admin account created on first run                   |
| `ADMIN_PASSWORD` | `Admin@123`                         | Admin password created on first run                  |
| `TRUST_PROXY`    | `false`                             | Set `true` when running behind an HTTPS proxy        |
| `USE_MEMORY_DB`  | unset                               | Set `false` to disable the in-memory dev fallback    |
| `NODE_ENV`       | development                         | `production` disables the in-memory fallback         |

---

## Notes on security

- Admin passwords are stored as bcrypt hashes; sessions live in MongoDB and expire after 8 hours.
- Login is rate-limited (20 attempts per 15 minutes per IP).
- Every input is trimmed, length-limited and validated on the server; order totals are calculated server-side.
- Customer-controlled text is escaped before being inserted into the DOM.
- Session cookies are `httpOnly` and `SameSite=Lax`.
- Before deploying: change the admin credentials and `SESSION_SECRET`, set `NODE_ENV=production`, use HTTPS and set
  `TRUST_PROXY=true` if applicable.

---

## Troubleshooting

| Problem                                  | Fix                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `EADDRINUSE`                             | Another process uses the port — change `PORT` in `.env`                              |
| First start is slow                      | The in-memory fallback is downloading MongoDB; wait or configure a real MongoDB URI  |
| `[db] could not reach ...` warning       | MongoDB is not running; the temporary database is being used instead                  |
| Admin login fails after changing `.env`  | Credentials are only created on first run — run `npm run admin:reset`                 |
| Data lost after restart                  | You were using the in-memory database; configure `MONGODB_URI`                       |
| 401 responses in the admin panel         | The session expired — sign in again                                                   |
