# 🛒 NearStock — Smart Nearby Inventory Discovery System

NearStock connects local shops and customers. A customer searches for a product; NearStock
returns every nearby shop that stocks it, the shop name, the live stock count and the real
distance from the customer — with the nearest available shop highlighted. Shops push stock
changes from their billing/POS counter, and customers can join a shop's **request queue**,
which is served strictly First In, First Out.

**Stack:** Node.js · Express.js · MySQL · REST API · vanilla JS frontend (Flutter-ready API)
**Primary DSA:** Queue (FIFO), implemented as a circular array — plus MinHeap, merge sort,
binary/linear search and the Haversine distance formula.

---

## 1. Quick start

```bash
npm install
npm run dev          # → http://localhost:3000
npm test             # 28 unit + integration tests
```

The app boots on a **seeded in-memory dataset** (10 shops, 24 products, 68 inventory lines
around Coimbatore), so it runs with zero configuration. Point it at MySQL whenever you want —
see §4.

| Page | What it is |
|---|---|
| `/` | Customer app — search, distance ranking, join a queue |
| `/shop.html` | Shop dashboard — inventory, billing sync, work the queue |
| `/about.html` | Architecture, data model and full API reference |
| `/api/meta` | Live status: active data driver, counts, DSA summary |

---

## 2. How it works

```
Shop billing / POS system
          │  stock delta (sold / restocked)
          ▼
Node.js + Express REST API
          │
          ▼
       MySQL              (seeded in-memory store when no DB is configured)
          │
          ▼
Customer app  (this website — the same API a Flutter client calls)
          │
          ├─ search for a product      → linear search + merge sort
          ├─ find shops that stock it  → inventory join
          ├─ calculate distance        → Haversine formula
          ├─ rank shops                → MinHeap, k-smallest extraction
          └─ place a request           → Queue, enqueue O(1)
                                          shop serves front → dequeue O(1)
```

### Customer features
🔍 Search products · 📦 View availability · 🏪 Shop name · 📍 Shop location · 📏 Distance from you ·
🥇 Nearest shop identified · 📋 Every shop that has it · 👥 Queue-based requests · 🔔 Live position in line

### Shop features
Manage products · Update inventory · Billing-system sync (single + batch webhook) ·
View customer requests · Work the FIFO queue · Keep stock current

---

## 3. Data structures

### Queue — the core structure (`server/lib/queue.js`)

Customer requests are held in a FIFO queue, one per shop. It is a **circular array (ring
buffer)**, not a JavaScript array, because `Array.shift()` is O(n) — it re-indexes every
remaining element. A ring buffer keeps `front` and `rear` indices and wraps them with modulo:

```
front ─┐                        ┌─ rear
       ▼                        ▼
[  _ ,  R1 ,  R2 ,  R3 ,  _ ,  _ ,  _ ,  _  ]
        ▲ dequeue here    enqueue here ▲
```

| Operation | Complexity | Meaning in NearStock |
|---|---|---|
| `enqueue(r)` | **O(1)** amortised | A customer joins the shop's line |
| `dequeue()` | **O(1)** | The shop serves whoever has waited longest |
| `peek()` | **O(1)** | "Who's next?" |
| `positionOf(p)` | O(n) | "You are 3rd in line" |
| `remove(p)` | O(n) | A customer cancels; the rest keep their order |
| `isEmpty()` / `size` | O(1) | |

When the ring fills, the backing array doubles and re-linearises — amortised O(1) per insert.
Against MySQL the same ordering comes from a monotonically increasing `position` ticket
column, so **dequeue = the smallest `position` still `'waiting'`**, served by the composite
index `idx_queue_fifo (store_id, status, position)`.

### MinHeap — nearest shop (`server/lib/minheap.js`)

Once every stocking shop has a distance, "which is nearest?" is a minimum-extraction problem.
Floyd's bottom-up heapify builds the heap in **O(n)**; pulling the k closest shops costs
**O(k log n)** — cheaper than a full O(n log n) sort, and k is always small (top 3–5).
Ties break toward in-stock first, then lower price.

### Searching & sorting (`server/lib/geo.js`)

* **Linear search** over the catalogue, scored so prefix matches outrank mid-string ones.
* **Binary search** over a name-sorted index as the exact-match fast path — O(log n).
* **Merge sort**, hand-written and stable, O(n log n), for relevance and distance ordering.
* **Haversine formula** for great-circle distance (r = 6371 km), available both in JS and as
  the MySQL stored function `haversine_km()`.

---

## 4. Database

`db/schema.sql` creates the schema; `db/seed.sql` loads the fixtures.

```
users          user_id, name, email, phone, role, latitude, longitude
stores         store_id, owner_id → users, name, category, address, city, phone,
               latitude, longitude, opens_at, closes_at, rating, is_active
products       product_id, name, brand, category, unit, base_price, barcode, image_emoji
inventory      inventory_id, store_id → stores, product_id → products,
               quantity, price, updated_at          UNIQUE (store_id, product_id)
request_queue  request_id, store_id, product_id, customer_name, customer_phone,
               quantity, note, position, status, enqueued_at, processed_at
billing_sync   sync_id, store_id, product_id, delta, source, synced_at
```

Plus the view `v_availability` (inventory ⋈ products ⋈ stores) and the stored function
`haversine_km(lat1, lon1, lat2, lon2)`.

### Switching to MySQL

```bash
mysql -u root -p < db/schema.sql
mysql -u root -p nearstock < db/seed.sql
```

Then set **either**:

```
DATABASE_URL=mysql://user:password@host:3306/nearstock
```

**or** the discrete variables:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=secret
DB_NAME=nearstock
DB_PORT=3306
DB_SSL=false
```

`server/lib/db.js` detects the connection at boot and swaps drivers — the routes never change.
If MySQL is configured but unreachable, the app logs the reason and degrades to the in-memory
dataset instead of failing the whole site.

> `db/seed.sql` is **generated** from `server/data/seed.js` by `node scripts/gen-seed-sql.js`,
> so the SQL fixtures and the in-memory fixtures can never drift apart.

---

## 5. REST API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness probe |
| GET | `/api/meta` | Active driver, counts, DSA summary |
| GET | `/api/search?q&lat&lng&limit&inStockOnly` | **Main query** — matched products, each with distance-ranked shops |
| GET | `/api/products?q` | Catalogue search |
| GET | `/api/products/:id` | One product |
| GET | `/api/products/:id/shops?lat&lng` | Every shop stocking it, ranked |
| GET | `/api/stores?lat&lng` | All shops, merge-sorted by distance |
| GET | `/api/stores/:id` | One shop |
| GET | `/api/stores/:id/inventory` | A shop's stock list |
| PUT | `/api/stores/:id/inventory` | Set quantity / price |
| POST | `/api/stores/:id/billing-sync` | Apply one POS stock delta |
| POST | `/api/billing/webhook` | Batch push of sale lines |
| GET | `/api/billing/recent` | Recent sync events |
| POST | `/api/queue` | **enqueue** — join a shop's line |
| GET | `/api/stores/:id/queue` | Queue snapshot, front first |
| GET | `/api/stores/:id/queue/peek` | **peek** — who's next |
| POST | `/api/stores/:id/queue/next` | **dequeue** — serve the front |
| DELETE | `/api/stores/:id/queue/:requestId` | Cancel a waiting request |
| GET | `/api/stores/:id/queue/history` | Recently processed requests |
| GET | `/api/queues` | Every shop's waiting line |
| POST | `/api/admin/reset` | Reset demo data (in-memory driver only) |

### Examples

```bash
# Find milk near Coimbatore Town Hall
curl "http://localhost:3000/api/search?q=milk&lat=11.0168&lng=76.9558&limit=5"

# A billing terminal pushes two sold lines
curl -X POST http://localhost:3000/api/billing/webhook \
  -H 'Content-Type: application/json' \
  -d '{"store_id":2,"source":"pos","lines":[{"product_id":3,"delta":-1},{"product_id":4,"delta":-2}]}'

# A customer joins the queue, then the shop serves the front
curl -X POST http://localhost:3000/api/queue -H 'Content-Type: application/json' \
  -d '{"store_id":2,"product_id":11,"customer_name":"Nirmal","quantity":1}'
curl -X POST http://localhost:3000/api/stores/2/queue/next
```

---

## 6. Deploying to Vercel

The repo is Vercel-ready: `public/` is served as static assets and `api/index.js` exports the
same Express app as a serverless function, with `vercel.json` rewriting `/api/*` onto it.

```bash
npm i -g vercel
vercel            # preview
vercel --prod     # production
```

Add `DATABASE_URL` (or the `DB_*` variables) under **Project → Settings → Environment
Variables** to run against a hosted MySQL such as TiDB Serverless, Aiven, or PlanetScale.
Without it the deployment runs on the seeded in-memory dataset — fine for a demo, but note
that serverless instances are ephemeral, so queue and stock edits are not durable until a real
database is attached.

---

## 7. Project layout

```
nearstock/
├── api/index.js              Vercel serverless entry (exports the Express app)
├── server/
│   ├── app.js                Express app: middleware, routers, error handling
│   ├── index.js              Local dev server
│   ├── lib/
│   │   ├── queue.js          Queue — circular array, O(1) enqueue/dequeue
│   │   ├── minheap.js        MinHeap — k-nearest shop extraction
│   │   ├── geo.js            Haversine, merge sort, linear + binary search
│   │   ├── db.js             Driver selector (MySQL ⇄ in-memory)
│   │   ├── store-mysql.js    MySQL data layer
│   │   └── store-memory.js   Seeded in-memory data layer
│   ├── routes/
│   │   ├── catalog.js        Products, stores, /search
│   │   ├── inventory.js      Stock + billing sync
│   │   └── queue.js          The FIFO request queue
│   └── data/seed.js          Canonical fixtures
├── db/
│   ├── schema.sql            MySQL DDL, view, stored function
│   └── seed.sql              Generated fixtures
├── public/                   Customer app, shop dashboard, architecture page
├── scripts/
│   ├── test-api.js           Test suite
│   └── gen-seed-sql.js       seed.js → seed.sql
└── vercel.json
```

---

## 8. Building the Flutter client

Every screen here is a plain `fetch` against the REST API, so a Flutter app is a drop-in
second client:

```dart
final pos = await Geolocator.getCurrentPosition();          // package:geolocator
final res = await http.get(Uri.parse(
  '$baseUrl/api/search?q=milk&lat=${pos.latitude}&lng=${pos.longitude}'));
final data = jsonDecode(res.body);
final nearest = data['results'][0]['nearest'];              // shop name, distanceLabel, price

await http.post(Uri.parse('$baseUrl/api/queue'),            // join the FIFO queue
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'store_id': nearest['store_id'],
    'product_id': data['results'][0]['product']['product_id'],
    'customer_name': 'Nirmal',
    'quantity': 1,
  }));
```

---

## 9. Tests

`npm test` boots the app on an ephemeral port and runs 28 checks:

* Queue FIFO order, ring wrap-around and growth, cancellation, position reporting
* MinHeap ordering and `kSmallest` agreement with a full sort
* Merge-sort stability, Haversine accuracy, prefix-first search scoring
* Every API route, including the FIFO guarantee end to end, stock floors at zero,
  400/404/409 error paths and static page delivery

---

## One-line explanation

> NearStock is a smart inventory discovery application powered by Node.js, Express.js and
> MySQL that lets customers find available products, view shop names and distances, identify
> the nearest shop, and manage customer requests using the **Queue** data structure.
