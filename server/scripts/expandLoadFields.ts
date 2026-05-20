// Expands load_orders with the fields a dispatcher needs to manage a load
// lifecycle: broker info, structured route, schedule, freight spec, and the
// pay breakdown (linehaul / FSC / accessorials).
//
// gross_load_amount_cents is NOT touched — it stays the stored gross total
// and is recomputed by the app layer as linehaul + fsc + accessorials.
// company_gross_cents (a GENERATED column) and all commission math continue
// to read it unchanged.
import dotenv from 'dotenv';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

import pool, { query } from '../src/config/database';

const COLUMNS: string[] = [
  // People & Broker
  'broker_name TEXT',
  'broker_mc_number TEXT',
  // Route
  'origin_city TEXT',
  'origin_state TEXT',
  'origin_zip TEXT',
  'dest_city TEXT',
  'dest_state TEXT',
  'dest_zip TEXT',
  'loaded_miles INTEGER',
  'deadhead_miles INTEGER',
  // Schedule
  'pickup_at TIMESTAMPTZ',
  'delivery_at TIMESTAMPTZ',
  // Freight
  'equipment_type TEXT',
  'trailer_length_ft INTEGER',
  'load_type TEXT',
  'commodity TEXT',
  'weight_lbs INTEGER',
  'is_hazmat BOOLEAN NOT NULL DEFAULT FALSE',
  'tarps_required BOOLEAN NOT NULL DEFAULT FALSE',
  'team_drivers BOOLEAN NOT NULL DEFAULT FALSE',
  'liftgate_required BOOLEAN NOT NULL DEFAULT FALSE',
  // Pay (component amounts; gross_load_amount_cents stays the derived total)
  'linehaul_amount_cents INTEGER',
  'fuel_surcharge_cents INTEGER',
  'accessorials_cents INTEGER',
  // References
  'broker_load_number TEXT',
  'bol_number TEXT',
];

async function migrate() {
  try {
    for (const col of COLUMNS) {
      await query(`ALTER TABLE load_orders ADD COLUMN IF NOT EXISTS ${col}`);
    }
    console.log(`Added ${COLUMNS.length} columns to load_orders.`);
  } catch (err: any) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
