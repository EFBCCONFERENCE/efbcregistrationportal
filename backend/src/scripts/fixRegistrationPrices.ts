/**
 * Migration script to fix registration prices for existing registrations.
 * Recalculates total_price using the same tier logic as createRegistration — real UTC timestamps
 * and shared pickActivePricingTier (never "last tier in JSON" fallback).
 *
 * Usage: npx ts-node src/scripts/fixRegistrationPrices.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { DatabaseService } from '../services/databaseService';
import connectDB from '../config/database';
import {
  getEasternTimeEndOfDay,
  parsePricingTierArray,
  pickActivePricingTier,
  fallbackRegistrationBasePrice,
} from '../utils/pricingTierUtils';

async function fixRegistrationPrices() {
  const connection = await connectDB();
  const db = new DatabaseService(connection);

  try {
    console.log('Starting registration price fix migration...');

    const registrations = await db.query('SELECT * FROM registrations ORDER BY id');

    if (!Array.isArray(registrations) || registrations.length === 0) {
      console.log('No registrations found.');
      return;
    }

    console.log(`Found ${registrations.length} registrations to process.`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const reg of registrations) {
      try {
        const regId = reg.id;
        const eventId = reg.event_id;

        const event = await db.findById('events', eventId);
        if (!event) {
          console.log(`⚠️  Registration ${regId}: Event ${eventId} not found, skipping...`);
          skipped++;
          continue;
        }

        const dateToUse = (reg as any).paid_at || (reg as any).paidAt || reg.created_at || reg.createdAt;
        const atMs = dateToUse ? new Date(dateToUse).getTime() : Date.now();
        if (!Number.isFinite(atMs)) {
          console.log(`⚠️  Registration ${regId}: Invalid date, skipping...`);
          skipped++;
          continue;
        }

        const regTiers = parsePricingTierArray((event as any).registration_pricing);
        const spouseTiers = parsePricingTierArray((event as any).spouse_pricing);
        const kidsTiers = parsePricingTierArray((event as any).kids_pricing);

        const breakfastPrice = Number((event as any).breakfast_price ?? 0);
        const bEnd = (event as any).breakfast_end_date
          ? getEasternTimeEndOfDay(String((event as any).breakfast_end_date))
          : Infinity;

        const base = pickActivePricingTier(regTiers, atMs);
        let calculatedPrice = 0;
        if (base && typeof base.price === 'number') {
          calculatedPrice += base.price;
        } else {
          calculatedPrice += fallbackRegistrationBasePrice(event, regTiers);
        }

        const spouseTicket = !!(reg as any).spouse_dinner_ticket;
        if (spouseTicket) {
          const spouse = pickActivePricingTier(spouseTiers, atMs);
          if (spouse && typeof spouse.price === 'number') {
            calculatedPrice += spouse.price;
          }
        }

        if ((reg as any).spouse_breakfast && atMs <= bEnd) {
          calculatedPrice += isNaN(breakfastPrice) ? 0 : breakfastPrice;
        }

        let kidsArr: any[] = [];
        try {
          const kd = (reg as any).kids_data;
          if (kd) {
            kidsArr = typeof kd === 'string' ? JSON.parse(kd) : kd;
          }
        } catch {
          kidsArr = [];
        }
        if (!Array.isArray(kidsArr)) kidsArr = [];

        const kidsActive = pickActivePricingTier(kidsTiers, atMs);
        const pricePerKid =
          kidsActive && typeof kidsActive.price === 'number' ? kidsActive.price : 0;
        calculatedPrice += pricePerKid * kidsArr.length;

        const currentPrice = Number(reg.total_price || 0);

        if (Math.abs(calculatedPrice - currentPrice) > 0.01) {
          await db.update('registrations', regId, {
            total_price: calculatedPrice,
          });

          console.log(
            `✅ Registration ${regId}: Updated price from $${currentPrice.toFixed(2)} to $${calculatedPrice.toFixed(2)} (ref: ${dateToUse}, tier: ${base?.label || base?.name || 'fallback'})`
          );
          updated++;
        } else {
          console.log(`✓  Registration ${regId}: Price already correct ($${currentPrice.toFixed(2)})`);
          skipped++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing registration ${reg.id}:`, error?.message || error);
        errors++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total registrations: ${registrations.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (already correct): ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log('\nMigration completed!');
  } catch (error: any) {
    console.error('Fatal error during migration:', error);
    throw error;
  }
}

if (require.main === module) {
  fixRegistrationPrices()
    .then(() => {
      console.log('Script completed successfully.');
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

export { fixRegistrationPrices };
