import { Registration as IRegistration } from '../types';

export class Registration {
  public id?: number;
  public userId: number;
  public eventId: number;
  public firstName: string;
  public lastName: string;
  public badgeName: string;
  public email: string;
  public secondaryEmail?: string;
  public organization: string;
  public jobTitle: string;
  public address: string; // Legacy field, kept for backward compatibility
  public addressStreet?: string;
  public city?: string;
  public state?: string;
  public zipCode?: string;
  public country?: string;
  public mobile: string;
  public officePhone?: string;
  public isFirstTimeAttending: boolean;
  public companyType: string;
  public companyTypeOther?: string;
  public emergencyContactName?: string;
  public emergencyContactPhone?: string;
  public wednesdayActivity: 'Golf Tournament' | 'Fishing' | 'Networking' | 'None';
  public wednesdayActivityWaitlisted?: boolean;
  public wednesdayActivityWaitlistedAt?: string;
  public wednesdayReception: 'I will attend' | 'I will NOT attend';
  public thursdayBreakfast: 'I will attend' | 'I will NOT attend';
  public thursdayLunch: 'I will attend' | 'I will NOT attend';
  public thursdayReception: 'I will attend' | 'I will NOT attend';
  public fridayBreakfast: 'I will attend' | 'I will NOT attend';
  public fridayDinner: 'I will attend' | 'I will NOT attend';
  public dietaryRestrictions?: string;
  public specialRequests?: string;
  public transportationMethod?: string;
  public transportationDetails?: string;
  public stayingAtBeachClub?: boolean;
  public accommodationDetails?: string;
  public dietaryRequirements?: string[];
  public dietaryRequirementsOther?: string;
  public specialPhysicalNeeds?: boolean;
  public specialPhysicalNeedsDetails?: string;
  public clubRentals?: string;
  public golfHandicap?: string;
  public massageTimeSlot?: string;
  public pickleballEquipment?: boolean;
  public spouseBreakfast?: boolean;
  public tuesdayEarlyReception?: 'I will attend' | 'I will NOT attend';
  public spouseFirstName?: string;
  public spouseLastName?: string;
  public spouseDinnerTicket: boolean;
  public kids?: Array<{ firstName: string; lastName: string; badgeName: string; age: number; price?: number; lunchTicket?: boolean }>;
  public kidsTotalPrice?: number;
  public childFirstName?: string;
  public childLastName?: string;
  public childLunchTicket?: boolean;
  public totalPrice: number;
  public paymentMethod: 'Card' | 'Check';
  public name: string;
  public category: string;
  public createdAt?: string;
  public updatedAt?: string;
  public status?: 'active' | 'cancelled';
  public cancellationReason?: string;
  public cancellationAt?: string;
  public paid?: boolean;
  public paidAt?: string;
  public squarePaymentId?: string;
  public spousePaymentId?: string;
  public spousePaidAt?: string;
  public kidsPaymentId?: string | string[]; // Support both single string (backward compat) and array
  public kidsPaidAt?: string;
  public groupAssigned?: number;
  public discountCode?: string;
  public discountAmount?: number;
  public originalTotalPrice?: number;
  public paidAmount?: number;
  public pendingPaymentAmount?: number;
  public pendingPaymentReason?: string;
  public pendingPaymentCreatedAt?: string;

  // Helper method to format dates for MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
  private formatDateForDB(dateValue: string | Date | undefined): string {
    if (!dateValue) {
      return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    if (isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  constructor(data: Partial<IRegistration>) {
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
    this.addressStreet = (data as any).addressStreet;
    this.city = (data as any).city;
    this.state = (data as any).state;
    this.zipCode = (data as any).zipCode;
    this.country = (data as any).country;
    this.mobile = data.mobile || '';
    this.officePhone = data.officePhone;
    this.isFirstTimeAttending = data.isFirstTimeAttending || false;
    this.companyType = data.companyType || '';
    this.companyTypeOther = data.companyTypeOther;
    this.emergencyContactName = data.emergencyContactName;
    this.emergencyContactPhone = data.emergencyContactPhone;
    this.wednesdayActivity = data.wednesdayActivity || 'None';
    this.wednesdayActivityWaitlisted = (data as any).wednesdayActivityWaitlisted ?? (data as any).wednesday_activity_waitlisted ?? false;
    this.wednesdayActivityWaitlistedAt = (data as any).wednesdayActivityWaitlistedAt ?? (data as any).wednesday_activity_waitlisted_at ?? undefined;
    this.wednesdayReception = data.wednesdayReception || 'I will attend';
    this.thursdayBreakfast = data.thursdayBreakfast || 'I will attend';
    // Support both thursdayLunch/thursdayLuncheon and thursdayReception/thursdayDinner for frontend compatibility
    this.thursdayLunch = (data as any).thursdayLunch || (data as any).thursdayLuncheon || 'I will attend';
    this.thursdayReception = (data as any).thursdayReception || (data as any).thursdayDinner || 'I will attend';
    this.fridayBreakfast = data.fridayBreakfast || 'I will attend';
    this.fridayDinner = data.fridayDinner || 'I will attend';
    this.dietaryRestrictions = data.dietaryRestrictions;
    this.specialRequests = (data as any).specialRequests;
    this.transportationMethod = (data as any).transportationMethod;
    this.transportationDetails = (data as any).transportationDetails;
    this.stayingAtBeachClub = (data as any).stayingAtBeachClub !== undefined ? (data as any).stayingAtBeachClub : undefined;
    this.accommodationDetails = (data as any).accommodationDetails;
    this.dietaryRequirements = (data as any).dietaryRequirements || undefined;
    this.dietaryRequirementsOther = (data as any).dietaryRequirementsOther;
    this.specialPhysicalNeeds = (data as any).specialPhysicalNeeds !== undefined ? (data as any).specialPhysicalNeeds : undefined;
    this.specialPhysicalNeedsDetails = (data as any).specialPhysicalNeedsDetails;
    // Handle clubRentals as string (preference or 'I will bring my own')
    // Support backward compatibility with boolean values
    const cr = (data as any).clubRentals;
    if (typeof cr === 'boolean') {
      this.clubRentals = cr ? undefined : 'I will bring my own';
    } else if (typeof cr === 'string') {
      this.clubRentals = cr || undefined;
    } else {
      this.clubRentals = undefined;
    }
    this.spouseBreakfast = (data as any).spouseBreakfast ?? false;
    this.tuesdayEarlyReception = (data as any).tuesdayEarlyReception ?? 'I will attend';
    this.golfHandicap = (data as any).golfHandicap;
    this.massageTimeSlot = (data as any).massageTimeSlot;
    const pbe: any = (data as any).pickleballEquipment;
    // Only set pickleballEquipment if it's explicitly provided (true/false), otherwise leave it undefined
    if (pbe !== undefined && pbe !== null) {
      this.pickleballEquipment = pbe === true || pbe === 'Yes' || pbe === 'yes' || pbe === 1;
    } else {
      this.pickleballEquipment = undefined;
    }
    this.spouseFirstName = data.spouseFirstName;
    this.spouseLastName = data.spouseLastName;
    // Accept boolean or "Yes"/"No" and normalize to boolean
    const sdt: any = (data as any).spouseDinnerTicket;
    this.spouseDinnerTicket = sdt === true || sdt === 'Yes' || sdt === 'yes' || sdt === 1;
    this.kids = (data as any).kids || undefined;
    this.kidsTotalPrice = (data as any).kidsTotalPrice ?? undefined;
    this.discountCode = (data as any).discountCode;
    this.discountAmount = (data as any).discountAmount ?? undefined;
    this.childFirstName = (data as any).childFirstName;
    this.childLastName = (data as any).childLastName;
    const clt: any = (data as any).childLunchTicket;
    this.childLunchTicket = clt === true || clt === 'Yes' || clt === 'yes' || clt === 1 || false;
    this.totalPrice = data.totalPrice || 0;
    this.paymentMethod = data.paymentMethod || 'Card';
    this.name = data.name || `${this.firstName} ${this.lastName}`;
    this.category = data.category || 'Networking';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    // optional cancellation fields
    this.status = (data as any).status as any;
    this.cancellationReason = (data as any).cancellationReason as any;
    this.cancellationAt = (data as any).cancellationAt as any;
    this.paid = (data as any).paid as any;
    this.paidAt = (data as any).paidAt ?? (data as any).paid_at ?? undefined;
    this.squarePaymentId = (data as any).squarePaymentId as any;
    this.spousePaymentId = (data as any).spousePaymentId ?? (data as any).spouse_payment_id ?? undefined;
    this.spousePaidAt = (data as any).spousePaidAt ?? (data as any).spouse_paid_at ?? undefined;
    // Handle both string (legacy) and array (new) formats for kidsPaymentId
    const kidsPaymentIdRaw = (data as any).kidsPaymentId ?? (data as any).kids_payment_id;
    if (kidsPaymentIdRaw !== undefined && kidsPaymentIdRaw !== null) {
      if (typeof kidsPaymentIdRaw === 'string') {
        // Try to parse as JSON array, fallback to single string
        try {
          const parsed = JSON.parse(kidsPaymentIdRaw);
          this.kidsPaymentId = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // Not JSON, treat as single payment ID
          this.kidsPaymentId = [kidsPaymentIdRaw];
        }
      } else if (Array.isArray(kidsPaymentIdRaw)) {
        this.kidsPaymentId = kidsPaymentIdRaw;
      } else {
        this.kidsPaymentId = [String(kidsPaymentIdRaw)];
      }
    }
    this.kidsPaidAt = (data as any).kidsPaidAt ?? (data as any).kids_paid_at ?? undefined;
    this.groupAssigned = (data as any).groupAssigned ?? (data as any).group_assigned ?? undefined;
    this.originalTotalPrice = (data as any).originalTotalPrice ?? (data as any).original_total_price ?? undefined;
    this.paidAmount = (data as any).paidAmount ?? (data as any).paid_amount ?? undefined;
    this.pendingPaymentAmount = (data as any).pendingPaymentAmount ?? (data as any).pending_payment_amount ?? undefined;
    this.pendingPaymentReason = (data as any).pendingPaymentReason ?? (data as any).pending_payment_reason ?? undefined;
    this.pendingPaymentCreatedAt = (data as any).pendingPaymentCreatedAt ?? (data as any).pending_payment_created_at ?? undefined;
  }

  // Convert to JSON
  toJSON(): IRegistration {
    const base: any = {
      id: this.id!,
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
      thursdayLuncheon: this.thursdayLunch, // Map for frontend compatibility
      thursdayReception: this.thursdayReception,
      thursdayDinner: this.thursdayReception, // Map for frontend compatibility
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
    
    if (this.discountCode) (base as any).discountCode = this.discountCode;
    if (this.discountAmount !== undefined) (base as any).discountAmount = this.discountAmount;
    if (this.status) (base as any).status = this.status;
    if (this.cancellationReason) (base as any).cancellationReason = this.cancellationReason;
    if (this.cancellationAt) (base as any).cancellationAt = this.cancellationAt;
    if (this.tuesdayEarlyReception) (base as any).tuesdayEarlyReception = this.tuesdayEarlyReception;
    if (typeof this.paid === 'boolean') (base as any).paid = this.paid;
    if (this.paid) (base as any).paidAt = this.paidAt || null;
    if (this.squarePaymentId) (base as any).squarePaymentId = this.squarePaymentId;
    if (this.spousePaymentId) (base as any).spousePaymentId = this.spousePaymentId;
    if (this.spousePaidAt) (base as any).spousePaidAt = this.spousePaidAt;
    if (this.kidsPaymentId) (base as any).kidsPaymentId = this.kidsPaymentId;
    if (this.kidsPaidAt) (base as any).kidsPaidAt = this.kidsPaidAt;
    if (this.groupAssigned) (base as any).groupAssigned = this.groupAssigned;
    if (this.originalTotalPrice !== undefined) (base as any).originalTotalPrice = this.originalTotalPrice;
    if (this.paidAmount !== undefined) (base as any).paidAmount = this.paidAmount;
    if (this.pendingPaymentAmount !== undefined) (base as any).pendingPaymentAmount = this.pendingPaymentAmount;
    if (this.pendingPaymentReason) (base as any).pendingPaymentReason = this.pendingPaymentReason;
    if (this.pendingPaymentCreatedAt) (base as any).pendingPaymentCreatedAt = this.pendingPaymentCreatedAt;
    return base as any;
  }

  // Helper to convert undefined to null for MySQL compatibility
  private nullIfUndefined<T>(value: T): T | null {
    return value === undefined ? null : value;
  }

  // Convert to database format
  toDatabase(): any {
    // Exclude id from update payload (it's used in WHERE clause, not SET)
    // Convert all undefined values to null for MySQL compatibility
    const payload: any = {
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
    
    // Add created_at only for new registrations (when id is not set)
    if (!this.id) {
      payload.created_at = this.formatDateForDB(this.createdAt || new Date().toISOString());
    }
    
    return payload;
  }

  // Create from database row
  static fromDatabase(row: any): Registration {
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
          } catch (e) {
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
        // Parse kids from JSON or migrate from legacy fields
        if (row.kids_data) {
          try {
            // Check if it's already an object (MySQL JSON columns may return as objects)
            if (typeof row.kids_data === 'string') {
              return JSON.parse(row.kids_data);
            } else if (typeof row.kids_data === 'object') {
              return row.kids_data;
            }
            return undefined;
          } catch (e) {
            console.error('Error parsing kids_data:', e);
            return undefined;
          }
        } else if (row.child_first_name || row.child_last_name) {
          // Migrate legacy single child to array
          return [{
            firstName: row.child_first_name || '',
            lastName: row.child_last_name || '',
            badgeName: `${row.child_first_name || ''} ${row.child_last_name || ''}`.trim(),
            age: 0, // Unknown age for legacy data
            lunchTicket: !!row.child_lunch_ticket,
          }];
        }
        return undefined;
      })(),
      kidsTotalPrice: row.kids_total_price ?? undefined,
      discountCode: row.discount_code,
      discountAmount: row.discount_amount ?? undefined,
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
      // Legacy fields are not mapped from DB in this version
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      category: row.wednesday_activity || 'Networking',
    });
  }
}
