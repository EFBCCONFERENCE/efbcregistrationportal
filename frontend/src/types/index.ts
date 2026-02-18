// Global type definitions

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
  role?: 'admin' | 'user' | 'guest';
}

export interface Event {
  id: number;
  year: number;
  name: string;
  date: string; // End date (kept for backward compatibility)
  startDate?: string; // Start date
  endDate?: string; // Alias for date
  activities?: Array<{ name: string; seatLimit?: number }> | string[]; // Support both formats for backward compatibility
  location?: string;
  description?: string[];
  createdAt?: string;
  updatedAt?: string;
  spousePricing?: Array<{ label: string; price: number; startDate?: string; endDate?: string }>;
  registrationPricing?: Array<{ label: string; price: number; startDate?: string; endDate?: string }>;
  breakfastPrice?: number;
  breakfastEndDate?: string;
  childLunchPrice?: number;
  kidsPricing?: Array<{ label: string; price: number; startDate?: string; endDate?: string }>;
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
  wednesdayActivity: string;
  wednesdayActivityWaitlisted?: boolean;
  wednesdayActivityWaitlistedAt?: string;
  golfHandicap?: string;
  clubRentals?: string;
  massageTimeSlot?: '8:00 AM- 10:00 AM' | '10:00 AM - 12:00 PM' | '12:00 PM - 2:00 PM' | '2:00 PM - 4:00 PM';
  pickleballEquipment?: boolean;

  // Pricing tier tracking (optional; used for reporting/export)
  registrationTierLabel?: string;
  spouseTierLabel?: string;
  spouseAddedAt?: string;
  kidsTierLabel?: string;
  kidsAddedAt?: string;
  
  // Conference Meals
  wednesdayReception: 'I will attend' | 'I will NOT attend';
  thursdayBreakfast: 'I will attend' | 'I will NOT attend';
  thursdayLuncheon: 'I will attend' | 'I will NOT attend';
  thursdayDinner: 'I will attend' | 'I will NOT attend';
  fridayBreakfast: 'I will attend' | 'I will NOT attend';
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
  
  // Spouse/Guest Information
  spouseDinnerTicket: boolean;
  spouseFirstName?: string;
  spouseLastName?: string;
  spouseBreakfast?: boolean;
  
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
}

export interface Team {
  id: string;
  name: string;
  sport: string;
  members: string[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  teamId?: string;
  sport: string;
}

export interface Sport {
  id: string;
  name: string;
  description: string;
  maxPlayers: number;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Form types
export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

// Constants
export const CATEGORIES = ["Golf", "Fishing", "Networking"];

export const COMPANY_TYPES = [
  "Utility Company",
  "Media",
  "Trade Association",
  "Supplier: Ash (Fly, Bottom, Coal) ",
  "Supplier: Broker",
  "Supplier: Coal Mine/Coal Producer",
  "Supplier: Consultant",
  "Supplier: Gas",
  "Supplier: Laboratory",
  "Supplier: LDC (Local distribution company)",
  "Supplier: Lime/Cement",
  "Supplier: Petcoke",
  "Supplier: Pipeline Operator",
  "Supplier: Rail",
  "Supplier: Shipping",
  "Supplier: Solar",
  "Supplier: Terminal",
  "Supplier: Trader",
  "Supplier: Transportation",
  "Other"
];

export const WEDNESDAY_ACTIVITIES = [
  "Golf Tournament",
  "Fishing", 
  "Networking",
  "None"
];

export const GOLF_CLUB_PREFERENCES = [
  "Right-handed Mens",
  "Left-handed Mens", 
  "Right-handed Ladies",
  "Left-handed Ladies"
];

export const MASSAGE_TIME_SLOTS = [
  "8:00 AM- 10:00 AM",
  "10:00 AM - 12:00 PM",
  "12:00 PM - 2:00 PM",
  "2:00 PM - 4:00 PM"
];

export const MEAL_OPTIONS = [
  "I will attend",
  "I will NOT attend"
];

export const PAYMENT_METHODS = [
  "Card",
  "Check"
];

// Helper functions
export const isEventExpired = (eventDate: string): boolean => new Date(eventDate) < new Date();
