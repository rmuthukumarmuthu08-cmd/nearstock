/**
 * NearStock — canonical seed dataset.
 *
 * This is the single source of truth for demo data. It powers:
 *   • the in-memory store (server/lib/store-memory.js) used when no MySQL is configured
 *   • db/seed.sql, which is generated from this file by scripts/gen-seed-sql.js
 *
 * Coordinates are real Coimbatore, Tamil Nadu locations so distance ranking
 * produces sensible, demonstrable numbers.
 */

const users = [
  { user_id: 1, name: 'Nirmal R',      email: 'nirmal@nearstock.app',  phone: '9876500001', role: 'customer', latitude: 11.0168, longitude: 76.9558 },
  { user_id: 2, name: 'Aravind K',     email: 'aravind@rskirana.in',   phone: '9876500002', role: 'shop',     latitude: 11.0041, longitude: 76.9614 },
  { user_id: 3, name: 'Meena S',       email: 'meena@greenmart.in',    phone: '9876500003', role: 'shop',     latitude: 11.0272, longitude: 76.9506 },
  { user_id: 4, name: 'Karthik V',     email: 'karthik@techzone.in',   phone: '9876500004', role: 'shop',     latitude: 11.0510, longitude: 76.9930 },
  { user_id: 5, name: 'Divya P',       email: 'divya@medipoint.in',    phone: '9876500005', role: 'shop',     latitude: 10.9975, longitude: 76.9470 },
];

const stores = [
  { store_id: 1,  owner_id: 2, name: 'RS Kirana Store',        category: 'Grocery',     address: '12 Big Bazaar Street, Town Hall',        city: 'Coimbatore', phone: '0422-2390001', latitude: 11.0041, longitude: 76.9614, opens_at: '07:00', closes_at: '22:00', rating: 4.4 },
  { store_id: 2,  owner_id: 3, name: 'GreenMart Supermarket',  category: 'Supermarket', address: '45 Avinashi Road, Peelamedu',            city: 'Coimbatore', phone: '0422-2390002', latitude: 11.0272, longitude: 76.9506, opens_at: '08:00', closes_at: '23:00', rating: 4.6 },
  { store_id: 3,  owner_id: 4, name: 'TechZone Electronics',   category: 'Electronics', address: '8 Cross Cut Road, Gandhipuram',          city: 'Coimbatore', phone: '0422-2390003', latitude: 11.0183, longitude: 76.9668, opens_at: '10:00', closes_at: '21:00', rating: 4.2 },
  { store_id: 4,  owner_id: 5, name: 'MediPoint Pharmacy',     category: 'Pharmacy',    address: '3 Trichy Road, Ramanathapuram',          city: 'Coimbatore', phone: '0422-2390004', latitude: 10.9975, longitude: 76.9470, opens_at: '06:30', closes_at: '23:30', rating: 4.8 },
  { store_id: 5,  owner_id: null, name: 'Saravana Stores',     category: 'Grocery',     address: '77 Oppanakara Street, Town Hall',        city: 'Coimbatore', phone: '0422-2390005', latitude: 11.0009, longitude: 76.9585, opens_at: '07:30', closes_at: '21:30', rating: 4.1 },
  { store_id: 6,  owner_id: null, name: 'Daily Fresh Mart',    category: 'Supermarket', address: '21 Sungam Bypass, Nanjundapuram',        city: 'Coimbatore', phone: '0422-2390006', latitude: 10.9838, longitude: 76.9704, opens_at: '08:00', closes_at: '22:00', rating: 4.3 },
  { store_id: 7,  owner_id: null, name: 'Vasanth Electronics', category: 'Electronics', address: '90 DB Road, RS Puram',                   city: 'Coimbatore', phone: '0422-2390007', latitude: 11.0060, longitude: 76.9490, opens_at: '10:00', closes_at: '20:30', rating: 4.0 },
  { store_id: 8,  owner_id: null, name: 'Anna Medicals',       category: 'Pharmacy',    address: '5 Mettupalayam Road, Thudiyalur',        city: 'Coimbatore', phone: '0422-2390008', latitude: 11.0810, longitude: 76.9420, opens_at: '07:00', closes_at: '23:00', rating: 4.5 },
  { store_id: 9,  owner_id: null, name: 'Kovai Book House',    category: 'Stationery',  address: '14 Raja Street, Town Hall',              city: 'Coimbatore', phone: '0422-2390009', latitude: 11.0025, longitude: 76.9640, opens_at: '09:00', closes_at: '20:00', rating: 4.7 },
  { store_id: 10, owner_id: null, name: 'Peelamedu Provisions',category: 'Grocery',     address: '62 Hope College Road, Peelamedu',        city: 'Coimbatore', phone: '0422-2390010', latitude: 11.0298, longitude: 76.9812, opens_at: '07:00', closes_at: '22:30', rating: 3.9 },
];

const products = [
  { product_id: 1,  name: 'Aashirvaad Atta 5kg',        brand: 'Aashirvaad', category: 'Grocery',     unit: 'pack',   base_price: 265.00, barcode: '8901030601001', image_emoji: '🌾' },
  { product_id: 2,  name: 'Amul Butter 500g',           brand: 'Amul',       category: 'Dairy',       unit: 'pack',   base_price: 285.00, barcode: '8901030601002', image_emoji: '🧈' },
  { product_id: 3,  name: 'Aavin Milk 1L',              brand: 'Aavin',      category: 'Dairy',       unit: 'packet', base_price: 54.00,  barcode: '8901030601003', image_emoji: '🥛' },
  { product_id: 4,  name: 'Tata Salt 1kg',              brand: 'Tata',       category: 'Grocery',     unit: 'pack',   base_price: 28.00,  barcode: '8901030601004', image_emoji: '🧂' },
  { product_id: 5,  name: 'Sunfeast Marie Light 250g',  brand: 'Sunfeast',   category: 'Snacks',      unit: 'pack',   base_price: 45.00,  barcode: '8901030601005', image_emoji: '🍪' },
  { product_id: 6,  name: 'Fortune Sunflower Oil 1L',   brand: 'Fortune',    category: 'Grocery',     unit: 'bottle', base_price: 152.00, barcode: '8901030601006', image_emoji: '🛢️' },
  { product_id: 7,  name: 'Surf Excel Easy Wash 1kg',   brand: 'Surf Excel', category: 'Household',   unit: 'pack',   base_price: 118.00, barcode: '8901030601007', image_emoji: '🧼' },
  { product_id: 8,  name: 'Colgate Strong Teeth 200g',  brand: 'Colgate',    category: 'Personal Care', unit: 'tube', base_price: 112.00, barcode: '8901030601008', image_emoji: '🪥' },
  { product_id: 9,  name: 'Dettol Handwash 200ml',      brand: 'Dettol',     category: 'Personal Care', unit: 'bottle', base_price: 99.00, barcode: '8901030601009', image_emoji: '🧴' },
  { product_id: 10, name: 'Maggi Noodles 12-pack',      brand: 'Nestle',     category: 'Snacks',      unit: 'pack',   base_price: 168.00, barcode: '8901030601010', image_emoji: '🍜' },
  { product_id: 11, name: 'Boost Health Drink 500g',    brand: 'Boost',      category: 'Beverages',   unit: 'jar',    base_price: 255.00, barcode: '8901030601011', image_emoji: '🥤' },
  { product_id: 12, name: 'Bru Instant Coffee 100g',    brand: 'Bru',        category: 'Beverages',   unit: 'jar',    base_price: 310.00, barcode: '8901030601012', image_emoji: '☕' },
  { product_id: 13, name: 'Paracetamol 500mg (15 tab)', brand: 'Cipla',      category: 'Medicine',    unit: 'strip',  base_price: 22.00,  barcode: '8901030601013', image_emoji: '💊' },
  { product_id: 14, name: 'Digital Thermometer',        brand: 'Dr Morepen', category: 'Medicine',    unit: 'piece',  base_price: 199.00, barcode: '8901030601014', image_emoji: '🌡️' },
  { product_id: 15, name: 'Vicks VapoRub 50ml',         brand: 'Vicks',      category: 'Medicine',    unit: 'jar',    base_price: 165.00, barcode: '8901030601015', image_emoji: '🫙' },
  { product_id: 16, name: 'boAt Rockerz 255 Earphones', brand: 'boAt',       category: 'Electronics', unit: 'piece',  base_price: 1299.00, barcode: '8901030601016', image_emoji: '🎧' },
  { product_id: 17, name: 'Duracell AA Battery 4-pack', brand: 'Duracell',   category: 'Electronics', unit: 'pack',   base_price: 185.00, barcode: '8901030601017', image_emoji: '🔋' },
  { product_id: 18, name: 'Philips LED Bulb 9W',        brand: 'Philips',    category: 'Electronics', unit: 'piece',  base_price: 149.00, barcode: '8901030601018', image_emoji: '💡' },
  { product_id: 19, name: 'Anker 20W USB-C Charger',    brand: 'Anker',      category: 'Electronics', unit: 'piece',  base_price: 1499.00, barcode: '8901030601019', image_emoji: '🔌' },
  { product_id: 20, name: 'HDMI Cable 1.5m',            brand: 'AmazonBasics', category: 'Electronics', unit: 'piece', base_price: 399.00, barcode: '8901030601020', image_emoji: '🧵' },
  { product_id: 21, name: 'Classmate Notebook 200pg',   brand: 'Classmate',  category: 'Stationery',  unit: 'piece',  base_price: 60.00,  barcode: '8901030601021', image_emoji: '📓' },
  { product_id: 22, name: 'Reynolds Pen (Blue, 5)',     brand: 'Reynolds',   category: 'Stationery',  unit: 'pack',   base_price: 50.00,  barcode: '8901030601022', image_emoji: '🖊️' },
  { product_id: 23, name: 'A4 Printer Paper 500 sheets',brand: 'JK Copier',  category: 'Stationery',  unit: 'ream',   base_price: 340.00, barcode: '8901030601023', image_emoji: '📄' },
  { product_id: 24, name: 'Basmati Rice 5kg',           brand: 'India Gate', category: 'Grocery',     unit: 'pack',   base_price: 620.00, barcode: '8901030601024', image_emoji: '🍚' },
];

/**
 * inventory: [store_id, product_id, quantity, price]
 * Quantities include deliberate zeroes so "out of stock" paths are demonstrable.
 */
const inventoryTuples = [
  // 1 RS Kirana Store (Grocery)
  [1, 1, 24, 262], [1, 2, 8, 289], [1, 3, 40, 54], [1, 4, 60, 27], [1, 5, 30, 44],
  [1, 6, 15, 155], [1, 7, 12, 120], [1, 10, 18, 165], [1, 24, 6, 615], [1, 22, 25, 50],
  // 2 GreenMart Supermarket
  [2, 1, 40, 258], [2, 2, 22, 279], [2, 3, 85, 52], [2, 4, 120, 26], [2, 5, 55, 42],
  [2, 6, 34, 149], [2, 7, 28, 115], [2, 8, 30, 108], [2, 9, 26, 95], [2, 10, 44, 162],
  [2, 11, 12, 249], [2, 12, 9, 305], [2, 24, 20, 605], [2, 21, 35, 58],
  // 3 TechZone Electronics
  [3, 16, 14, 1249], [3, 17, 40, 179], [3, 18, 60, 139], [3, 19, 9, 1449], [3, 20, 25, 379],
  // 4 MediPoint Pharmacy
  [4, 13, 150, 21], [4, 14, 12, 189], [4, 15, 40, 159], [4, 8, 20, 110], [4, 9, 30, 92],
  // 5 Saravana Stores
  [5, 1, 10, 270], [5, 3, 25, 55], [5, 4, 45, 28], [5, 6, 8, 158], [5, 10, 0, 170],
  [5, 24, 4, 630], [5, 5, 12, 46],
  // 6 Daily Fresh Mart
  [6, 1, 18, 259], [6, 2, 14, 282], [6, 3, 60, 53], [6, 7, 20, 116], [6, 10, 26, 164],
  [6, 11, 7, 252], [6, 12, 5, 315], [6, 21, 20, 59],
  // 7 Vasanth Electronics
  [7, 16, 5, 1319], [7, 17, 22, 189], [7, 18, 33, 145], [7, 19, 0, 1520], [7, 20, 11, 405],
  // 8 Anna Medicals
  [8, 13, 90, 22], [8, 15, 18, 168], [8, 14, 0, 205], [8, 9, 16, 99],
  // 9 Kovai Book House
  [9, 21, 120, 55], [9, 22, 90, 48], [9, 23, 30, 329],
  // 10 Peelamedu Provisions
  [10, 1, 9, 268], [10, 3, 30, 56], [10, 4, 50, 29], [10, 5, 20, 47], [10, 10, 10, 169],
  [10, 22, 15, 52], [10, 21, 12, 62],
];

/** Pre-seeded FIFO queue entries so the Queue demo has history on first load. */
const queueSeed = [
  { store_id: 2, product_id: 12, customer_name: 'Priya M',  customer_phone: '9840011122', quantity: 1, note: 'Need before 6pm',        status: 'fulfilled' },
  { store_id: 2, product_id: 11, customer_name: 'Rahul S',  customer_phone: '9840011133', quantity: 2, note: '',                        status: 'waiting'   },
  { store_id: 3, product_id: 19, customer_name: 'Ashwin T', customer_phone: '9840011144', quantity: 1, note: 'Reserve if restocked',    status: 'waiting'   },
  { store_id: 4, product_id: 14, customer_name: 'Lakshmi R',customer_phone: '9840011155', quantity: 1, note: 'For home use',            status: 'waiting'   },
];

module.exports = { users, stores, products, inventoryTuples, queueSeed };
