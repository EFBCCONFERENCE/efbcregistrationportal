"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Registration = void 0;
class Registration {
    formatDateForDB(dateValue) {
        if (!dateValue) {
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
        const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
        if (isNaN(date.getTime())) {
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }
    constructor(data) {
        this.id = data.id;
        this.userId = data.userId ?? 1;
        this.eventId = data.eventId ?? 1;
        this.firstName = data.firstName || '';
        this.lastName = data.lastName || '';
        this.badgeName = data.badgeName || '';
        this.email = data.email || '';
        this.secondaryEmail = data.secondaryEmail;
        this.organization = data.organization || '';
        this.jobTitle = data.jobTitle || '';
        this.address = data.address || '';
        this.addressStreet = data.addressStreet;
        this.city = data.city;
        this.state = data.state;
        this.zipCode = data.zipCode;
        this.country = data.country;
        this.mobile = data.mobile || '';
        this.officePhone = data.officePhone;
        this.isFirstTimeAttending = data.isFirstTimeAttending || false;
        this.companyType = data.companyType || '';
        this.companyTypeOther = data.companyTypeOther;
        this.emergencyContactName = data.emergencyContactName;
        this.emergencyContactPhone = data.emergencyContactPhone;
        this.wednesdayActivity = data.wednesdayActivity || 'None';
        this.wednesdayActivityWaitlisted = data.wednesdayActivityWaitlisted ?? data.wednesday_activity_waitlisted ?? false;
        this.wednesdayActivityWaitlistedAt = data.wednesdayActivityWaitlistedAt ?? data.wednesday_activity_waitlisted_at ?? undefined;
        this.wednesdayReception = data.wednesdayReception || 'I will attend';
        this.thursdayBreakfast = data.thursdayBreakfast || 'I will attend';
        this.thursdayLunch = data.thursdayLunch || data.thursdayLuncheon || 'I will attend';
        this.thursdayReception = data.thursdayReception || data.thursdayDinner || 'I will attend';
        this.fridayBreakfast = data.fridayBreakfast || 'I will attend';
        this.fridayDinner = data.fridayDinner || 'I will attend';
        this.dietaryRestrictions = data.dietaryRestrictions;
        this.specialRequests = data.specialRequests;
        this.transportationMethod = data.transportationMethod;
        this.transportationDetails = data.transportationDetails;
        this.stayingAtBeachClub = data.stayingAtBeachClub !== undefined ? data.stayingAtBeachClub : undefined;
        this.accommodationDetails = data.accommodationDetails;
        this.dietaryRequirements = data.dietaryRequirements || undefined;
        this.dietaryRequirementsOther = data.dietaryRequirementsOther;
        this.specialPhysicalNeeds = data.specialPhysicalNeeds !== undefined ? data.specialPhysicalNeeds : undefined;
        this.specialPhysicalNeedsDetails = data.specialPhysicalNeedsDetails;
        const cr = data.clubRentals;
        if (typeof cr === 'boolean') {
            this.clubRentals = cr ? undefined : 'I will bring my own';
        }
        else if (typeof cr === 'string') {
            this.clubRentals = cr || undefined;
        }
        else {
            this.clubRentals = undefined;
        }
        this.spouseBreakfast = data.spouseBreakfast ?? false;
        this.tuesdayEarlyReception = data.tuesdayEarlyReception ?? 'I will attend';
        this.golfHandicap = data.golfHandicap;
        this.massageTimeSlot = data.massageTimeSlot;
        const pbe = data.pickleballEquipment;
        if (pbe !== undefined && pbe !== null) {
            this.pickleballEquipment = pbe === true || pbe === 'Yes' || pbe === 'yes' || pbe === 1;
        }
        else {
            this.pickleballEquipment = undefined;
        }
        this.spouseFirstName = data.spouseFirstName;
        this.spouseLastName = data.spouseLastName;
        const sdt = data.spouseDinnerTicket;
        this.spouseDinnerTicket = sdt === true || sdt === 'Yes' || sdt === 'yes' || sdt === 1;
        this.kids = data.kids || undefined;
        this.kidsTotalPrice = data.kidsTotalPrice ?? undefined;
        this.discountCode = data.discountCode;
        this.discountAmount = data.discountAmount ?? undefined;
        this.registrationTierLabel = data.registrationTierLabel ?? data.registration_tier_label ?? undefined;
        this.spouseTierLabel = data.spouseTierLabel ?? data.spouse_tier_label ?? undefined;
        this.spouseAddedAt = data.spouseAddedAt ?? data.spouse_added_at ?? undefined;
        this.kidsTierLabel = data.kidsTierLabel ?? data.kids_tier_label ?? undefined;
        this.kidsAddedAt = data.kidsAddedAt ?? data.kids_added_at ?? undefined;
        this.childFirstName = data.childFirstName;
        this.childLastName = data.childLastName;
        const clt = data.childLunchTicket;
        this.childLunchTicket = clt === true || clt === 'Yes' || clt === 'yes' || clt === 1 || false;
        this.totalPrice = data.totalPrice || 0;
        this.paymentMethod = data.paymentMethod || 'Card';
        this.name = data.name || `${this.firstName} ${this.lastName}`;
        this.category = data.category || 'Networking';
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
        this.status = data.status;
        this.cancellationReason = data.cancellationReason;
        this.cancellationAt = data.cancellationAt;
        this.paid = data.paid;
        this.paidAt = data.paidAt ?? data.paid_at ?? undefined;
        this.squarePaymentId = data.squarePaymentId;
        this.spousePaymentId = data.spousePaymentId ?? data.spouse_payment_id ?? undefined;
        this.spousePaidAt = data.spousePaidAt ?? data.spouse_paid_at ?? undefined;
        const kidsPaymentIdRaw = data.kidsPaymentId ?? data.kids_payment_id;
        if (kidsPaymentIdRaw !== undefined && kidsPaymentIdRaw !== null) {
            if (typeof kidsPaymentIdRaw === 'string') {
                try {
                    const parsed = JSON.parse(kidsPaymentIdRaw);
                    this.kidsPaymentId = Array.isArray(parsed) ? parsed : [parsed];
                }
                catch {
                    this.kidsPaymentId = [kidsPaymentIdRaw];
                }
            }
            else if (Array.isArray(kidsPaymentIdRaw)) {
                this.kidsPaymentId = kidsPaymentIdRaw;
            }
            else {
                this.kidsPaymentId = [String(kidsPaymentIdRaw)];
            }
        }
        this.kidsPaidAt = data.kidsPaidAt ?? data.kids_paid_at ?? undefined;
        this.groupAssigned = data.groupAssigned ?? data.group_assigned ?? undefined;
        this.originalTotalPrice = data.originalTotalPrice ?? data.original_total_price ?? undefined;
        this.paidAmount = data.paidAmount ?? data.paid_amount ?? undefined;
        this.pendingPaymentAmount = data.pendingPaymentAmount ?? data.pending_payment_amount ?? undefined;
        this.pendingPaymentReason = data.pendingPaymentReason ?? data.pending_payment_reason ?? undefined;
        this.pendingPaymentCreatedAt = data.pendingPaymentCreatedAt ?? data.pending_payment_created_at ?? undefined;
    }
    toJSON() {
        const base = {
            id: this.id,
            userId: this.userId,
            eventId: this.eventId,
            firstName: this.firstName,
            lastName: this.lastName,
            badgeName: this.badgeName,
            email: this.email,
            secondaryEmail: this.secondaryEmail,
            organization: this.organization,
            jobTitle: this.jobTitle,
            address: this.address,
            addressStreet: this.addressStreet,
            city: this.city,
            state: this.state,
            zipCode: this.zipCode,
            country: this.country,
            mobile: this.mobile,
            officePhone: this.officePhone,
            isFirstTimeAttending: this.isFirstTimeAttending,
            companyType: this.companyType,
            companyTypeOther: this.companyTypeOther,
            emergencyContactName: this.emergencyContactName,
            emergencyContactPhone: this.emergencyContactPhone,
            wednesdayActivity: this.wednesdayActivity,
            wednesdayActivityWaitlisted: !!this.wednesdayActivityWaitlisted,
            wednesdayActivityWaitlistedAt: this.wednesdayActivityWaitlistedAt,
            wednesdayReception: this.wednesdayReception,
            thursdayBreakfast: this.thursdayBreakfast,
            thursdayLunch: this.thursdayLunch,
            thursdayLuncheon: this.thursdayLunch,
            thursdayReception: this.thursdayReception,
            thursdayDinner: this.thursdayReception,
            fridayBreakfast: this.fridayBreakfast,
            fridayDinner: this.fridayDinner,
            dietaryRestrictions: this.dietaryRestrictions,
            specialRequests: this.specialRequests,
            transportationMethod: this.transportationMethod,
            transportationDetails: this.transportationDetails,
            stayingAtBeachClub: this.stayingAtBeachClub,
            accommodationDetails: this.accommodationDetails,
            dietaryRequirements: this.dietaryRequirements,
            dietaryRequirementsOther: this.dietaryRequirementsOther,
            specialPhysicalNeeds: this.specialPhysicalNeeds,
            specialPhysicalNeedsDetails: this.specialPhysicalNeedsDetails,
            clubRentals: this.clubRentals,
            golfHandicap: this.golfHandicap,
            massageTimeSlot: this.massageTimeSlot,
            pickleballEquipment: this.pickleballEquipment,
            spouseFirstName: this.spouseFirstName,
            spouseLastName: this.spouseLastName,
            spouseDinnerTicket: this.spouseDinnerTicket,
            kids: this.kids,
            kidsTotalPrice: this.kidsTotalPrice,
            childFirstName: this.childFirstName,
            childLastName: this.childLastName,
            childLunchTicket: this.childLunchTicket,
            totalPrice: this.totalPrice,
            paymentMethod: this.paymentMethod,
            name: this.name,
            category: this.category,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
        if (this.discountCode)
            base.discountCode = this.discountCode;
        if (this.discountAmount !== undefined)
            base.discountAmount = this.discountAmount;
        if (this.registrationTierLabel)
            base.registrationTierLabel = this.registrationTierLabel;
        if (this.spouseTierLabel)
            base.spouseTierLabel = this.spouseTierLabel;
        if (this.spouseAddedAt)
            base.spouseAddedAt = this.spouseAddedAt;
        if (this.kidsTierLabel)
            base.kidsTierLabel = this.kidsTierLabel;
        if (this.kidsAddedAt)
            base.kidsAddedAt = this.kidsAddedAt;
        if (this.status)
            base.status = this.status;
        if (this.cancellationReason)
            base.cancellationReason = this.cancellationReason;
        if (this.cancellationAt)
            base.cancellationAt = this.cancellationAt;
        if (this.tuesdayEarlyReception)
            base.tuesdayEarlyReception = this.tuesdayEarlyReception;
        if (typeof this.paid === 'boolean')
            base.paid = this.paid;
        if (this.paid)
            base.paidAt = this.paidAt || null;
        if (this.squarePaymentId)
            base.squarePaymentId = this.squarePaymentId;
        if (this.spousePaymentId)
            base.spousePaymentId = this.spousePaymentId;
        if (this.spousePaidAt)
            base.spousePaidAt = this.spousePaidAt;
        if (this.kidsPaymentId)
            base.kidsPaymentId = this.kidsPaymentId;
        if (this.kidsPaidAt)
            base.kidsPaidAt = this.kidsPaidAt;
        if (this.groupAssigned)
            base.groupAssigned = this.groupAssigned;
        if (this.originalTotalPrice !== undefined)
            base.originalTotalPrice = this.originalTotalPrice;
        if (this.paidAmount !== undefined)
            base.paidAmount = this.paidAmount;
        if (this.pendingPaymentAmount !== undefined)
            base.pendingPaymentAmount = this.pendingPaymentAmount;
        if (this.pendingPaymentReason)
            base.pendingPaymentReason = this.pendingPaymentReason;
        if (this.pendingPaymentCreatedAt)
            base.pendingPaymentCreatedAt = this.pendingPaymentCreatedAt;
        return base;
    }
    nullIfUndefined(value) {
        return value === undefined ? null : value;
    }
    toDatabase() {
        const payload = {
            user_id: this.userId,
            event_id: this.eventId,
            first_name: this.firstName || null,
            last_name: this.lastName || null,
            badge_name: this.badgeName || null,
            email: this.email || null,
            secondary_email: this.nullIfUndefined(this.secondaryEmail),
            organization: this.organization || null,
            job_title: this.jobTitle || null,
            address: this.address || null,
            address_street: this.nullIfUndefined(this.addressStreet),
            city: this.nullIfUndefined(this.city),
            state: this.nullIfUndefined(this.state),
            zip_code: this.nullIfUndefined(this.zipCode),
            country: this.nullIfUndefined(this.country),
            mobile: this.mobile || null,
            office_phone: this.nullIfUndefined(this.officePhone),
            is_first_time_attending: this.isFirstTimeAttending ?? false,
            company_type: this.companyType || null,
            company_type_other: this.nullIfUndefined(this.companyTypeOther),
            emergency_contact_name: this.nullIfUndefined(this.emergencyContactName),
            emergency_contact_phone: this.nullIfUndefined(this.emergencyContactPhone),
            wednesday_activity: this.wednesdayActivity || null,
            wednesday_activity_waitlisted: this.wednesdayActivityWaitlisted ? 1 : 0,
            wednesday_activity_waitlisted_at: this.wednesdayActivityWaitlistedAt ? this.formatDateForDB(this.wednesdayActivityWaitlistedAt) : null,
            wednesday_reception: this.wednesdayReception || null,
            thursday_breakfast: this.thursdayBreakfast || null,
            thursday_luncheon: this.thursdayLunch || null,
            thursday_dinner: this.thursdayReception || null,
            friday_breakfast: this.fridayBreakfast || null,
            dietary_restrictions: this.dietaryRestrictions || null,
            special_requests: this.nullIfUndefined(this.specialRequests),
            transportation_method: this.nullIfUndefined(this.transportationMethod),
            transportation_details: this.nullIfUndefined(this.transportationDetails),
            staying_at_beach_club: this.stayingAtBeachClub ?? null,
            accommodation_details: this.nullIfUndefined(this.accommodationDetails),
            dietary_requirements: this.dietaryRequirements && this.dietaryRequirements.length > 0 ? JSON.stringify(this.dietaryRequirements) : null,
            dietary_requirements_other: this.nullIfUndefined(this.dietaryRequirementsOther),
            special_physical_needs: this.specialPhysicalNeeds ?? null,
            special_physical_needs_details: this.nullIfUndefined(this.specialPhysicalNeedsDetails),
            club_rentals: this.nullIfUndefined(this.clubRentals),
            golf_handicap: this.nullIfUndefined(this.golfHandicap),
            massage_time_slot: this.nullIfUndefined(this.massageTimeSlot),
            pickleball_equipment: this.pickleballEquipment ?? null,
            spouse_dinner_ticket: !!this.spouseDinnerTicket,
            spouse_breakfast: !!this.spouseBreakfast,
            tuesday_early_reception: this.nullIfUndefined(this.tuesdayEarlyReception),
            spouse_first_name: this.nullIfUndefined(this.spouseFirstName),
            spouse_last_name: this.nullIfUndefined(this.spouseLastName),
            kids_data: this.kids && this.kids.length > 0 ? JSON.stringify(this.kids) : null,
            kids_total_price: this.kidsTotalPrice ?? null,
            discount_code: this.nullIfUndefined(this.discountCode),
            discount_amount: this.discountAmount ?? 0,
            registration_tier_label: this.nullIfUndefined(this.registrationTierLabel),
            spouse_tier_label: this.nullIfUndefined(this.spouseTierLabel),
            spouse_added_at: this.spouseAddedAt ? this.formatDateForDB(this.spouseAddedAt) : null,
            kids_tier_label: this.nullIfUndefined(this.kidsTierLabel),
            kids_added_at: this.kidsAddedAt ? this.formatDateForDB(this.kidsAddedAt) : null,
            child_first_name: this.nullIfUndefined(this.childFirstName),
            child_last_name: this.nullIfUndefined(this.childLastName),
            child_lunch_ticket: this.childLunchTicket ?? false,
            total_price: this.totalPrice || 0,
            payment_method: this.paymentMethod || null,
            paid: this.paid ?? false,
            paid_at: this.paidAt ? this.formatDateForDB(this.paidAt) : null,
            square_payment_id: this.nullIfUndefined(this.squarePaymentId),
            spouse_payment_id: this.nullIfUndefined(this.spousePaymentId),
            spouse_paid_at: this.spousePaidAt ? this.formatDateForDB(this.spousePaidAt) : null,
            kids_payment_id: this.kidsPaymentId
                ? (Array.isArray(this.kidsPaymentId)
                    ? JSON.stringify(this.kidsPaymentId)
                    : JSON.stringify([this.kidsPaymentId]))
                : null,
            kids_paid_at: this.kidsPaidAt ? this.formatDateForDB(this.kidsPaidAt) : null,
            group_assigned: this.nullIfUndefined(this.groupAssigned),
            original_total_price: this.originalTotalPrice ?? null,
            paid_amount: this.paidAmount ?? (this.paid ? this.totalPrice : 0),
            pending_payment_amount: this.pendingPaymentAmount ?? null,
            pending_payment_reason: this.nullIfUndefined(this.pendingPaymentReason),
            pending_payment_created_at: this.pendingPaymentCreatedAt ? this.formatDateForDB(this.pendingPaymentCreatedAt) : null,
            updated_at: this.formatDateForDB(this.updatedAt || new Date().toISOString()),
        };
        if (!this.id) {
            payload.created_at = this.formatDateForDB(this.createdAt || new Date().toISOString());
        }
        return payload;
    }
    static fromDatabase(row) {
        return new Registration({
            id: row.id,
            userId: row.user_id,
            eventId: row.event_id,
            firstName: row.first_name,
            lastName: row.last_name,
            badgeName: row.badge_name,
            email: row.email,
            secondaryEmail: row.secondary_email,
            organization: row.organization,
            jobTitle: row.job_title,
            address: row.address,
            addressStreet: row.address_street,
            city: row.city,
            state: row.state,
            zipCode: row.zip_code,
            country: row.country,
            mobile: row.mobile,
            officePhone: row.office_phone,
            isFirstTimeAttending: !!row.is_first_time_attending,
            companyType: row.company_type,
            companyTypeOther: row.company_type_other,
            emergencyContactName: row.emergency_contact_name,
            emergencyContactPhone: row.emergency_contact_phone,
            wednesdayActivity: row.wednesday_activity,
            wednesdayActivityWaitlisted: row.wednesday_activity_waitlisted !== undefined ? !!row.wednesday_activity_waitlisted : false,
            wednesdayActivityWaitlistedAt: row.wednesday_activity_waitlisted_at ?? undefined,
            wednesdayReception: row.wednesday_reception,
            thursdayBreakfast: row.thursday_breakfast,
            thursdayLunch: row.thursday_luncheon,
            thursdayReception: row.thursday_dinner,
            fridayBreakfast: row.friday_breakfast,
            fridayDinner: row.friday_dinner,
            dietaryRestrictions: row.dietary_restrictions,
            specialRequests: row.special_requests,
            transportationMethod: row.transportation_method,
            transportationDetails: row.transportation_details,
            stayingAtBeachClub: row.staying_at_beach_club !== undefined ? !!row.staying_at_beach_club : undefined,
            accommodationDetails: row.accommodation_details,
            dietaryRequirements: (() => {
                if (row.dietary_requirements) {
                    try {
                        return typeof row.dietary_requirements === 'string' ? JSON.parse(row.dietary_requirements) : row.dietary_requirements;
                    }
                    catch (e) {
                        return undefined;
                    }
                }
                return undefined;
            })(),
            dietaryRequirementsOther: row.dietary_requirements_other,
            specialPhysicalNeeds: row.special_physical_needs !== undefined ? !!row.special_physical_needs : undefined,
            specialPhysicalNeedsDetails: row.special_physical_needs_details,
            clubRentals: row.club_rentals || undefined,
            golfHandicap: row.golf_handicap,
            massageTimeSlot: row.massage_time_slot,
            pickleballEquipment: !!row.pickleball_equipment,
            spouseDinnerTicket: !!row.spouse_dinner_ticket,
            spouseBreakfast: !!row.spouse_breakfast,
            spouseFirstName: row.spouse_first_name,
            spouseLastName: row.spouse_last_name,
            kids: (() => {
                if (row.kids_data) {
                    try {
                        if (typeof row.kids_data === 'string') {
                            return JSON.parse(row.kids_data);
                        }
                        else if (typeof row.kids_data === 'object') {
                            return row.kids_data;
                        }
                        return undefined;
                    }
                    catch (e) {
                        console.error('Error parsing kids_data:', e);
                        return undefined;
                    }
                }
                else if (row.child_first_name || row.child_last_name) {
                    return [{
                            firstName: row.child_first_name || '',
                            lastName: row.child_last_name || '',
                            badgeName: `${row.child_first_name || ''} ${row.child_last_name || ''}`.trim(),
                            age: 0,
                            lunchTicket: !!row.child_lunch_ticket,
                        }];
                }
                return undefined;
            })(),
            kidsTotalPrice: row.kids_total_price ?? undefined,
            discountCode: row.discount_code,
            discountAmount: row.discount_amount ?? undefined,
            registrationTierLabel: row.registration_tier_label ?? undefined,
            spouseTierLabel: row.spouse_tier_label ?? undefined,
            spouseAddedAt: row.spouse_added_at ?? undefined,
            kidsTierLabel: row.kids_tier_label ?? undefined,
            kidsAddedAt: row.kids_added_at ?? undefined,
            childFirstName: row.child_first_name,
            childLastName: row.child_last_name,
            childLunchTicket: !!row.child_lunch_ticket,
            totalPrice: row.total_price,
            paymentMethod: row.payment_method,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            status: row.status,
            cancellationReason: row.cancellation_reason,
            cancellationAt: row.cancellation_at,
            tuesdayEarlyReception: row.tuesday_early_reception,
            paid: !!row.paid,
            paidAt: row.paid_at,
            squarePaymentId: row.square_payment_id,
            spousePaymentId: row.spouse_payment_id,
            spousePaidAt: row.spouse_paid_at,
            groupAssigned: row.group_assigned || undefined,
            originalTotalPrice: row.original_total_price ?? undefined,
            paidAmount: row.paid_amount ?? undefined,
            pendingPaymentAmount: row.pending_payment_amount ?? undefined,
            pendingPaymentReason: row.pending_payment_reason ?? undefined,
            pendingPaymentCreatedAt: row.pending_payment_created_at ?? undefined,
            name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
            category: row.wednesday_activity || 'Networking',
        });
    }
}
exports.Registration = Registration;
//# sourceMappingURL=Registration.js.map