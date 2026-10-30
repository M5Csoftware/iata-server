import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { AwbStock } from '../models/AwbStock.js';
import { Docket } from '../models/Docket.js';
import { Booking } from '../models/Booking.js';
import { Mawb } from '../models/Mawb.js';
import { FlightManifest } from '../models/FlightManifest.js';
import { EawbMessage } from '../models/EawbMessage.js';
import { CassInvoice } from '../models/CassInvoice.js';
import { Airline, Airport, ShipperConsignee, AgentProfile } from '../models/MasterData.js';
import {
  SEED_AGENT_PROFILE,
  SEED_AIRLINES,
  SEED_AIRPORTS,
  SEED_PARTNERS,
  SEED_STOCK,
  SEED_DOCKETS,
  SEED_BOOKINGS,
  SEED_MAWBS,
  SEED_MANIFESTS,
  SEED_EAWB_MESSAGES,
  SEED_INVOICES,
  SEED_USERS,
} from './seedData.js';

export async function seedDatabase(force = false): Promise<void> {
  console.log('[Seeder] Starting database check and seeding...');

  // Users
  const userCount = await User.countDocuments();
  if (userCount === 0 || force) {
    if (force) await User.deleteMany({});
    for (const u of SEED_USERS) {
      await User.create(u);
    }
    console.log(`[Seeder] Seeded ${SEED_USERS.length} users (including admin/admin).`);
  }

  // Agent Profile
  const agentCount = await AgentProfile.countDocuments();
  if (agentCount === 0 || force) {
    if (force) await AgentProfile.deleteMany({});
    await AgentProfile.create(SEED_AGENT_PROFILE);
    console.log('[Seeder] Seeded Issuing Agent Profile.');
  }

  // Airlines
  const airlineCount = await Airline.countDocuments();
  if (airlineCount === 0 || force) {
    if (force) await Airline.deleteMany({});
    await Airline.insertMany(SEED_AIRLINES);
    console.log(`[Seeder] Seeded ${SEED_AIRLINES.length} IATA Airlines.`);
  }

  // Airports
  const airportCount = await Airport.countDocuments();
  if (airportCount === 0 || force) {
    if (force) await Airport.deleteMany({});
    await Airport.insertMany(SEED_AIRPORTS);
    console.log(`[Seeder] Seeded ${SEED_AIRPORTS.length} IATA Airports.`);
  }

  // Partners
  const partnerCount = await ShipperConsignee.countDocuments();
  if (partnerCount === 0 || force) {
    if (force) await ShipperConsignee.deleteMany({});
    await ShipperConsignee.insertMany(SEED_PARTNERS);
    console.log(`[Seeder] Seeded ${SEED_PARTNERS.length} Trading Partners.`);
  }

  // AWB Stock
  const stockCount = await AwbStock.countDocuments();
  if (stockCount === 0 || force) {
    if (force) await AwbStock.deleteMany({});
    await AwbStock.insertMany(SEED_STOCK);
    console.log(`[Seeder] Seeded ${SEED_STOCK.length} AWB Stock numbers.`);
  }

  // Dockets
  const docketCount = await Docket.countDocuments();
  if (docketCount === 0 || force) {
    if (force) await Docket.deleteMany({});
    await Docket.insertMany(SEED_DOCKETS);
    console.log(`[Seeder] Seeded ${SEED_DOCKETS.length} Cargo Dockets.`);
  }

  // Bookings
  const bookingCount = await Booking.countDocuments();
  if (bookingCount === 0 || force) {
    if (force) await Booking.deleteMany({});
    await Booking.insertMany(SEED_BOOKINGS);
    console.log(`[Seeder] Seeded ${SEED_BOOKINGS.length} Bookings.`);
  }

  // Mawbs
  const mawbCount = await Mawb.countDocuments();
  if (mawbCount === 0 || force) {
    if (force) await Mawb.deleteMany({});
    await Mawb.insertMany(SEED_MAWBS);
    console.log(`[Seeder] Seeded ${SEED_MAWBS.length} MAWBs with HAWBs.`);
  }

  // Manifests
  const manifestCount = await FlightManifest.countDocuments();
  if (manifestCount === 0 || force) {
    if (force) await FlightManifest.deleteMany({});
    await FlightManifest.insertMany(SEED_MANIFESTS);
    console.log(`[Seeder] Seeded ${SEED_MANIFESTS.length} Flight Manifests.`);
  }

  // e-AWB Messages
  const eawbCount = await EawbMessage.countDocuments();
  if (eawbCount === 0 || force) {
    if (force) await EawbMessage.deleteMany({});
    await EawbMessage.insertMany(SEED_EAWB_MESSAGES);
    console.log(`[Seeder] Seeded ${SEED_EAWB_MESSAGES.length} e-AWB Messages.`);
  }

  // Invoices
  const invoiceCount = await CassInvoice.countDocuments();
  if (invoiceCount === 0 || force) {
    if (force) await CassInvoice.deleteMany({});
    await CassInvoice.insertMany(SEED_INVOICES);
    console.log(`[Seeder] Seeded ${SEED_INVOICES.length} CASS Invoices.`);
  }

  console.log('[Seeder] Database is ready and up to date.');
}

// Standalone CLI execution
if (process.argv[1]?.endsWith('seeder.ts') || process.argv[1]?.endsWith('seeder.js')) {
  (async () => {
    try {
      await connectDatabase();
      const force = process.argv.includes('--force');
      await seedDatabase(force);
      await disconnectDatabase();
      process.exit(0);
    } catch (err: any) {
      console.error('[Seeder] Error seeding database:', err.message);
      process.exit(1);
    }
  })();
}

