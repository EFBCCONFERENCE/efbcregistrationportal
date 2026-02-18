export interface Kid {
    firstName: string;
    lastName: string;
    badgeName: string;
    age: number;
    price?: number;
    lunchTicket?: boolean;
}
export interface User {
    id: number;
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'user' | 'guest';
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
}
export interface Event {
    id: number;
    year: number;
    name: string;
    date: string;
    startDate?: string;
    activities?: Array<{
        name: string;
        seatLimit?: number;
    }> | string[];
    location?: string;
    description?: string | string[];
    createdAt?: string;
    updatedAt?: string;
    spousePricing?: Array<{
        label: string;
        price: number;
        startDate?: string;
        endDate?: string;
    }>;
    registrationPricing?: Array<{
        label: string;
        price: number;
        startDate?: string;
        endDate?: string;
    }>;
    breakfastPrice?: number;
    breakfastEndDate?: string;
}
export interface Registration {
    id: number;
    userId: number;
    eventId: number;
    status?: 'active' | 'cancelled';
    cancellationReason?: string;
    cancellationAt?: string;
    tuesdayEarlyReception?: 'I will attend' | 'I will NOT attend';
    firstName: string;
    lastName: string;
    badgeName: string;
    email: string;
    secondaryEmail?: string;
    organization: string;
    jobTitle: string;
    address: string;
    addressStreet?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    mobile: string;
    officePhone?: string;
    isFirstTimeAttending: boolean;
    companyType: string;
    companyTypeOther?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    wednesdayActivity: 'Golf Tournament' | 'Fishing' | 'Networking' | 'None';
    wednesdayActivityWaitlisted?: boolean;
    wednesdayActivityWaitlistedAt?: string;
    golfHandicap?: string;
    clubRentals?: string;
    massageTimeSlot?: string;
    pickleballEquipment?: boolean;
    spouseBreakfast?: boolean;
    registrationTierLabel?: string;
    spouseTierLabel?: string;
    spouseAddedAt?: string;
    kidsTierLabel?: string;
    kidsAddedAt?: string;
    wednesdayReception: 'I will attend' | 'I will NOT attend';
    thursdayBreakfast: 'I will attend' | 'I will NOT attend';
    thursdayLunch: 'I will attend' | 'I will NOT attend';
    thursdayReception: 'I will attend' | 'I will NOT attend';
    fridayBreakfast: 'I will attend' | 'I will NOT attend';
    fridayDinner: 'I will attend' | 'I will NOT attend';
    dietaryRestrictions?: string;
    specialRequests?: string;
    transportationMethod?: string;
    transportationDetails?: string;
    stayingAtBeachClub?: boolean;
    accommodationDetails?: string;
    dietaryRequirements?: string[];
    dietaryRequirementsOther?: string;
    specialPhysicalNeeds?: boolean;
    specialPhysicalNeedsDetails?: string;
    spouseFirstName?: string;
    spouseLastName?: string;
    spouseDinnerTicket: boolean;
    kids?: Kid[];
    kidsTotalPrice?: number;
    childFirstName?: string;
    childLastName?: string;
    childLunchTicket?: boolean;
    totalPrice: number;
    paymentMethod: 'Card' | 'Check';
    paid?: boolean;
    paidAt?: string;
    squarePaymentId?: string;
    spousePaymentId?: string;
    spousePaidAt?: string;
    kidsPaymentId?: string | string[];
    kidsPaidAt?: string;
    discountCode?: string;
    discountAmount?: number;
    groupAssigned?: number;
    originalTotalPrice?: number;
    paidAmount?: number;
    pendingPaymentAmount?: number;
    pendingPaymentReason?: string;
    pendingPaymentCreatedAt?: string;
    name: string;
    category: string;
    createdAt?: string;
    updatedAt?: string;
}
export interface Group {
    id: number;
    eventId: number;
    category: string;
    name: string;
    members: number[];
    createdAt?: string;
    updatedAt?: string;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface CreateEventRequest {
    year: number;
    name: string;
    date: string;
    startDate?: string;
    activities?: string[];
    location?: string;
    description?: string | string[];
    spousePricing?: Array<{
        label: string;
        price: number;
        startDate?: string;
        endDate?: string;
    }>;
    registrationPricing?: Array<{
        label: string;
        price: number;
        startDate?: string;
        endDate?: string;
    }>;
    breakfastPrice?: number;
    breakfastEndDate?: string;
}
export interface UpdateEventRequest extends Partial<CreateEventRequest> {
}
export interface CreateRegistrationRequest {
    userId: number;
    eventId: number;
    firstName: string;
    lastName: string;
    badgeName: string;
    email: string;
    secondaryEmail?: string;
    organization: string;
    jobTitle: string;
    address: string;
    addressStreet?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    mobile: string;
    officePhone?: string;
    isFirstTimeAttending: boolean;
    companyType: string;
    companyTypeOther?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    wednesdayActivity: 'Golf Tournament' | 'Fishing' | 'Networking' | 'None';
    wednesdayActivityWaitlisted?: boolean;
    wednesdayActivityWaitlistedAt?: string;
    golfHandicap?: string;
    clubRentals?: string;
    wednesdayReception: 'I will attend' | 'I will NOT attend';
    tuesdayEarlyReception?: 'I will attend' | 'I will NOT attend';
    thursdayBreakfast: 'I will attend' | 'I will NOT attend';
    thursdayLunch: 'I will attend' | 'I will NOT attend';
    thursdayReception: 'I will attend' | 'I will NOT attend';
    fridayBreakfast: 'I will attend' | 'I will NOT attend';
    fridayDinner: 'I will attend' | 'I will NOT attend';
    dietaryRestrictions?: string;
    specialRequests?: string;
    spouseFirstName?: string;
    spouseLastName?: string;
    spouseDinnerTicket: boolean;
    totalPrice: number;
    paymentMethod: 'Card' | 'Check';
    name: string;
    category: string;
}
export interface UpdateRegistrationRequest extends Partial<CreateRegistrationRequest> {
}
export interface DiscountCode {
    id?: number;
    code: string;
    eventId: number;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    expiryDate?: string;
    usageLimit?: number;
    usedCount?: number;
    createdAt?: string;
    updatedAt?: string;
}
export interface CreateDiscountCodeRequest {
    code: string;
    eventId: number;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    expiryDate?: string;
    usageLimit?: number;
}
export interface UpdateDiscountCodeRequest extends Partial<CreateDiscountCodeRequest> {
}
export interface CreateGroupRequest {
    eventId: number;
    category: string;
    name: string;
    members?: number[];
}
export interface UpdateGroupRequest extends Partial<CreateGroupRequest> {
}
export interface EventQuery {
    page?: number;
    limit?: number;
    year?: number;
    search?: string;
}
export interface RegistrationQuery {
    page?: number;
    limit?: number;
    eventId?: number;
    category?: string;
    search?: string;
}
export interface GroupQuery {
    page?: number;
    limit?: number;
    eventId?: number;
    category?: string;
    search?: string;
}
export interface LoginRequest {
    email: string;
    password: string;
}
export interface RegisterRequest {
    name: string;
    email: string;
    password: string;
    role?: 'admin' | 'user' | 'guest';
}
export interface AuthResponse {
    success: boolean;
    user?: Omit<User, 'password'>;
    token?: string;
    message?: string;
    error?: string;
}
export interface CreateUserRequest {
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'user' | 'guest';
}
export interface UpdateUserRequest extends Partial<CreateUserRequest> {
    isActive?: boolean;
}
//# sourceMappingURL=index.d.ts.map