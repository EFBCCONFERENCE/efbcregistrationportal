/**
 * Migration script to fix registration prices for existing registrations
 * This script recalculates the total_price based on the registration's creation date
 * and the tier pricing that was active at that time.
 * 
 * Usage: 
 *   npx ts-node src/scripts/fixRegistrationPrices.ts
 *   OR
 *   npm run fix-prices (if added to package.json)
 *   OR
 *   npm run fix-prices (if added to package.json)
 *   OR
 *   npm run fix-prices (if added to package.json)
 *   OR
 *   npm run fix-prices (if added to package.json)
 *   OR
 *   npm run fix-prices (if added to package.json)
 *   OR
 *   npm run fix-prices (if added to package.json)
 *   OR
 *   npm run fix-prices (if added to package.json)
 *   OR
 *   npm run fix-prices (if added to package.json)
 *   OR
 *   npm run fix-prices (if added to package.json)
 */

import dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();

import { DatabaseService } from '../services/databaseService';
import connectDB from '../config/database';

// Helper functions from registrationController (copied here for standalone script)
function getEasternTimeMidnight(dateString: string): number {
  if (!dateString) return -Infinity;
  
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
      return new Date(dateString + 'T00:00:00Z').getTime();
    }
    
    let guessUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    let easternTime = formatter.format(guessUtc);
    let [easternHour, easternMinute] = easternTime.split(':').map(Number);
    
    let iterations = 0;
    while ((easternHour !== 0 || easternMinute !== 0) && iterations < 10) {
      const hoursToSubtract = easternHour;
      const minutesToSubtract = easternMinute;
      const adjustmentMs = (hoursToSubtract * 60 + minutesToSubtract) * 60 * 1000;
      
      guessUtc = new Date(guessUtc.getTime() - adjustmentMs);
      
      easternTime = formatter.format(guessUtc);
      [easternHour, easternMinute] = easternTime.split(':').map(Number);
      iterations++;
    }
    
    return guessUtc.getTime();
  } catch (error) {
    console.warn(`Failed to parse date ${dateString} as Eastern Time, using UTC:`, error);
    return new Date(dateString + 'T00:00:00Z').getTime();
  }
}

function getEasternTimeEndOfDay(dateString: string): number {
  if (!dateString) return Infinity;
  
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
      const fallbackDate = new Date(dateString + 'T00:00:00Z');
      fallbackDate.setUTCDate(fallbackDate.getUTCDate() + 1);
      return getEasternTimeMidnight(`${fallbackDate.getUTCFullYear()}-${String(fallbackDate.getUTCMonth() + 1).padStart(2, '0')}-${String(fallbackDate.getUTCDate()).padStart(2, '0')}`);
    }
    
    const nextDay = new Date(year, month - 1, day + 1);
    const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
    return getEasternTimeMidnight(nextDayStr);
  } catch (error) {
    console.warn(`Failed to parse end date ${dateString} as Eastern Time, using UTC:`, error);
    const fallbackDate = new Date(dateString + 'T00:00:00Z');
    fallbackDate.setUTCDate(fallbackDate.getUTCDate() + 1);
    return fallbackDate.getTime();
  }
}

function getEasternTimeForDate(dateString: string): number {
  if (!dateString) return new Date().getTime();
  
  try {
    // Parse the date string (could be YYYY-MM-DD or full datetime)
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return new Date().getTime();
    }
    
    // Get date components in Eastern Time
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
    
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const easternMidnight = getEasternTimeMidnight(dateStr);
    
    const hoursMs = hour * 60 * 60 * 1000;
    const minutesMs = minute * 60 * 1000;
    const secondsMs = second * 1000;
    
    return easternMidnight + hoursMs + minutesMs + secondsMs;
  } catch (error) {
    console.warn(`Failed to parse date ${dateString} as Eastern Time, using current time:`, error);
    return new Date().getTime();
  }
}

async function fixRegistrationPrices() {
  const connection = await connectDB();
  const db = new DatabaseService(connection);
  
  try {
    console.log('Starting registration price fix migration...');
    
    // Debug: Check current database
    try {
      const dbCheck = await db.query('SELECT DATABASE() as current_db');
      console.log('[DEBUG] Current database query result:', dbCheck);
      if (Array.isArray(dbCheck) && dbCheck.length > 0) {
        console.log('[DEBUG] Current database:', dbCheck[0]?.current_db || 'unknown');
      } else if (dbCheck && typeof dbCheck === 'object' && 'current_db' in dbCheck) {
        console.log('[DEBUG] Current database:', (dbCheck as any).current_db);
      }
    } catch (dbError: any) {
      console.error('[DEBUG] Error checking database:', dbError?.message);
    }
    
    // Debug: Check table count
    try {
      const countCheck = await db.query('SELECT COUNT(*) as total FROM registrations');
      console.log('[DEBUG] Count query result:', countCheck);
      if (Array.isArray(countCheck) && countCheck.length > 0) {
        console.log('[DEBUG] Total registrations:', countCheck[0]?.total || 0);
      } else if (countCheck && typeof countCheck === 'object' && 'total' in countCheck) {
        console.log('[DEBUG] Total registrations:', (countCheck as any).total);
      }
    } catch (countError: any) {
      console.error('[DEBUG] Error counting registrations:', countError?.message);
    }
    
    // Get all registrations
    console.log('[DEBUG] Executing: SELECT * FROM registrations ORDER BY id');
    const registrations = await db.query('SELECT * FROM registrations ORDER BY id');
    
    console.log('[DEBUG] Query result type:', typeof registrations);
    console.log('[DEBUG] Is array?', Array.isArray(registrations));
    if (Array.isArray(registrations)) {
      console.log('[DEBUG] Array length:', registrations.length);
      if (registrations.length > 0) {
        console.log('[DEBUG] First registration sample (first 3 fields):', {
          id: registrations[0]?.id,
          first_name: registrations[0]?.first_name,
          email: registrations[0]?.email
        });
      }
    } else {
      console.log('[DEBUG] Result structure:', registrations);
      console.log('[DEBUG] Result keys:', registrations ? Object.keys(registrations) : 'null/undefined');
    }
    
    if (!Array.isArray(registrations) || registrations.length === 0) {
      console.log('No registrations found.');
      console.log('[DEBUG] This could mean:');
      console.log('[DEBUG] 1. Wrong database connected');
      console.log('[DEBUG] 2. Table name is different');
      console.log('[DEBUG] 3. Query returned data in unexpected format');
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
        
        // Get the event to access pricing tiers
        const event = await db.findById('events', eventId);
        if (!event) {
          console.log(`⚠️  Registration ${regId}: Event ${eventId} not found, skipping...`);
          skipped++;
          continue;
        }
        
        // Parse pricing tiers
        const parseJson = (v: any) => {
          try {
            return JSON.parse(v || '[]');
          } catch {
            return [];
          }
        };
        
        const regTiers: any[] = parseJson((event as any).registration_pricing);
        const spouseTiers: any[] = parseJson((event as any).spouse_pricing);
        const defaultPrice = Number((event as any).default_price || 675);
        
        // Use creation date (or paid_at if available) to determine which tier was active
        // Prefer paid_at if available, otherwise use created_at
        // Check for both snake_case and camelCase field names
        const dateToUse = (reg as any).paid_at || (reg as any).paidAt || reg.created_at || reg.createdAt;
        const registrationTime = getEasternTimeForDate(dateToUse);
        
        // Calculate tier prices
        const pickTier = (tiers: any[]) => {
          const mapped = (tiers || []).map((t: any) => ({
            ...t,
            s: t.startDate ? getEasternTimeMidnight(t.startDate) : -Infinity,
            e: t.endDate ? getEasternTimeEndOfDay(t.endDate) : Infinity
          }));
          return mapped.find((t: any) => registrationTime >= t.s && registrationTime < t.e) || mapped[mapped.length - 1] || null;
        };
        
        const baseTier = pickTier(regTiers);
        const spouseTier = reg.spouse_dinner_ticket ? pickTier(spouseTiers) : null;
        
        // Calculate total price
        let calculatedPrice = 0;
        if (baseTier && typeof baseTier.price === 'number') {
          calculatedPrice += baseTier.price;
        } else {
          calculatedPrice += defaultPrice;
        }
        
        if (spouseTier && typeof spouseTier.price === 'number') {
          calculatedPrice += spouseTier.price;
        }
        
        // Get current price from database
        const currentPrice = Number(reg.total_price || 0);
        
        // Only update if price is different
        if (Math.abs(calculatedPrice - currentPrice) > 0.01) {
          await db.update('registrations', regId, {
            total_price: calculatedPrice
          });
          
          console.log(`✅ Registration ${regId}: Updated price from $${currentPrice.toFixed(2)} to $${calculatedPrice.toFixed(2)} (Date: ${dateToUse}, Tier: ${baseTier?.label || baseTier?.name || 'default'})`);
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
  } finally {
    // Close database connection if needed
    // db.close(); // Uncomment if DatabaseService has a close method
  }
}

// Run the migration
if (require.main === module) {
  fixRegistrationPrices()
    .then(() => {
      console.log('Script completed successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { fixRegistrationPrices };

