"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistrationController = void 0;
const Registration_1 = require("../models/Registration");
const Group_1 = require("../models/Group");
const emailService_1 = require("../services/emailService");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const pricingTierUtils_1 = require("../utils/pricingTierUtils");
function groupCategoryMatchesWednesdayActivity(groupCategory, wednesdayActivity) {
    const c = String(groupCategory || '').trim().toLowerCase();
    const w = String(wednesdayActivity || '').trim().toLowerCase();
    if (!w || w === 'none')
        return false;
    if (c === w)
        return true;
    const firstToken = w.split(/\s+/)[0] || w;
    return w.includes(c) || c.includes(w) || c.includes(firstToken) || firstToken.includes(c);
}
async function removeRegistrantFromStaleActivityGroups(db, eventId, registrationId, newWednesdayActivity) {
    const rows = await db.query('SELECT * FROM `activity_groups` WHERE eventId = ?', [eventId]);
    for (const row of rows) {
        let memberIds = [];
        try {
            memberIds = row.members ? (typeof row.members === 'string' ? JSON.parse(row.members) : row.members) : [];
            if (!Array.isArray(memberIds))
                memberIds = [];
        }
        catch {
            memberIds = [];
        }
        if (!memberIds.includes(registrationId))
            continue;
        if (groupCategoryMatchesWednesdayActivity(String(row.category || ''), newWednesdayActivity))
            continue;
        const groupModel = Group_1.Group.fromDatabase(row);
        groupModel.removeMember(registrationId);
        await db.update('activity_groups', Number(row.id), groupModel.toDatabase());
    }
}
class RegistrationController {
    constructor(db) {
        this.db = db;
    }
    getAuth(req) {
        try {
            const hdr = (req.headers.authorization || '');
            const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
            if (!token)
                return {};
            const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
            const p = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            return { id: Number(p.sub), role: p.role };
        }
        catch {
            return {};
        }
    }
    async getRegistrations(req, res) {
        try {
            const { page = 1, limit = 10, eventId, category, search } = req.query;
            const offset = (Number(page) - 1) * Number(limit);
            let conditions = {};
            if (eventId)
                conditions.event_id = eventId;
            if (category)
                conditions.category = category;
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
                registrations = await this.db.query(`SELECT * FROM registrations WHERE ${whereClause} LIMIT ? OFFSET ?`, [...Object.values(conditions), ...searchParams, Number(limit), offset]);
                total = await this.db.query(`SELECT COUNT(*) as count FROM registrations WHERE ${whereClause}`, [...Object.values(conditions), ...searchParams]);
            }
            else {
                registrations = await this.db.findAll('registrations', conditions, Number(limit), offset);
                total = await this.db.count('registrations', conditions);
            }
            const response = {
                success: true,
                data: registrations.map((row) => Registration_1.Registration.fromDatabase(row).toJSON()),
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: Array.isArray(total) ? total[0].count : total,
                    totalPages: Math.ceil((Array.isArray(total) ? total[0].count : total) / Number(limit))
                }
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error fetching registrations:', error);
            const response = {
                success: false,
                error: 'Failed to fetch registrations'
            };
            res.status(500).json(response);
        }
    }
    async getMyRegistrations(req, res) {
        try {
            const auth = this.getAuth(req);
            const uid = auth.id != null ? Number(auth.id) : NaN;
            if (!auth.id || Number.isNaN(uid)) {
                res.status(401).json({ success: false, error: 'Unauthorized' });
                return;
            }
            const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
            const rows = await this.db.query(`SELECT * FROM registrations
         WHERE user_id = ?
           AND (status IS NULL OR status != 'cancelled')
           AND cancellation_at IS NULL
         ORDER BY updated_at DESC
         LIMIT ${limit}`, [uid]);
            const data = [];
            for (const row of rows) {
                try {
                    data.push(Registration_1.Registration.fromDatabase(row).toJSON());
                }
                catch (rowErr) {
                    console.error('getMyRegistrations: skipping registration row', row?.id, rowErr);
                }
            }
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            console.error('Error fetching my registrations:', error);
            res.status(500).json({ success: false, error: 'Failed to load your registrations' });
        }
    }
    async getActivitySeatSummaryForEvent(req, res) {
        try {
            const auth = this.getAuth(req);
            const uid = auth.id != null ? Number(auth.id) : NaN;
            if (!auth.id || Number.isNaN(uid)) {
                res.status(401).json({ success: false, error: 'Unauthorized' });
                return;
            }
            const eventId = Number(req.params.eventId);
            if (!eventId || Number.isNaN(eventId)) {
                res.status(400).json({ success: false, error: 'Invalid event ID' });
                return;
            }
            const rows = await this.db.query(`SELECT
          wednesday_activity AS activityName,
          SUM(CASE WHEN COALESCE(wednesday_activity_waitlisted, 0) = 0 THEN 1 ELSE 0 END) AS confirmedCount,
          SUM(CASE WHEN COALESCE(wednesday_activity_waitlisted, 0) != 0 THEN 1 ELSE 0 END) AS waitlistedCount
        FROM registrations
        WHERE event_id = ?
          AND (status IS NULL OR status != 'cancelled')
          AND cancellation_at IS NULL
        GROUP BY wednesday_activity`, [eventId]);
            const activities = rows.map((r) => ({
                activityName: String(r.activityName ?? ''),
                confirmedCount: Number(r.confirmedCount ?? 0),
                waitlistedCount: Number(r.waitlistedCount ?? 0),
            }));
            const response = {
                success: true,
                data: { eventId, activities },
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error fetching activity seat summary:', error);
            res.status(500).json({ success: false, error: 'Failed to load activity seat summary' });
        }
    }
    async getRegistrationById(req, res) {
        try {
            const auth = this.getAuth(req);
            if (auth.id == null || Number.isNaN(Number(auth.id))) {
                res.status(401).json({ success: false, error: 'Authentication required' });
                return;
            }
            const { id } = req.params;
            const registration = await this.db.findById('registrations', Number(id));
            if (!registration) {
                const response = {
                    success: false,
                    error: 'Registration not found'
                };
                res.status(404).json(response);
                return;
            }
            const ownerId = Number(registration.user_id ?? registration.userId ?? NaN);
            const requesterId = Number(auth.id);
            const isAdmin = auth.role === 'admin';
            const isOwner = !Number.isNaN(ownerId) && ownerId === requesterId;
            if (!isAdmin && !isOwner) {
                res.status(403).json({ success: false, error: 'Forbidden' });
                return;
            }
            const response = {
                success: true,
                data: Registration_1.Registration.fromDatabase(registration).toJSON()
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error fetching registration:', error);
            const response = {
                success: false,
                error: 'Failed to fetch registration'
            };
            res.status(500).json(response);
        }
    }
    async createRegistration(req, res) {
        try {
            const registrationData = req.body;
            registrationData.wednesdayActivityWaitlisted = false;
            registrationData.wednesdayActivityWaitlistedAt = undefined;
            if (registrationData.wednesdayActivity && registrationData.eventId) {
                const event = await this.db.findById('events', registrationData.eventId);
                if (event && event.activities) {
                    const activities = typeof event.activities === 'string'
                        ? JSON.parse(event.activities)
                        : event.activities;
                    if (Array.isArray(activities) && activities.length > 0 && typeof activities[0] === 'object') {
                        const activity = activities
                            .find(a => a.name === registrationData.wednesdayActivity);
                        if (activity?.seatLimit !== undefined) {
                            const existingRegs = await this.db.query(`SELECT COUNT(*) as count FROM registrations 
                 WHERE event_id = ? 
                 AND wednesday_activity = ? 
                 AND (status IS NULL OR status != 'cancelled')
                 AND cancellation_at IS NULL
                 AND (wednesday_activity_waitlisted IS NULL OR wednesday_activity_waitlisted = 0)`, [registrationData.eventId, registrationData.wednesdayActivity]);
                            const confirmedCount = Number(existingRegs[0]?.count || 0);
                            const willBeWaitlisted = confirmedCount >= activity.seatLimit;
                            registrationData.wednesdayActivityWaitlisted = willBeWaitlisted;
                            registrationData.wednesdayActivityWaitlistedAt = willBeWaitlisted ? new Date().toISOString() : undefined;
                        }
                    }
                }
            }
            const activity = registrationData.wednesdayActivity || '';
            const isPickleball = activity.toLowerCase().includes('pickleball');
            if (!isPickleball) {
                registrationData.pickleballEquipment = undefined;
            }
            const registration = new Registration_1.Registration(registrationData);
            try {
                const ev = await this.db.findById('events', registration.eventId);
                if (ev) {
                    const regTiers = (0, pricingTierUtils_1.parsePricingTierArray)(ev.registration_pricing);
                    const spouseTiers = (0, pricingTierUtils_1.parsePricingTierArray)(ev.spouse_pricing);
                    const breakfastPrice = Number(ev.breakfast_price ?? 0);
                    const bEnd = ev.breakfast_end_date ? (0, pricingTierUtils_1.getEasternTimeEndOfDay)(ev.breakfast_end_date) : Infinity;
                    const now = Date.now();
                    const base = (0, pricingTierUtils_1.pickActivePricingTier)(regTiers, now);
                    const spouse = registration.spouseDinnerTicket ? (0, pricingTierUtils_1.pickActivePricingTier)(spouseTiers, now) : null;
                    registration.registrationTierLabel = base?.label || base?.name || undefined;
                    if (registration.spouseDinnerTicket) {
                        registration.spouseTierLabel = spouse?.label || spouse?.name || undefined;
                        registration.spouseAddedAt = registration.spouseAddedAt || registration.createdAt;
                    }
                    let total = 0;
                    if (base && typeof base.price === 'number')
                        total += base.price;
                    else
                        total += (0, pricingTierUtils_1.fallbackRegistrationBasePrice)(ev, regTiers);
                    if (spouse && typeof spouse.price === 'number')
                        total += spouse.price;
                    if (registration.spouseBreakfast && now <= bEnd)
                        total += (isNaN(breakfastPrice) ? 0 : breakfastPrice);
                    const kidsTiers = (0, pricingTierUtils_1.parsePricingTierArray)(ev.kids_pricing);
                    const kidsActive = (0, pricingTierUtils_1.pickActivePricingTier)(kidsTiers, now);
                    if (registration.kids && registration.kids.length > 0) {
                        registration.kidsTierLabel = kidsActive?.label || kidsActive?.name || undefined;
                        registration.kidsAddedAt = registration.kidsAddedAt || registration.createdAt;
                        const pricePerKid = kidsActive?.price ?? 0;
                        total += pricePerKid * registration.kids.length;
                    }
                    registration.totalPrice = total;
                    const hasClientDiscount = typeof registration.discountAmount === 'number' &&
                        !isNaN(registration.discountAmount) &&
                        registration.discountAmount > 0;
                    if (registration.discountCode && !hasClientDiscount) {
                        try {
                            const codeRows = await this.db.query('SELECT * FROM discount_codes WHERE code = ? AND event_id = ?', [registration.discountCode.toUpperCase().trim(), registration.eventId]);
                            if (codeRows.length > 0) {
                                const { DiscountCode } = await Promise.resolve().then(() => __importStar(require('../models/DiscountCode')));
                                const discountCode = DiscountCode.fromDatabase(codeRows[0]);
                                const validation = discountCode.isValid();
                                if (validation.valid) {
                                    let discountAmount = 0;
                                    if (discountCode.discountType === 'percentage') {
                                        discountAmount = (registration.totalPrice * discountCode.discountValue) / 100;
                                    }
                                    else {
                                        discountAmount = discountCode.discountValue;
                                    }
                                    registration.discountAmount = discountAmount;
                                    registration.totalPrice = Math.max(0, registration.totalPrice - discountAmount);
                                    await this.db.query('UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?', [discountCode.id]);
                                }
                            }
                        }
                        catch (discountError) {
                            console.error('Error applying discount code:', discountError);
                        }
                    }
                    else if (registration.discountCode && hasClientDiscount) {
                        try {
                            const codeRows = await this.db.query('SELECT * FROM discount_codes WHERE code = ? AND event_id = ?', [registration.discountCode.toUpperCase().trim(), registration.eventId]);
                            if (codeRows.length > 0) {
                                const { DiscountCode } = await Promise.resolve().then(() => __importStar(require('../models/DiscountCode')));
                                const discountCode = DiscountCode.fromDatabase(codeRows[0]);
                                const validation = discountCode.isValid();
                                if (validation.valid) {
                                    await this.db.query('UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?', [discountCode.id]);
                                }
                            }
                        }
                        catch (discountError) {
                            console.error('Error incrementing discount code usage:', discountError);
                        }
                    }
                    const auth = this.getAuth(req);
                    const isAdmin = auth.role === 'admin';
                    if (isAdmin && registrationData.totalPrice !== undefined) {
                        registration.totalPrice = Number(registrationData.totalPrice);
                    }
                }
            }
            catch (e) {
            }
            const dbPayload = registration.toDatabase();
            const auth = this.getAuth(req);
            const isAdmin = auth.role === 'admin';
            if (isAdmin && registration.paymentMethod !== 'Comp' && (registration.paymentMethod === 'Card' || !registration.paid)) {
                if (!registration.paid) {
                    dbPayload.pending_payment_amount = dbPayload.total_price;
                    dbPayload.pending_payment_reason = 'Admin created registration (Payment Due)';
                    dbPayload.pending_payment_created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
                }
            }
            const result = await this.db.insert('registrations', dbPayload);
            registration.id = result.insertId;
            const adminCopy = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || 'planner@efbcconference.org';
            const toName = registration.badgeName || `${registration.firstName} ${registration.lastName}`.trim();
            const eventRow = await this.db.findById('events', registration.eventId);
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
            };
            (0, emailService_1.sendRegistrationConfirmationEmail)({ to: registration.email, ...payload }).catch((e) => console.warn('⚠️ Failed to queue registration confirmation:', e));
            if (adminCopy && adminCopy !== registration.email) {
                (0, emailService_1.sendRegistrationConfirmationEmail)({ to: adminCopy, ...payload }).catch((e) => console.warn('⚠️ Failed to queue admin confirmation:', e));
            }
            if (registration.secondaryEmail && registration.secondaryEmail !== registration.email && registration.secondaryEmail !== adminCopy) {
                (0, emailService_1.sendRegistrationConfirmationEmail)({ to: registration.secondaryEmail, ...payload }).catch((e) => console.warn('⚠️ Failed to queue secondary confirmation:', e));
            }
            const response = {
                success: true,
                data: registration.toJSON(),
                message: 'Registration created successfully'
            };
            res.status(201).json(response);
        }
        catch (error) {
            console.error('Error creating registration:', error);
            const response = {
                success: false,
                error: 'Failed to create registration'
            };
            res.status(500).json(response);
        }
    }
    async updateRegistration(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body || {};
            let computedActivityWaitlisted;
            let computedActivityWaitlistedAtDb;
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
                const response = {
                    success: false,
                    error: 'Registration not found'
                };
                res.status(404).json(response);
                return;
            }
            const authForActivity = this.getAuth(req);
            const isAdminForActivity = authForActivity.role === 'admin';
            if (!isAdminForActivity && authForActivity.id && Number(existingRow.user_id) !== Number(authForActivity.id)) {
                res.status(403).json({ success: false, error: 'You can only update your own registration' });
                return;
            }
            const existingActivity = String(existingRow.wednesday_activity ?? '').trim();
            const incomingActivity = updateData.wednesdayActivity !== undefined
                ? String(updateData.wednesdayActivity ?? '').trim()
                : undefined;
            if (incomingActivity !== undefined &&
                incomingActivity !== existingActivity &&
                !isAdminForActivity) {
                res.status(403).json({
                    success: false,
                    error: 'Only administrators can change the Wednesday activity after registration.',
                });
                return;
            }
            if (updateData.wednesdayActivity &&
                updateData.wednesdayActivity !== existingRow.wednesday_activity) {
                computedActivityWaitlisted = false;
                computedActivityWaitlistedAtDb = null;
                const event = await this.db.findById('events', existingRow.event_id);
                if (event && event.activities) {
                    const activities = typeof event.activities === 'string'
                        ? JSON.parse(event.activities)
                        : event.activities;
                    if (Array.isArray(activities) && activities.length > 0 && typeof activities[0] === 'object') {
                        const activity = activities
                            .find(a => a.name === updateData.wednesdayActivity);
                        if (activity?.seatLimit !== undefined) {
                            const existingRegs = await this.db.query(`SELECT COUNT(*) as count FROM registrations 
                 WHERE event_id = ? 
                 AND wednesday_activity = ? 
                 AND (status IS NULL OR status != 'cancelled')
                 AND cancellation_at IS NULL
                 AND (wednesday_activity_waitlisted IS NULL OR wednesday_activity_waitlisted = 0)
                 AND id != ?`, [existingRow.event_id, updateData.wednesdayActivity, Number(id)]);
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
            const fieldMapping = {
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
            const dbPayload = {
                updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
            };
            const updateDataObj = updateData || {};
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
                    if (adminSkipFields.includes(camelKey))
                        continue;
                    let value = updateDataObj[camelKey];
                    if ((camelKey === 'clubRentals' || camelKey === 'golfHandicap') && !isGolf) {
                        value = null;
                    }
                    if (camelKey === 'massageTimeSlot' && !isMassage) {
                        value = null;
                    }
                    if (camelKey === 'pickleballEquipment' && !isPickleball) {
                        value = null;
                    }
                    if (camelKey === 'kids') {
                        if (Array.isArray(value) && value.length > 0) {
                            value = JSON.stringify(value);
                        }
                        else if (existingRow && existingRow.kids_data) {
                            continue;
                        }
                        else {
                            value = null;
                        }
                    }
                    else if (camelKey === 'kidsPaymentId') {
                        if (Array.isArray(value)) {
                            value = value.length > 0 ? JSON.stringify(value) : null;
                        }
                        else if (value !== null && value !== undefined && String(value).trim() !== '') {
                            value = JSON.stringify([String(value).trim()]);
                        }
                        else {
                            value = null;
                        }
                    }
                    else if (camelKey === 'kidsTotalPrice') {
                        value = value !== null && value !== undefined ? Number(value) : null;
                    }
                    else if (camelKey === 'paidAmount') {
                        value = value !== null && value !== undefined ? Number(value) : null;
                    }
                    else if (camelKey === 'spouseDinnerTicket') {
                        value = value === true || value === 'Yes' || value === 'yes' || value === 1 ? 1 : 0;
                    }
                    else if (camelKey === 'isFirstTimeAttending' || camelKey === 'spouseBreakfast' || camelKey === 'paid') {
                        value = value === true || value === 1 ? 1 : 0;
                    }
                    else if (camelKey === 'paidAt' || camelKey === 'spousePaidAt' || camelKey === 'kidsPaidAt') {
                        value = value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : null;
                    }
                    else if (value === null || value === undefined) {
                        value = null;
                    }
                    dbPayload[dbKey] = value;
                }
            }
            if (updateDataObj.updateNotes && String(updateDataObj.updateNotes).trim()) {
                const newEntry = String(updateDataObj.updateNotes).trim();
                const existing = existingRow.update_notes ? String(existingRow.update_notes) : '';
                dbPayload.update_notes = existing ? `${newEntry}\n${existing}` : newEntry;
            }
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
                    const ev = await this.db.findById('events', existingRow.event_id);
                    const parseJson = (v) => {
                        if (!v)
                            return [];
                        if (Array.isArray(v))
                            return v;
                        if (typeof v === 'object')
                            return [v];
                        try {
                            return JSON.parse(v);
                        }
                        catch {
                            return [];
                        }
                    };
                    const now = Date.now();
                    const nowDb = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    if (shouldSetSpouseFirstAdded) {
                        const spouseTier = ev ? (0, pricingTierUtils_1.pickActivePricingTier)(parseJson(ev.spouse_pricing), now) : null;
                        dbPayload.spouse_added_at = nowDb;
                        dbPayload.spouse_tier_label = spouseTier?.label || spouseTier?.name || null;
                    }
                    if (shouldSetKidsFirstAdded) {
                        const kidsTier = ev ? (0, pricingTierUtils_1.pickActivePricingTier)(parseJson(ev.kids_pricing), now) : null;
                        dbPayload.kids_added_at = nowDb;
                        dbPayload.kids_tier_label = kidsTier?.label || kidsTier?.name || null;
                    }
                }
            }
            catch (e) {
            }
            if (computedActivityWaitlisted !== undefined) {
                dbPayload.wednesday_activity_waitlisted = computedActivityWaitlisted ? 1 : 0;
                dbPayload.wednesday_activity_waitlisted_at = computedActivityWaitlisted ? computedActivityWaitlistedAtDb : null;
            }
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
            if (isAdminUpdate) {
                const oldTotalPrice = Number(existingRow.total_price || 0);
                const oldPaidAmount = Number(existingRow.paid_amount || (existingRow.paid ? oldTotalPrice : 0));
                const oldSpouseTicket = existingRow.spouse_dinner_ticket || false;
                const oldKidsData = existingRow.kids_data
                    ? (typeof existingRow.kids_data === 'string' ? JSON.parse(existingRow.kids_data) : existingRow.kids_data)
                    : [];
                const oldKidsCount = Array.isArray(oldKidsData) ? oldKidsData.length : 0;
                let newTotalPrice = oldTotalPrice;
                let pendingAmount = 0;
                const reasonParts = [];
                const adminReason = updateData.pendingPaymentReason || '';
                try {
                    const ev = await this.db.findById('events', existingRow.event_id);
                    if (ev) {
                        const parseJson = (v) => {
                            if (!v)
                                return [];
                            if (Array.isArray(v))
                                return v;
                            if (typeof v === 'object')
                                return [v];
                            try {
                                return JSON.parse(v);
                            }
                            catch {
                                return [];
                            }
                        };
                        const spouseTiers = parseJson(ev.spouse_pricing);
                        const kidsTiers = parseJson(ev.kids_pricing);
                        const now = Date.now();
                        const newSpouseTicket = updateData.spouseDinnerTicket || false;
                        if (newSpouseTicket && !oldSpouseTicket) {
                            const spouse = (0, pricingTierUtils_1.pickActivePricingTier)(spouseTiers, now);
                            const spousePrice = spouse && typeof spouse.price === 'number' ? spouse.price : 200;
                            pendingAmount += spousePrice;
                            newTotalPrice += spousePrice;
                            reasonParts.push(`Spouse dinner ticket added ($${spousePrice.toFixed(2)})`);
                        }
                        const newKids = updateData.kids || [];
                        const newKidsCount = Array.isArray(newKids) ? newKids.length : 0;
                        const effectiveOldKidsCount = newKidsCount > 0 ? oldKidsCount : 0;
                        if (newKidsCount > effectiveOldKidsCount) {
                            const addedKidsCount = newKidsCount - effectiveOldKidsCount;
                            const kidsActive = (0, pricingTierUtils_1.pickActivePricingTier)(kidsTiers, now);
                            const pricePerKid = kidsActive?.price ?? 50;
                            const kidsPrice = pricePerKid * addedKidsCount;
                            pendingAmount += kidsPrice;
                            newTotalPrice += kidsPrice;
                            reasonParts.push(`${addedKidsCount} children added ($${kidsPrice.toFixed(2)})`);
                        }
                    }
                }
                catch (e) {
                    console.error('Error calculating spouse/kids pending from tiers:', e);
                }
                if (pendingAmount === 0 && updateData.pendingPaymentReason) {
                    const incomingPrice = Number(updateData.totalPrice);
                    if (Number.isFinite(incomingPrice) && incomingPrice > oldTotalPrice) {
                        const priceDiff = incomingPrice - oldTotalPrice;
                        pendingAmount += priceDiff;
                        newTotalPrice = incomingPrice;
                        reasonParts.push(`Price increased by admin from $${oldTotalPrice.toFixed(2)} to $${incomingPrice.toFixed(2)}`);
                    }
                    else if (Number.isFinite(incomingPrice) && incomingPrice < oldTotalPrice) {
                        newTotalPrice = incomingPrice;
                    }
                }
                let finalReason = reasonParts.join('. ');
                if (adminReason) {
                    finalReason += (finalReason ? '. ' : '') + adminReason;
                }
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
                if (pendingAmount <= 0 && (updateData.paid === true || updateData.paid === 1)) {
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
            const isPaidUpdate = updateDataObj.paid === true || updateDataObj.paid === 1 || updateDataObj.paid === 'true';
            if (!isAdminUpdate && isPaidUpdate && existingRow.pending_payment_amount && Number(existingRow.pending_payment_amount) > 0) {
                const totalPrice = Number(existingRow.total_price || 0);
                const previousPaidAmount = Number(existingRow.paid_amount || 0);
                const pending = Number(existingRow.pending_payment_amount || 0);
                const clientPaidAmount = Number(updateDataObj.paidAmount);
                const dbComputedPaidAmount = previousPaidAmount + pending;
                let newPaidAmount;
                if (Number.isFinite(clientPaidAmount) && clientPaidAmount > 0) {
                    newPaidAmount = Math.max(clientPaidAmount, dbComputedPaidAmount);
                }
                else {
                    newPaidAmount = dbComputedPaidAmount;
                }
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
                const newWa = dbPayload.wednesday_activity !== undefined
                    ? String(dbPayload.wednesday_activity ?? '').trim()
                    : oldWa;
                if (newWa !== oldWa) {
                    await removeRegistrantFromStaleActivityGroups(this.db, Number(existingRow.event_id), Number(id), newWa);
                    const ga = existingRow.group_assigned;
                    if (ga) {
                        const ag = await this.db.findById('activity_groups', Number(ga));
                        if (!ag || !groupCategoryMatchesWednesdayActivity(String(ag.category || ''), newWa)) {
                            dbPayload.group_assigned = null;
                        }
                    }
                }
            }
            const updateResult = await this.db.update('registrations', Number(id), dbPayload);
            console.log(`[UPDATE] Database update result:`, updateResult);
            const verifyRow = await this.db.findById('registrations', Number(id));
            console.log(`[UPDATE] Verification - Updated record:`, {
                first_name: verifyRow?.first_name,
                email: verifyRow?.email,
                club_rentals: verifyRow?.club_rentals,
                wednesday_activity: verifyRow?.wednesday_activity
            });
            const updatedRegistration = Registration_1.Registration.fromDatabase(verifyRow);
            if (isAdminUpdate && verifyRow.pending_payment_amount && Number(verifyRow.pending_payment_amount) > 0 && updatedRegistration.paymentMethod === 'Card') {
                try {
                    const { sendPendingPaymentEmail } = await Promise.resolve().then(() => __importStar(require('../services/emailService')));
                    const eventRow = await this.db.findById('events', updatedRegistration.eventId);
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
                }
                catch (emailError) {
                    console.error('Error sending pending payment email:', emailError?.message || emailError);
                }
            }
            if (!isAdminUpdate) {
                try {
                    const adminCopy = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || 'planner@efbcconference.org';
                    const eventRow = await this.db.findById('events', updatedRegistration.eventId);
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
                    };
                    (0, emailService_1.sendRegistrationUpdateEmail)({ to: updatedRegistration.email, ...payload }).catch((e) => console.warn('Failed to queue registration update email:', e));
                    if (adminCopy && adminCopy !== updatedRegistration.email) {
                        (0, emailService_1.sendRegistrationUpdateEmail)({ to: adminCopy, ...payload }).catch((e) => console.warn('Failed to queue admin update email:', e));
                    }
                    if (updatedRegistration.secondaryEmail && updatedRegistration.secondaryEmail !== updatedRegistration.email && updatedRegistration.secondaryEmail !== adminCopy) {
                        (0, emailService_1.sendRegistrationUpdateEmail)({ to: updatedRegistration.secondaryEmail, ...payload }).catch((e) => console.warn('Failed to queue secondary update email:', e));
                    }
                }
                catch (emailError) {
                    console.warn('Failed to send update email after registration update:', emailError?.message || emailError);
                }
            }
            const response = {
                success: true,
                data: updatedRegistration.toJSON(),
                message: 'Registration updated successfully'
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error updating registration:', error);
            const response = {
                success: false,
                error: 'Failed to update registration'
            };
            res.status(500).json(response);
        }
    }
    async deleteRegistration(req, res) {
        try {
            const { id } = req.params;
            const existingRegistration = await this.db.findById('registrations', Number(id));
            if (!existingRegistration) {
                const response = {
                    success: false,
                    error: 'Registration not found'
                };
                res.status(404).json(response);
                return;
            }
            await this.db.delete('registrations', Number(id));
            const response = {
                success: true,
                message: 'Registration deleted successfully'
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error deleting registration:', error);
            const response = {
                success: false,
                error: 'Failed to delete registration'
            };
            res.status(500).json(response);
        }
    }
    async bulkDeleteRegistrations(req, res) {
        try {
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                const response = {
                    success: false,
                    error: 'Invalid registration IDs provided'
                };
                res.status(400).json(response);
                return;
            }
            const placeholders = ids.map(() => '?').join(',');
            await this.db.query(`DELETE FROM registrations WHERE id IN (${placeholders})`, ids);
            const response = {
                success: true,
                message: `${ids.length} registrations deleted successfully`
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error bulk deleting registrations:', error);
            const response = {
                success: false,
                error: 'Failed to delete registrations'
            };
            res.status(500).json(response);
        }
    }
    async resendConfirmationEmail(req, res) {
        try {
            const { id } = req.params;
            const registrationId = Number(id);
            if (isNaN(registrationId)) {
                const response = {
                    success: false,
                    error: 'Invalid registration ID'
                };
                res.status(400).json(response);
                return;
            }
            const registrationRow = await this.db.findById('registrations', registrationId);
            if (!registrationRow) {
                const response = {
                    success: false,
                    error: 'Registration not found'
                };
                res.status(404).json(response);
                return;
            }
            const registration = Registration_1.Registration.fromDatabase(registrationRow);
            const eventRow = await this.db.findById('events', registration.eventId);
            if (!eventRow) {
                const response = {
                    success: false,
                    error: 'Event not found'
                };
                res.status(404).json(response);
                return;
            }
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
            };
            (0, emailService_1.sendRegistrationConfirmationEmail)({ to: registration.email, ...payload }).catch((e) => console.warn('⚠️ Failed to queue registration confirmation (resend):', e));
            if (registration.secondaryEmail && registration.secondaryEmail !== registration.email) {
                (0, emailService_1.sendRegistrationConfirmationEmail)({ to: registration.secondaryEmail, ...payload }).catch((e) => console.warn('⚠️ Failed to queue secondary confirmation (resend):', e));
            }
            const response = {
                success: true,
                message: 'Confirmation email(s) sent successfully'
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error resending confirmation email:', error);
            const response = {
                success: false,
                error: 'Failed to resend confirmation email'
            };
            res.status(500).json(response);
        }
    }
    async promoteWaitlistedRegistration(req, res) {
        try {
            const auth = this.getAuth(req);
            if (auth.role !== 'admin') {
                res.status(403).json({ success: false, error: 'Forbidden' });
                return;
            }
            const registrationId = Number(req.params.id);
            if (!registrationId || isNaN(registrationId)) {
                res.status(400).json({ success: false, error: 'Invalid registration ID' });
                return;
            }
            const row = await this.db.findById('registrations', registrationId);
            if (!row) {
                res.status(404).json({ success: false, error: 'Registration not found' });
                return;
            }
            if (row.status === 'cancelled' || row.cancellation_at) {
                res.status(400).json({ success: false, error: 'Cannot promote a cancelled registration' });
                return;
            }
            const activityName = String(row.wednesday_activity || '').trim();
            if (!activityName) {
                res.status(400).json({ success: false, error: 'Registration has no selected activity' });
                return;
            }
            const isWaitlisted = row.wednesday_activity_waitlisted === 1 || row.wednesday_activity_waitlisted === true;
            if (!isWaitlisted) {
                res.status(400).json({ success: false, error: 'Registration is not waitlisted for this activity' });
                return;
            }
            const event = await this.db.findById('events', Number(row.event_id));
            if (event && event.activities) {
                const activities = typeof event.activities === 'string' ? JSON.parse(event.activities) : event.activities;
                if (Array.isArray(activities) && activities.length > 0 && typeof activities[0] === 'object') {
                    const activity = activities.find(a => a.name === activityName);
                    if (activity?.seatLimit !== undefined) {
                        const existingRegs = await this.db.query(`SELECT COUNT(*) as count FROM registrations
               WHERE event_id = ?
               AND wednesday_activity = ?
               AND (status IS NULL OR status != 'cancelled')
               AND cancellation_at IS NULL
               AND (wednesday_activity_waitlisted IS NULL OR wednesday_activity_waitlisted = 0)`, [row.event_id, activityName]);
                        const confirmedCount = Number(existingRegs[0]?.count || 0);
                        if (confirmedCount >= activity.seatLimit) {
                            res.status(400).json({
                                success: false,
                                error: `No seats available for ${activityName} (${activity.seatLimit} seats).`
                            });
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
            });
            const updatedRow = await this.db.findById('registrations', registrationId);
            const updated = Registration_1.Registration.fromDatabase(updatedRow);
            res.status(200).json({
                success: true,
                data: updated.toJSON(),
                message: 'Promoted from waitlist'
            });
        }
        catch (error) {
            console.error('Error promoting waitlisted registration:', error);
            res.status(500).json({ success: false, error: 'Failed to promote from waitlist' });
        }
    }
}
exports.RegistrationController = RegistrationController;
//# sourceMappingURL=registrationController.js.map