import { Request, Response } from 'express';
import { Registration } from '../models/Registration';
import { Group } from '../models/Group';
import { ApiResponse, CreateRegistrationRequest, UpdateRegistrationRequest, RegistrationQuery } from '../types';
import { DatabaseService } from '../services/databaseService';
import { sendRegistrationConfirmationEmail, sendRegistrationUpdateEmail } from '../services/emailService';
import jwt from 'jsonwebtoken';

import {
  getEasternTimeEndOfDay,
  parsePricingTierArray,
  pickActivePricingTier,
  fallbackRegistrationBasePrice,
} from '../utils/pricingTierUtils';

/** Whether an activity_groups.category matches the registration's wednesday_activity (tab / roster labels). */
function groupCategoryMatchesWednesdayActivity(groupCategory: string, wednesdayActivity: string): boolean {
  const c = String(groupCategory || '').trim().toLowerCase();
  const w = String(wednesdayActivity || '').trim().toLowerCase();
  if (!w || w === 'none') return false;
  if (c === w) return true;
  const firstToken = w.split(/\s+/)[0] || w;
  return w.includes(c) || c.includes(w) || c.includes(firstToken) || firstToken.includes(c);
}

async function removeRegistrantFromStaleActivityGroups(
  db: DatabaseService,
  eventId: number,
  registrationId: number,
  newWednesdayActivity: string
): Promise<void> {
  const rows: any[] = await db.query('SELECT * FROM `activity_groups` WHERE eventId = ?', [eventId]);
  for (const row of rows) {
    let memberIds: number[] = [];
    try {
      memberIds = row.members ? (typeof row.members === 'string' ? JSON.parse(row.members) : row.members) : [];
      if (!Array.isArray(memberIds)) memberIds = [];
    } catch {
      memberIds = [];
    }
    if (!memberIds.includes(registrationId)) continue;
    if (groupCategoryMatchesWednesdayActivity(String(row.category || ''), newWednesdayActivity)) continue;

    const groupModel = Group.fromDatabase(row);
    groupModel.removeMember(registrationId);
    await db.update('activity_groups', Number(row.id), groupModel.toDatabase());
  }
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
        const searchCondition = `(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR organization LIKE ?)`;
        const searchValue = `%${search}%`;
        let whereClause = searchCondition;
        const searchParams = [searchValue, searchValue, searchValue, searchValue];
        
        if (Object.keys(conditions).length > 0) {
          const conditionClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
          whereClause = `${conditionClause} AND ${searchCondition}`;
        }

        registrations = await this.db.query(
          `SELECT * FROM registrations WHERE ${whereClause} LIMIT ? OFFSET ?`,
          [...Object.values(conditions), ...searchParams, Number(limit), offset]
        );
        
        total = await this.db.query(
          `SELECT COUNT(*) as count FROM registrations WHERE ${whereClause}`,
          [...Object.values(conditions), ...searchParams]
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

  /** Active registrations for the authenticated user (for pairing requests, dashboard, etc.) */
  async getMyRegistrations(req: Request, res: Response): Promise<void> {
    try {
      const auth = this.getAuth(req);
      const uid = auth.id != null ? Number(auth.id) : NaN;
      if (!auth.id || Number.isNaN(uid)) {
        res.status(401).json({ success: false, error: 'Unauthorized' } satisfies ApiResponse);
        return;
      }
      const limit = Math.min(Math.max(Number((req.query as any).limit) || 50, 1), 200);
      // mysql2 prepared statements with LIMIT ? raise ER_WRONG_ARGUMENTS on many MySQL builds; inline a clamped int.
      const rows = await this.db.query(
        `SELECT * FROM registrations
         WHERE user_id = ?
           AND (status IS NULL OR status != 'cancelled')
           AND cancellation_at IS NULL
         ORDER BY updated_at DESC
         LIMIT ${limit}`,
        [uid]
      );
      const data: any[] = [];
      for (const row of rows as any[]) {
        try {
          data.push(Registration.fromDatabase(row).toJSON());
        } catch (rowErr) {
          console.error('getMyRegistrations: skipping registration row', row?.id, rowErr);
        }
      }
      res.status(200).json({ success: true, data } satisfies ApiResponse);
    } catch (error) {
      console.error('Error fetching my registrations:', error);
      res.status(500).json({ success: false, error: 'Failed to load your registrations' } satisfies ApiResponse);
    }
  }

  /**
   * Aggregate confirmed / waitlisted counts per Wednesday activity for an event.
   * Used by the registration UI so seat availability is accurate without exposing all registrations.
   */
  async getActivitySeatSummaryForEvent(req: Request, res: Response): Promise<void> {
    try {
      const auth = this.getAuth(req);
      const uid = auth.id != null ? Number(auth.id) : NaN;
      if (!auth.id || Number.isNaN(uid)) {
        res.status(401).json({ success: false, error: 'Unauthorized' } satisfies ApiResponse);
        return;
      }

      const eventId = Number(req.params.eventId);
      if (!eventId || Number.isNaN(eventId)) {
        res.status(400).json({ success: false, error: 'Invalid event ID' } satisfies ApiResponse);
        return;
      }

      const rows = await this.db.query(
        `SELECT
          wednesday_activity AS activityName,
          SUM(CASE WHEN COALESCE(wednesday_activity_waitlisted, 0) = 0 THEN 1 ELSE 0 END) AS confirmedCount,
          SUM(CASE WHEN COALESCE(wednesday_activity_waitlisted, 0) != 0 THEN 1 ELSE 0 END) AS waitlistedCount
        FROM registrations
        WHERE event_id = ?
          AND (status IS NULL OR status != 'cancelled')
          AND cancellation_at IS NULL
        GROUP BY wednesday_activity`,
        [eventId]
      );

      const activities = (rows as any[]).map((r) => ({
        activityName: String(r.activityName ?? ''),
        confirmedCount: Number(r.confirmedCount ?? 0),
        waitlistedCount: Number(r.waitlistedCount ?? 0),
      }));

      const response: ApiResponse<{ eventId: number; activities: typeof activities }> = {
        success: true,
        data: { eventId, activities },
      };
      res.status(200).json(response);
    } catch (error) {
      console.error('Error fetching activity seat summary:', error);
      res.status(500).json({ success: false, error: 'Failed to load activity seat summary' } satisfies ApiResponse);
    }
  }

  // Get registration by ID (admin: any; authenticated user: own registration only)
  async getRegistrationById(req: Request, res: Response): Promise<void> {
    try {
      const auth = this.getAuth(req);
      if (auth.id == null || Number.isNaN(Number(auth.id))) {
        res.status(401).json({ success: false, error: 'Authentication required' } satisfies ApiResponse);
        return;
      }

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

      const ownerId = Number((registration as any).user_id ?? (registration as any).userId ?? NaN);
      const requesterId = Number(auth.id);
      const isAdmin = auth.role === 'admin';
      const isOwner = !Number.isNaN(ownerId) && ownerId === requesterId;

      if (!isAdmin && !isOwner) {
        res.status(403).json({ success: false, error: 'Forbidden' } satisfies ApiResponse);
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
          const regTiers = parsePricingTierArray(ev.registration_pricing);
          const spouseTiers = parsePricingTierArray(ev.spouse_pricing);
          const breakfastPrice = Number(ev.breakfast_price ?? 0);
          // Use Eastern Time for breakfast end date
          const bEnd = ev.breakfast_end_date ? getEasternTimeEndOfDay(ev.breakfast_end_date) : Infinity;
          const now = Date.now();
          const base = pickActivePricingTier(regTiers, now);
          const spouse = registration.spouseDinnerTicket ? pickActivePricingTier(spouseTiers, now) : null;
          
          // Store pricing tier labels (for reporting/export) using the tier active at submission time
          (registration as any).registrationTierLabel = (base as any)?.label || (base as any)?.name || undefined;
          if (registration.spouseDinnerTicket) {
            (registration as any).spouseTierLabel = (spouse as any)?.label || (spouse as any)?.name || undefined;
            // For spouse, track when it was first added (on create it's the submission time)
            (registration as any).spouseAddedAt = (registration as any).spouseAddedAt || registration.createdAt;
          }
          let total = 0;
          if (base && typeof base.price==='number') total += base.price; else total += fallbackRegistrationBasePrice(ev, regTiers);
          if (spouse && typeof spouse.price==='number') total += spouse.price;
          if ((registration as any).spouseBreakfast && now <= bEnd) total += (isNaN(breakfastPrice)?0:breakfastPrice);
          
          // Calculate kids price
          const kidsTiers = parsePricingTierArray(ev.kids_pricing);
          const kidsActive = pickActivePricingTier(kidsTiers, now);
          if (registration.kids && registration.kids.length > 0) {
            (registration as any).kidsTierLabel = (kidsActive as any)?.label || (kidsActive as any)?.name || undefined;
            // For kids, track when they were first added (on create it's the submission time)
            (registration as any).kidsAddedAt = (registration as any).kidsAddedAt || registration.createdAt;
            const pricePerKid = kidsActive?.price ?? 0;
            total += pricePerKid * registration.kids.length;
          }
          
          // Prefer server-calculated package total so client-sent totalPrice cannot skew stored totals
          registration.totalPrice = total;
          
          // Apply discount code ONLY if the client did not already apply it
          // (Card payment flows send discountAmount pre-calculated, so we shouldn't re-apply)
          const hasClientDiscount =
            typeof registration.discountAmount === 'number' &&
            !isNaN(registration.discountAmount) &&
            registration.discountAmount > 0;

          if (registration.discountCode && !hasClientDiscount) {
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
          } else if (registration.discountCode && hasClientDiscount) {
            // Client already applied discount - just increment usage count (don't re-apply)
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
                  // Increment used count (discount already applied by client)
                  await this.db.query(
                    'UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?',
                    [discountCode.id]
                  );
                }
              }
            } catch (discountError: any) {
              console.error('Error incrementing discount code usage:', discountError);
              // Continue even if usage count increment fails
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
      
      if (isAdmin && registration.paymentMethod !== 'Comp' && (registration.paymentMethod === 'Card' || !registration.paid)) {
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

      const authForActivity = this.getAuth(req);
      const isAdminForActivity = authForActivity.role === 'admin';

      if (!isAdminForActivity && authForActivity.id && Number(existingRow.user_id) !== Number(authForActivity.id)) {
        res.status(403).json({ success: false, error: 'You can only update your own registration' } satisfies ApiResponse);
        return;
      }
      const existingActivity = String(existingRow.wednesday_activity ?? '').trim();
      const incomingActivity = updateData.wednesdayActivity !== undefined
        ? String(updateData.wednesdayActivity ?? '').trim()
        : undefined;
      if (
        incomingActivity !== undefined &&
        incomingActivity !== existingActivity &&
        !isAdminForActivity
      ) {
        res.status(403).json({
          success: false,
          error: 'Only administrators can change the Wednesday activity after registration.',
        });
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
        paidAmount: 'paid_amount',
        paymentMethod: 'payment_method',
        paid: 'paid',
        squarePaymentId: 'square_payment_id',
        paidAt: 'paid_at',
        spousePaymentId: 'spouse_payment_id',
        spousePaidAt: 'spouse_paid_at',
        kidsPaymentId: 'kids_payment_id',
        kidsPaidAt: 'kids_paid_at',
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
      
      const auth = this.getAuth(req);
      const isAdminUpdate = auth.role === 'admin';

      const adminSkipFields = isAdminUpdate
        ? ['totalPrice', 'paidAmount', 'pendingPaymentAmount', 'paid']
        : [];

      for (const [camelKey, dbKey] of Object.entries(fieldMapping)) {
        if (camelKey in updateDataObj && camelKey !== 'id') {
          if (adminSkipFields.includes(camelKey)) continue;
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
            if (Array.isArray(value) && value.length > 0) {
              value = JSON.stringify(value);
            } else if (existingRow && existingRow.kids_data) {
              // Don't wipe existing kids when an empty array is sent
              // (e.g. admin editing spouse without touching kids section)
              continue;
            } else {
              value = null;
            }
          } else if (camelKey === 'kidsPaymentId') {
            if (Array.isArray(value)) {
              value = value.length > 0 ? JSON.stringify(value) : null;
            } else if (value !== null && value !== undefined && String(value).trim() !== '') {
              value = JSON.stringify([String(value).trim()]);
            } else {
              value = null;
            }
          } else if (camelKey === 'kidsTotalPrice') {
            value = value !== null && value !== undefined ? Number(value) : null;
          } else if (camelKey === 'paidAmount') {
            value = value !== null && value !== undefined ? Number(value) : null;
          } else if (camelKey === 'spouseDinnerTicket') {
            value = value === true || value === 'Yes' || value === 'yes' || value === 1 ? 1 : 0;
          } else if (camelKey === 'isFirstTimeAttending' || camelKey === 'spouseBreakfast' || camelKey === 'paid') {
            value = value === true || value === 1 ? 1 : 0;
          } else if (camelKey === 'paidAt' || camelKey === 'spousePaidAt' || camelKey === 'kidsPaidAt') {
            // Convert ISO date string to MySQL DATETIME format
            value = value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : null;
          } else if (value === null || value === undefined) {
            value = null;
          }
          
          dbPayload[dbKey] = value;
        }
      }

      // Cumulative update notes — append new note to existing notes
      if (updateDataObj.updateNotes && String(updateDataObj.updateNotes).trim()) {
        const newEntry = String(updateDataObj.updateNotes).trim();
        const existing = existingRow.update_notes ? String(existingRow.update_notes) : '';
        dbPayload.update_notes = existing ? `${newEntry}\n${existing}` : newEntry;
      }

      // Pricing tier tracking for spouse/kids (do NOT rely on paid_at; use "first added" timestamps)
      try {
        const oldSpouseTicket = !!existingRow.spouse_dinner_ticket;
        const newSpouseTicketRaw = updateDataObj.spouseDinnerTicket;
        const newSpouseTicket = newSpouseTicketRaw !== undefined
          ? (newSpouseTicketRaw === true || newSpouseTicketRaw === 'Yes' || newSpouseTicketRaw === 'yes' || newSpouseTicketRaw === 1)
          : oldSpouseTicket;

        const oldKidsData = existingRow.kids_data
          ? (typeof existingRow.kids_data === 'string' ? JSON.parse(existingRow.kids_data) : existingRow.kids_data)
          : [];
        const oldKidsCount = Array.isArray(oldKidsData) ? oldKidsData.length : 0;
        const newKids = updateDataObj.kids;
        const newKidsCount = Array.isArray(newKids) ? newKids.length : oldKidsCount;

        const shouldSetSpouseFirstAdded = !oldSpouseTicket && newSpouseTicket && !existingRow.spouse_added_at;
        const shouldSetKidsFirstAdded = oldKidsCount === 0 && newKidsCount > 0 && !existingRow.kids_added_at;

        if (shouldSetSpouseFirstAdded || shouldSetKidsFirstAdded) {
          const ev: any = await this.db.findById('events', existingRow.event_id);
          const parseJson = (v: any) => {
            if (!v) return [];
            if (Array.isArray(v)) return v;
            if (typeof v === 'object') return [v];
            try { return JSON.parse(v); } catch { return []; }
          };
          const now = Date.now();

          const nowDb = new Date().toISOString().slice(0, 19).replace('T', ' ');

          if (shouldSetSpouseFirstAdded) {
            const spouseTier = ev ? pickActivePricingTier(parseJson(ev.spouse_pricing), now) : null;
            dbPayload.spouse_added_at = nowDb;
            dbPayload.spouse_tier_label = (spouseTier as any)?.label || (spouseTier as any)?.name || null;
          }

          if (shouldSetKidsFirstAdded) {
            const kidsTier = ev ? pickActivePricingTier(parseJson(ev.kids_pricing), now) : null;
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
      if (isAdminUpdate) {
        // Get existing registration data
        const oldTotalPrice = Number(existingRow.total_price || 0);
        const oldPaidAmount = Number(existingRow.paid_amount || (existingRow.paid ? oldTotalPrice : 0));
        const oldSpouseTicket = existingRow.spouse_dinner_ticket || false;
        const oldKidsData = existingRow.kids_data
          ? (typeof existingRow.kids_data === 'string' ? JSON.parse(existingRow.kids_data) : existingRow.kids_data)
          : [];
        const oldKidsCount = Array.isArray(oldKidsData) ? oldKidsData.length : 0;
        
        // Calculate new total price and pending amount.
        // Always detect spouse/kids additions from event tier prices so
        // the pending amount is accurate regardless of what totalPrice
        // the frontend sends (which may include card-fee inflation).
        let newTotalPrice = oldTotalPrice;
        let pendingAmount = 0;
        const reasonParts: string[] = [];
        const adminReason = (updateData as any).pendingPaymentReason || '';

        // --- Detect spouse / kids additions using event tier prices ---
        try {
          const ev: any = await this.db.findById('events', existingRow.event_id);
          if (ev) {
            const parseJson = (v: any) => {
              if (!v) return [];
              if (Array.isArray(v)) return v;
              if (typeof v === 'object') return [v];
              try { return JSON.parse(v); } catch { return []; }
            };
            const spouseTiers: any[] = parseJson(ev.spouse_pricing);
            const kidsTiers: any[] = parseJson(ev.kids_pricing);
            const now = Date.now();

            // Spouse newly added
            const newSpouseTicket = (updateData as any).spouseDinnerTicket || false;
            if (newSpouseTicket && !oldSpouseTicket) {
              const spouse = pickActivePricingTier(spouseTiers, now);
              const spousePrice = spouse && typeof spouse.price === 'number' ? spouse.price : 200;
              pendingAmount += spousePrice;
              newTotalPrice += spousePrice;
              reasonParts.push(`Spouse dinner ticket added ($${spousePrice.toFixed(2)})`);
            }

            // Children newly added
            const newKids = (updateData as any).kids || [];
            const newKidsCount = Array.isArray(newKids) ? newKids.length : 0;
            const effectiveOldKidsCount = newKidsCount > 0 ? oldKidsCount : 0;
            if (newKidsCount > effectiveOldKidsCount) {
              const addedKidsCount = newKidsCount - effectiveOldKidsCount;
              const kidsActive = pickActivePricingTier(kidsTiers, now);
              const pricePerKid = kidsActive?.price ?? 50;
              const kidsPrice = pricePerKid * addedKidsCount;
              pendingAmount += kidsPrice;
              newTotalPrice += kidsPrice;
              reasonParts.push(`${addedKidsCount} children added ($${kidsPrice.toFixed(2)})`);
            }
          }
        } catch (e) {
          console.error('Error calculating spouse/kids pending from tiers:', e);
        }

        // --- Manual price override by admin (only when no spouse/kids were detected) ---
        if (pendingAmount === 0 && (updateData as any).pendingPaymentReason) {
          const incomingPrice = Number((updateData as any).totalPrice);
          if (Number.isFinite(incomingPrice) && incomingPrice > oldTotalPrice) {
            const priceDiff = incomingPrice - oldTotalPrice;
            pendingAmount += priceDiff;
            newTotalPrice = incomingPrice;
            reasonParts.push(`Price increased by admin from $${oldTotalPrice.toFixed(2)} to $${incomingPrice.toFixed(2)}`);
          } else if (Number.isFinite(incomingPrice) && incomingPrice < oldTotalPrice) {
            newTotalPrice = incomingPrice;
          }
        }
        
        // Build final reason
        let finalReason = reasonParts.join('. ');
        if (adminReason) {
          finalReason += (finalReason ? '. ' : '') + adminReason;
        }
        
        // Update database payload if pending amount exists.
        // Stack the new increment on top of any existing pending balance so
        // successive additions (e.g. kids batch 1 then batch 2) accumulate
        // correctly even when paid_amount includes card processing fees.
        const existingPending = Number(existingRow.pending_payment_amount || 0);
        const newPending = existingPending + pendingAmount;
        if (pendingAmount > 0) {
          dbPayload.total_price = newTotalPrice;
          dbPayload.paid_amount = oldPaidAmount;
          dbPayload.pending_payment_amount = newPending;
          dbPayload.pending_payment_reason = finalReason;
          dbPayload.pending_payment_created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
          dbPayload.paid = 0;
          
          if (!existingRow.original_total_price) {
            dbPayload.original_total_price = oldTotalPrice;
          }
        }
        // Do not clear pending_payment_amount when pendingAmount === 0 on this request.
        // Admin edits that don't add new charges (name fixes, toggling spouse off, etc.)
        // must leave any existing unpaid balance in the DB until payment completes or admin marks paid.

        // If admin manually marks as paid AND there is no new pending balance,
        // update paid_amount to match total_price.
        // Skip when pendingAmount > 0: the block above already set paid=0 and
        // created a pending payment — don't clobber it just because the frontend
        // forwarded the existing paid flag.
        if (pendingAmount <= 0 && ((updateData as any).paid === true || (updateData as any).paid === 1)) {
          dbPayload.paid = 1;
          dbPayload.paid_amount = newTotalPrice;
          dbPayload.pending_payment_amount = 0;
          dbPayload.pending_payment_reason = null;
          dbPayload.pending_payment_created_at = null;
          const paidAtStr = existingRow.paid_at ? String(existingRow.paid_at) : '';
          const isMissingPaidAt = !paidAtStr || paidAtStr.startsWith('0000-00-00');
          if (isMissingPaidAt) {
            dbPayload.paid_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
          }
        }
      }
      
      // If a non-admin user just completed a pending payment,
      // accumulate the charged amount into paid_amount and clear pending fields.
      // Always compute from DB values so the frontend cannot accidentally replace
      // the existing paid_amount.
      const isPaidUpdate = updateDataObj.paid === true || updateDataObj.paid === 1 || (updateDataObj as any).paid === 'true';
      if (!isAdminUpdate && isPaidUpdate && existingRow.pending_payment_amount && Number(existingRow.pending_payment_amount) > 0) {
        const totalPrice = Number(existingRow.total_price || 0);
        const previousPaidAmount = Number(existingRow.paid_amount || 0);
        const pending = Number(existingRow.pending_payment_amount || 0);

        // Use the client-sent paidAmount only as the *increment* (amount just charged).
        // If the client already accumulated (old + charged), take the larger of
        // client value vs DB-computed value to avoid under-counting.
        const clientPaidAmount = Number(updateDataObj.paidAmount);
        const dbComputedPaidAmount = previousPaidAmount + pending;
        let newPaidAmount: number;
        if (Number.isFinite(clientPaidAmount) && clientPaidAmount > 0) {
          newPaidAmount = Math.max(clientPaidAmount, dbComputedPaidAmount);
        } else {
          newPaidAmount = dbComputedPaidAmount;
        }

        // Preserve the existing total_price (don't let frontend overwrite it with pending amount)
        if (dbPayload.total_price !== undefined) {
          delete dbPayload.total_price;
        }

        dbPayload.paid_amount = newPaidAmount;

        dbPayload.pending_payment_amount = 0;
        dbPayload.pending_payment_reason = null;
        dbPayload.pending_payment_created_at = null;

        if (newPaidAmount >= totalPrice) {
          dbPayload.paid = 1;
          const paidAtStr = existingRow.paid_at ? String(existingRow.paid_at) : '';
          const isMissingPaidAt = !paidAtStr || paidAtStr.startsWith('0000-00-00');
          if (isMissingPaidAt) {
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

      if (updateDataObj.wednesdayActivity !== undefined) {
        const oldWa = String(existingRow.wednesday_activity || '').trim();
        const newWa =
          dbPayload.wednesday_activity !== undefined
            ? String(dbPayload.wednesday_activity ?? '').trim()
            : oldWa;
        if (newWa !== oldWa) {
          await removeRegistrantFromStaleActivityGroups(
            this.db,
            Number(existingRow.event_id),
            Number(id),
            newWa
          );
          const ga = existingRow.group_assigned;
          if (ga) {
            const ag: any = await this.db.findById('activity_groups', Number(ga));
            if (!ag || !groupCategoryMatchesWednesdayActivity(String(ag.category || ''), newWa)) {
              dbPayload.group_assigned = null;
            }
          }
        }
      }

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
      if (isAdminUpdate && verifyRow.pending_payment_amount && Number(verifyRow.pending_payment_amount) > 0 && updatedRegistration.paymentMethod === 'Card') {
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
