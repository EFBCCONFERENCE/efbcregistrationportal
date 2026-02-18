import { Request, Response } from 'express';
import { Registration } from '../models/Registration';
import { ApiResponse, CreateRegistrationRequest, UpdateRegistrationRequest, RegistrationQuery } from '../types';
import { DatabaseService } from '../services/databaseService';
import { sendRegistrationConfirmationEmail, sendRegistrationUpdateEmail } from '../services/emailService';
import jwt from 'jsonwebtoken';

/**
 * Helper function to convert a date string (YYYY-MM-DD) to Eastern Time midnight
 * Florida uses Eastern Time (America/New_York timezone)
 * Returns the UTC timestamp that represents midnight Eastern Time on the given date
 * 
 * This function handles DST automatically by using Intl.DateTimeFormat
 */
function getEasternTimeMidnight(dateString: string): number {
  if (!dateString) return -Infinity;
  
  try {
    // Parse the date string
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
      // Fallback to UTC parsing
      return new Date(dateString + 'T00:00:00Z').getTime();
    }
    
    // Strategy: Find the UTC timestamp that, when converted to Eastern Time, equals midnight
    // We'll use a binary search approach: start with a guess and adjust
    
    // Start with UTC midnight on that date
    let guessUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    
    // Check what Eastern time this UTC time represents
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    let easternTime = formatter.format(guessUtc);
    let [easternHour, easternMinute] = easternTime.split(':').map(Number);
    
    // Adjust until we get midnight Eastern (00:00)
    // Eastern is typically UTC-5 (EST) or UTC-4 (EDT)
    // So midnight Eastern is around 4-5 AM UTC
    let iterations = 0;
    while ((easternHour !== 0 || easternMinute !== 0) && iterations < 10) {
      // Calculate adjustment needed
      const hoursToSubtract = easternHour;
      const minutesToSubtract = easternMinute;
      const adjustmentMs = (hoursToSubtract * 60 + minutesToSubtract) * 60 * 1000;
      
      guessUtc = new Date(guessUtc.getTime() - adjustmentMs);
      
      easternTime = formatter.format(guessUtc);
      [easternHour, easternMinute] = easternTime.split(':').map(Number);
      iterations++;
    }
    
    // For end dates, we want end of day (23:59:59 Eastern)
    // But this function is for start dates, so return midnight
    return guessUtc.getTime();
  } catch (error) {
    // Fallback to UTC parsing if Eastern Time conversion fails
    console.warn(`Failed to parse date ${dateString} as Eastern Time, using UTC:`, error);
    return new Date(dateString + 'T00:00:00Z').getTime();
  }
}

/**
 * Get Eastern Time end of day for a date string
 * Returns the start of the next day (exclusive) to ensure the full end date is included
 * Example: For Dec 11, returns Dec 12 00:00:00 Eastern Time
 * This way, any time on Dec 11 will be < Dec 12 00:00:00, so it's included
 */
function getEasternTimeEndOfDay(dateString: string): number {
  if (!dateString) return Infinity;
  
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
      // Fallback: add 1 day and get midnight
      const fallbackDate = new Date(dateString + 'T00:00:00Z');
      fallbackDate.setUTCDate(fallbackDate.getUTCDate() + 1);
      return getEasternTimeMidnight(`${fallbackDate.getUTCFullYear()}-${String(fallbackDate.getUTCMonth() + 1).padStart(2, '0')}-${String(fallbackDate.getUTCDate()).padStart(2, '0')}`);
    }
    
    // Get midnight of next day in Eastern Time
    // This makes the end date exclusive, so Dec 11 includes all of Dec 11 up to (but not including) Dec 12
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

/**
 * Get current time converted to Eastern Time for comparison
 * Returns a UTC timestamp that represents the current Eastern Time
 * This can be directly compared with Eastern Time midnight timestamps
 */
function getCurrentEasternTime(): number {
  const now = new Date();
  
  // Get current time components in Eastern Time
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
  
  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
  
  // Create a UTC date with these Eastern Time components
  // This represents "what UTC time would give us this Eastern Time"
  let guessUtc = new Date(Date.UTC(year, month, day, hour, minute, second));
  
  // Verify: check what Eastern time this UTC time actually represents
  const checkFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  let checkTime = checkFormatter.format(guessUtc);
  let [checkH, checkM, checkS] = checkTime.split(':').map(Number);
  
  // If there's a mismatch, adjust the UTC time
  // This handles edge cases where the initial guess is off
  if (checkH !== hour || checkM !== minute || checkS !== second) {
    const diffH = hour - checkH;
    const diffM = minute - checkM;
    const diffS = second - checkS;
    const adjustmentMs = (diffH * 3600 + diffM * 60 + diffS) * 1000;
    guessUtc = new Date(guessUtc.getTime() + adjustmentMs);
  }
  
  return guessUtc.getTime();
}

export class RegistrationController {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  // Helper method to extract authentication info from request
  private getAuth(req: Request): { id?: number; role?: string } {
    try {
      const hdr = (req.headers.authorization || '') as string;
      const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
      if (!token) return {};
      const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
      const p: any = jwt.verify(token, JWT_SECRET);
      return { id: Number(p.sub), role: p.role };
    } catch { 
      return {}; 
    }
  }

  // Get all registrations
  async getRegistrations(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10, eventId, category, search } = req.query as RegistrationQuery;
      const offset = (Number(page) - 1) * Number(limit);

      // Map camelCase to snake_case for database columns
      let conditions: Record<string, any> = {};
      if (eventId) conditions.event_id = eventId;
      if (category) conditions.category = category;

      let registrations;
      let total;

      if (search) {
        const searchCondition = `first_name LIKE '%${search}%' OR last_name LIKE '%${search}%' OR email LIKE '%${search}%' OR organization LIKE '%${search}%'`;
        let whereClause = searchCondition;
        
        if (Object.keys(conditions).length > 0) {
          const conditionClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
          whereClause = `${conditionClause} AND ${searchCondition}`;
        }

        registrations = await this.db.query(
          `SELECT * FROM registrations WHERE ${whereClause} LIMIT ? OFFSET ?`,
          [...Object.values(conditions), Number(limit), offset]
        );
        
        total = await this.db.query(
          `SELECT COUNT(*) as count FROM registrations WHERE ${whereClause}`,
          Object.values(conditions)
        );
      } else {
        registrations = await this.db.findAll('registrations', conditions, Number(limit), offset);
        total = await this.db.count('registrations', conditions);
      }

      const response: ApiResponse = {
        success: true,
        data: registrations.map((row: any) => Registration.fromDatabase(row).toJSON()),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: Array.isArray(total) ? total[0].count : total,
          totalPages: Math.ceil((Array.isArray(total) ? total[0].count : total) / Number(limit))
        }
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Error fetching registrations:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch registrations'
      };
      res.status(500).json(response);
    }
  }

  // Get registration by ID
  async getRegistrationById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const registration = await this.db.findById('registrations', Number(id));

      if (!registration) {
        const response: ApiResponse = {
          success: false,
          error: 'Registration not found'
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: Registration.fromDatabase(registration).toJSON()
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Error fetching registration:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch registration'
      };
      res.status(500).json(response);
    }
  }

  // Create new registration
  async createRegistration(req: Request, res: Response): Promise<void> {
    try {
      const registrationData: CreateRegistrationRequest = req.body;

      // Never trust client-provided waitlist fields. Compute server-side.
      (registrationData as any).wednesdayActivityWaitlisted = false;
      (registrationData as any).wednesdayActivityWaitlistedAt = undefined;
      
      // Check activity seat limit if specified
      if (registrationData.wednesdayActivity && registrationData.eventId) {
        const event = await this.db.findById('events', registrationData.eventId);
        if (event && event.activities) {
          const activities = typeof event.activities === 'string' 
            ? JSON.parse(event.activities) 
            : event.activities;
          
          if (Array.isArray(activities) && activities.length > 0 && typeof activities[0] === 'object') {
            const activity = (activities as Array<{ name: string; seatLimit?: number }>)
              .find(a => a.name === registrationData.wednesdayActivity);
            
            if (activity?.seatLimit !== undefined) {
              // Count existing CONFIRMED (non-waitlisted) ACTIVE registrations for this activity
              // Exclude cancelled registrations and waitlisted registrations
              const existingRegs = await this.db.query(
                `SELECT COUNT(*) as count FROM registrations 
                 WHERE event_id = ? 
                 AND wednesday_activity = ? 
                 AND (status IS NULL OR status != 'cancelled')
                 AND cancellation_at IS NULL
                 AND (wednesday_activity_waitlisted IS NULL OR wednesday_activity_waitlisted = 0)`,
                [registrationData.eventId, registrationData.wednesdayActivity]
              );
              
              const confirmedCount = Number(existingRegs[0]?.count || 0);
              
              // If seats are full, allow selection but mark the registration as waitlisted
              const willBeWaitlisted = confirmedCount >= activity.seatLimit;
              (registrationData as any).wednesdayActivityWaitlisted = willBeWaitlisted;
              (registrationData as any).wednesdayActivityWaitlistedAt = willBeWaitlisted ? new Date().toISOString() : undefined;
            }
          }
        }
      }
      
      // Clear activity-specific fields if activity doesn't match
      const activity = registrationData.wednesdayActivity || '';
      const isPickleball = activity.toLowerCase().includes('pickleball');
      if (!isPickleball) {
        (registrationData as any).pickleballEquipment = undefined;
      }
      
      const registration = new Registration(registrationData);
      // Compute total dynamically from event pricing
      try {
        const ev: any = await this.db.findById('events', registration.eventId);
        if (ev) {
          const parseJson = (v:any)=>{ try { return JSON.parse(v||'[]'); } catch { return []; } };
          const regTiers: any[] = parseJson(ev.registration_pricing);
          const spouseTiers: any[] = parseJson(ev.spouse_pricing);
          const breakfastPrice = Number(ev.breakfast_price ?? 0);
          // Use Eastern Time for breakfast end date
          const bEnd = ev.breakfast_end_date ? getEasternTimeEndOfDay(ev.breakfast_end_date) : Infinity;
          // Get current time in Eastern Time (Florida timezone)
          const now = getCurrentEasternTime();
          const pick = (tiers:any[])=>{
            // Convert tier dates to Eastern Time midnight/end-of-day
            const mapped = (tiers||[]).map(t=>({ 
              ...t, 
              s: t.startDate ? getEasternTimeMidnight(t.startDate) : -Infinity, 
              e: t.endDate ? getEasternTimeEndOfDay(t.endDate) : Infinity 
            }));
            // Find active tier: now >= startDate AND now < endDate (end date is exclusive - start of next day)
            // Example: Priority ends Dec 11, so endDate = Dec 12 00:00:00 (exclusive)
            // Any time on Dec 11 will be < Dec 12 00:00:00, so it matches
            return mapped.find((t:any)=> now>=t.s && now<t.e) || mapped[mapped.length-1] || null;
          };
          const base = pick(regTiers);
          const spouse = registration.spouseDinnerTicket ? pick(spouseTiers) : null;
          
          // Store pricing tier labels (for reporting/export) using the tier active at submission time
          (registration as any).registrationTierLabel = (base as any)?.label || (base as any)?.name || undefined;
          if (registration.spouseDinnerTicket) {
            (registration as any).spouseTierLabel = (spouse as any)?.label || (spouse as any)?.name || undefined;
            // For spouse, track when it was first added (on create it's the submission time)
            (registration as any).spouseAddedAt = (registration as any).spouseAddedAt || registration.createdAt;
          }
          let total = 0;
          if (base && typeof base.price==='number') total += base.price; else total += Number(ev.default_price || 0);
          if (spouse && typeof spouse.price==='number') total += spouse.price;
          if ((registration as any).spouseBreakfast && now <= bEnd) total += (isNaN(breakfastPrice)?0:breakfastPrice);
          
          // Calculate kids price
          const kidsTiers: any[] = parseJson(ev.kids_pricing);
          const kidsActive = pick(kidsTiers);
          if (registration.kids && registration.kids.length > 0) {
            (registration as any).kidsTierLabel = (kidsActive as any)?.label || (kidsActive as any)?.name || undefined;
            // For kids, track when they were first added (on create it's the submission time)
            (registration as any).kidsAddedAt = (registration as any).kidsAddedAt || registration.createdAt;
            const pricePerKid = kidsActive?.price ?? 0;
            total += pricePerKid * registration.kids.length;
          }
          
          registration.totalPrice = total || registration.totalPrice || 0;
          
          // Apply discount code if provided
          if (registration.discountCode) {
            try {
              const codeRows = await this.db.query(
                'SELECT * FROM discount_codes WHERE code = ? AND event_id = ?',
                [registration.discountCode.toUpperCase().trim(), registration.eventId]
              );
              
              if (codeRows.length > 0) {
                const { DiscountCode } = await import('../models/DiscountCode');
                const discountCode = DiscountCode.fromDatabase(codeRows[0]);
                const validation = discountCode.isValid();
                
                if (validation.valid) {
                  let discountAmount = 0;
                  if (discountCode.discountType === 'percentage') {
                    discountAmount = (registration.totalPrice * discountCode.discountValue) / 100;
                  } else {
                    discountAmount = discountCode.discountValue;
                  }
                  registration.discountAmount = discountAmount;
                  registration.totalPrice = Math.max(0, registration.totalPrice - discountAmount);
                  
                  // Increment used count
                  await this.db.query(
                    'UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?',
                    [discountCode.id]
                  );
                }
              }
            } catch (discountError: any) {
              console.error('Error applying discount code:', discountError);
              // Continue without discount if validation fails
            }
          }
          // If Admin overrides price, use that instead
          const auth = this.getAuth(req);
          const isAdmin = auth.role === 'admin';
          if (isAdmin && (registrationData as any).totalPrice !== undefined) {
             registration.totalPrice = Number((registrationData as any).totalPrice);
          }
        }
      } catch (e) {
        // fallback to existing total if compute fails
      }
      
      const dbPayload = registration.toDatabase();

      // If Admin creates an unpaid registration (e.g. Card payment, pay later), set pending amount
      const auth = this.getAuth(req);
      const isAdmin = auth.role === 'admin';
      
      if (isAdmin && (registration.paymentMethod === 'Card' || !registration.paid)) {
        // If not marked as paid, the entire amount is pending
        if (!registration.paid) {
          dbPayload.pending_payment_amount = dbPayload.total_price;
          dbPayload.pending_payment_reason = 'Admin created registration (Payment Due)';
          dbPayload.pending_payment_created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
      }

      const result = await this.db.insert('registrations', dbPayload);
      registration.id = result.insertId;

      // Fire-and-forget confirmation emails (primary, secondary if any, and admin copy)
      const adminCopy = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || 'planner@efbcconference.org';
      const toName = registration.badgeName || `${registration.firstName} ${registration.lastName}`.trim();
      const eventRow: any = await this.db.findById('events', registration.eventId);
      const evName = eventRow?.name;
      const evDate = eventRow?.date;
      const evStartDate = eventRow?.start_date;
      const payload = {
        name: toName,
        eventName: evName,
        eventDate: evDate,
        eventStartDate: evStartDate,
        totalPrice: registration.totalPrice,
        registration: registration.toJSON ? registration.toJSON() : registration
      } as any;
      // Send emails via queue (emails will be sent sequentially with automatic retries)
      // Primary email (this will also send admin copy via sendMailWithAdminCopy)
      sendRegistrationConfirmationEmail({ to: registration.email, ...payload }).catch((e) => 
        console.warn('⚠️ Failed to queue registration confirmation:', e)
      );
      
      // Send admin copy separately to ensure it's sent (only if not already sent via sendMailWithAdminCopy)
      if (adminCopy && adminCopy !== registration.email) {
        sendRegistrationConfirmationEmail({ to: adminCopy, ...payload }).catch((e) => 
          console.warn('⚠️ Failed to queue admin confirmation:', e)
        );
      }
      
      // Send to secondary email if provided (no admin copy to avoid duplicates)
      if ((registration as any).secondaryEmail && (registration as any).secondaryEmail !== registration.email && (registration as any).secondaryEmail !== adminCopy) {
        sendRegistrationConfirmationEmail({ to: (registration as any).secondaryEmail, ...payload }).catch((e) => 
          console.warn('⚠️ Failed to queue secondary confirmation:', e)
        );
      }

      const response: ApiResponse = {
        success: true,
        data: registration.toJSON(),
        message: 'Registration created successfully'
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Error creating registration:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to create registration'
      };
      res.status(500).json(response);
    }
  }

  // Update registration
  async updateRegistration(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData: UpdateRegistrationRequest = req.body || {};

      // If the activity changes, we may need to recompute waitlist status.
      // Keep these values separate so users can't spoof them via payload.
      let computedActivityWaitlisted: boolean | undefined;
      let computedActivityWaitlistedAtDb: string | null | undefined;
      
      console.log(`[UPDATE] Received update request for registration ${id}`);
      console.log(`[UPDATE] Update data keys:`, Object.keys(updateData));
      console.log(`[UPDATE] Sample fields:`, {
        firstName: updateData.firstName,
        email: updateData.email,
        clubRentals: updateData.clubRentals,
        wednesdayActivity: updateData.wednesdayActivity
      });
      
      const existingRow = await this.db.findById('registrations', Number(id));
      if (!existingRow) {
        console.log(`[UPDATE] Registration ${id} not found in database`);
        const response: ApiResponse = {
          success: false,
          error: 'Registration not found'
        };
        res.status(404).json(response);
        return;
      }
      
      // If activity is being changed, check seat limit for the NEW activity
      if (updateData.wednesdayActivity && 
          updateData.wednesdayActivity !== existingRow.wednesday_activity) {
        
        // Default: if the new activity has no seat limit, it should not be waitlisted
        computedActivityWaitlisted = false;
        computedActivityWaitlistedAtDb = null;

        const event = await this.db.findById('events', existingRow.event_id);
        if (event && event.activities) {
          const activities = typeof event.activities === 'string' 
            ? JSON.parse(event.activities) 
            : event.activities;
          
          if (Array.isArray(activities) && activities.length > 0 && typeof activities[0] === 'object') {
            const activity = (activities as Array<{ name: string; seatLimit?: number }>)
              .find(a => a.name === updateData.wednesdayActivity);
            
            if (activity?.seatLimit !== undefined) {
              // Count existing CONFIRMED (non-waitlisted) ACTIVE registrations for the NEW activity
              // Exclude cancelled registrations and the current registration (since it's changing activities)
              const existingRegs = await this.db.query(
                `SELECT COUNT(*) as count FROM registrations 
                 WHERE event_id = ? 
                 AND wednesday_activity = ? 
                 AND (status IS NULL OR status != 'cancelled')
                 AND cancellation_at IS NULL
                 AND (wednesday_activity_waitlisted IS NULL OR wednesday_activity_waitlisted = 0)
                 AND id != ?`,
                [existingRow.event_id, updateData.wednesdayActivity, Number(id)]
              );
              
              const confirmedCount = Number(existingRegs[0]?.count || 0);
              const willBeWaitlisted = confirmedCount >= activity.seatLimit;

              computedActivityWaitlisted = willBeWaitlisted;
              computedActivityWaitlistedAtDb = willBeWaitlisted
                ? new Date().toISOString().slice(0, 19).replace('T', ' ')
                : null;
            }
          }
        }
      }

      console.log(`[UPDATE] Found existing registration ${id}`);
      
      // Map camelCase fields from updateData to snake_case database columns
      const fieldMapping: Record<string, string> = {
        userId: 'user_id',
        eventId: 'event_id',
        firstName: 'first_name',
        lastName: 'last_name',
        badgeName: 'badge_name',
        email: 'email',
        secondaryEmail: 'secondary_email',
        organization: 'organization',
        jobTitle: 'job_title',
        address: 'address',
        addressStreet: 'address_street',
        city: 'city',
        state: 'state',
        zipCode: 'zip_code',
        country: 'country',
        mobile: 'mobile',
        officePhone: 'office_phone',
        isFirstTimeAttending: 'is_first_time_attending',
        companyType: 'company_type',
        companyTypeOther: 'company_type_other',
        emergencyContactName: 'emergency_contact_name',
        emergencyContactPhone: 'emergency_contact_phone',
        wednesdayActivity: 'wednesday_activity',
        wednesdayReception: 'wednesday_reception',
        thursdayBreakfast: 'thursday_breakfast',
        thursdayLuncheon: 'thursday_luncheon',
        thursdayDinner: 'thursday_dinner',
        fridayBreakfast: 'friday_breakfast',
        dietaryRestrictions: 'dietary_restrictions',
        specialRequests: 'special_requests',
        clubRentals: 'club_rentals',
        golfHandicap: 'golf_handicap',
        massageTimeSlot: 'massage_time_slot',
        pickleballEquipment: 'pickleball_equipment',
        spouseDinnerTicket: 'spouse_dinner_ticket',
        spouseBreakfast: 'spouse_breakfast',
        tuesdayEarlyReception: 'tuesday_early_reception',
        spouseFirstName: 'spouse_first_name',
        spouseLastName: 'spouse_last_name',
        childFirstName: 'child_first_name',
        childLastName: 'child_last_name',
        childLunchTicket: 'child_lunch_ticket',
        totalPrice: 'total_price',
        paymentMethod: 'payment_method',
        paid: 'paid',
        squarePaymentId: 'square_payment_id',
        paidAt: 'paid_at',
        spousePaidAt: 'spouse_paid_at',
        discountCode: 'discount_code',
        discountAmount: 'discount_amount',
        kids: 'kids_data',
        kidsTotalPrice: 'kids_total_price',
      };
      
      // Build update payload by mapping fields and converting values
      const dbPayload: any = {
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };
      
      const updateDataObj = updateData as any || {};
      
      // Check if activity is being updated and determine if golf/massage/pickleball fields should be cleared
      const updatedActivity = updateDataObj.wednesdayActivity || existingRow.wednesday_activity || '';
      const isGolf = updatedActivity.toLowerCase().includes('golf');
      const isMassage = updatedActivity.toLowerCase().includes('massage');
      const isPickleball = updatedActivity.toLowerCase().includes('pickleball');
      
      for (const [camelKey, dbKey] of Object.entries(fieldMapping)) {
        if (camelKey in updateDataObj && camelKey !== 'id') {
          let value = updateDataObj[camelKey];
          
          // Clear golf-related fields if activity is not golf
          if ((camelKey === 'clubRentals' || camelKey === 'golfHandicap') && !isGolf) {
            value = null;
          }
          
          // Clear massage field if activity is not massage
          if (camelKey === 'massageTimeSlot' && !isMassage) {
            value = null;
          }
          
          // Clear pickleball field if activity is not pickleball
          if (camelKey === 'pickleballEquipment' && !isPickleball) {
            value = null;
          }
          
          // Handle special conversions
          if (camelKey === 'kids') {
            // Store kids array in JSON column
            if (Array.isArray(value) && value.length > 0) {
              value = JSON.stringify(value);
            } else {
              value = null;
            }
          } else if (camelKey === 'kidsTotalPrice') {
            value = value !== null && value !== undefined ? Number(value) : null;
          } else if (camelKey === 'spouseDinnerTicket') {
            value = value === true || value === 'Yes' || value === 'yes' || value === 1 ? 1 : 0;
          } else if (camelKey === 'isFirstTimeAttending' || camelKey === 'spouseBreakfast' || camelKey === 'paid') {
            value = value === true || value === 1 ? 1 : 0;
          } else if (camelKey === 'paidAt' || camelKey === 'spousePaidAt') {
            // Convert ISO date string to MySQL DATETIME format
            value = value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : null;
          } else if (value === null || value === undefined) {
            value = null;
          }
          
          dbPayload[dbKey] = value;
        }
      }

      // Pricing tier tracking for spouse/kids (do NOT rely on paid_at; use "first added" timestamps)
      try {
        const oldSpouseTicket = !!existingRow.spouse_dinner_ticket;
        const newSpouseTicketRaw = updateDataObj.spouseDinnerTicket;
        const newSpouseTicket = newSpouseTicketRaw !== undefined
          ? (newSpouseTicketRaw === true || newSpouseTicketRaw === 'Yes' || newSpouseTicketRaw === 'yes' || newSpouseTicketRaw === 1)
          : oldSpouseTicket;

        const oldKidsData = existingRow.kids_data ? JSON.parse(existingRow.kids_data) : [];
        const oldKidsCount = Array.isArray(oldKidsData) ? oldKidsData.length : 0;
        const newKids = updateDataObj.kids;
        const newKidsCount = Array.isArray(newKids) ? newKids.length : oldKidsCount;

        const shouldSetSpouseFirstAdded = !oldSpouseTicket && newSpouseTicket && !existingRow.spouse_added_at;
        const shouldSetKidsFirstAdded = oldKidsCount === 0 && newKidsCount > 0 && !existingRow.kids_added_at;

        if (shouldSetSpouseFirstAdded || shouldSetKidsFirstAdded) {
          const ev: any = await this.db.findById('events', existingRow.event_id);
          const parseJson = (v: any) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
          const now = getCurrentEasternTime();
          const pick = (tiers: any[]) => {
            const mapped = (tiers || []).map(t => ({
              ...t,
              s: t.startDate ? getEasternTimeMidnight(t.startDate) : -Infinity,
              e: t.endDate ? getEasternTimeEndOfDay(t.endDate) : Infinity
            }));
            return mapped.find((t: any) => now >= t.s && now < t.e) || mapped[mapped.length - 1] || null;
          };

          const nowDb = new Date().toISOString().slice(0, 19).replace('T', ' ');

          if (shouldSetSpouseFirstAdded) {
            const spouseTier = ev ? pick(parseJson(ev.spouse_pricing)) : null;
            dbPayload.spouse_added_at = nowDb;
            dbPayload.spouse_tier_label = (spouseTier as any)?.label || (spouseTier as any)?.name || null;
          }

          if (shouldSetKidsFirstAdded) {
            const kidsTier = ev ? pick(parseJson(ev.kids_pricing)) : null;
            dbPayload.kids_added_at = nowDb;
            dbPayload.kids_tier_label = (kidsTier as any)?.label || (kidsTier as any)?.name || null;
          }
        }
      } catch (e) {
        // Best-effort; don't fail the update if tier tracking can't be computed
      }

      // Apply computed waitlist status if activity changed.
      if (computedActivityWaitlisted !== undefined) {
        dbPayload.wednesday_activity_waitlisted = computedActivityWaitlisted ? 1 : 0;
        dbPayload.wednesday_activity_waitlisted_at = computedActivityWaitlisted ? computedActivityWaitlistedAtDb : null;
      }
      
      // Explicitly clear fields if activity changed and they're not applicable
      if (updateDataObj.wednesdayActivity !== undefined) {
        if (!isGolf) {
          dbPayload.club_rentals = null;
          dbPayload.golf_handicap = null;
        }
        if (!isMassage) {
          dbPayload.massage_time_slot = null;
        }
        if (!isPickleball) {
          dbPayload.pickleball_equipment = null;
        }
      }
      // Calculate pending payment if admin is updating price or adding spouse/children
      const auth = this.getAuth(req);
      const isAdminUpdate = auth.role === 'admin';
      
      if (isAdminUpdate) {
        // Get existing registration data
        const oldTotalPrice = Number(existingRow.total_price || 0);
        const oldPaidAmount = Number(existingRow.paid_amount || (existingRow.paid ? oldTotalPrice : 0));
        const oldSpouseTicket = existingRow.spouse_dinner_ticket || false;
        const oldKidsData = existingRow.kids_data ? JSON.parse(existingRow.kids_data) : [];
        const oldKidsCount = Array.isArray(oldKidsData) ? oldKidsData.length : 0;
        
        // Calculate new total price and pending amount
        let newTotalPrice = oldTotalPrice;
        let pendingAmount = 0;
        const reasonParts: string[] = [];
        const adminReason = (updateData as any).pendingPaymentReason || '';
        
        // Check if price was manually overridden
        if ((updateData as any).totalPrice !== undefined && (updateData as any).totalPrice !== oldTotalPrice) {
          const priceDiff = Number((updateData as any).totalPrice) - oldTotalPrice;
          if (priceDiff > 0) {
            pendingAmount += priceDiff;
            reasonParts.push(`Price increased by admin from $${oldTotalPrice.toFixed(2)} to $${Number((updateData as any).totalPrice).toFixed(2)}`);
            newTotalPrice = Number((updateData as any).totalPrice);
          } else if (priceDiff < 0) {
            // Price decreased - refund scenario (not handled in this flow)
            newTotalPrice = Number((updateData as any).totalPrice);
          }
        } else {
          // Calculate price from event pricing if not manually overridden
          try {
            const ev: any = await this.db.findById('events', existingRow.event_id);
            if (ev) {
              const parseJson = (v: any) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
              const regTiers: any[] = parseJson(ev.registration_pricing);
              const spouseTiers: any[] = parseJson(ev.spouse_pricing);
              const kidsTiers: any[] = parseJson(ev.kids_pricing);
              const breakfastPrice = Number(ev.breakfast_price ?? 0);
              const bEnd = ev.breakfast_end_date ? getEasternTimeEndOfDay(ev.breakfast_end_date) : Infinity;
              const now = getCurrentEasternTime();
              
              const pick = (tiers: any[]) => {
                const mapped = (tiers || []).map(t => ({
                  ...t,
                  s: t.startDate ? getEasternTimeMidnight(t.startDate) : -Infinity,
                  e: t.endDate ? getEasternTimeEndOfDay(t.endDate) : Infinity
                }));
                return mapped.find((t: any) => now >= t.s && now < t.e) || mapped[mapped.length - 1] || null;
              };
              
              // Calculate base price
              const base = pick(regTiers);
              let calculatedTotal = 0;
              if (base && typeof base.price === 'number') {
                calculatedTotal += base.price;
              } else {
                calculatedTotal += Number(ev.default_price || 0);
              }
              
              // Check if spouse was added
              const newSpouseTicket = (updateData as any).spouseDinnerTicket || false;
              if (newSpouseTicket && !oldSpouseTicket) {
                const spouse = pick(spouseTiers);
                const spousePrice = spouse && typeof spouse.price === 'number' ? spouse.price : 200; // Default
                calculatedTotal += spousePrice;
                pendingAmount += spousePrice;
                reasonParts.push(`Spouse dinner ticket added ($${spousePrice.toFixed(2)})`);
              } else if (newSpouseTicket && oldSpouseTicket) {
                // Spouse already exists, recalculate price
                const spouse = pick(spouseTiers);
                const spousePrice = spouse && typeof spouse.price === 'number' ? spouse.price : 200;
                calculatedTotal += spousePrice;
              }
              
              // Check if spouse breakfast was added
              if ((updateData as any).spouseBreakfast && now <= bEnd) {
                calculatedTotal += (isNaN(breakfastPrice) ? 0 : breakfastPrice);
              }
              
              // Check if children were added
              const newKids = (updateData as any).kids || [];
              const newKidsCount = Array.isArray(newKids) ? newKids.length : 0;
              if (newKidsCount > oldKidsCount) {
                const addedKidsCount = newKidsCount - oldKidsCount;
                const kidsActive = pick(kidsTiers);
                const pricePerKid = kidsActive?.price ?? 50; // Default
                const kidsPrice = pricePerKid * addedKidsCount;
                calculatedTotal += kidsPrice;
                pendingAmount += kidsPrice;
                reasonParts.push(`${addedKidsCount} children added ($${kidsPrice.toFixed(2)})`);
              } else if (newKidsCount > 0) {
                // Children already exist, recalculate price
                const kidsActive = pick(kidsTiers);
                const pricePerKid = kidsActive?.price ?? 50;
                calculatedTotal += pricePerKid * newKidsCount;
              }
              
              // Apply discount if exists
              if (existingRow.discount_code) {
                try {
                  const codeRows = await this.db.query(
                    'SELECT * FROM discount_codes WHERE code = ? AND event_id = ?',
                    [existingRow.discount_code.toUpperCase().trim(), existingRow.event_id]
                  );
                  
                  if (codeRows.length > 0) {
                    const { DiscountCode } = await import('../models/DiscountCode');
                    const discountCode = DiscountCode.fromDatabase(codeRows[0]);
                    const validation = discountCode.isValid();
                    
                    if (validation.valid) {
                      let discountAmount = 0;
                      if (discountCode.discountType === 'percentage') {
                        discountAmount = (calculatedTotal * discountCode.discountValue) / 100;
                      } else {
                        discountAmount = discountCode.discountValue;
                      }
                      calculatedTotal = Math.max(0, calculatedTotal - discountAmount);
                    }
                  }
                } catch (discountError: any) {
                  console.error('Error applying discount code:', discountError);
                }
              }
              
              // Only update if calculated total is different and not manually overridden
              if ((updateData as any).totalPrice === undefined && Math.abs(calculatedTotal - oldTotalPrice) > 0.01) {
                const priceDiff = calculatedTotal - oldTotalPrice;
                if (priceDiff > 0) {
                  pendingAmount += priceDiff;
                  reasonParts.push(`Price recalculated from $${oldTotalPrice.toFixed(2)} to $${calculatedTotal.toFixed(2)}`);
                }
                newTotalPrice = calculatedTotal;
              }
            }
          } catch (e) {
            console.error('Error calculating pending payment:', e);
          }
        }
        
        // Build final reason
        let finalReason = reasonParts.join('. ');
        if (adminReason) {
          finalReason += (finalReason ? '. ' : '') + adminReason;
        }
        
        // Update database payload if pending amount exists
        if (pendingAmount > 0) {
          dbPayload.total_price = newTotalPrice;
          dbPayload.paid_amount = oldPaidAmount; // Keep existing paid amount
          dbPayload.pending_payment_amount = pendingAmount;
          dbPayload.pending_payment_reason = finalReason;
          dbPayload.pending_payment_created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
          dbPayload.paid = 0; // Mark as unpaid since balance exists
          
          // Store original price if not already stored
          if (!existingRow.original_total_price) {
            dbPayload.original_total_price = oldTotalPrice;
          }
        } else if (pendingAmount === 0 && existingRow.pending_payment_amount) {
          // Clear pending payment if amount is now 0
          dbPayload.pending_payment_amount = 0;
          dbPayload.pending_payment_reason = null;
          dbPayload.pending_payment_created_at = null;
        }

        // If admin manually marks as paid, update paid_amount to match total_price
        if ((updateData as any).paid === true || (updateData as any).paid === 1) {
          dbPayload.paid = 1;
          dbPayload.paid_amount = newTotalPrice;
          dbPayload.pending_payment_amount = 0;
          dbPayload.pending_payment_reason = null;
          dbPayload.pending_payment_created_at = null;
          // Set paid_at if not set
          if (!existingRow.paid_at || existingRow.paid_at === '0000-00-00 00:00:00') {
            dbPayload.paid_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
          }
        }
      }
      
      // If a non-admin user just completed a pending payment,
      // move the pending amount into paid_amount and clear pending fields
      const isPaidUpdate = updateDataObj.paid === true || updateDataObj.paid === 1 || (updateDataObj as any).paid === 'true';
      if (!isAdminUpdate && isPaidUpdate && existingRow.pending_payment_amount && Number(existingRow.pending_payment_amount) > 0) {
        const totalPrice = Number(existingRow.total_price || 0);
        const previousPaidAmount = Number(existingRow.paid_amount || 0);
        const pending = Number(existingRow.pending_payment_amount || 0);
        const newPaidAmount = previousPaidAmount + pending;

        // Preserve the existing total_price (don't let frontend overwrite it with pending amount)
        // Remove total_price from dbPayload if it was set, to preserve the correct full amount
        if (dbPayload.total_price !== undefined) {
          delete dbPayload.total_price;
        }

        // Update paid_amount
        dbPayload.paid_amount = newPaidAmount;

        // Clear pending payment fields
        dbPayload.pending_payment_amount = 0;
        dbPayload.pending_payment_reason = null;
        dbPayload.pending_payment_created_at = null;

        // If now fully paid, ensure paid flag and paid_at are set
        if (newPaidAmount >= totalPrice) {
          dbPayload.paid = 1;
          // Only set paid_at if not already set
          if (!existingRow.paid_at || existingRow.paid_at === '0000-00-00 00:00:00') {
            dbPayload.paid_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
          }
        }
      }
      
      console.log(`[UPDATE] Database payload keys:`, Object.keys(dbPayload));
      console.log(`[UPDATE] Sample DB fields:`, {
        first_name: dbPayload.first_name,
        email: dbPayload.email,
        club_rentals: dbPayload.club_rentals,
        wednesday_activity: dbPayload.wednesday_activity,
        pending_payment_amount: dbPayload.pending_payment_amount
      });
      
      const updateResult = await this.db.update('registrations', Number(id), dbPayload);
      console.log(`[UPDATE] Database update result:`, updateResult);
      
      // Verify the update by fetching the updated record
      const verifyRow = await this.db.findById('registrations', Number(id));
      console.log(`[UPDATE] Verification - Updated record:`, {
        first_name: verifyRow?.first_name,
        email: verifyRow?.email,
        club_rentals: verifyRow?.club_rentals,
        wednesday_activity: verifyRow?.wednesday_activity
      });

      // Convert the updated row back to Registration object for response
      const updatedRegistration = Registration.fromDatabase(verifyRow);

      // Check if the requester is an admin - only send emails if it's a user update, not an admin update
      // Admins can manually resend confirmation emails using the resend endpoint if needed
      // This allows admins to make corrections (spelling, punctuation, etc.) without automatically sending emails
      // Note: auth and isAdminUpdate are already declared above
      
      // Send pending payment email if admin created a pending payment
      // Skip email if payment method is Check (as admin usually handles checks manually)
      if (isAdminUpdate && verifyRow.pending_payment_amount && Number(verifyRow.pending_payment_amount) > 0 && updatedRegistration.paymentMethod !== 'Check') {
        try {
          const { sendPendingPaymentEmail } = await import('../services/emailService');
          const eventRow: any = await this.db.findById('events', updatedRegistration.eventId);
          const evName = eventRow?.name;
          const evDate = eventRow?.date;
          const evStartDate = eventRow?.start_date;
          const toName = updatedRegistration.badgeName || `${updatedRegistration.firstName} ${updatedRegistration.lastName}`.trim();
          
          await sendPendingPaymentEmail({
            to: updatedRegistration.email,
            name: toName,
            eventName: evName,
            eventDate: evDate,
            eventStartDate: evStartDate,
            pendingAmount: Number(verifyRow.pending_payment_amount),
            reason: verifyRow.pending_payment_reason || '',
            registration: updatedRegistration.toJSON ? updatedRegistration.toJSON() : updatedRegistration
          });
        } catch (emailError: any) {
          console.error('Error sending pending payment email:', emailError?.message || emailError);
        }
      }

      // Only send update emails if the update is from a user (not an admin)
      if (!isAdminUpdate) {
        try {
          const adminCopy = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || 'planner@efbcconference.org';
          const eventRow: any = await this.db.findById('events', updatedRegistration.eventId);
          const evName = eventRow?.name;
          const evDate = eventRow?.date;
          const evStartDate = eventRow?.start_date;
          const toName = updatedRegistration.badgeName || `${updatedRegistration.firstName} ${updatedRegistration.lastName}`.trim();
          const payload = {
            name: toName,
            eventName: evName,
            eventDate: evDate,
            eventStartDate: evStartDate,
            totalPrice: updatedRegistration.totalPrice,
            registration: updatedRegistration.toJSON ? updatedRegistration.toJSON() : updatedRegistration
          } as any;

          // Send update emails via queue (emails will be sent sequentially with automatic retries)
          // Primary email (to user)
          sendRegistrationUpdateEmail({ to: updatedRegistration.email, ...payload }).catch((e) => 
            console.warn('Failed to queue registration update email:', e)
          );

          // Admin copy (send separately to ensure it's sent)
          if (adminCopy && adminCopy !== updatedRegistration.email) {
            sendRegistrationUpdateEmail({ to: adminCopy, ...payload }).catch((e) => 
              console.warn('Failed to queue admin update email:', e)
            );
          }

          // Secondary email if provided (no admin copy to avoid duplicates)
          if ((updatedRegistration as any).secondaryEmail && (updatedRegistration as any).secondaryEmail !== updatedRegistration.email && (updatedRegistration as any).secondaryEmail !== adminCopy) {
            sendRegistrationUpdateEmail({ to: (updatedRegistration as any).secondaryEmail, ...payload }).catch((e) => 
              console.warn('Failed to queue secondary update email:', e)
            );
          }
        } catch (emailError) {
          // Don't fail the update if email sending fails
          console.warn('Failed to send update email after registration update:', (emailError as any)?.message || emailError);
        }
      }

      const response: ApiResponse = {
        success: true,
        data: updatedRegistration.toJSON(),
        message: 'Registration updated successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Error updating registration:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to update registration'
      };
      res.status(500).json(response);
    }
  }

  // Delete registration
  async deleteRegistration(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const existingRegistration = await this.db.findById('registrations', Number(id));
      if (!existingRegistration) {
        const response: ApiResponse = {
          success: false,
          error: 'Registration not found'
        };
        res.status(404).json(response);
        return;
      }

      await this.db.delete('registrations', Number(id));

      const response: ApiResponse = {
        success: true,
        message: 'Registration deleted successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Error deleting registration:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to delete registration'
      };
      res.status(500).json(response);
    }
  }

  // Bulk delete registrations
  async bulkDeleteRegistrations(req: Request, res: Response): Promise<void> {
    try {
      const { ids } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid registration IDs provided'
        };
        res.status(400).json(response);
        return;
      }

      const placeholders = ids.map(() => '?').join(',');
      await this.db.query(`DELETE FROM registrations WHERE id IN (${placeholders})`, ids);

      const response: ApiResponse = {
        success: true,
        message: `${ids.length} registrations deleted successfully`
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Error bulk deleting registrations:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to delete registrations'
      };
      res.status(500).json(response);
    }
  }

  // Resend registration confirmation email
  async resendConfirmationEmail(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const registrationId = Number(id);

      if (isNaN(registrationId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid registration ID'
        };
        res.status(400).json(response);
        return;
      }

      // Fetch registration
      const registrationRow = await this.db.findById('registrations', registrationId);
      if (!registrationRow) {
        const response: ApiResponse = {
          success: false,
          error: 'Registration not found'
        };
        res.status(404).json(response);
        return;
      }

      // Convert to Registration model
      const registration = Registration.fromDatabase(registrationRow);

      // Fetch event details
      const eventRow: any = await this.db.findById('events', registration.eventId);
      if (!eventRow) {
        const response: ApiResponse = {
          success: false,
          error: 'Event not found'
        };
        res.status(404).json(response);
        return;
      }

      // Prepare email payload
      const toName = registration.badgeName || `${registration.firstName} ${registration.lastName}`.trim();
      const evName = eventRow?.name;
      const evDate = eventRow?.date;
      const evStartDate = eventRow?.start_date;
      const payload = {
        name: toName,
        eventName: evName,
        eventDate: evDate,
        eventStartDate: evStartDate,
        totalPrice: registration.totalPrice,
        registration: registration.toJSON ? registration.toJSON() : registration
      } as any;

      // Send emails via queue - only to user (primary and secondary), NOT to admin
      // Primary email (to user)
      sendRegistrationConfirmationEmail({ to: registration.email, ...payload }).catch((e) => 
        console.warn('⚠️ Failed to queue registration confirmation (resend):', e)
      );

      // Secondary email if provided (only to user's secondary email)
      if ((registration as any).secondaryEmail && (registration as any).secondaryEmail !== registration.email) {
        sendRegistrationConfirmationEmail({ to: (registration as any).secondaryEmail, ...payload }).catch((e) => 
          console.warn('⚠️ Failed to queue secondary confirmation (resend):', e)
        );
      }

      const response: ApiResponse = {
        success: true,
        message: 'Confirmation email(s) sent successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Error resending confirmation email:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to resend confirmation email'
      };
      res.status(500).json(response);
    }
  }

  // Admin action: promote a waitlisted registration to confirmed (if seats are available)
  async promoteWaitlistedRegistration(req: Request, res: Response): Promise<void> {
    try {
      const auth = this.getAuth(req);
      if (auth.role !== 'admin') {
        res.status(403).json({ success: false, error: 'Forbidden' } satisfies ApiResponse);
        return;
      }

      const registrationId = Number(req.params.id);
      if (!registrationId || isNaN(registrationId)) {
        res.status(400).json({ success: false, error: 'Invalid registration ID' } satisfies ApiResponse);
        return;
      }

      const row: any = await this.db.findById('registrations', registrationId);
      if (!row) {
        res.status(404).json({ success: false, error: 'Registration not found' } satisfies ApiResponse);
        return;
      }

      // Don't promote cancelled registrations
      if (row.status === 'cancelled' || row.cancellation_at) {
        res.status(400).json({ success: false, error: 'Cannot promote a cancelled registration' } satisfies ApiResponse);
        return;
      }

      const activityName = String(row.wednesday_activity || '').trim();
      if (!activityName) {
        res.status(400).json({ success: false, error: 'Registration has no selected activity' } satisfies ApiResponse);
        return;
      }

      const isWaitlisted = row.wednesday_activity_waitlisted === 1 || row.wednesday_activity_waitlisted === true;
      if (!isWaitlisted) {
        res.status(400).json({ success: false, error: 'Registration is not waitlisted for this activity' } satisfies ApiResponse);
        return;
      }

      // Load seat limit from event (if any)
      const event: any = await this.db.findById('events', Number(row.event_id));
      if (event && event.activities) {
        const activities = typeof event.activities === 'string' ? JSON.parse(event.activities) : event.activities;
        if (Array.isArray(activities) && activities.length > 0 && typeof activities[0] === 'object') {
          const activity = (activities as Array<{ name: string; seatLimit?: number }>).find(a => a.name === activityName);
          if (activity?.seatLimit !== undefined) {
            // Count current CONFIRMED (non-waitlisted) active registrations for this activity
            const existingRegs = await this.db.query(
              `SELECT COUNT(*) as count FROM registrations
               WHERE event_id = ?
               AND wednesday_activity = ?
               AND (status IS NULL OR status != 'cancelled')
               AND cancellation_at IS NULL
               AND (wednesday_activity_waitlisted IS NULL OR wednesday_activity_waitlisted = 0)`,
              [row.event_id, activityName]
            );
            const confirmedCount = Number(existingRegs[0]?.count || 0);
            if (confirmedCount >= activity.seatLimit) {
              res.status(400).json({
                success: false,
                error: `No seats available for ${activityName} (${activity.seatLimit} seats).`
              } satisfies ApiResponse);
              return;
            }
          }
        }
      }

      const nowDb = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await this.db.update('registrations', registrationId, {
        wednesday_activity_waitlisted: 0,
        wednesday_activity_waitlisted_at: null,
        updated_at: nowDb,
      } as any);

      const updatedRow = await this.db.findById('registrations', registrationId);
      const updated = Registration.fromDatabase(updatedRow);

      res.status(200).json({
        success: true,
        data: updated.toJSON(),
        message: 'Promoted from waitlist'
      } satisfies ApiResponse);
    } catch (error) {
      console.error('Error promoting waitlisted registration:', error);
      res.status(500).json({ success: false, error: 'Failed to promote from waitlist' } satisfies ApiResponse);
    }
  }
}
