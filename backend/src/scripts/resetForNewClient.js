/**
 * Factory reset for HindHolidays (new client).
 * KEEPS: packages, hotels, roles, admin@crm.com
 * WIPES: every other collection (leads, bookings, HR, users except admin, etc.)
 *
 * Run locally only:  npm run reset:new-client
 * Do NOT run against production unless intentional — uses MONGO_URI from backend/.env
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');

const ADMIN_EMAIL = 'admin@crm.com';
const KEEP = new Set(['packages', 'hotels', 'roles']);

async function count(col) {
  try {
    return await mongoose.connection.db.collection(col).countDocuments();
  } catch {
    return 0;
  }
}

async function run() {
  console.log('[reset:new-client] Connecting…');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log(`[reset:new-client] DB: ${mongoose.connection.name}`);

  const packagesBefore = await count('packages');
  const hotelsBefore = await count('hotels');
  console.log(`Keeping packages=${packagesBefore}, hotels=${hotelsBefore}`);

  const User = require('../models/User');
  const admin = await User.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    console.warn(`⚠️  ${ADMIN_EMAIL} not found — all users will be wiped. Seed/create admin afterwards.`);
  } else {
    console.log(`Keeping admin: ${admin.email} (${admin.name})`);
  }

  const existing = await mongoose.connection.db.listCollections().toArray();
  const names = existing.map((c) => c.name).filter((n) => !n.startsWith('system.'));
  const summary = {};

  for (const name of names) {
    if (KEEP.has(name)) {
      console.log(`  skip (keep): ${name} (${await count(name)})`);
      continue;
    }
    if (name === 'users') continue;

    const result = await mongoose.connection.db.collection(name).deleteMany({});
    const deleted = result.deletedCount || 0;
    if (deleted > 0) {
      summary[name] = deleted;
      console.log(`  wiped ${name}: ${deleted}`);
    }
  }

  if (admin) {
    const removed = await User.deleteMany({ email: { $ne: ADMIN_EMAIL } });
    summary.users_removed = removed.deletedCount;
    console.log(`  users removed (non-admin): ${removed.deletedCount}`);
  } else {
    const removed = await User.deleteMany({});
    summary.users_removed = removed.deletedCount;
    console.log(`  users wiped: ${removed.deletedCount}`);
  }

  const packagesAfter = await count('packages');
  const hotelsAfter = await count('hotels');
  const rolesAfter = await count('roles');
  const usersAfter = await count('users');
  const leadsAfter = await count('leads');

  console.log('\n✅ Reset complete.');
  console.log({
    packages: packagesAfter,
    hotels: hotelsAfter,
    roles: rolesAfter,
    users: usersAfter,
    leads: leadsAfter,
    wiped: summary,
  });

  if (packagesAfter !== packagesBefore || hotelsAfter !== hotelsBefore) {
    console.error('❌ WARNING: package/hotel counts changed unexpectedly.');
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err.message || err);
  console.error('\nIs MongoDB running? Check MONGO_URI in backend/.env');
  process.exit(1);
});
