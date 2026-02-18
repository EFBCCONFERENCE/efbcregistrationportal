// Backend type definitions aligned with frontend

export interface Kid {
  firstName: string;
  lastName: string;
  badgeName: string;
  age: number;
  price?: number; // Admin-adjusted price per kid
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
  date: string; // End date (kept for backward compatibility)
  startDate?: string; // Start date
  activities?: Array<{ name: string; seatLimit?: number }> | string[]; // Support both formats for backward compatibility
  location?: string;
  description?: string | string[];
  createdAt?: string;
  updatedAt?: string;
  spousePricing?: Array<{ label: string; price: number; startDate?: string; endDate?: string }>;
  registrationPricing?: Array<{ label: string; price: number; startDate?: string; endDate?: string }>;
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
  
  // Personal Information
  firstName: string;
  lastName: string;
  badgeName: string;
  email: string;
  secondaryEmail?: string;
  organization: string;
  jobTitle: string;
  address: string; // Legacy field, kept for backward compatibility
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
  
  // Conference Events
  wednesdayActivity: 'Golf Tournament' | 'Fishing' | 'Networking' | 'None';
  wednesdayActivityWaitlisted?: boolean;
  wednesdayActivityWaitlistedAt?: string;
  golfHandicap?: string;
  clubRentals?: string;
  massageTimeSlot?: string;
  pickleballEquipment?: boolean;
  spouseBreakfast?: boolean;

  // Pricing tier tracking (stored server-side)
  registrationTierLabel?: string;
  spouseTierLabel?: string;
  spouseAddedAt?: string;
  kidsTierLabel?: string;
  kidsAddedAt?: string;
  
  // Conference Meals
  wednesdayReception: 'I will attend' | 'I will NOT attend';
  thursdayBreakfast: 'I will attend' | 'I will NOT attend';
  thursdayLunch: 'I will attend' | 'I will NOT attend';
  thursdayReception: 'I will attend' | 'I will NOT attend';
  fridayBreakfast: 'I will attend' | 'I will NOT attend';
  fridayDinner: 'I will attend' | 'I will NOT attend';
  dietaryRestrictions?: string;
  specialRequests?: string;
  
  // Additional Information
  transportationMethod?: string; // Driving or Flying
  transportationDetails?: string; // Text box for transportation details
  stayingAtBeachClub?: boolean; // Will you be staying at the Beach Club Resort?
  accommodationDetails?: string; // Text box if not staying at Beach Club
  dietaryRequirements?: string[]; // Array of dietary requirements (Dairy Free, Gluten Free, etc.)
  dietaryRequirementsOther?: string; // Text box for "Other" dietary requirement
  specialPhysicalNeeds?: boolean; // Do you have any special physical needs?
  specialPhysicalNeedsDetails?: string; // Text box for special physical needs details
  
  // Spouse Information
  spouseFirstName?: string;
  spouseLastName?: string;
  spouseDinnerTicket: boolean;
  
  // Kids Information (new - supports multiple kids)
  kids?: Kid[];
  kidsTotalPrice?: number; // Admin-adjusted total price for all kids
  
  // Child Information (legacy - kept for backward compatibility)
  childFirstName?: string;
  childLastName?: string;
  childLunchTicket?: boolean;
  
  // Payment Information
  totalPrice: number;
  paymentMethod: 'Card' | 'Check';
  paid?: boolean;
  paidAt?: string;
  squarePaymentId?: string;
  spousePaymentId?: string;
  spousePaidAt?: string;
  kidsPaymentId?: string | string[]; // Support both formats for backward compatibility
  kidsPaidAt?: string;
  
  // Discount Information
  discountCode?: string;
  discountAmount?: number;
  
  // Group Assignment
  groupAssigned?: number;
  
  // Pending Payment Information
  originalTotalPrice?: number;
  paidAmount?: number;
  pendingPaymentAmount?: number;
  pendingPaymentReason?: string;
  pendingPaymentCreatedAt?: string;
  
  // Legacy fields for backward compatibility
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

// API Response interfaces
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

// Request interfaces
export interface CreateEventRequest {
  year: number;
  name: string;
  date: string; // End date
  startDate?: string; // Start date
  activities?: string[];
  location?: string;
  description?: string | string[];
  spousePricing?: Array<{ label: string; price: number; startDate?: string; endDate?: string }>;
  registrationPricing?: Array<{ label: string; price: number; startDate?: string; endDate?: string }>;
  breakfastPrice?: number;
  breakfastEndDate?: string;
}

export interface UpdateEventRequest extends Partial<CreateEventRequest> {}

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
  address: string; // Legacy field, kept for backward compatibility
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
  // Computed server-side when seat limits are reached
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

export interface UpdateRegistrationRequest extends Partial<CreateRegistrationRequest> {}

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

export interface UpdateDiscountCodeRequest extends Partial<CreateDiscountCodeRequest> {}

export interface CreateGroupRequest {
  eventId: number;
  category: string;
  name: string;
  members?: number[];
}

export interface UpdateGroupRequest extends Partial<CreateGroupRequest> {}

// Query interfaces
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

// Authentication interfaces
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