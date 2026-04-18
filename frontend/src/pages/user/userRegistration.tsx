import React, { useEffect, useMemo, useState } from 'react';
import {
  Event,
  Registration,
  COMPANY_TYPES,
  MASSAGE_TIME_SLOTS,
  MEAL_OPTIONS,
  GOLF_CLUB_PREFERENCES,
  isEventExpired,
} from '../../types';
import { formatDateShort } from '../../utils/dateUtils';
import { getActivityNames, getActivitySeatLimit } from '../../utils/eventUtils';
import { COUNTRY_OPTIONS, getRegionOptionsForCountry, normalizeCountryCode } from '../../utils/addressOptions';
import apiClient from '../../services/apiClient';
import '../../styles/RegistrationModal.css';
import {
  getCurrentEasternTimeMs as getCurrentEasternTime,
  pickActivePricingTier,
} from '../../utils/pricingTierUtils';

/** Per-tier line amounts; sum aligns with tier-based package total (before discount code). */
function computePackageLineAmounts(opts: {
  registrationPricing: any[];
  spousePricing: any[];
  kidsPricing: any[];
  spouseSelected: boolean;
  kidsCount: number;
}) {
  const now = getCurrentEasternTime();
  const reg = pickActivePricingTier(opts.registrationPricing, now);
  const conference = typeof reg?.price === 'number' ? reg.price : 675;
  let spouse = 0;
  if (opts.spouseSelected) {
    const st = pickActivePricingTier(opts.spousePricing, now);
    spouse = typeof st?.price === 'number' ? st.price : 0;
  }
  let kids = 0;
  if (opts.kidsCount > 0) {
    const kt = pickActivePricingTier(opts.kidsPricing, now);
    const per = typeof kt?.price === 'number' ? kt.price : 0;
    kids = per * opts.kidsCount;
  }
  return { conference, spouse, kids, sum: conference + spouse + kids };
}

interface UserRegistrationProps {
  events: Event[];
  registrations: Registration[];
  user: { id: number; name: string; email: string };
  targetEventId?: number | null;
 
  scrollToPaymentSection?: boolean;
  onScrollToPaymentSectionConsumed?: () => void;
  onBack: () => void;
  onSave: (regData: Registration) => void;
  isAdminEdit?: boolean; // True when admin is editing/creating registration
}

export const UserRegistration: React.FC<UserRegistrationProps> = ({
  events,
  registrations,
  user,
  targetEventId,
  scrollToPaymentSection = false,
  onScrollToPaymentSectionConsumed,
  onBack,
  onSave,
  isAdminEdit = false,
}) => {
  const toBooleanYesNo = (v: any): boolean => v === true || v === 'Yes' || v === 'yes' || v === 1;
  const activeEvent = useMemo(() => events.find(e => !isEventExpired(e.date)), [events]);
  const event = useMemo(
    () => (targetEventId ? (events.find(e => e.id === targetEventId) || activeEvent) : activeEvent),
    [events, targetEventId, activeEvent]
  );

  const registration = useMemo(
    () => (event ? registrations.find(r => r.userId === user.id && r.eventId === event.id) || null : null),
    [registrations, user, event]
  );

  useEffect(() => {
    if (!scrollToPaymentSection || isAdminEdit) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById('registration-payment-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      onScrollToPaymentSectionConsumed?.();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [scrollToPaymentSection, isAdminEdit, event?.id, onScrollToPaymentSectionConsumed]);

  const isEditing = !!registration;
  const isAlreadyPaid = !!(registration as any)?.paid;
  const hadSpouseTicket = toBooleanYesNo((registration as any)?.spouseDinnerTicket);
  const hadSpousePayment = !!(registration as any)?.spousePaymentId;
  const hadKidsBefore = registration?.kids && Array.isArray(registration.kids) && registration.kids.length > 0;
  const originalKidsCount = registration?.kids && Array.isArray(registration.kids) ? registration.kids.length : 0;

  /** Server-aggregated seat counts (required for normal users who only load /registrations/mine) */
  const [activitySeatSummary, setActivitySeatSummary] = useState<{
    loaded: boolean;
    byName: Record<string, { confirmedCount: number; waitlistedCount: number }>;
  }>({ loaded: false, byName: {} });

  useEffect(() => {
    if (!event?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get<{
          eventId: number;
          activities: { activityName: string; confirmedCount: number; waitlistedCount: number }[];
        }>(`/registrations/event/${event.id}/activity-seat-summary`);
        if (cancelled || !res.success || !res.data) return;
        const byName: Record<string, { confirmedCount: number; waitlistedCount: number }> = {};
        for (const row of res.data.activities || []) {
          byName[row.activityName] = {
            confirmedCount: row.confirmedCount,
            waitlistedCount: row.waitlistedCount,
          };
        }
        setActivitySeatSummary({ loaded: true, byName });
      } catch (e) {
        console.error('Failed to load activity seat summary', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event?.id, registrations]);

  // Helper function to count active registrations for an activity
  const getActivityRegistrationCount = (activityName: string): number => {
    if (!event) return 0;
    if (activitySeatSummary.loaded) {
      return activitySeatSummary.byName[activityName]?.confirmedCount ?? 0;
    }
    return registrations.filter(reg =>
      reg.eventId === event.id &&
      reg.wednesdayActivity === activityName &&
      !(reg as any).wednesdayActivityWaitlisted &&
      reg.status !== 'cancelled' &&
      !(reg as any).cancellationAt
    ).length;
  };

  // Helper function to count waitlisted registrations for an activity
  const getActivityWaitlistCount = (activityName: string): number => {
    if (!event) return 0;
    if (activitySeatSummary.loaded) {
      return activitySeatSummary.byName[activityName]?.waitlistedCount ?? 0;
    }
    return registrations.filter(reg =>
      reg.eventId === event.id &&
      reg.wednesdayActivity === activityName &&
      (reg as any).wednesdayActivityWaitlisted &&
      reg.status !== 'cancelled' &&
      !(reg as any).cancellationAt
    ).length;
  };

  const [formData, setFormData] = useState<Partial<Registration>>({
    // Personal Information
    firstName: registration?.firstName || user.name.split(' ')[0] || '',
    lastName: registration?.lastName || user.name.split(' ').slice(1).join(' ') || '',
    badgeName: registration?.badgeName || '',
    email: registration?.email || user.email || '',
    secondaryEmail: registration?.secondaryEmail || '',
    organization: registration?.organization || '',
    jobTitle: registration?.jobTitle || '',
    address: registration?.address || '',
    mobile: registration?.mobile || '',
    officePhone: registration?.officePhone || '',
    isFirstTimeAttending: registration?.isFirstTimeAttending !== undefined ? registration.isFirstTimeAttending : undefined,
    companyType: registration?.companyType || '',
    companyTypeOther: registration?.companyTypeOther || '',
    emergencyContactName: registration?.emergencyContactName || '',
    emergencyContactPhone: registration?.emergencyContactPhone || '',

    // Conference Events
    wednesdayActivity: registration?.wednesdayActivity || '',
    golfHandicap: registration?.golfHandicap || '',
    massageTimeSlot: registration?.massageTimeSlot || '8:00 AM- 10:00 AM',
    pickleballEquipment: (registration as any)?.pickleballEquipment !== undefined ? (registration as any).pickleballEquipment : undefined,

    // Conference Meals
    wednesdayReception: (registration?.wednesdayReception || '') as any,
    thursdayBreakfast: (registration?.thursdayBreakfast || '') as any,
    thursdayLuncheon: (registration?.thursdayLuncheon || '') as any,
    thursdayDinner: (registration?.thursdayDinner || '') as any,
    fridayBreakfast: (registration?.fridayBreakfast || '') as any,
    tuesdayEarlyReception: (registration as any)?.tuesdayEarlyReception || '',
    dietaryRestrictions: registration?.dietaryRestrictions || '',
    specialRequests: (registration as any)?.specialRequests || '',
    
    // Additional Information
    transportationMethod: registration?.transportationMethod || '',
    transportationDetails: registration?.transportationDetails || '',
    stayingAtBeachClub: registration?.stayingAtBeachClub !== undefined ? registration.stayingAtBeachClub : undefined,
    accommodationDetails: registration?.accommodationDetails || '',
    dietaryRequirements: registration?.dietaryRequirements || [],
    dietaryRequirementsOther: registration?.dietaryRequirementsOther || '',
    specialPhysicalNeeds: registration?.specialPhysicalNeeds !== undefined ? registration.specialPhysicalNeeds : undefined,
    specialPhysicalNeedsDetails: registration?.specialPhysicalNeedsDetails || '',

    // Spouse/Guest Information
    spouseDinnerTicket: toBooleanYesNo((registration as any)?.spouseDinnerTicket) || false,
    spouseFirstName: registration?.spouseFirstName || '',
    spouseLastName: registration?.spouseLastName || '',
    
    // Kids Information
    kids: registration?.kids || [],
    // kidsTotalPrice: registration?.kidsTotalPrice, // Commented out - using coupon codes instead
    
    // Child Information (legacy)
    // childLunchTicket: (registration as any)?.childLunchTicket || false,
    // childFirstName: (registration as any)?.childFirstName || '',
    // childLastName: (registration as any)?.childLastName || '',

    // Update Notes — always start empty; new entries are appended server-side
    updateNotes: '',

    // Payment Information
    // Backend stores the discounted price in totalPrice, so use it directly
    totalPrice: registration?.totalPrice || 675,
    paymentMethod: registration?.paymentMethod || 'Card',
    paid: registration?.paid ?? false,
    discountCode: registration?.discountCode,
    discountAmount: registration?.discountAmount,
    // Pending Payment Information
    originalTotalPrice: registration?.originalTotalPrice,
    paidAmount: registration?.paidAmount,
    pendingPaymentAmount: registration?.pendingPaymentAmount,
    pendingPaymentReason: registration?.pendingPaymentReason,
    pendingPaymentCreatedAt: registration?.pendingPaymentCreatedAt,

    // Legacy fields
    name: registration?.name || user.name,
    category: registration?.category || 'Networking',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [squareSdkLoading, setSquareSdkLoading] = useState(false);
  // Address fields (split) - prefer new separate fields, fallback to parsing legacy address field
  const parseAddress = (addr?: string) => {
    const res = { street:'', city:'', state:'', zip:'', country:'' };
    if (!addr) return res;
    const lines = String(addr).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (lines[0]) res.street = lines[0];
    if (lines[1]) {
      const m = lines[1].match(/^(.*?)[,]\s*(\w{2,})\s*(\w+)?$/);
      if (m) { res.city = m[1] || ''; res.state = m[2] || ''; res.zip = (m[3]||''); }
      else { res.city = lines[1]; }
    }
    if (lines[2]) res.country = lines[2];
    return res;
  };

  const toTitleCaseName = (value: string): string => {
    const raw = (value || '').toString().trim();
    if (!raw) return '';
    const normalized = raw.replace(/\s+/g, ' ').toLowerCase();
    return normalized
      .split(' ')
      .map((word) =>
        word
          .split(/([-'])/)
          .map((p) => {
            if (p === '-' || p === "'") return p;
            if (!p) return p;
            return p.charAt(0).toUpperCase() + p.slice(1);
          })
          .join('')
      )
      .join(' ');
  };
  // Use new separate fields if available, otherwise parse legacy address field
  // Since these are separate database fields, always prefer them if the registration object exists
  // The fields may be null/undefined, but we should still use the structure
  const initialAddr = registration && (
    registration.addressStreet !== undefined || 
    registration.city !== undefined || 
    registration.state !== undefined || 
    registration.zipCode !== undefined || 
    registration.country !== undefined
  )
    ? {
        street: registration.addressStreet ?? '',
        city: registration.city ?? '',
        state: registration.state ?? '',
        zip: registration.zipCode ?? '',
        country: normalizeCountryCode(registration.country ?? '') || 'US'
      }
    : (() => {
        const parsed = parseAddress(registration?.address);
        return { ...parsed, country: normalizeCountryCode(parsed.country) || 'US' };
      })();
  const [addrStreet, setAddrStreet] = useState<string>(initialAddr.street);
  const [addrCity, setAddrCity] = useState<string>(initialAddr.city);
  const [addrState, setAddrState] = useState<string>(initialAddr.state);
  const [addrZip, setAddrZip] = useState<string>(initialAddr.zip);
  const initialCountryRaw = String(registration?.country ?? initialAddr.country ?? '').trim();
  const initialCountryCode = normalizeCountryCode(initialCountryRaw);
  const initialCountrySelection = initialCountryCode
    ? initialCountryCode
    : (initialCountryRaw ? 'OTHER' : 'US');
  const initialCountryOther = !initialCountryCode && initialCountryRaw ? initialCountryRaw : '';

  const [addrCountrySelection, setAddrCountrySelection] = useState<string>(initialCountrySelection);
  const [addrCountryOther, setAddrCountryOther] = useState<string>(initialCountryOther);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cardInstance, setCardInstance] = useState<any | null>(null);
  
  const regionOptions = useMemo(() => getRegionOptionsForCountry(addrCountrySelection), [addrCountrySelection]);
  const showRegionDropdown = !!regionOptions && regionOptions.length > 0;

  const countryForStorage = useMemo(() => {
    if (addrCountrySelection === 'OTHER') return addrCountryOther.trim();
    return (addrCountrySelection || '').trim();
  }, [addrCountrySelection, addrCountryOther]);

  const countryCodeForPayments = useMemo(() => {
    // Square expects 2-letter country codes. If "Other" is selected, fall back to US.
    // Convert UK to GB for Square payments (Square uses ISO 3166-1 alpha-2, which uses GB for United Kingdom)
    const c = (addrCountrySelection || '').trim().toUpperCase();
    if (c === 'UK') return 'GB'; // Square expects GB, not UK
    return c.length === 2 ? c : 'US';
  }, [addrCountrySelection]);
  const [discountCodeInput, setDiscountCodeInput] = useState(registration?.discountCode || '');
  const [discountCodeData, setDiscountCodeData] = useState<any | null>(null);
  const [discountCodeError, setDiscountCodeError] = useState('');
  const [validatingDiscountCode, setValidatingDiscountCode] = useState(false);
  const [priceOverrideEnabled, setPriceOverrideEnabled] = useState(false);
  const [priceOverride, setPriceOverride] = useState<number>(registration?.totalPrice || 675);
  const [priceOverrideReason, setPriceOverrideReason] = useState<string>(registration?.pendingPaymentReason || '');
  
  // Load discount code data if registration already has a discount code
  useEffect(() => {
    if (registration?.discountCode && event && !discountCodeData) {
      validateDiscountCode(registration.discountCode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registration?.discountCode, event?.id]);
  
  // Club rentals state: track if user needs rentals (Yes/No) and their preference
  const initialNeedsRentals = useMemo(() => {
    const cr = registration?.clubRentals;
    // If clubRentals is a string and not 'I will bring my own', they need rentals
    return !!(cr && cr !== 'I will bring my own' && cr !== '');
  }, [registration?.clubRentals]);
  
  const [needsClubRentals, setNeedsClubRentals] = useState<boolean>(initialNeedsRentals);
  const [golfClubPreference, setGolfClubPreference] = useState<string>(
    initialNeedsRentals && registration?.clubRentals ? registration.clubRentals : ''
  );
  
  // Update needsClubRentals when registration changes
  useEffect(() => {
    const cr = registration?.clubRentals;
    const needs = !!(cr && cr !== 'I will bring my own' && cr !== '');
    setNeedsClubRentals(needs);
    if (needs && cr) {
      setGolfClubPreference(cr);
    } else {
      setGolfClubPreference('');
    }
  }, [registration?.clubRentals]);

  const spouseDinnerSelected = !!formData.spouseDinnerTicket;
  const kids = useMemo(() => formData.kids || [], [formData.kids]);
  // const childLunchSelected = !!(formData as any).childLunchTicket;
  const regTiers = useMemo(() => event?.registrationPricing || [], [event?.registrationPricing]);
  const spouseTiers = useMemo(() => event?.spousePricing || [], [event?.spousePricing]);
  const kidsTiers = useMemo(() => event?.kidsPricing || [], [event?.kidsPricing]);

  /** Tier line items for payment summary (before discount); sum should match formData.totalPrice when pricing is in sync. */
  const checkoutPackageLines = useMemo(
    () =>
      computePackageLineAmounts({
        registrationPricing: regTiers,
        spousePricing: spouseTiers,
        kidsPricing: kidsTiers,
        spouseSelected: !!formData.spouseDinnerTicket,
        kidsCount: kids.length,
      }),
    [regTiers, spouseTiers, kidsTiers, formData.spouseDinnerTicket, kids.length]
  );

  // Calculate original price (what was already paid/stored for existing registrations)
  const originalPrice = useMemo(() => {
    if (registration) {
      // For existing registrations, use the stored price as original (what was already paid)
      return registration.totalPrice || 675;
    }
    // For new registrations, calculate base price only (no spouse, no kids)
    if (event) {
      const now = getCurrentEasternTime();
      const regActive = pickActivePricingTier(event.registrationPricing || [], now);
      return typeof regActive?.price === 'number' ? regActive.price : 675;
    }
    return 675;
  }, [registration, event]);
  // const childLunchPrice = useMemo(() => event?.childLunchPrice || 0, [event?.childLunchPrice]);

  // Ensure spouse ticket stays checked if payment was made
  useEffect(() => {
    if (hadSpousePayment && !formData.spouseDinnerTicket) {
      setFormData(prev => ({ ...prev, spouseDinnerTicket: true }));
    }
  }, [hadSpousePayment, formData.spouseDinnerTicket]);

  useEffect(() => {
    // Skip price calculation if override is enabled (admin is manually setting price)
    if (priceOverrideEnabled) {
      return;
    }
    
    // Skip price calculation if there is a pending payment amount,
    // UNLESS new kids or spouse are being added on top of the existing pending balance.
    if ((formData.pendingPaymentAmount || 0) > 0) {
      const isAddingSpouseOverPending = formData.spouseDinnerTicket && !hadSpouseTicket;
      const isAddingKidsOverPending = kids.length > originalKidsCount;
      if (!isAddingSpouseOverPending && !isAddingKidsOverPending) {
        return;
      }
    }

    // For existing registrations (paid or unpaid), preserve price unless something is being added
    if (isEditing && registration) {
      // Check if spouse is being added
      const isAddingSpouse = formData.spouseDinnerTicket && !hadSpouseTicket;
      // Check if kids are being added
      const isAddingKids = kids.length > originalKidsCount;
      
      // If nothing is being added, ALWAYS preserve the original price
      if (!isAddingSpouse && !isAddingKids) {
        const storedPrice = registration?.totalPrice || 675;
        // Always set to stored price to prevent any recalculation
        setFormData(prev => {
          // Force update to stored price when viewing existing registration with no changes
          return { ...prev, totalPrice: storedPrice };
        });
        return;
      }
      
      // If spouse is being added (without kids), calculate only spouse price
      if (isAddingSpouse && !isAddingKids) {
        const originalRegPrice = registration?.totalPrice || 675;
        const now = getCurrentEasternTime();
        const spouseActive = pickActivePricingTier(spouseTiers, now);
        const spousePrice = typeof spouseActive?.price === 'number' ? spouseActive.price : 0;
        const total = originalRegPrice + spousePrice;
        setFormData(prev => ({ ...prev, totalPrice: total }));
        return;
      }
      
      // If kids are being added (without spouse), calculate only kids price
      if (isAddingKids && !isAddingSpouse) {
        const originalRegPrice = registration?.totalPrice || 675;
        const now = getCurrentEasternTime();
        const kidsActive = pickActivePricingTier(kidsTiers, now);
        const pricePerKid = typeof kidsActive?.price === 'number' ? kidsActive.price : 0;
        const newKidsCount = kids.length - originalKidsCount;
        const kidsPrice = pricePerKid * newKidsCount;
        const total = originalRegPrice + kidsPrice;
        setFormData(prev => ({ ...prev, totalPrice: total }));
        return;
      }
      
      // If both spouse and kids are being added, calculate both
      if (isAddingSpouse && isAddingKids) {
        const originalRegPrice = registration?.totalPrice || 675;
        const now = getCurrentEasternTime();
        const spouseActive = pickActivePricingTier(spouseTiers, now);
        const spousePrice = typeof spouseActive?.price === 'number' ? spouseActive.price : 0;
        const kidsActive = pickActivePricingTier(kidsTiers, now);
        const pricePerKid = typeof kidsActive?.price === 'number' ? kidsActive.price : 0;
        const newKidsCount = kids.length - originalKidsCount;
        const kidsPrice = pricePerKid * newKidsCount;
        const total = originalRegPrice + spousePrice + kidsPrice;
        setFormData(prev => ({ ...prev, totalPrice: total }));
        return;
      }
    }

    // For paid registrations where spouse is being added, preserve original registration price
    // and only calculate spouse tier price
    if (isAlreadyPaid && formData.spouseDinnerTicket && !hadSpouseTicket) {
      const originalRegPrice = registration?.totalPrice || 675;
      const now = getCurrentEasternTime();
      const spouseActive = pickActivePricingTier(spouseTiers, now);
      const spousePrice = typeof spouseActive?.price === 'number' ? spouseActive.price : 0;
      const total = originalRegPrice + spousePrice;
      setFormData(prev => ({ ...prev, totalPrice: total }));
      return;
    }

    // For new registrations or unpaid registrations, calculate price based on current tier (matches backend)
    const now = getCurrentEasternTime();
    const regActive = pickActivePricingTier(regTiers, now);
    const spouseActive = pickActivePricingTier(spouseTiers, now);
    const kidsActive = pickActivePricingTier(kidsTiers, now);
    let total = typeof regActive?.price === 'number' ? regActive.price : 675;
    if (spouseDinnerSelected) total += typeof spouseActive?.price === 'number' ? spouseActive.price : 0;
    if (kids.length > 0) {
      const kidsPrice = (typeof kidsActive?.price === 'number' ? kidsActive.price : 0) * kids.length;
      total += kidsPrice;
    }
    // if (childLunchSelected) total += childLunchPrice;
    setFormData(prev => ({ ...prev, totalPrice: total }));
  }, [isEditing, isAlreadyPaid, hadSpouseTicket, formData.spouseDinnerTicket, /* formData.kidsTotalPrice, */ spouseDinnerSelected, registration, registration?.totalPrice, kids, kids.length, originalKidsCount, /* childLunchSelected, childLunchPrice, */ regTiers, spouseTiers, kidsTiers, priceOverrideEnabled, formData.pendingPaymentAmount]);

  // Sync priceOverride with calculated price when override is disabled
  useEffect(() => {
    // When override is disabled, sync priceOverride with the calculated price
    // This ensures the comparison always shows the correct values when spouse/children are added
    if (!priceOverrideEnabled && formData.totalPrice !== undefined) {
      setPriceOverride(formData.totalPrice);
    }
  }, [formData.totalPrice, priceOverrideEnabled]);

  const validateForm = () => {
    // Skip all required field validation for admin edits - all fields are optional
    if (isAdminEdit) {
      const newErrors: Record<string, string> = {};
      // Only validate email format if email is provided
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Please enter a valid email address';
      }
      // Only validate secondary email format if secondary email is provided
      if (formData.secondaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.secondaryEmail)) {
        newErrors.secondaryEmail = 'Please enter a valid email address';
      }
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }
    
    const newErrors: Record<string, string> = {};
    if (!formData.firstName?.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName?.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.badgeName?.trim()) newErrors.badgeName = 'Badge name is required';
    if (!formData.email?.trim()) newErrors.email = 'Email is required';
    if (formData.secondaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.secondaryEmail)) {
      newErrors.secondaryEmail = 'Please enter a valid email address';
    }
    if (!formData.organization?.trim()) newErrors.organization = 'Organization is required';
    if (!formData.jobTitle?.trim()) newErrors.jobTitle = 'Job title is required';
    if (!addrStreet.trim()) newErrors.address = 'Address is required';
    if (!addrCity.trim()) newErrors.city = 'City is required';
    if (!addrState.trim()) newErrors.state = 'State is required';
    if (!addrZip.trim()) newErrors.zip = 'Zip code is required';
    if (!addrCountrySelection.trim()) {
      newErrors.country = 'Country is required';
    } else if (addrCountrySelection === 'OTHER' && !addrCountryOther.trim()) {
      newErrors.country = 'Please enter your country';
    }
    if (!formData.mobile?.trim()) newErrors.mobile = 'Mobile number is required';
    if (!formData.companyType?.trim()) newErrors.companyType = 'Please choose an option';
    if (!formData.wednesdayActivity?.trim()) newErrors.wednesdayActivity = 'Please choose an option';
    // Validate first time attending
    if (formData.isFirstTimeAttending === undefined || formData.isFirstTimeAttending === null) {
      (newErrors as any).isFirstTimeAttending = 'Please choose an option';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    // Validate golf club preference if rentals are needed
    if (needsClubRentals && !golfClubPreference?.trim()) {
      newErrors.golfClubPreference = 'Please choose an option';
    }
    // Validate massage time slot if Massage is selected
    if ((formData.wednesdayActivity || '').toLowerCase().includes('massage') && !(formData as any).massageTimeSlot?.trim()) {
      newErrors.massageTimeSlot = 'Please choose an option';
    }
    // Validate pickleball equipment if Pickleball is selected
    if ((formData.wednesdayActivity || '').toLowerCase().includes('pickleball') && (formData as any).pickleballEquipment === undefined) {
      (newErrors as any).pickleballEquipment = 'Please choose an option';
    }
    if (formData.spouseDinnerTicket) {
      if (!formData.spouseFirstName?.trim()) newErrors.spouseFirstName = 'Spouse first name is required';
      if (!formData.spouseLastName?.trim()) newErrors.spouseLastName = 'Spouse last name is required';
    }
    // Validate kids
    if (kids.length > 0) {
      kids.forEach((kid, idx) => {
        if (!kid.firstName?.trim()) (newErrors as any)[`kid_${idx}_firstName`] = 'First name is required';
        if (!kid.lastName?.trim()) (newErrors as any)[`kid_${idx}_lastName`] = 'Last name is required';
        if (!kid.badgeName?.trim()) (newErrors as any)[`kid_${idx}_badgeName`] = 'Badge name is required';
        if (!kid.age || kid.age < 0) (newErrors as any)[`kid_${idx}_age`] = 'Valid age is required';
      });
    }
    // if ((formData as any).childLunchTicket) {
    //   if (!(formData as any).childFirstName?.trim()) (newErrors as any).childFirstName = 'Child first name is required';
    //   if (!(formData as any).childLastName?.trim()) (newErrors as any).childLastName = 'Child last name is required';
    // }
    // Validate conference meals (mandatory - must select an option, not "Choose")
    const mealFields = [
      { field: 'tuesdayEarlyReception', label: 'Tuesday Early Arrivals Reception' },
      { field: 'wednesdayReception', label: 'Wednesday Welcome Reception' },
      { field: 'thursdayBreakfast', label: 'Thursday Breakfast' },
      { field: 'thursdayLuncheon', label: 'Thursday Luncheon' },
      { field: 'thursdayDinner', label: 'Thursday Dinner' },
      { field: 'fridayBreakfast', label: 'Friday Breakfast' }
    ];
    mealFields.forEach(({ field, label }) => {
      const value = (formData as any)[field];
      if (!value || !value.trim() || value === '') {
        (newErrors as any)[field] = 'Please choose an option';
      }
    });
    
    // Validate additional information fields
    if (!formData.transportationMethod?.trim()) {
      (newErrors as any).transportationMethod = 'Please choose an option';
    }
    if (formData.stayingAtBeachClub === undefined || formData.stayingAtBeachClub === null) {
      (newErrors as any).stayingAtBeachClub = 'Please choose an option';
    }
    if (formData.stayingAtBeachClub === false && !formData.accommodationDetails?.trim()) {
      (newErrors as any).accommodationDetails = 'Please specify where you will be staying';
    }
    // If "None" is selected, it's valid even if it's the only option
    if (!formData.dietaryRequirements || formData.dietaryRequirements.length === 0) {
      (newErrors as any).dietaryRequirements = 'Please select at least one option';
    } else if ((formData.dietaryRequirements || []).includes('None') && formData.dietaryRequirements.length === 1) {
      // "None" alone is valid, so remove any error
      delete (newErrors as any).dietaryRequirements;
    }
    if ((formData.dietaryRequirements || []).includes('Other') && !formData.dietaryRequirementsOther?.trim()) {
      (newErrors as any).dietaryRequirementsOther = 'Please specify other dietary requirement';
    }
    if (formData.specialPhysicalNeeds === undefined || formData.specialPhysicalNeeds === null) {
      (newErrors as any).specialPhysicalNeeds = 'Please choose an option';
    }
    if (formData.specialPhysicalNeeds === true && !formData.specialPhysicalNeedsDetails?.trim()) {
      (newErrors as any).specialPhysicalNeedsDetails = 'Please specify your special physical needs';
    }
    
    setErrors(newErrors);
    
    // If there are errors, scroll to the first error field
    if (Object.keys(newErrors).length > 0) {
      // Map error field names to their HTML element IDs
      const fieldIdMap: Record<string, string> = {
        firstName: 'firstName',
        lastName: 'lastName',
        badgeName: 'badgeName',
        email: 'email',
        secondaryEmail: 'secondaryEmail',
        organization: 'organization',
        jobTitle: 'jobTitle',
        address: 'addrStreet', // address error maps to addrStreet ID
        city: 'addrCity',
        state: 'addrState',
        transportationMethod: 'transportationMethod',
        accommodationDetails: 'accommodationDetails',
        dietaryRequirements: 'dietaryRequirements',
        dietaryRequirementsOther: 'dietaryRequirementsOther',
        specialPhysicalNeeds: 'specialPhysicalNeeds',
        specialPhysicalNeedsDetails: 'specialPhysicalNeedsDetails',
        zip: 'addrZip',
        country: 'addrCountry',
        mobile: 'mobile',
        companyType: 'companyType',
        wednesdayActivity: 'wednesdayActivity',
        golfClubPreference: 'golfClubPreference',
        massageTimeSlot: 'massageTimeSlot',
        pickleballEquipment: 'pickleballEquipment', // Will need special handling for radio buttons
        isFirstTimeAttending: 'isFirstTimeAttending', // Will need special handling for radio buttons
        spouseFirstName: 'spouseFirstName',
        spouseLastName: 'spouseLastName',
        tuesdayEarlyReception: 'tuesdayEarly',
        wednesdayReception: 'wednesdayReception',
        thursdayBreakfast: 'thursdayBreakfast',
        thursdayLuncheon: 'thursdayLuncheon',
        thursdayDinner: 'thursdayDinner',
        fridayBreakfast: 'fridayBreakfast'
      };
      
      // Find the first error field
      const firstErrorField = Object.keys(newErrors)[0];
      const fieldId = fieldIdMap[firstErrorField];
      
      if (fieldId) {
        // Function to scroll to error field
        const scrollToError = () => {
          let element: HTMLElement | null = null;
          let focusableElement: HTMLElement | null = null;
          let errorMessageElement: HTMLElement | null = null;
          
          // Special handling for radio button fields (pickleballEquipment, isFirstTimeAttending, stayingAtBeachClub, specialPhysicalNeeds)
          if (firstErrorField === 'pickleballEquipment' || firstErrorField === 'isFirstTimeAttending' || firstErrorField === 'stayingAtBeachClub' || firstErrorField === 'specialPhysicalNeeds') {
            // Find the first radio button or the parent form-group
            const radioButtons = document.querySelectorAll(`input[name="${firstErrorField}"]`);
            if (radioButtons.length > 0) {
              const formGroup = radioButtons[0].closest('.form-group') as HTMLElement;
              element = formGroup;
              focusableElement = radioButtons[0] as HTMLElement;
              // Find the error message element
              errorMessageElement = formGroup?.querySelector('.error-message') as HTMLElement;
            }
          } else {
            // Try to find the element by ID
            const fieldElement = document.getElementById(fieldId);
            if (fieldElement) {
              // Find the parent form-group to scroll to (includes label and error message)
              const formGroup = fieldElement.closest('.form-group') as HTMLElement;
              element = formGroup || fieldElement;
              focusableElement = fieldElement;
              // Find the error message element within the form-group
              errorMessageElement = formGroup?.querySelector('.error-message') as HTMLElement;
            }
          }
          
          // Scroll to the error message if it exists, otherwise scroll to the form-group
          const scrollTarget = errorMessageElement || element;
          
          if (scrollTarget) {
            // Get the element's position relative to the viewport
            const rect = scrollTarget.getBoundingClientRect();
            const scrollY = window.scrollY || window.pageYOffset || 0;
            const absoluteElementTop = rect.top + scrollY;
            // Add some offset to ensure the error message is fully visible
            const offset = 100;
            const scrollPosition = absoluteElementTop - offset;
            
            // Scroll the window to show the error message
            window.scrollTo({
              top: Math.max(0, scrollPosition),
              behavior: 'smooth'
            });
            
            // Focus the input/select/textarea after scroll animation
            if (focusableElement) {
              setTimeout(() => {
                if (focusableElement instanceof HTMLInputElement || 
                    focusableElement instanceof HTMLSelectElement || 
                    focusableElement instanceof HTMLTextAreaElement) {
                  focusableElement.focus();
                }
              }, 600);
            }
            return true;
          }
          return false;
        };
        
        // Try to scroll immediately, then retry after React has updated the DOM
        requestAnimationFrame(() => {
          // First attempt after a short delay
          setTimeout(() => {
            if (!scrollToError()) {
              // If first attempt failed, retry after a longer delay to ensure React has rendered
              setTimeout(() => {
                scrollToError();
              }, 300);
            }
          }, 100);
        });
      }
    }
    
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    
    // Prevent unchecking spouse ticket if payment was made
    if (hadSpousePayment && !formData.spouseDinnerTicket) {
      alert('Cannot remove spouse ticket that has already been paid for. You can only edit the spouse information.');
      return;
    }
    
    if (!validateForm()) return;
    
    // For card payments, ensure payment is completed before allowing submission
    // Allow admin to save without payment completion
    const paymentMethod = formData.paymentMethod || 'Card';
    if (!isAdminEdit && paymentMethod === 'Card' && !isAlreadyPaid) {
      alert('Please complete the payment using the "Pay & Complete Registration" button.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Compose address string for backward compatibility (legacy field)
      const composedAddress = [
        addrStreet.trim(),
        `${addrCity.trim()}${addrCity ? ', ' : ''}${addrState.trim()} ${addrZip.trim()}`.trim(),
        countryForStorage
      ].filter(Boolean).join('\n');

      // Determine clubRentals value based on user selection
      const isGolf = (formData.wednesdayActivity || '').toLowerCase().includes('golf');
      const isMassage = (formData.wednesdayActivity || '').toLowerCase().includes('massage');
      const isPickleball = (formData.wednesdayActivity || '').toLowerCase().includes('pickleball');
      
      const clubRentalsValue = isGolf 
        ? (needsClubRentals && golfClubPreference 
            ? golfClubPreference 
            : (!needsClubRentals ? 'I will bring my own' : undefined))
        : undefined; // Clear if not golf
      
      const golfHandicapValue = isGolf ? formData.golfHandicap : undefined; // Clear if not golf
      const massageTimeSlotValue = isMassage ? (formData as any).massageTimeSlot : undefined; // Clear if not massage
      // Only set pickleballEquipment if pickleball is selected, otherwise explicitly set to null
      const pickleballEquipmentValue = isPickleball ? ((formData as any).pickleballEquipment !== undefined ? (formData as any).pickleballEquipment : null) : null;

      const isCompPayment = paymentMethod === 'Comp';
      const registrationData: Registration = {
        ...(registration?.id ? { id: registration.id } : {} as any),
        userId: user.id,
        eventId: event.id,
        ...formData,
        // Force spouse ticket to true if payment was made
        spouseDinnerTicket: hadSpousePayment ? true : formData.spouseDinnerTicket,
        specialRequests: (formData as any).specialRequests || '',
        clubRentals: clubRentalsValue,
        golfHandicap: golfHandicapValue,
        massageTimeSlot: massageTimeSlotValue,
        pickleballEquipment: pickleballEquipmentValue,
        badgeName: toTitleCaseName(formData.badgeName || ''),
        kids: kids.map(kid => ({
          ...kid,
          badgeName: toTitleCaseName(kid.badgeName || ''),
        })),
        address: composedAddress, // Legacy field for backward compatibility
        addressStreet: addrStreet.trim(),
        city: addrCity.trim(),
        state: addrState.trim(),
        zipCode: addrZip.trim(),
        country: countryForStorage,
        tuesdayEarlyReception: (formData as any).tuesdayEarlyReception || '',
        // childFirstName: (formData as any).childFirstName || '',
        // childLastName: (formData as any).childLastName || '',
        // childLunchTicket: !!(formData as any).childLunchTicket,
        name: `${formData.firstName} ${formData.lastName}`,
        category: formData.wednesdayActivity || 'Networking',
        // Preserve payment information from existing registration if already paid
        ...(isAlreadyPaid ? {
          paid: (registration as any)?.paid,
          squarePaymentId: (registration as any)?.squarePaymentId,
          spousePaymentId: (registration as any)?.spousePaymentId,
        } : {}),
        // Include discount code if provided
        discountCode: discountCodeInput.trim() || undefined,
        discountAmount: discountCodeData && typeof discountCodeData.discountValue === 'number' ? (() => {
          let discountAmount = 0;
          if (discountCodeData.discountType === 'percentage') {
            discountAmount = ((formData.totalPrice || 0) * discountCodeData.discountValue) / 100;
          } else {
            discountAmount = discountCodeData.discountValue;
          }
          return discountAmount;
        })() : undefined,
        // Include admin price override if enabled
        ...(isAdminEdit && priceOverrideEnabled ? { totalPrice: priceOverride } : {}),
        ...(isAdminEdit && priceOverrideEnabled && priceOverrideReason ? { pendingPaymentReason: priceOverrideReason } : {}),
      } as Registration;
      if (isCompPayment) {
        registrationData.totalPrice = 0;
        (registrationData as any).paid = true;
        (registrationData as any).paidAt = new Date().toISOString();
        (registrationData as any).squarePaymentId = undefined;
        (registrationData as any).spousePaymentId = undefined;
        (registrationData as any).kidsPaymentId = undefined;
        (registrationData as any).pendingPaymentAmount = 0;
        (registrationData as any).pendingPaymentReason = undefined;
      }
      
      // For card payments, ensure payment was completed (has payment ID) - only check for new registrations
      // Allow admin to save without payment completion
      if (!isAdminEdit && (formData.paymentMethod || 'Card') === 'Card' && !isAlreadyPaid && !(registrationData as any).squarePaymentId) {
        alert('Payment must be completed before registration can be submitted. Please use the "Pay & Complete Registration" button.');
        setIsSubmitting(false);
        return;
      }
      
      onSave(registrationData);
      alert('Registration updated successfully');
      onBack();
    } catch (error) {
      console.error('Error saving registration:', error);
      alert('An error occurred while saving the registration. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSpousePayment = async () => {
    if (!event) return;
    if (!formData.spouseDinnerTicket) {
      alert('Please select spouse dinner ticket first.');
      return;
    }
    if (!formData.spouseFirstName || !formData.spouseLastName) {
      alert('Please enter spouse first and last name.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Ensure card is mounted with proper error handling
      let card;
      try {
        card = await ensureCardMounted();
      } catch (error: any) {
        const errorMsg = error?.message || 'Failed to initialize payment form';
        alert(`Payment Error: ${errorMsg}`);
        setIsSubmitting(false);
        return;
      }
      
      // Attempt tokenization with improved error handling
      let res;
      try {
        res = await card.tokenize();
      } catch (tokenizeError: any) {
        console.error('Tokenization exception (spouse):', tokenizeError);
        throw new Error('Failed to process card information. Please check your card details and try again.');
      }
      
      if (res.status !== 'OK') {
        const userFriendlyMessage = getTokenizationErrorMessage(res);
        throw new Error(userFriendlyMessage);
      }
      const nonce = res.token;
      
      // Calculate spouse-only price using Eastern Time to match backend
      const now = getCurrentEasternTime();
      const active = pickActivePricingTier(event.spousePricing || [], now);
      let spousePrice = typeof active?.price === 'number' ? active.price : 0;
      
      // Apply discount if discount code is valid
      if (discountCodeData && typeof discountCodeData.discountValue === 'number') {
        let discountAmount = 0;
        if (discountCodeData.discountType === 'percentage') {
          discountAmount = (spousePrice * discountCodeData.discountValue) / 100;
        } else {
          discountAmount = discountCodeData.discountValue;
        }
        spousePrice = Math.max(0, spousePrice - discountAmount);
      }
      
      const baseAmountCents = Math.round(spousePrice * 100);
      // Backend will calculate the final amount with fee when applyCardFee is true
      const payRes = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/payments/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: baseAmountCents, // Backend will add fee
          baseAmountCents,
          applyCardFee: true, // Backend will apply 3.5% fee
          currency: 'USD',
          eventName: `${event?.name || 'EFBC Conference'} - Spouse Ticket`,
          nonce,
          buyerEmail: formData.email || undefined,
          buyerPhone: formData.mobile || formData.officePhone || undefined,
          billingAddress: {
            firstName: formData.firstName,
            lastName: formData.lastName,
          addressLine1: addrStreet,
            locality: addrCity,
            administrativeDistrictLevel1: addrState,
            postalCode: addrZip,
          country: countryCodeForPayments
          }
        })
      });
      
      if (!payRes.ok) {
        const errorData = await payRes.json().catch(() => ({ error: 'Network error or invalid response' }));
        const errorMessage = errorData?.error || errorData?.message || `Payment failed with status ${payRes.status}`;
        throw new Error(errorMessage);
      }
      
      const payload = await payRes.json();
      if (!payload?.success) {
        const errorMessage = payload?.error || payload?.message || 'Payment charge failed';
        throw new Error(errorMessage);
      }
      
      if (!payload?.paymentId) {
        throw new Error('Payment was processed but no payment ID was returned. Please contact support.');
      }
      
      if (payload?.status && payload.status !== 'COMPLETED') {
        throw new Error(`Payment status is ${payload.status}. Payment may not have been completed successfully.`);
      }
      const chargedAmountCents = Number(payload?.chargedAmountCents ?? Math.round(baseAmountCents * 1.035));
      const chargedAmount = Number.isFinite(chargedAmountCents) ? chargedAmountCents / 100 : spousePrice * 1.035;
      const existingPaidAmount = Number((registration as any)?.paidAmount || 0);
      
      // Update registration with spouse payment ID
      const composedAddress = [
        addrStreet.trim(),
        `${addrCity.trim()}${addrCity ? ', ' : ''}${addrState.trim()} ${addrZip.trim()}`.trim(),
        countryForStorage
      ].filter(Boolean).join('\n');
      
      const isGolf = (formData.wednesdayActivity || '').toLowerCase().includes('golf');
      const isMassage = (formData.wednesdayActivity || '').toLowerCase().includes('massage');
      const isPickleball = (formData.wednesdayActivity || '').toLowerCase().includes('pickleball');
      
      const clubRentalsValue = isGolf 
        ? (needsClubRentals && golfClubPreference 
            ? golfClubPreference 
            : (!needsClubRentals ? 'I will bring my own' : undefined))
        : undefined;
      
      const golfHandicapValue = isGolf ? formData.golfHandicap : undefined;
      const massageTimeSlotValue = isMassage ? (formData as any).massageTimeSlot : undefined;
      const pickleballEquipmentValue = isPickleball ? ((formData as any).pickleballEquipment !== undefined ? (formData as any).pickleballEquipment : null) : null;
      
      const registrationData: Registration = {
        ...(registration?.id ? { id: registration.id } : {} as any),
        userId: user.id,
        eventId: event.id,
        ...formData,
        totalPrice: formData.totalPrice || registration?.totalPrice || '0',
        badgeName: toTitleCaseName(formData.badgeName || ''),
        specialRequests: (formData as any).specialRequests || '',
        clubRentals: clubRentalsValue,
        golfHandicap: golfHandicapValue,
        massageTimeSlot: massageTimeSlotValue,
        pickleballEquipment: pickleballEquipmentValue,
        address: composedAddress,
        addressStreet: addrStreet.trim(),
        city: addrCity.trim(),
        state: addrState.trim(),
        zipCode: addrZip.trim(),
        country: countryForStorage,
        tuesdayEarlyReception: (formData as any).tuesdayEarlyReception || '',
        name: `${formData.firstName} ${formData.lastName}`,
        category: formData.wednesdayActivity || 'Networking',
        // Preserve existing payment info
        paid: (registration as any)?.paid,
        paidAmount: existingPaidAmount + chargedAmount,
        squarePaymentId: (registration as any)?.squarePaymentId,
        // Add spouse payment ID and timestamp
        spousePaymentId: payload.paymentId,
        spousePaidAt: new Date().toISOString(), // Set spouse payment timestamp
        // Include discount code if provided
        discountCode: discountCodeInput.trim() || undefined,
        discountAmount: discountCodeData && typeof discountCodeData.discountValue === 'number' ? (() => {
          const now = getCurrentEasternTime();
          const active = pickActivePricingTier(event.spousePricing || [], now);
          const spousePrice = typeof active?.price === 'number' ? active.price : 0;
          let discountAmount = 0;
          if (discountCodeData.discountType === 'percentage') {
            discountAmount = (spousePrice * discountCodeData.discountValue) / 100;
          } else {
            discountAmount = discountCodeData.discountValue;
          }
          return discountAmount;
        })() : undefined,
      } as Registration;
      
      onSave(registrationData);
      alert('Spouse ticket payment successful! Registration updated.');
      onBack();
    } catch (err: any) {
      console.error('Spouse payment error:', {
        message: err?.message,
        error: err,
        response: err?.response,
        stack: err?.stack
      });
      
      // Extract error message with priority: user-friendly message > Square error > generic message
      let errorMessage = err?.message || err?.response?.data?.error || 'Payment failed. Please check your card details and try again.';
      
      // If it's a tokenization error, it should already have a user-friendly message
      // Otherwise, provide a generic helpful message
      if (!errorMessage.includes('tokenization') && !errorMessage.includes('card') && !errorMessage.includes('declined')) {
        errorMessage = 'Payment failed. Please check your card details and try again, or contact support if the problem persists.';
      }
      
      alert(`Payment Error: ${errorMessage}`);
      setIsSubmitting(false);
    }
  };

  const handleKidsPayment = async () => {
    if (!event) return;
    if (!kids || kids.length === 0) {
      alert('Please add at least one child first.');
      return;
    }
    
    // Validate all kids have required fields
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i];
      if (!kid.firstName?.trim() || !kid.lastName?.trim() || !kid.badgeName?.trim() || !kid.age) {
        alert(`Please fill in all required fields for Child ${i + 1} (First Name, Last Name, Badge Name, and Age).`);
        return;
      }
    }
    
    setIsSubmitting(true);
    try {
      // Ensure card is mounted with proper error handling
      let card;
      try {
        card = await ensureCardMounted();
      } catch (error: any) {
        const errorMsg = error?.message || 'Failed to initialize payment form';
        alert(`Payment Error: ${errorMsg}`);
        setIsSubmitting(false);
        return;
      }
      
      // Attempt tokenization with improved error handling
      let res;
      try {
        res = await card.tokenize();
      } catch (tokenizeError: any) {
        console.error('Tokenization exception (kids):', tokenizeError);
        throw new Error('Failed to process card information. Please check your card details and try again.');
      }
      
      if (res.status !== 'OK') {
        const userFriendlyMessage = getTokenizationErrorMessage(res);
        throw new Error(userFriendlyMessage);
      }
      const nonce = res.token;
      
      // Calculate kids-only price using Eastern Time to match backend
      const now = getCurrentEasternTime();
      const active = pickActivePricingTier(event.kidsPricing || [], now);
      const pricePerKid = typeof active?.price === 'number' ? active.price : 0;
      // Only calculate price for NEW children being added
      const newKidsCount = kids.length - originalKidsCount;
      let kidsPrice = pricePerKid * newKidsCount;
      
      // Apply discount if discount code is valid
      if (discountCodeData && typeof discountCodeData.discountValue === 'number') {
        let discountAmount = 0;
        if (discountCodeData.discountType === 'percentage') {
          discountAmount = (kidsPrice * discountCodeData.discountValue) / 100;
        } else {
          discountAmount = discountCodeData.discountValue;
        }
        kidsPrice = Math.max(0, kidsPrice - discountAmount);
      }
      
      const baseAmountCents = Math.round(kidsPrice * 100);
      
      // Backend will calculate the final amount with fee when applyCardFee is true
      const payRes = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/payments/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: baseAmountCents, // Backend will add fee
          baseAmountCents,
          applyCardFee: true, // Backend will apply 3.5% fee
          currency: 'USD',
          eventName: `${event?.name || 'EFBC Conference'} - Children Registration (${kids.length} ${kids.length === 1 ? 'child' : 'children'})`,
          nonce,
          buyerEmail: formData.email || undefined,
          buyerPhone: formData.mobile || formData.officePhone || undefined,
          billingAddress: {
            firstName: formData.firstName,
            lastName: formData.lastName,
          addressLine1: addrStreet,
            locality: addrCity,
            administrativeDistrictLevel1: addrState,
            postalCode: addrZip,
          country: countryCodeForPayments
          }
        })
      });
      
      if (!payRes.ok) {
        const errorData = await payRes.json().catch(() => ({ error: 'Network error or invalid response' }));
        const errorMessage = errorData?.error || errorData?.message || `Payment failed with status ${payRes.status}`;
        throw new Error(errorMessage);
      }
      
      const payload = await payRes.json();
      if (!payload?.success) {
        const errorMessage = payload?.error || payload?.message || 'Payment charge failed';
        throw new Error(errorMessage);
      }
      
      if (!payload?.paymentId) {
        throw new Error('Payment was processed but no payment ID was returned. Please contact support.');
      }
      
      if (payload?.status && payload.status !== 'COMPLETED') {
        throw new Error(`Payment status is ${payload.status}. Payment may not have been completed successfully.`);
      }
      const chargedAmountCents = Number(payload?.chargedAmountCents ?? Math.round(baseAmountCents * 1.035));
      const chargedAmount = Number.isFinite(chargedAmountCents) ? chargedAmountCents / 100 : kidsPrice * 1.035;
      const existingPaidAmount = Number((registration as any)?.paidAmount || 0);
      
      // Update registration with kids payment ID
      const composedAddress = [
        addrStreet.trim(),
        `${addrCity.trim()}${addrCity ? ', ' : ''}${addrState.trim()} ${addrZip.trim()}`.trim(),
        countryForStorage
      ].filter(Boolean).join('\n');
      
      const isGolf = (formData.wednesdayActivity || '').toLowerCase().includes('golf');
      const isMassage = (formData.wednesdayActivity || '').toLowerCase().includes('massage');
      const isPickleball = (formData.wednesdayActivity || '').toLowerCase().includes('pickleball');
      
      const clubRentalsValue = isGolf 
        ? (needsClubRentals && golfClubPreference 
            ? golfClubPreference 
            : (!needsClubRentals ? 'I will bring my own' : undefined))
        : undefined;
      
      const golfHandicapValue = isGolf ? formData.golfHandicap : undefined;
      const massageTimeSlotValue = isMassage ? (formData as any).massageTimeSlot : undefined;
      const pickleballEquipmentValue = isPickleball ? ((formData as any).pickleballEquipment !== undefined ? (formData as any).pickleballEquipment : null) : null;
      
      const registrationData: Registration = {
        ...(registration?.id ? { id: registration.id } : {} as any),
        userId: user.id,
        eventId: event.id,
        ...formData,
        totalPrice: formData.totalPrice || registration?.totalPrice || '0',
        badgeName: toTitleCaseName(formData.badgeName || ''),
        specialRequests: (formData as any).specialRequests || '',
        clubRentals: clubRentalsValue,
        golfHandicap: golfHandicapValue,
        massageTimeSlot: massageTimeSlotValue,
        pickleballEquipment: pickleballEquipmentValue,
        address: composedAddress,
        addressStreet: addrStreet.trim(),
        city: addrCity.trim(),
        state: addrState.trim(),
        zipCode: addrZip.trim(),
        country: countryForStorage,
        tuesdayEarlyReception: (formData as any).tuesdayEarlyReception || '',
        name: `${formData.firstName} ${formData.lastName}`,
        category: formData.wednesdayActivity || 'Networking',
        // Preserve existing payment info
        paid: (registration as any)?.paid,
        paidAmount: existingPaidAmount + chargedAmount,
        squarePaymentId: (registration as any)?.squarePaymentId,
        spousePaymentId: (registration as any)?.spousePaymentId,
        spousePaidAt: (registration as any)?.spousePaidAt,
        // Append new kids payment ID to existing ones (handle both string and array)
        kidsPaymentId: (() => {
          const existing = (registration as any)?.kidsPaymentId;
          const existingIds = existing 
            ? (Array.isArray(existing) ? existing : [existing])
            : [];
          return [...existingIds, payload.paymentId];
        })(),
        kidsPaidAt: new Date().toISOString(), // Set kids payment timestamp
        // Include discount code if provided
        discountCode: discountCodeInput.trim() || undefined,
        discountAmount: discountCodeData && typeof discountCodeData.discountValue === 'number' ? (() => {
          const now = getCurrentEasternTime();
          const active = pickActivePricingTier(event.kidsPricing || [], now);
          const pricePerKid = typeof active?.price === 'number' ? active.price : 0;
          // Only calculate price for NEW children being added
          const newKidsCount = kids.length - originalKidsCount;
          const kidsPrice = pricePerKid * newKidsCount;
          let discountAmount = 0;
          if (discountCodeData.discountType === 'percentage') {
            discountAmount = (kidsPrice * discountCodeData.discountValue) / 100;
          } else {
            discountAmount = discountCodeData.discountValue;
          }
          return discountAmount;
        })() : undefined,
        kids: kids.map(kid => ({
          ...kid,
          badgeName: toTitleCaseName(kid.badgeName || ''),
        })),
      } as Registration;
      
      onSave(registrationData);
      alert(`Children registration payment successful! Registration updated.`);
      onBack();
    } catch (err: any) {
      console.error('Kids payment error:', {
        message: err?.message,
        error: err,
        response: err?.response,
        stack: err?.stack
      });
      
      // Extract error message with priority: user-friendly message > Square error > generic message
      let errorMessage = err?.message || err?.response?.data?.error || 'Payment failed. Please check your card details and try again.';
      
      // If it's a tokenization error, it should already have a user-friendly message
      // Otherwise, provide a generic helpful message
      if (!errorMessage.includes('tokenization') && !errorMessage.includes('card') && !errorMessage.includes('declined')) {
        errorMessage = 'Payment failed. Please check your card details and try again, or contact support if the problem persists.';
      }
      
      alert(`Payment Error: ${errorMessage}`);
      setIsSubmitting(false);
    }
  };

  const handleCombinedPayment = async () => {
    if (!event) return;
    if (!formData.spouseDinnerTicket) {
      alert('Please select spouse dinner ticket first.');
      return;
    }
    if (!formData.spouseFirstName || !formData.spouseLastName) {
      alert('Please enter spouse first and last name.');
      return;
    }
    if (!kids || kids.length === 0) {
      alert('Please add at least one child first.');
      return;
    }
    
    // Validate all kids have required fields
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i];
      if (!kid.firstName?.trim() || !kid.lastName?.trim() || !kid.badgeName?.trim() || !kid.age) {
        alert(`Please fill in all required fields for Child ${i + 1} (First Name, Last Name, Badge Name, and Age).`);
        return;
      }
    }
    
    setIsSubmitting(true);
    try {
      // Ensure card is mounted with proper error handling
      let card;
      try {
        card = await ensureCardMounted();
      } catch (error: any) {
        const errorMsg = error?.message || 'Failed to initialize payment form';
        alert(`Payment Error: ${errorMsg}`);
        setIsSubmitting(false);
        return;
      }
      
      // Attempt tokenization with improved error handling
      let res;
      try {
        res = await card.tokenize();
      } catch (tokenizeError: any) {
        console.error('Tokenization exception (combined):', tokenizeError);
        throw new Error('Failed to process card information. Please check your card details and try again.');
      }
      
      if (res.status !== 'OK') {
        const userFriendlyMessage = getTokenizationErrorMessage(res);
        throw new Error(userFriendlyMessage);
      }
      const nonce = res.token;
      
      // Calculate combined price (spouse + kids) using Eastern Time to match backend
      const now = getCurrentEasternTime();
      const spouseActive = pickActivePricingTier(event.spousePricing || [], now);
      const spousePrice = typeof spouseActive?.price === 'number' ? spouseActive.price : 0;
      const kidsActive = pickActivePricingTier(event.kidsPricing || [], now);
      const pricePerKid = typeof kidsActive?.price === 'number' ? kidsActive.price : 0;
      // Only calculate price for NEW children being added
      const newKidsCount = kids.length - originalKidsCount;
      const kidsPrice = pricePerKid * newKidsCount;
      
      let combinedPrice = spousePrice + kidsPrice;
      
      // Apply discount if discount code is valid
      if (discountCodeData && typeof discountCodeData.discountValue === 'number') {
        let discountAmount = 0;
        if (discountCodeData.discountType === 'percentage') {
          discountAmount = (combinedPrice * discountCodeData.discountValue) / 100;
        } else {
          discountAmount = discountCodeData.discountValue;
        }
        combinedPrice = Math.max(0, combinedPrice - discountAmount);
      }
      
      const baseAmountCents = Math.round(combinedPrice * 100);
      
      // Backend will calculate the final amount with fee when applyCardFee is true
      const payRes = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/payments/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: baseAmountCents, // Backend will add fee
          baseAmountCents,
          applyCardFee: true, // Backend will apply 3.5% fee
          currency: 'USD',
          eventName: `${event?.name || 'EFBC Conference'} - Spouse & Children Registration`,
          nonce,
          buyerEmail: formData.email || undefined,
          buyerPhone: formData.mobile || formData.officePhone || undefined,
          billingAddress: {
            firstName: formData.firstName,
            lastName: formData.lastName,
            addressLine1: addrStreet,
            locality: addrCity,
            administrativeDistrictLevel1: addrState,
            postalCode: addrZip,
            country: countryCodeForPayments
          }
        })
      });
      
      if (!payRes.ok) {
        const errorData = await payRes.json().catch(() => ({ error: 'Network error or invalid response' }));
        const errorMessage = errorData?.error || errorData?.message || `Payment failed with status ${payRes.status}`;
        throw new Error(errorMessage);
      }
      
      const payload = await payRes.json();
      if (!payload?.success) {
        const errorMessage = payload?.error || payload?.message || 'Payment charge failed';
        throw new Error(errorMessage);
      }
      
      if (!payload?.paymentId) {
        throw new Error('Payment was processed but no payment ID was returned. Please contact support.');
      }
      
      if (payload?.status && payload.status !== 'COMPLETED') {
        throw new Error(`Payment status is ${payload.status}. Payment may not have been completed successfully.`);
      }
      const chargedAmountCents = Number(payload?.chargedAmountCents ?? Math.round(baseAmountCents * 1.035));
      const chargedAmount = Number.isFinite(chargedAmountCents) ? chargedAmountCents / 100 : combinedPrice * 1.035;
      const existingPaidAmount = Number((registration as any)?.paidAmount || 0);
      
      // Update registration with combined payment ID (same ID for both spouse and kids)
      const composedAddress = [
        addrStreet.trim(),
        `${addrCity.trim()}${addrCity ? ', ' : ''}${addrState.trim()} ${addrZip.trim()}`.trim(),
        countryForStorage
      ].filter(Boolean).join('\n');
      
      const isGolf = (formData.wednesdayActivity || '').toLowerCase().includes('golf');
      const isMassage = (formData.wednesdayActivity || '').toLowerCase().includes('massage');
      const isPickleball = (formData.wednesdayActivity || '').toLowerCase().includes('pickleball');
      
      const clubRentalsValue = isGolf 
        ? (needsClubRentals && golfClubPreference 
            ? golfClubPreference 
            : (!needsClubRentals ? 'I will bring my own' : undefined))
        : undefined;
      
      const golfHandicapValue = isGolf ? formData.golfHandicap : undefined;
      const massageTimeSlotValue = isMassage ? (formData as any).massageTimeSlot : undefined;
      const pickleballEquipmentValue = isPickleball ? ((formData as any).pickleballEquipment !== undefined ? (formData as any).pickleballEquipment : null) : null;
      
      const paymentTimestamp = new Date().toISOString();
      
      const registrationData: Registration = {
        ...(registration?.id ? { id: registration.id } : {} as any),
        userId: user.id,
        eventId: event.id,
        ...formData,
        totalPrice: formData.totalPrice || registration?.totalPrice || '0',
        badgeName: toTitleCaseName(formData.badgeName || ''),
        specialRequests: (formData as any).specialRequests || '',
        clubRentals: clubRentalsValue,
        golfHandicap: golfHandicapValue,
        massageTimeSlot: massageTimeSlotValue,
        pickleballEquipment: pickleballEquipmentValue,
        address: composedAddress,
        addressStreet: addrStreet.trim(),
        city: addrCity.trim(),
        state: addrState.trim(),
        zipCode: addrZip.trim(),
        country: countryForStorage,
        tuesdayEarlyReception: (formData as any).tuesdayEarlyReception || '',
        name: `${formData.firstName} ${formData.lastName}`,
        category: formData.wednesdayActivity || 'Networking',
        // Preserve existing payment info
        paid: (registration as any)?.paid,
        paidAmount: existingPaidAmount + chargedAmount,
        squarePaymentId: (registration as any)?.squarePaymentId,
        // Append new payment ID to existing ones for combined payment (handle both string and array)
        spousePaymentId: (() => {
          const existing = (registration as any)?.spousePaymentId;
          const existingIds = existing 
            ? (Array.isArray(existing) ? existing : [existing])
            : [];
          return [...existingIds, payload.paymentId];
        })(),
        spousePaidAt: paymentTimestamp,
        kidsPaymentId: (() => {
          const existing = (registration as any)?.kidsPaymentId;
          const existingIds = existing 
            ? (Array.isArray(existing) ? existing : [existing])
            : [];
          return [...existingIds, payload.paymentId];
        })(),
        kidsPaidAt: paymentTimestamp, // Same timestamp for combined transaction
        // Include discount code if provided
        discountCode: discountCodeInput.trim() || undefined,
        discountAmount: discountCodeData && typeof discountCodeData.discountValue === 'number' ? (() => {
          const now = getCurrentEasternTime();
          const spouseActive = pickActivePricingTier(event.spousePricing || [], now);
          const spousePrice = typeof spouseActive?.price === 'number' ? spouseActive.price : 0;
          const kidsActive = pickActivePricingTier(event.kidsPricing || [], now);
          const pricePerKid = typeof kidsActive?.price === 'number' ? kidsActive.price : 0;
          // Only calculate price for NEW children being added
          const newKidsCount = kids.length - originalKidsCount;
          const kidsPrice = pricePerKid * newKidsCount;
          const combinedPrice = spousePrice + kidsPrice;
          let discountAmount = 0;
          if (discountCodeData.discountType === 'percentage') {
            discountAmount = (combinedPrice * discountCodeData.discountValue) / 100;
          } else {
            discountAmount = discountCodeData.discountValue;
          }
          return discountAmount;
        })() : undefined,
        kids: kids.map(kid => ({
          ...kid,
          badgeName: toTitleCaseName(kid.badgeName || ''),
        })),
      } as Registration;
      
      onSave(registrationData);
      alert(`Spouse and children registration payment successful! Registration updated.`);
      onBack();
    } catch (err: any) {
      console.error('Combined payment error:', {
        message: err?.message,
        error: err,
        response: err?.response,
        stack: err?.stack
      });
      
      // Extract error message with priority: user-friendly message > Square error > generic message
      let errorMessage = err?.message || err?.response?.data?.error || 'Payment failed. Please check your card details and try again.';
      
      // If it's a tokenization error, it should already have a user-friendly message
      // Otherwise, provide a generic helpful message
      if (!errorMessage.includes('tokenization') && !errorMessage.includes('card') && !errorMessage.includes('declined')) {
        errorMessage = 'Payment failed. Please check your card details and try again, or contact support if the problem persists.';
      }
      
      alert(`Payment Error: ${errorMessage}`);
      setIsSubmitting(false);
    }
  };

  // Validate discount code
  const validateDiscountCode = async (code: string) => {
    if (!code.trim() || !event) {
      setDiscountCodeData(null);
      setDiscountCodeError('');
      handleInputChange('discountCode', '');
      handleInputChange('discountAmount', undefined);
      return;
    }
    
    setValidatingDiscountCode(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/discount-codes/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), eventId: event.id })
      });
      
      const data = await res.json();
      if (data.success && data.valid) {
        setDiscountCodeData(data.data);
        setDiscountCodeError('');
        handleInputChange('discountCode', code.trim().toUpperCase());
      } else {
        setDiscountCodeData(null);
        setDiscountCodeError(data.error || 'Invalid discount code');
        handleInputChange('discountCode', '');
        handleInputChange('discountAmount', undefined);
      }
    } catch (error) {
      setDiscountCodeData(null);
      setDiscountCodeError('Failed to validate discount code');
      handleInputChange('discountCode', '');
      handleInputChange('discountAmount', undefined);
    } finally {
      setValidatingDiscountCode(false);
    }
  };

  // Helper function to parse Square tokenization errors and provide user-friendly messages
  const getTokenizationErrorMessage = (tokenizeResult: any): string => {
    if (!tokenizeResult || !tokenizeResult.errors || tokenizeResult.errors.length === 0) {
      return 'Card tokenization failed. Please check your card details and try again.';
    }

    const error = tokenizeResult.errors[0];
    const errorCode = error?.code || '';
    const errorDetail = error?.detail || '';
    
    // Log full error for debugging
    console.error('Square tokenization error:', {
      status: tokenizeResult.status,
      errors: tokenizeResult.errors,
      code: errorCode,
      detail: errorDetail
    });

    // Map Square error codes to user-friendly messages
    const errorMessages: Record<string, string> = {
      'INVALID_EXPIRATION': 'The card expiration date is invalid. Please check and try again.',
      'INVALID_EXPIRATION_YEAR': 'The card expiration year is invalid. Please check and try again.',
      'INVALID_EXPIRATION_DATE': 'The card expiration date is invalid. Please check and try again.',
      'INVALID_POSTAL_CODE': 'The postal code is invalid. Please enter a valid postal code.',
      'INVALID_CARD': 'The card number is invalid. Please check and try again.',
      'CARD_DECLINED': 'Your card was declined. Please try a different card or contact your bank.',
      'INSUFFICIENT_FUNDS': 'Insufficient funds. Please use a different payment method.',
      'CVV_FAILURE': 'The CVV (security code) is incorrect. Please check and try again.',
      'ADDRESS_VERIFICATION_FAILURE': 'The billing address could not be verified. Please check your address and try again.',
      'INVALID_CARD_DATA': 'Invalid card information. Please check all card details and try again.',
      'CARD_NOT_SUPPORTED': 'This card type is not supported. Please use a different payment method.',
      'PAYMENT_METHOD_ERROR': 'There was an error processing your card. Please try again or use a different payment method.',
    };

    // Check for specific error codes first
    if (errorCode && errorMessages[errorCode]) {
      return errorMessages[errorCode];
    }

    // Check error detail for common patterns
    const detailLower = errorDetail.toLowerCase();
    if (detailLower.includes('expiration') || detailLower.includes('expiry')) {
      return 'The card expiration date is invalid. Please check and try again.';
    }
    if (detailLower.includes('cvv') || detailLower.includes('security code') || detailLower.includes('cvc')) {
      return 'The CVV (security code) is incorrect. Please check and try again.';
    }
    if (detailLower.includes('card number') || detailLower.includes('invalid card')) {
      return 'The card number is invalid. Please check and try again.';
    }
    if (detailLower.includes('postal code') || detailLower.includes('zip code')) {
      return 'The postal code is invalid. Please enter a valid postal code.';
    }
    if (detailLower.includes('declined')) {
      return 'Your card was declined. Please try a different card or contact your bank.';
    }
    if (detailLower.includes('insufficient') || detailLower.includes('funds')) {
      return 'Insufficient funds. Please use a different payment method.';
    }

    // Return the Square error detail if available, otherwise generic message
    return errorDetail || 'Card tokenization failed. Please check your card details and try again.';
  };

  const handleCardPay = async () => {
    if (isAlreadyPaid) return; // prevent double charge on edit
    if (!event) return;
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      // Ensure card is mounted with proper error handling
      let card;
      try {
        card = await ensureCardMounted();
      } catch (error: any) {
        const errorMsg = error?.message || 'Failed to initialize payment form';
        console.error('Card mount error:', error);
        alert(`Payment Error: ${errorMsg}`);
        setIsSubmitting(false);
        return;
      }
      
      // Attempt tokenization with improved error handling
      let res;
      try {
        res = await card.tokenize();
      } catch (tokenizeError: any) {
        console.error('Tokenization exception:', tokenizeError);
        throw new Error('Failed to process card information. Please check your card details and try again.');
      }
      
      if (res.status !== 'OK') {
        const userFriendlyMessage = getTokenizationErrorMessage(res);
        throw new Error(userFriendlyMessage);
      }
      const nonce = res.token;
      
      // Check if there's a pending payment - if so, use that amount
      const pendingPaymentAmount = Number(formData.pendingPaymentAmount || 0);
      let finalTotal: number;
      
      if (pendingPaymentAmount > 0) {
        // Use pending payment amount
        finalTotal = pendingPaymentAmount;
      } else {
        // Use formData.totalPrice (original price before discount)
        let baseTotal = Number(formData.totalPrice || 0);
        
        // Apply discount ONLY for new registrations (not when editing)
        finalTotal = baseTotal;
        if (discountCodeData && typeof discountCodeData.discountValue === 'number' && !isEditing) {
          let discountAmount = 0;
          if (discountCodeData.discountType === 'percentage') {
            discountAmount = (baseTotal * discountCodeData.discountValue) / 100;
          } else {
            discountAmount = discountCodeData.discountValue;
          }
          finalTotal = Math.max(0, baseTotal - discountAmount);
        }
      }
      
      const baseAmountCents = Math.round(finalTotal * 100);
      // Backend will calculate the final amount with fee when applyCardFee is true
      const payRes = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/payments/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: baseAmountCents, // Backend will add fee
          baseAmountCents,
          applyCardFee: true, // Backend will apply 3.5% fee
          currency: 'USD',
          eventName: event?.name || 'EFBC Conference Registration',
          nonce,
          buyerEmail: formData.email || undefined,
          buyerPhone: formData.mobile || formData.officePhone || undefined,
          billingAddress: {
            firstName: formData.firstName,
            lastName: formData.lastName,
          addressLine1: addrStreet,
            locality: addrCity,
            administrativeDistrictLevel1: addrState,
            postalCode: addrZip,
          country: countryCodeForPayments
          }
        })
      });
      
      if (!payRes.ok) {
        const errorData = await payRes.json().catch(() => ({ error: 'Network error or invalid response' }));
        const errorMessage = errorData?.error || errorData?.message || `Payment failed with status ${payRes.status}`;
        throw new Error(errorMessage);
      }
      
      const payload = await payRes.json();
      if (!payload?.success) {
        const errorMessage = payload?.error || payload?.message || 'Payment charge failed';
        throw new Error(errorMessage);
      }
      
      if (!payload?.paymentId) {
        throw new Error('Payment was processed but no payment ID was returned. Please contact support.');
      }
      
      // Verify payment status is COMPLETED
      if (payload?.status && payload.status !== 'COMPLETED') {
        throw new Error(`Payment status is ${payload.status}. Payment may not have been completed successfully.`);
      }
      const chargedAmountCents = Number(payload?.chargedAmountCents ?? Math.round(baseAmountCents * 1.035));
      const chargedAmount = Number.isFinite(chargedAmountCents) ? chargedAmountCents / 100 : finalTotal * 1.035;
      
      // Determine clubRentals value based on user selection
      const isGolf = (formData.wednesdayActivity || '').toLowerCase().includes('golf');
      const isMassage = (formData.wednesdayActivity || '').toLowerCase().includes('massage');
      const isPickleball = (formData.wednesdayActivity || '').toLowerCase().includes('pickleball');
      
      const clubRentalsValue = isGolf 
        ? (needsClubRentals && golfClubPreference 
            ? golfClubPreference 
            : (!needsClubRentals ? 'I will bring my own' : undefined))
        : undefined; // Clear if not golf
      
      const golfHandicapValue = isGolf ? formData.golfHandicap : undefined; // Clear if not golf
      const massageTimeSlotValue = isMassage ? (formData as any).massageTimeSlot : undefined; // Clear if not massage
      // Only set pickleballEquipment if pickleball is selected, otherwise explicitly set to null
      const pickleballEquipmentValue = isPickleball ? ((formData as any).pickleballEquipment !== undefined ? (formData as any).pickleballEquipment : null) : null;

      // Compose address string for backward compatibility (legacy field)
      const composedAddress = [
        addrStreet.trim(),
        `${addrCity.trim()}${addrCity ? ', ' : ''}${addrState.trim()} ${addrZip.trim()}`.trim(),
        countryForStorage
      ].filter(Boolean).join('\n');

      // Now save registration including payment markers
      const registrationData: Registration = {
        ...(registration?.id ? { id: registration.id } : {} as any),
        userId: user.id,
        eventId: event.id,
        ...formData,
        totalPrice: finalTotal.toString(), // Save the amount AFTER discount (no processing fee)
        badgeName: toTitleCaseName(formData.badgeName || ''),
        specialRequests: (formData as any).specialRequests || '',
        clubRentals: clubRentalsValue,
        golfHandicap: golfHandicapValue,
        massageTimeSlot: massageTimeSlotValue,
        pickleballEquipment: pickleballEquipmentValue,
        paid: true,
        paidAmount: Number((registration as any)?.paidAmount || 0) + chargedAmount,
        squarePaymentId: payload.paymentId,
        address: composedAddress, // Legacy field for backward compatibility
        addressStreet: addrStreet.trim(),
        city: addrCity.trim(),
        state: addrState.trim(),
        zipCode: addrZip.trim(),
        country: countryForStorage,
        tuesdayEarlyReception: (formData as any).tuesdayEarlyReception || '',
        // childFirstName: (formData as any).childFirstName || '',
        // childLastName: (formData as any).childLastName || '',
        // childLunchTicket: !!(formData as any).childLunchTicket,
        name: `${formData.firstName} ${formData.lastName}`,
        category: formData.wednesdayActivity || 'Networking',
        paidAt: new Date().toISOString(), // Set payment timestamp
        // Include discount code if provided
        discountCode: discountCodeInput.trim() || undefined,
        discountAmount: discountCodeData && typeof discountCodeData.discountValue === 'number' ? (() => {
          let discountAmount = 0;
          if (discountCodeData.discountType === 'percentage') {
            discountAmount = (Number(formData.totalPrice || 0) * discountCodeData.discountValue) / 100;
          } else {
            discountAmount = discountCodeData.discountValue;
          }
          return discountAmount;
        })() : undefined,
      } as Registration;
      
      // Payment has been verified above, now save the registration
      onSave(registrationData);
      alert('Thank you. Your Registration has been successfully submitted! A copy will be emailed to you.');
      onBack();
    } catch (err: any) {
      console.error('Payment error:', {
        message: err?.message,
        error: err,
        response: err?.response,
        stack: err?.stack
      });
      
      // Extract error message with priority: user-friendly message > Square error > generic message
      let errorMessage = err?.message || err?.response?.data?.error || 'Payment failed. Please check your card details and try again.';
      
      // If it's a tokenization error, it should already have a user-friendly message
      // Otherwise, provide a generic helpful message
      if (!errorMessage.includes('tokenization') && !errorMessage.includes('card') && !errorMessage.includes('declined')) {
        errorMessage = 'Payment failed. Please check your card details and try again, or contact support if the problem persists.';
      }
      
      alert(`Payment Error: ${errorMessage}`);
      setIsSubmitting(false);
    }
  };

  // Ensure Square SDK is loaded and card element attached when Card is selected (including by default)
  const ensureSquareLoaded = async (timeoutMs: number = 10000): Promise<void> => {
    // Check if Square is already available
    if ((window as any).Square && (window as any).Square.payments) {
      return;
    }

    // Check if script is already loading
      const existing = document.querySelector('script[data-square-sdk]');
      if (existing) {
      // Wait for existing script to load
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Square SDK script load timeout'));
        }, timeoutMs);

        const checkSquare = () => {
          if ((window as any).Square && (window as any).Square.payments) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkSquare, 100);
          }
        };

        if ((window as any).Square && (window as any).Square.payments) {
          clearTimeout(timeout);
          resolve();
        } else {
          existing.addEventListener('load', () => {
            // Wait for Square.payments to be available
            const checkInterval = setInterval(() => {
              if ((window as any).Square && (window as any).Square.payments) {
                clearInterval(checkInterval);
                clearTimeout(timeout);
                resolve();
              }
            }, 50);
            setTimeout(() => {
              clearInterval(checkInterval);
              if (!((window as any).Square && (window as any).Square.payments)) {
                clearTimeout(timeout);
                reject(new Error('Square SDK loaded but payments API not available'));
              }
            }, timeoutMs);
          });
          existing.addEventListener('error', () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load Square SDK script'));
          });
          // Start checking immediately in case it's already loaded
          checkSquare();
        }
      });
    }

    // Load script if not already present
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Square SDK script load timeout'));
      }, timeoutMs);

      const s = document.createElement('script');
      const squareEnv = (process.env.REACT_APP_SQUARE_ENV || 'sandbox').toLowerCase();
      const squareSdkUrl =
        squareEnv === 'production'
          ? 'https://web.squarecdn.com/v1/square.js'          // PRODUCTION
          : 'https://sandbox.web.squarecdn.com/v1/square.js'; // SANDBOX

      s.src = squareSdkUrl;
      s.async = true;
      s.setAttribute('data-square-sdk', 'true');
      
      s.onload = () => {
        // Wait for Square.payments to be available after script loads
        const checkInterval = setInterval(() => {
          if ((window as any).Square && (window as any).Square.payments) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve();
          }
        }, 50);
        
        // Timeout if Square.payments doesn't become available
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!((window as any).Square && (window as any).Square.payments)) {
            clearTimeout(timeout);
            reject(new Error('Square SDK loaded but payments API not available'));
          }
        }, timeoutMs);
      };
      
      s.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load Square SDK script'));
      };
      
      document.head.appendChild(s);
    });
  };

  const ensureCardMounted = async (retries: number = 3): Promise<any> => {
    // Validate environment variables
    const appId = process.env.REACT_APP_SQUARE_APP_ID;
    const locationId = process.env.REACT_APP_SQUARE_LOCATION_ID;
    
    if (!appId || !locationId) {
      throw new Error('Square payment configuration is missing. Please contact support.');
    }

    // Return existing instance if available
    if (cardInstance) {
      return cardInstance;
    }

    // Ensure SDK is loaded with retries
    let lastError: Error | null = null;
    for (let i = 0; i < retries; i++) {
      try {
        await ensureSquareLoaded(15000); // 15 second timeout
        
        // Verify Square.payments is available
        if (!(window as any).Square || !(window as any).Square.payments) {
          throw new Error('Square.payments API is not available');
        }

        // Initialize payments
        const payments = (window as any).Square.payments(appId, locationId);
        
        // Wait a bit for payments to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
    const card = await payments.card();
        
        // Make sure container exists and is empty before attach
    const container = document.getElementById('card-container');
        if (!container) {
          throw new Error('Card container element not found');
        }
        container.innerHTML = '';
        
    await card.attach('#card-container');
    setCardInstance(card);
    return card;
      } catch (error: any) {
        lastError = error;
        if (i < retries - 1) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }

    // All retries failed
    throw new Error(
      lastError?.message || 
      'Web Payments SDK was unable to be initialized in time. Please refresh the page and try again.'
    );
  };

  useEffect(() => {
    if ((formData.paymentMethod || 'Card') === 'Card') {
      // Pre-load card element, but don't block on errors (they'll be handled on pay)
      setSquareSdkLoading(true);
      ensureCardMounted()
        .then(() => setSquareSdkLoading(false))
        .catch((error) => {
          setSquareSdkLoading(false);
          console.warn('Square SDK pre-load failed (will retry on payment):', error?.message || error);
        });
    } else {
      setSquareSdkLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.paymentMethod]);

  // Clear activity-specific fields when activity doesn't match
  useEffect(() => {
    const activity = formData.wednesdayActivity || '';
    const isGolf = activity.toLowerCase().includes('golf');
    const isMassage = activity.toLowerCase().includes('massage');
    const isPickleball = activity.toLowerCase().includes('pickleball');
    
    setFormData(prev => {
      const updated = { ...prev };
      let changed = false;
      
      if (!isGolf && (prev.clubRentals !== undefined || prev.golfHandicap)) {
        updated.clubRentals = undefined;
        updated.golfHandicap = '';
        setNeedsClubRentals(false);
        setGolfClubPreference('');
        changed = true;
      }
      
      if (!isMassage && (prev as any).massageTimeSlot) {
        (updated as any).massageTimeSlot = '';
        changed = true;
      }
      
      if (!isPickleball && (prev as any).pickleballEquipment !== undefined) {
        (updated as any).pickleballEquipment = undefined;
        changed = true;
      }
      
      return changed ? updated : prev;
    });
  }, [formData.wednesdayActivity]);

  const wednesdayActivityLocked = isEditing && !isAdminEdit;

  const handleInputChange = (field: string, value: any) => {
    if (field === 'wednesdayActivity' && wednesdayActivityLocked) {
      return;
    }
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Clear golf-related fields if activity is not golf
      if (field === 'wednesdayActivity') {
        const isGolf = (value || '').toLowerCase().includes('golf');
        const isMassage = (value || '').toLowerCase().includes('massage');
        
        if (!isGolf) {
          // Clear golf fields when not golf
          updated.clubRentals = undefined;
          updated.golfHandicap = '';
          setNeedsClubRentals(false);
          setGolfClubPreference('');
        }
        
        if (!isMassage) {
          // Clear massage field when not massage
          (updated as any).massageTimeSlot = '';
        }
        
        const isPickleball = (updated.wednesdayActivity || '').toLowerCase().includes('pickleball');
        if (!isPickleball) {
          // Clear pickleball field when not pickleball
          (updated as any).pickleballEquipment = undefined;
        }
      }
      
      return updated;
    });
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  if (!event) {
    return (
      <div className="container">
        <div className="page-header">
          <h1>Registration</h1>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <p>No active event available for registration.</p>
          <div className="modal-footer-actions">
            <button className="btn btn-secondary" onClick={onBack}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1>{registration ? 'Edit' : 'Register'}</h1>
        <p className="modal-subtitle">
          {event.name} - {
            event.startDate 
              ? `${formatDateShort(event.startDate)} - ${formatDateShort(event.date || event.endDate || '')}`
              : formatDateShort(event.date || event.endDate || '')
          }
        </p>
      </div>

      <div className="card" style={{ padding: '1rem' }}>
        <form id="registration-form" onSubmit={handleSubmit} className="registration-form" noValidate>
          <div className="form-section">
            <h3 className="section-title">Registration Information</h3>
            <div className="pricing-info">
              <div className="pricing-section">
                <h4 className="pricing-title">Registration Fees</h4>
                {(event.registrationPricing || []).map((t, i) => (
                  <div className="pricing-item" key={i}>
                    <span className="pricing-label">{t.label || `Tier ${i + 1}`}:</span>
                    <span className="pricing-amount">${t.price}{(t.startDate || t.endDate) ? ` ${t.startDate ? 'between ' + formatDateShort(t.startDate) : ''}${t.startDate && t.endDate ? ' to ' : ''}${t.endDate ? formatDateShort(t.endDate) : ''}` : ''}</span>
                  </div>
                ))}
              </div>
              <div className="pricing-section">
                <h4 className="pricing-title">Spouse/Guest Tickets</h4>
                {(event.spousePricing || []).map((t, i) => (
                  <div className="pricing-item" key={i}>
                    <span className="pricing-label">{t.label || `Spouse dinner ticket ${i + 1}`}:</span>
                    <span className="pricing-amount">${t.price}{(t.startDate || t.endDate) ? ` ${t.startDate ? 'between ' + formatDateShort(t.startDate) : ''}${t.startDate && t.endDate ? ' to ' : ''}${t.endDate ? formatDateShort(t.endDate) : ''}` : ''}</span>
                  </div>
                ))}
              </div>
              {(event.kidsPricing && event.kidsPricing.length > 0) && (
                <div className="pricing-section">
                  <h4 className="pricing-title">Child/Children Registration</h4>
                  {(event.kidsPricing || []).map((t, i) => (
                    <div className="pricing-item" key={i}>
                      <span className="pricing-label">{t.label || `Child/Children registration ${i + 1}`}:</span>
                      <span className="pricing-amount">${t.price}{(t.startDate || t.endDate) ? ` ${t.startDate ? 'between ' + formatDateShort(t.startDate) : ''}${t.startDate && t.endDate ? ' to ' : ''}${t.endDate ? formatDateShort(t.endDate) : ''}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="registration-includes">
              <h4 className="includes-title">Registration Form Includes:</h4>
              {event.description && Array.isArray(event.description) && event.description.length > 0 ? (
                <ul className="includes-list">
                  {event.description.map((item, idx) => (
                    <li key={idx} className="includes-item">
                      
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="includes-list">
                  <li>All Education Sessions</li>
                  <li>Wednesday Golf Tournament OR Alternate Activity</li>
                  <li>Welcome Reception</li>
                  <li>Breakfasts</li>
                  <li>Coffee Break</li>
                  <li>Lunch</li>
                  <li>Reception/Dinner</li>
                </ul>
              )}
            </div>
          </div>

          <div className="form-section">
            <h3 className="section-title">Personal Information</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName" className="form-label">First Name <span className="required-asterisk">*</span></label>
                <input id="firstName" type="text" className={`form-control ${errors.firstName ? 'error' : ''}`} value={formData.firstName || ''} onChange={e => handleInputChange('firstName', e.target.value)} placeholder="John" required />
                {errors.firstName && <div className="error-message">{errors.firstName}</div>}
              </div>
              <div className="form-group">
                <label htmlFor="lastName" className="form-label">Last Name <span className="required-asterisk">*</span></label>
                <input id="lastName" type="text" className={`form-control ${errors.lastName ? 'error' : ''}`} value={formData.lastName || ''} onChange={e => handleInputChange('lastName', e.target.value)} placeholder="Doe" required />
                {errors.lastName && <div className="error-message">{errors.lastName}</div>}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="badgeName" className="form-label">YOUR 1ST NAME AS YOU WISH IT TO APPEAR ON YOUR BADGE <span className="required-asterisk">*</span></label>
              <input 
                id="badgeName" 
                type="text" 
                  className={`form-control ${errors.badgeName ? 'error' : ''}`} 
                value={formData.badgeName || ''} 
                onChange={e => handleInputChange('badgeName', e.target.value)} 
                  onBlur={() => {
                    setFormData(prev => ({ ...prev, badgeName: toTitleCaseName(String(prev.badgeName || '')) }));
                  }}
                required 
              />
              {errors.badgeName && <div className="error-message">{errors.badgeName}</div>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email" className="form-label">Email <span className="required-asterisk">*</span></label>
                <input id="email" type="email" className={`form-control ${errors.email ? 'error' : ''}`} value={formData.email || ''} onChange={e => handleInputChange('email', e.target.value)} placeholder="john.doe@example.com" required />
                {errors.email && <div className="error-message">{errors.email}</div>}
              </div>
              <div className="form-group">
                <label htmlFor="secondaryEmail" className="form-label">Secondary Email</label>
                <input
                  id="secondaryEmail"
                  type="email"
                  className={`form-control ${errors.secondaryEmail ? 'error' : ''}`}
                  value={formData.secondaryEmail || ''}
                  onChange={e => handleInputChange('secondaryEmail', e.target.value)}
                  placeholder="secondary@example.com"
                />
                {errors.secondaryEmail && <div className="error-message">{errors.secondaryEmail}</div>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="organization" className="form-label">Organization <span className="required-asterisk">*</span></label>
                <input id="organization" type="text" className={`form-control ${errors.organization ? 'error' : ''}`} value={formData.organization || ''} onChange={e => handleInputChange('organization', e.target.value)} required />
                {errors.organization && <div className="error-message">{errors.organization}</div>}
              </div>
              <div className="form-group">
                <label htmlFor="jobTitle" className="form-label">Job Title <span className="required-asterisk">*</span></label>
                <input id="jobTitle" type="text" className={`form-control ${errors.jobTitle ? 'error' : ''}`} value={formData.jobTitle || ''} onChange={e => handleInputChange('jobTitle', e.target.value)} required />
                {errors.jobTitle && <div className="error-message">{errors.jobTitle}</div>}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="addrStreet" className="form-label">Address <span className="required-asterisk">*</span></label>
              <input id="addrStreet" type="text" className={`form-control ${errors.address ? 'error' : ''}`} value={addrStreet} onChange={e=>{ setAddrStreet(e.target.value); if (errors.address) setErrors(prev=>({ ...prev, address:'' })); }} placeholder="123 Main Street" required />
              {errors.address && <div className="error-message">{errors.address}</div>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="addrCountry" className="form-label">Country <span className="required-asterisk">*</span></label>
                <select
                  id="addrCountry"
                  className={`form-control ${errors.country ? 'error' : ''}`}
                  value={addrCountrySelection}
                  onChange={e => {
                    const newCountry = e.target.value;
                    setAddrCountrySelection(newCountry);
                    if (errors.country) setErrors(prev => ({ ...prev, country: '' }));

                    // If switching to a country with a region dropdown, clear invalid existing region
                    const opts = getRegionOptionsForCountry(newCountry);
                    if (opts && opts.length > 0) {
                      const valid = opts.some(o => o.value === (addrState || '').toUpperCase());
                      if (!valid) {
                        setAddrState('');
                        if (errors.state) setErrors(prev => ({ ...prev, state: '' }));
                      }
                    }

                    // Reset "Other" text unless Other is selected
                    if (newCountry !== 'OTHER') {
                      if (addrCountryOther) setAddrCountryOther('');
                    }
                  }}
                  required
                >
                  <option value="" disabled>
                    Select Country
                  </option>
                  {COUNTRY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {errors.country && <div className="error-message">{errors.country}</div>}
                {addrCountrySelection === 'OTHER' && (
                  <div style={{ marginTop: '8px' }}>
                    <label htmlFor="addrCountryOther" className="form-label">
                      Country (Other) <span className="required-asterisk">*</span>
                    </label>
                    <input
                      id="addrCountryOther"
                      type="text"
                      className={`form-control ${errors.country ? 'error' : ''}`}
                      value={addrCountryOther}
                      onChange={e => {
                        setAddrCountryOther(e.target.value);
                        if (errors.country) setErrors(prev => ({ ...prev, country: '' }));
                      }}
                      placeholder="Type your country"
                      required
                    />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="addrState" className="form-label">
                  {addrCountrySelection === 'CA' ? 'Province' : 'State'} <span className="required-asterisk">*</span>
                </label>
                {showRegionDropdown ? (
                  <select
                    id="addrState"
                    className={`form-control ${errors.state ? 'error' : ''}`}
                    value={(addrState || '').toUpperCase()}
                    onChange={e => {
                      setAddrState(e.target.value);
                      if (errors.state) setErrors(prev => ({ ...prev, state: '' }));
                    }}
                    required
                  >
                    <option value="" disabled>
                      {addrCountrySelection === 'CA' ? 'Select Province' : 'Select State'}
                    </option>
                    {(regionOptions || []).map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="addrState"
                    type="text"
                    className={`form-control ${errors.state ? 'error' : ''}`}
                    value={addrState}
                    onChange={e => {
                      setAddrState(e.target.value);
                      if (errors.state) setErrors(prev => ({ ...prev, state: '' }));
                    }}
                    placeholder="State / Province / Region"
                    required
                  />
                )}
                {errors.state && <div className="error-message">{errors.state}</div>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="addrCity" className="form-label">City <span className="required-asterisk">*</span></label>
                <input
                  id="addrCity"
                  type="text"
                  className={`form-control ${errors.city ? 'error' : ''}`}
                  value={addrCity}
                  onChange={e => {
                    setAddrCity(e.target.value);
                    if (errors.city) setErrors(prev => ({ ...prev, city: '' }));
                  }}
                  placeholder="New York"
                  required
                />
                {errors.city && <div className="error-message">{errors.city}</div>}
              </div>
              <div className="form-group">
                <label htmlFor="addrZip" className="form-label">Zip Code <span className="required-asterisk">*</span></label>
                <input
                  id="addrZip"
                  type="text"
                  className={`form-control ${errors.zip ? 'error' : ''}`}
                  value={addrZip}
                  onChange={e => {
                    setAddrZip(e.target.value);
                    if (errors.zip) setErrors(prev => ({ ...prev, zip: '' }));
                  }}
                  placeholder="10001"
                  required
                />
                {errors.zip && <div className="error-message">{errors.zip}</div>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="mobile" className="form-label">Mobile <span className="required-asterisk">*</span></label>
                <input id="mobile" type="tel" className={`form-control ${errors.mobile ? 'error' : ''}`} value={formData.mobile || ''} onChange={e => handleInputChange('mobile', e.target.value)} placeholder="(123) 456-7890" required />
                {errors.mobile && <div className="error-message">{errors.mobile}</div>}
              </div>
              <div className="form-group">
                <label htmlFor="officePhone" className="form-label">Office Phone</label>
                <input id="officePhone" type="tel" className="form-control" value={formData.officePhone || ''} onChange={e => handleInputChange('officePhone', e.target.value)} placeholder="(123) 456-7890" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Is this your first time attending the conference? <span className="required-asterisk">*</span></label>
              <div className="radio-group">
                <label className="radio-label">
                  <input type="radio" name="isFirstTimeAttending" checked={formData.isFirstTimeAttending === true} onChange={() => handleInputChange('isFirstTimeAttending', true)} />
                  <span style={{ marginLeft: '8px' }}>Yes</span>
                </label>
                <label className="radio-label">
                  <input type="radio" name="isFirstTimeAttending" checked={formData.isFirstTimeAttending === false} onChange={() => handleInputChange('isFirstTimeAttending', false)} />
                  <span style={{ marginLeft: '8px' }}>No</span>
                </label>
              </div>
              {(errors as any).isFirstTimeAttending && <div className="error-message">{(errors as any).isFirstTimeAttending}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="companyType" className="form-label">Company Type <span className="required-asterisk">*</span></label>
              <select id="companyType" className={`form-control ${errors.companyType ? 'error' : ''}`} value={formData.companyType || ''} onChange={e => handleInputChange('companyType', e.target.value)} required>
                <option value="" disabled>Please Select Company Type</option>
                {COMPANY_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {errors.companyType && <div className="error-message">{errors.companyType}</div>}
            </div>
            {formData.companyType === 'Other' && (
              <div className="form-group">
                <label htmlFor="companyTypeOther" className="form-label">If "other" selected, please specify</label>
                <input id="companyTypeOther" type="text" className="form-control" value={formData.companyTypeOther || ''} onChange={e => handleInputChange('companyTypeOther', e.target.value)} />
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="emergencyContactName" className="form-label">Emergency Contact Name</label>
                <input id="emergencyContactName" type="text" className="form-control" value={formData.emergencyContactName || ''} onChange={e => handleInputChange('emergencyContactName', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="emergencyContactPhone" className="form-label">Emergency Contact Phone</label>
                <input id="emergencyContactPhone" type="tel" className="form-control" value={formData.emergencyContactPhone || ''} onChange={e => handleInputChange('emergencyContactPhone', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="section-title">Conference Events</h3>
            <div className="form-group">
              <label htmlFor="wednesdayActivity" className="form-label">Please indicate which Wednesday activity you will be attending (Select ONE) <span className="required-asterisk">*</span></label>
              {wednesdayActivityLocked && (
                <p className="form-hint" style={{ marginBottom: '8px', fontSize: '0.9em', color: '#6b7280' }}>
                  Your Wednesday activity cannot be changed here. Contact an administrator if you need to update it.
                </p>
              )}
              <select 
                id="wednesdayActivity" 
                className={`form-control ${errors.wednesdayActivity ? 'error' : ''}`} 
                value={formData.wednesdayActivity || ''} 
                onChange={e => handleInputChange('wednesdayActivity', e.target.value)} 
                required
                disabled={wednesdayActivityLocked}
              >
                <option value="" disabled>Please Select Conference Event</option>
                {getActivityNames(event.activities).map(activityName => {
                  const seatLimit = getActivitySeatLimit(event.activities, activityName);
                  const confirmedCount = getActivityRegistrationCount(activityName);
                  const waitlistCount = getActivityWaitlistCount(activityName);
                  const isFull = seatLimit !== undefined && confirmedCount >= seatLimit;
                  const availableSeats = seatLimit !== undefined ? seatLimit - confirmedCount : null;
                  
                  const isCurrentSelection = isEditing && formData.wednesdayActivity === activityName;
                  const isExistingSelectedActivity = isEditing && registration?.wednesdayActivity === activityName;
                  const existingIsWaitlisted = isExistingSelectedActivity ? !!(registration as any)?.wednesdayActivityWaitlisted : false;
                  
                  return (
                    <option 
                      key={activityName} 
                      value={activityName}
                    >
                      {activityName}
                      {seatLimit !== undefined && (
                        isFull
                          ? (
                              isCurrentSelection && isExistingSelectedActivity
                                ? ` (FULL — You are ${existingIsWaitlisted ? 'WAITLISTED' : 'CONFIRMED'}, ${confirmedCount}/${seatLimit} confirmed${waitlistCount ? `, ${waitlistCount} waitlisted` : ''})`
                                : ` (FULL — Waitlist available, ${confirmedCount}/${seatLimit} confirmed${waitlistCount ? `, ${waitlistCount} waitlisted` : ''})`
                            )
                          : ` (${availableSeats} available, ${confirmedCount}/${seatLimit} confirmed${waitlistCount ? `, ${waitlistCount} waitlisted` : ''})`
                      )}
                    </option>
                  );
                })}
              </select>
              {errors.wednesdayActivity && <div className="error-message">{errors.wednesdayActivity}</div>}
              {formData.wednesdayActivity && (() => {
                const seatLimit = getActivitySeatLimit(event.activities, formData.wednesdayActivity);
                const confirmedCount = getActivityRegistrationCount(formData.wednesdayActivity);
                const waitlistCount = getActivityWaitlistCount(formData.wednesdayActivity);
                if (seatLimit !== undefined) {
                  const isFull = confirmedCount >= seatLimit;
                  const availableSeats = seatLimit - confirmedCount;
                  const isExistingSelectedActivity = isEditing && registration?.wednesdayActivity === formData.wednesdayActivity;
                  const existingIsWaitlisted = isExistingSelectedActivity ? !!(registration as any)?.wednesdayActivityWaitlisted : false;
                  return (
                    <div style={{ marginTop: '5px', fontSize: '0.9em', color: isFull ? '#dc2626' : '#666' }}>
                      {isFull ? (
                        <strong>
                          {isExistingSelectedActivity
                            ? `This activity is FULL (${confirmedCount}/${seatLimit} seats confirmed). You are currently ${existingIsWaitlisted ? 'WAITLISTED' : 'CONFIRMED'} for this activity.`
                            : `This activity is FULL (${confirmedCount}/${seatLimit} seats confirmed). You can still select it and you will be waitlisted.`}
                          {waitlistCount ? ` (Current waitlist: ${waitlistCount})` : ''}
                        </strong>
                      ) : (
                        `${availableSeats} of ${seatLimit} seats available`
                      )}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            {(getActivityNames(event.activities).some(a => a.toLowerCase().includes('golf')) && (formData.wednesdayActivity || '').toLowerCase().includes('golf')) && (
              <>
                <div className="form-group">
                  <label className="form-label">Club rentals needed?</label>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="clubRentals" 
                        checked={needsClubRentals} 
                        onChange={() => {
                          setNeedsClubRentals(true);
                          setGolfClubPreference('');
                        }} 
                      />
                      <span style={{ marginLeft: '8px' }}>Yes</span>
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        name="clubRentals" 
                        checked={!needsClubRentals} 
                        onChange={() => {
                          setNeedsClubRentals(false);
                          setGolfClubPreference('');
                        }} 
                      />
                      <span style={{ marginLeft: '8px' }}>No</span>
                    </label>
                  </div>
                </div>
                {needsClubRentals && (
                  <div className="form-group">
                    <label htmlFor="golfClubPreference" className="form-label">Rental clubs are available for a fee, must be reserved in advance to ensure availability. Let us know your club preference. <span className="required-asterisk">*</span></label>
                    <select 
                      id="golfClubPreference" 
                      className={`form-control ${errors.golfClubPreference ? 'error' : ''}`}
                      value={golfClubPreference} 
                      onChange={e => {
                        setGolfClubPreference(e.target.value);
                        if (errors.golfClubPreference) {
                          setErrors(prev => {
                            const newErr = { ...prev };
                            delete newErr.golfClubPreference;
                            return newErr;
                          });
                        }
                      }}
                      required
                    >
                      <option value="" disabled>Please select a preference</option>
                      {GOLF_CLUB_PREFERENCES.map(pref => (
                        <option key={pref} value={pref}>{pref}</option>
                      ))}
                    </select>
                    {errors.golfClubPreference && <div className="error-message">{errors.golfClubPreference}</div>}
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="golfHandicap" className="form-label">Your handicap (1-36)</label>
                  <input id="golfHandicap" type="number" min={1} max={36} className="form-control" value={formData.golfHandicap || ''} onChange={e => handleInputChange('golfHandicap', e.target.value)} />
                </div>
              </>
            )}
            {(getActivityNames(event.activities).some(a => a.toLowerCase().includes('massage')) && (formData.wednesdayActivity || '').toLowerCase().includes('massage')) && (
              <div className="form-group">
                <label htmlFor="massageTimeSlot" className="form-label">If you Chose Massage: <span className="required-asterisk">*</span></label>
                <label htmlFor="massageTimeSlot" className="form-label" style={{ fontWeight: 'normal', fontSize: '0.9rem', marginTop: '0.25rem', display: 'block' }}>
                  Select your preferred time slot; We will get back to you confirming your appointment time.
                </label>
                <select 
                  id="massageTimeSlot" 
                  className={`form-control ${errors.massageTimeSlot ? 'error' : ''}`}
                  value={(formData as any).massageTimeSlot || ''} 
                  onChange={e => {
                    handleInputChange('massageTimeSlot', e.target.value);
                    if (errors.massageTimeSlot) {
                      setErrors(prev => {
                        const newErr = { ...prev };
                        delete newErr.massageTimeSlot;
                        return newErr;
                      });
                    }
                  }}
                  required
                >
                  <option value="" disabled>Select an option</option>
                  {MASSAGE_TIME_SLOTS.map(slot => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
                {errors.massageTimeSlot && <div className="error-message">{errors.massageTimeSlot}</div>}
              </div>
            )}
            {(getActivityNames(event.activities).some(a => a.toLowerCase().includes('pickleball')) && (formData.wednesdayActivity || '').toLowerCase().includes('pickleball')) && (
              <div className="form-group">
                <label className="form-label">Will you bring your own equipment? <span className="required-asterisk">*</span></label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input 
                      type="radio" 
                      name="pickleballEquipment" 
                      checked={(formData as any).pickleballEquipment === true} 
                      onChange={() => handleInputChange('pickleballEquipment', true)} 
                    />
                    <span style={{ marginLeft: '8px' }}>Yes</span>
                  </label>
                  <label className="radio-label">
                    <input 
                      type="radio" 
                      name="pickleballEquipment" 
                      checked={(formData as any).pickleballEquipment === false} 
                      onChange={() => handleInputChange('pickleballEquipment', false)} 
                    />
                    <span style={{ marginLeft: '8px' }}>No</span>
                  </label>
                </div>
                {(errors as any).pickleballEquipment && (
                  <div className="error-message">{(errors as any).pickleballEquipment}</div>
                )}
              </div>
            )}
          </div>

          <div className="form-section">
            <h3 className="section-title">Conference Meals</h3>
            <div className="form-group">
              <label htmlFor="tuesdayEarly" className="form-label">Tuesday Early Arrivals Reception <span className="required-asterisk">*</span></label>
              <select id="tuesdayEarly" className={`form-control ${(errors as any).tuesdayEarlyReception ? 'error' : ''}`} value={(formData as any).tuesdayEarlyReception || ''} onChange={e=>handleInputChange('tuesdayEarlyReception', e.target.value)} required>
                <option value="" disabled>Choose</option>
                {MEAL_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {(errors as any).tuesdayEarlyReception && <div className="error-message">{(errors as any).tuesdayEarlyReception}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="wednesdayReception" className="form-label">Wednesday Welcome Reception <span className="required-asterisk">*</span></label>
              <select id="wednesdayReception" className={`form-control ${errors.wednesdayReception ? 'error' : ''}`} value={formData.wednesdayReception || ''} onChange={e => handleInputChange('wednesdayReception', e.target.value)} required>
                <option value="" disabled>Choose</option>
                {MEAL_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {errors.wednesdayReception && <div className="error-message">{errors.wednesdayReception}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="thursdayBreakfast" className="form-label">Thursday Breakfast <span className="required-asterisk">*</span></label>
              <select id="thursdayBreakfast" className={`form-control ${errors.thursdayBreakfast ? 'error' : ''}`} value={formData.thursdayBreakfast || ''} onChange={e => handleInputChange('thursdayBreakfast', e.target.value)} required>
                <option value="" disabled>Choose</option>
                {MEAL_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {errors.thursdayBreakfast && <div className="error-message">{errors.thursdayBreakfast}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="thursdayLuncheon" className="form-label">Thursday Luncheon <span className="required-asterisk">*</span></label>
              <select id="thursdayLuncheon" className={`form-control ${errors.thursdayLuncheon ? 'error' : ''}`} value={formData.thursdayLuncheon || ''} onChange={e => handleInputChange('thursdayLuncheon', e.target.value)} required>
                <option value="" disabled>Choose</option>
                {MEAL_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {errors.thursdayLuncheon && <div className="error-message">{errors.thursdayLuncheon}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="thursdayDinner" className="form-label">Thursday Dinner <span className="required-asterisk">*</span></label>
              <select id="thursdayDinner" className={`form-control ${errors.thursdayDinner ? 'error' : ''}`} value={formData.thursdayDinner || ''} onChange={e => handleInputChange('thursdayDinner', e.target.value)} required>
                <option value="" disabled>Choose</option>
                {MEAL_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {errors.thursdayDinner && <div className="error-message">{errors.thursdayDinner}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="fridayBreakfast" className="form-label">Friday Breakfast <span className="required-asterisk">*</span></label>
              <select id="fridayBreakfast" className={`form-control ${errors.fridayBreakfast ? 'error' : ''}`} value={formData.fridayBreakfast || ''} onChange={e => handleInputChange('fridayBreakfast', e.target.value)} required>
                <option value="" disabled>Choose</option>
                {MEAL_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {errors.fridayBreakfast && <div className="error-message">{errors.fridayBreakfast}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Do you have any dietary restrictions or allergies? <span className="required-asterisk">*</span></label>
              <div className="checkbox-group">
                {['None', 'Dairy Free', 'Gluten Free', 'Lactose Intolerant', 'Vegetarian'].map(option => (
                  <label key={option} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={(formData.dietaryRequirements || []).includes(option)}
                      onChange={(e) => {
                        const current = formData.dietaryRequirements || [];
                        if (e.target.checked) {
                          if (option === 'None') {
                            // If "None" is selected, clear all other selections
                            handleInputChange('dietaryRequirements', ['None']);
                            handleInputChange('dietaryRequirementsOther', '');
                          } else {
                            // If any other option is selected, remove "None" if it exists
                            const withoutNone = current.filter((item: string) => item !== 'None');
                            handleInputChange('dietaryRequirements', [...withoutNone, option]);
                          }
                        } else {
                          handleInputChange('dietaryRequirements', current.filter((item: string) => item !== option));
                        }
                      }}
                    />
                    <span style={{ marginLeft: '8px' }}>{option}</span>
                  </label>
                ))}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={(formData.dietaryRequirements || []).includes('Other')}
                    onChange={(e) => {
                      const current = formData.dietaryRequirements || [];
                      if (e.target.checked) {
                        // If "Other" is selected, remove "None" if it exists
                        const withoutNone = current.filter((item: string) => item !== 'None');
                        handleInputChange('dietaryRequirements', [...withoutNone, 'Other']);
                      } else {
                        handleInputChange('dietaryRequirements', current.filter((item: string) => item !== 'Other'));
                        handleInputChange('dietaryRequirementsOther', '');
                      }
                    }}
                  />
                  <span style={{ marginLeft: '8px' }}>Other</span>
                </label>
              </div>
              {(formData.dietaryRequirements || []).includes('Other') && (
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label htmlFor="dietaryRequirementsOther" className="form-label">Please specify<span className="required-asterisk">*</span></label>
                  <input 
                    id="dietaryRequirementsOther" 
                    type="text" 
                    className={`form-control ${errors.dietaryRequirementsOther ? 'error' : ''}`} 
                    value={formData.dietaryRequirementsOther || ''} 
                    onChange={e => handleInputChange('dietaryRequirementsOther', e.target.value)} 
                    placeholder="Specify other dietary requirement..." 
                    required={(formData.dietaryRequirements || []).includes('Other')}
                  />
                  {errors.dietaryRequirementsOther && <div className="error-message">{errors.dietaryRequirementsOther}</div>}
                </div>
              )}
              {errors.dietaryRequirements && <div className="error-message">{errors.dietaryRequirements}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="specialRequests" className="form-label">Special Requests</label>
              <textarea id="specialRequests" className="form-control" value={(formData as any).specialRequests || ''} onChange={e => handleInputChange('specialRequests', e.target.value)} rows={3} placeholder="Please specify any special requests..." />
            </div>
          </div>

          {/* Additional Information Section */}
          <div className="form-section">
            <h3 className="section-title">Additional Information</h3>
            
            <div className="form-group">
              <label htmlFor="transportationMethod" className="form-label">Will you be driving or flying? <span className="required-asterisk">*</span></label>
              <select 
                id="transportationMethod" 
                className={`form-control ${errors.transportationMethod ? 'error' : ''}`} 
                value={formData.transportationMethod || ''} 
                onChange={e => handleInputChange('transportationMethod', e.target.value)} 
                required
              >
                <option value="" disabled>Choose</option>
                <option value="Driving">Driving</option>
                <option value="Flying">Flying</option>
              </select>
              {errors.transportationMethod && <div className="error-message">{errors.transportationMethod}</div>}
            </div>
            
            <div className="form-group">
              <label htmlFor="transportationDetails" className="form-label">Transportation Details</label>
              <textarea 
                id="transportationDetails" 
                className="form-control" 
                value={formData.transportationDetails || ''} 
                onChange={e => handleInputChange('transportationDetails', e.target.value)} 
                rows={2} 
                placeholder="Please provide additional details about your transportation..." 
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Will you be staying at the Beach Club Resort? <span className="required-asterisk">*</span></label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="stayingAtBeachClub"
                    checked={formData.stayingAtBeachClub === true}
                    onChange={() => handleInputChange('stayingAtBeachClub', true)}
                    required
                  />
                  <span style={{ marginLeft: '8px' }}>Yes</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="stayingAtBeachClub"
                    checked={formData.stayingAtBeachClub === false}
                    onChange={() => handleInputChange('stayingAtBeachClub', false)}
                    required
                  />
                  <span style={{ marginLeft: '8px' }}>No</span>
                </label>
              </div>
              {formData.stayingAtBeachClub === false && (
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label htmlFor="accommodationDetails" className="form-label">If not, please list where you will be staying. <span className="required-asterisk">*</span></label>
                  <textarea 
                    id="accommodationDetails" 
                    className={`form-control ${errors.accommodationDetails ? 'error' : ''}`} 
                    value={formData.accommodationDetails || ''} 
                    onChange={e => handleInputChange('accommodationDetails', e.target.value)} 
                    rows={2} 
                    placeholder="Please specify your accommodation..." 
                    required={formData.stayingAtBeachClub === false}
                  />
                  {errors.accommodationDetails && <div className="error-message">{errors.accommodationDetails}</div>}
                </div>
              )}
            </div>
            
            <div className="form-group">
              <label className="form-label">Do you have any special physical needs? <span className="required-asterisk">*</span></label>
              <div className="radio-group">
                
                <label className="radio-label">
                  <input
                    type="radio"
                    name="specialPhysicalNeeds"
                    checked={formData.specialPhysicalNeeds === true}
                    onChange={() => handleInputChange('specialPhysicalNeeds', true)}
                    required
                  />
                  <span style={{ marginLeft: '8px' }}>Yes</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="specialPhysicalNeeds"
                    checked={formData.specialPhysicalNeeds === false}
                    onChange={() => {
                      handleInputChange('specialPhysicalNeeds', false);
                      handleInputChange('specialPhysicalNeedsDetails', '');
                    }}
                    required
                  />
                  <span style={{ marginLeft: '8px' }}>No</span>
                </label>
              </div>
              {formData.specialPhysicalNeeds === true && (
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label htmlFor="specialPhysicalNeedsDetails" className="form-label">Please specify your special physical needs <span className="required-asterisk">*</span></label>
                  <textarea 
                    id="specialPhysicalNeedsDetails" 
                    className={`form-control ${errors.specialPhysicalNeedsDetails ? 'error' : ''}`} 
                    value={formData.specialPhysicalNeedsDetails || ''} 
                    onChange={e => handleInputChange('specialPhysicalNeedsDetails', e.target.value)} 
                    rows={3} 
                    placeholder="Please specify your special physical needs..." 
                    required={formData.specialPhysicalNeeds === true}
                  />
                  {errors.specialPhysicalNeedsDetails && <div className="error-message">{errors.specialPhysicalNeedsDetails}</div>}
                </div>
              )}
            </div>
          </div>

          {/* Spouse section: Always show to allow adding spouse later */}
            <div className="form-section">
              <h3 className="section-title">Spouse/Guest Information</h3>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={!!formData.spouseDinnerTicket} 
                    onChange={e => {
                      // Prevent unchecking if spouse payment was made
                      if (hadSpousePayment && !e.target.checked) {
                        alert('Cannot remove spouse ticket that has already been paid for. You can only edit the spouse information.');
                        return;
                      }
                      handleInputChange('spouseDinnerTicket', e.target.checked);
                    }}
                    disabled={hadSpousePayment} // Disable checkbox if payment was made
                    />
                    <span style={{ marginLeft: '8px' }}>Check Box to purchase Spouse/Guest Dinner Ticket.</span>
                  {hadSpousePayment && (
                    <span style={{ marginLeft: '8px', color: '#6b7280', fontSize: '0.875rem' }}>
                      (Already paid - cannot be removed)
                    </span>
                  )}
                  </label>
                </div>
              {/* Show spouse name fields when checkbox is selected */}
              {formData.spouseDinnerTicket && (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="spouseFirstName" className="form-label">Spouse/Guest's First Name <span className="required-asterisk">*</span></label>
                    <input 
                      id="spouseFirstName" 
                      type="text" 
                      className={`form-control ${errors.spouseFirstName ? 'error' : ''}`} 
                      value={formData.spouseFirstName || ''} 
                      onChange={e => handleInputChange('spouseFirstName', e.target.value)}
                    />
                    {errors.spouseFirstName && <div className="error-message">{errors.spouseFirstName}</div>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="spouseLastName" className="form-label">Spouse/Guest's Last Name <span className="required-asterisk">*</span></label>
                    <input 
                      id="spouseLastName" 
                      type="text" 
                      className={`form-control ${errors.spouseLastName ? 'error' : ''}`} 
                      value={formData.spouseLastName || ''} 
                      onChange={e => handleInputChange('spouseLastName', e.target.value)}
                    />
                    {errors.spouseLastName && <div className="error-message">{errors.spouseLastName}</div>}
                  </div>
                </div>
              )}
            </div>

          {/* Child/Children Registration Section */}
          <div className="form-section">
            <h3 className="section-title">Child/Children Registration</h3>
            <p className="form-help-text">Add children who will be attending the conference.</p>
            
            {kids.map((kid, idx) => (
              <div key={idx} className="kid-entry" style={{ border: '1px solid #ddd', padding: '1rem', marginBottom: '1rem', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>Child {idx + 1}</h4>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      const updatedKids = [...kids];
                      updatedKids.splice(idx, 1);
                      handleInputChange('kids', updatedKids);
                    }}
                  >
                    Remove
                  </button>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor={`kid_${idx}_firstName`} className="form-label">
                      First Name <span className="required-asterisk">*</span>
                    </label>
                    <input
                      id={`kid_${idx}_firstName`}
                      type="text"
                      className={`form-control ${(errors as any)[`kid_${idx}_firstName`] ? 'error' : ''}`}
                      value={kid.firstName || ''}
                      onChange={(e) => {
                        const updatedKids = [...kids];
                        updatedKids[idx] = { ...updatedKids[idx], firstName: e.target.value };
                        handleInputChange('kids', updatedKids);
                      }}
                    />
                    {(errors as any)[`kid_${idx}_firstName`] && (
                      <div className="error-message">{(errors as any)[`kid_${idx}_firstName`]}</div>
                    )}
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor={`kid_${idx}_lastName`} className="form-label">
                      Last Name <span className="required-asterisk">*</span>
                    </label>
                    <input
                      id={`kid_${idx}_lastName`}
                      type="text"
                      className={`form-control ${(errors as any)[`kid_${idx}_lastName`] ? 'error' : ''}`}
                      value={kid.lastName || ''}
                      onChange={(e) => {
                        const updatedKids = [...kids];
                        updatedKids[idx] = { ...updatedKids[idx], lastName: e.target.value };
                        handleInputChange('kids', updatedKids);
                      }}
                    />
                    {(errors as any)[`kid_${idx}_lastName`] && (
                      <div className="error-message">{(errors as any)[`kid_${idx}_lastName`]}</div>
                    )}
                  </div>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor={`kid_${idx}_badgeName`} className="form-label">
                      Badge Name <span className="required-asterisk">*</span>
                    </label>
                    <input
                      id={`kid_${idx}_badgeName`}
                      type="text"
                      className={`form-control ${(errors as any)[`kid_${idx}_badgeName`] ? 'error' : ''}`}
                      value={kid.badgeName || ''}
                      onChange={(e) => {
                        const updatedKids = [...kids];
                        updatedKids[idx] = { ...updatedKids[idx], badgeName: e.target.value };
                        handleInputChange('kids', updatedKids);
                      }}
                      onBlur={() => {
                        const updatedKids = [...kids];
                        updatedKids[idx] = { ...updatedKids[idx], badgeName: toTitleCaseName(updatedKids[idx].badgeName || '') };
                        handleInputChange('kids', updatedKids);
                      }}
                    />
                    {(errors as any)[`kid_${idx}_badgeName`] && (
                      <div className="error-message">{(errors as any)[`kid_${idx}_badgeName`]}</div>
                    )}
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor={`kid_${idx}_age`} className="form-label">
                      Age <span className="required-asterisk">*</span>
                    </label>
                    <input
                      id={`kid_${idx}_age`}
                      type="number"
                      min="0"
                      max="17"
                      className={`form-control ${(errors as any)[`kid_${idx}_age`] ? 'error' : ''}`}
                      value={kid.age || ''}
                      onChange={(e) => {
                        const updatedKids = [...kids];
                        updatedKids[idx] = { ...updatedKids[idx], age: parseInt(e.target.value) || 0 };
                        handleInputChange('kids', updatedKids);
                      }}
                    />
                    {(errors as any)[`kid_${idx}_age`] && (
                      <div className="error-message">{(errors as any)[`kid_${idx}_age`]}</div>
                    )}
                  </div>
                </div>
                
              </div>
            ))}
            
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const newKid = {
                  firstName: '',
                  lastName: '',
                  badgeName: '',
                  age: 0,
                };
                handleInputChange('kids', [...kids, newKid]);
              }}
            >
              Add Child
            </button>
            
            {/* Kids price override commented out - using coupon codes instead */}
            {/* {isAdminEdit && kids.length > 0 && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label htmlFor="kidsTotalPrice" className="form-label">
                  Children Total Price Override
                </label>
                <input
                  id="kidsTotalPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  value={formData.kidsTotalPrice || ''}
                  placeholder="Leave empty to calculate from tier pricing"
                  onChange={(e) => {
                    handleInputChange('kidsTotalPrice', e.target.value === '' ? undefined : parseFloat(e.target.value));
                  }}
                />
                <small className="form-help-text">
                  Override the total price for all children. If not set, price will be calculated from the active pricing tier.
                </small>
              </div>
            )} */}
          </div>

          {/* Child section - only visible to admins */}
          {/* {isAdminEdit && (
            <div className="form-section">
              <h3 className="section-title">Child Information</h3>
              <div className="form-group">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={!!(formData as any).childLunchTicket} 
                    onChange={e => handleInputChange('childLunchTicket', e.target.checked)}
                  />
                  <span>Check Box to purchase Child Lunch Ticket{childLunchPrice > 0 ? ` ($${childLunchPrice.toFixed(2)})` : ''}.</span>
                </label>
              </div>
              {(formData as any).childLunchTicket && (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="childFirstName" className="form-label">Child's First Name <span className="required-asterisk">*</span></label>
                    <input 
                      id="childFirstName" 
                      type="text" 
                      className={`form-control ${(errors as any).childFirstName ? 'error' : ''}`} 
                      value={(formData as any).childFirstName || ''} 
                      onChange={e => handleInputChange('childFirstName', e.target.value)}
                      required
                    />
                    {(errors as any).childFirstName && <div className="error-message">{(errors as any).childFirstName}</div>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="childLastName" className="form-label">Child's Last Name <span className="required-asterisk">*</span></label>
                    <input 
                      id="childLastName" 
                      type="text" 
                      className={`form-control ${(errors as any).childLastName ? 'error' : ''}`} 
                      value={(formData as any).childLastName || ''} 
                      onChange={e => handleInputChange('childLastName', e.target.value)}
                      required
                    />
                    {(errors as any).childLastName && <div className="error-message">{(errors as any).childLastName}</div>}
                  </div>
                </div>
              )}
            </div>
          )} */}

          {/* Update Notes section — only visible when editing an existing registration */}
          {isEditing && (
            <div className="form-section">
              <h3 className="section-title">Update Notes</h3>
              <div className="form-group">
                <label htmlFor="updateNotes" className="form-label">
                  Add a note about changes being made
                </label>
                <textarea
                  id="updateNotes"
                  className="form-control"
                  placeholder="e.g., Changed personal information, Updated spouse information..."
                  value={(formData as any).updateNotes || ''}
                  onChange={(e) => handleInputChange('updateNotes', e.target.value)}
                  rows={3}
                />
              </div>
              {registration?.updateNotes && (
                <div className="form-group">
                  <label className="form-label">Previous Notes</label>
                  <div style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: '14px',
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    color: '#374151',
                    lineHeight: '1.6'
                  }}>
                    {registration.updateNotes}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment section for admins */}
          {isAdminEdit && (
            <div className="form-section">
              <h3 className="section-title">Payment Information</h3>
              
              {/* Admin Price Override Section */}
              <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <h4 style={{ marginTop: 0, marginBottom: '15px', color: '#374151', fontSize: '16px', fontWeight: '600' }}>Admin Price Override</h4>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={priceOverrideEnabled}
                      onChange={(e) => {
                        setPriceOverrideEnabled(e.target.checked);
                        if (e.target.checked) {
                          // When enabling override, set formData.totalPrice to the override value
                          setFormData(prev => ({ ...prev, totalPrice: priceOverride }));
                        } else {
                          // Reset to calculated price when disabled
                          const now = getCurrentEasternTime();
                          const regActive = pickActivePricingTier(event?.registrationPricing || [], now);
                          let total = typeof regActive?.price === 'number' ? regActive.price : 675;
                          if (formData.spouseDinnerTicket) {
                            const sa = pickActivePricingTier(event?.spousePricing || [], now);
                            total += typeof sa?.price === 'number' ? sa.price : 0;
                          }
                          if (kids.length > 0) {
                            const ka = pickActivePricingTier(event?.kidsPricing || [], now);
                            const pricePerKid = typeof ka?.price === 'number' ? ka.price : 0;
                            total += pricePerKid * kids.length;
                          }
                          setPriceOverride(total);
                          setFormData(prev => ({ ...prev, totalPrice: total }));
                        }
                      }}
                    />
                    <span style={{ marginLeft: '8px' }}>Override calculated price</span>
                  </label>
                </div>

                {/* Always show price comparison for admin */}
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px', fontSize: '14px' }}>
                  {priceOverrideEnabled ? (
                    <>
                      {isEditing && registration && (
                        <p style={{ margin: '4px 0', color: '#6b7280' }}>
                          Original Price (Paid): <strong>${originalPrice.toFixed(2)}</strong>
                        </p>
                      )}
                      <p style={{ margin: '4px 0', color: '#6b7280' }}>
                        Override Price: <strong>${priceOverride.toFixed(2)}</strong>
                      </p>
                      {isEditing && registration && (
                        <p style={{ margin: '4px 0', color: priceOverride > originalPrice ? '#dc2626' : '#059669' }}>
                          Difference: <strong>${(priceOverride - originalPrice).toFixed(2)}</strong>
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p style={{ margin: '4px 0', color: '#6b7280' }}>
                        {isEditing && registration ? 'Original Price (Paid):' : 'Base Price:'} <strong>${originalPrice.toFixed(2)}</strong>
                      </p>
                      <p style={{ margin: '4px 0', color: '#6b7280' }}>
                        Current Calculated Price: <strong>${(formData.totalPrice || 675).toFixed(2)}</strong>
                      </p>
                      {/* Only show additional amount due if something actually changed (spouse, kids, or override) */}
                      {isEditing && registration && 
                       (formData.totalPrice || 675) > originalPrice && 
                       (formData.spouseDinnerTicket !== hadSpouseTicket || kids.length !== originalKidsCount) && (
                        <p style={{ margin: '4px 0', color: '#dc2626', fontWeight: '600' }}>
                          Additional Amount Due: <strong>${((formData.totalPrice || 675) - originalPrice).toFixed(2)}</strong>
                        </p>
                      )}
                    </>
                  )}
                </div>

                {priceOverrideEnabled && (
                  <>
                    <div className="form-group">
                      <label htmlFor="priceOverride" className="form-label">Override Price ($)</label>
                      <input
                        type="number"
                        id="priceOverride"
                        step="0.01"
                        className="form-control"
                        value={priceOverride}
                        onChange={(e) => {
                          const newPrice = Number(e.target.value);
                          setPriceOverride(newPrice);
                          setFormData(prev => ({ ...prev, totalPrice: newPrice }));
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="priceOverrideReason" className="form-label">Reason (Optional)</label>
                      <textarea
                        id="priceOverrideReason"
                        className="form-control"
                        placeholder="e.g., Special discount applied, Price adjustment due to..."
                        value={priceOverrideReason}
                        onChange={(e) => setPriceOverrideReason(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </>
                )}
              </div>
              
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <div className="segmented-group">
                  <label className="segmented-label">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={(formData.paymentMethod || 'Card') === 'Card'}
                      onChange={() => handleInputChange('paymentMethod', 'Card')}
                    />
                    <span style={{ marginLeft: '8px' }}>Card</span>
                  </label>
                  <label className="segmented-label">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={formData.paymentMethod === 'Check'}
                      onChange={() => handleInputChange('paymentMethod', 'Check')}
                    />
                    <span style={{ marginLeft: '8px' }}>Check</span>
                  </label>
                  <label className="segmented-label">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={formData.paymentMethod === 'Comp'}
                      onChange={() => handleInputChange('paymentMethod', 'Comp')}
                    />
                    <span style={{ marginLeft: '8px' }}>Comp</span>
                  </label>
                </div>
              </div>
              {formData.paymentMethod === 'Check' && (
                <div className="form-group">
                  <label className="form-label">Paid</label>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="paid"
                        checked={formData.paid === true}
                        onChange={() => handleInputChange('paid', true)}
                      />
                      <span style={{ marginLeft: '8px' }}>Yes</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="paid"
                        checked={formData.paid === false || formData.paid === undefined}
                        onChange={() => handleInputChange('paid', false)}
                      />
                      <span style={{ marginLeft: '8px' }}>No</span>
                    </label>
                  </div>
                  <p className="form-hint" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    Mark as "Yes" when the check has been received and processed.
                  </p>
                </div>
              )}
              {formData.paymentMethod === 'Comp' && (
                <div className="form-group">
                  <p className="form-hint" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    Compensation selected. No fee will be charged.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Payment section: Hide in admin edit mode, show in user mode only when transaction is needed */}
          {!isAdminEdit && (() => {
            // Check if spouse is being added (wasn't there before, but now is)
            const isAddingSpouse = isEditing && !hadSpouseTicket && formData.spouseDinnerTicket && !hadSpousePayment;
            // Check if kids are being added (current count > original count)
            const isAddingKids = isEditing && kids.length > originalKidsCount;
            
            // Show payment section if:
            // 1. New registration (!isEditing)
            // 2. Unpaid registration being edited (!isAlreadyPaid)
            // 3. Adding spouse to already-paid registration (isAddingSpouse)
            // 4. Adding kids to already-paid registration (isAddingKids)
            const shouldShowPaymentSection = !isEditing || !isAlreadyPaid || isAddingSpouse || isAddingKids;
            
            if (!shouldShowPaymentSection) {
              return null; // Hide payment section for paid registrations being edited without adding spouse/kids
            }
            
            return (
            <div id="registration-payment-section" className="form-section">
              <h3 className="section-title">Payment Information</h3>
              {(() => {
                // Re-check these flags for the payment summary logic
                const isAddingSpouse = isEditing && !hadSpouseTicket && formData.spouseDinnerTicket && !hadSpousePayment;
                const isAddingKids = isEditing && kids.length > originalKidsCount;

                if (isAlreadyPaid && !isAddingSpouse && !isAddingKids) {
                  return (
                <div className="payment-summary">
                  <div className="payment-item">
                    <span>Paid:</span>
                    <span>Yes</span>
                  </div>
                  {(registration as any)?.squarePaymentId && (
                    <div className="payment-item">
                      <span>Square Payment ID:</span>
                      <span>{(registration as any).squarePaymentId}</span>
                    </div>
                  )}
                      {hadSpouseTicket && (registration as any)?.spousePaymentId && (
                        <div className="payment-item">
                          <span>Spouse Payment ID:</span>
                          <span>{(registration as any).spousePaymentId}</span>
                </div>
                      )}
                      {hadKidsBefore && (registration as any)?.kidsPaymentId && (
                        <div className="payment-item">
                          <span>Children Payment ID{Array.isArray((registration as any).kidsPaymentId) && (registration as any).kidsPaymentId.length > 1 ? 's' : ''}:</span>
                          <span>{Array.isArray((registration as any).kidsPaymentId) 
                            ? (registration as any).kidsPaymentId.join(', ') 
                            : (registration as any).kidsPaymentId}</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return (
              <>
                {(() => {
                  // Check if this is a spouse-only payment (adding spouse to already-paid registration)
                  const isAddingSpouse = isEditing && !hadSpouseTicket && formData.spouseDinnerTicket && !hadSpousePayment;
                  // Check if this is a kids-only payment (adding kids to already-paid registration)
                  const isAddingKids = isEditing && kids.length > originalKidsCount;
                  
                  // If adding spouse or kids to paid registration, only calculate the new amount
                  let baseTotal: number;
                  if (isAddingSpouse && isAddingKids) {
                    const now = getCurrentEasternTime();
                    const spouseActive = pickActivePricingTier(event.spousePricing || [], now);
                    const spousePrice = typeof spouseActive?.price === 'number' ? spouseActive.price : 0;
                    const kidsActive = pickActivePricingTier(event.kidsPricing || [], now);
                    const pricePerKid = typeof kidsActive?.price === 'number' ? kidsActive.price : 0;
                    const newKidsCount = kids.length - originalKidsCount;
                    baseTotal = spousePrice + pricePerKid * newKidsCount;
                  } else if (isAddingSpouse) {
                    const now = getCurrentEasternTime();
                    const active = pickActivePricingTier(event.spousePricing || [], now);
                    baseTotal = typeof active?.price === 'number' ? active.price : 0;
                  } else if (isAddingKids) {
                    const now = getCurrentEasternTime();
                    const active = pickActivePricingTier(event.kidsPricing || [], now);
                    const pricePerKid = typeof active?.price === 'number' ? active.price : 0;
                    const newKidsCount = kids.length - originalKidsCount;
                    baseTotal = pricePerKid * newKidsCount;
                  } else {
                    // Normal flow: show full registration price (already discounted if discount was applied)
                    baseTotal = Number(formData.totalPrice || 0);
                  }
                  
                  // Apply discount ONLY for new registrations (not when editing existing ones)
                  let finalTotal = baseTotal;
                  if (discountCodeData && typeof discountCodeData.discountValue === 'number' && !isEditing) {
                    let discountAmount = 0;
                    if (discountCodeData.discountType === 'percentage') {
                      discountAmount = (baseTotal * discountCodeData.discountValue) / 100;
                    } else {
                      discountAmount = discountCodeData.discountValue;
                    }
                    finalTotal = Math.max(0, baseTotal - discountAmount);
                  }
                  
                  // Check if there's a pending payment
                  const pendingPaymentAmount = Number(formData.pendingPaymentAmount || 0);
                  const pendingPaymentReason = formData.pendingPaymentReason || '';
                  const hasPendingPayment = pendingPaymentAmount > 0;
                  
                  // If there's a pending payment, use it as the base total instead
                  const amountToPay = hasPendingPayment ? pendingPaymentAmount : finalTotal;
                  
                  const isCard = (formData.paymentMethod || 'Card') === 'Card';
                  // Calculate 3.5% convenience fee for card payments (on amount to pay)
                  const convenienceFee = isCard ? amountToPay * 0.035 : 0;
                  const totalWithFee = amountToPay + convenienceFee;
                  return (
                <div className="payment-summary">
                  {hasPendingPayment && (
                    <div style={{ 
                      backgroundColor: '#ffffff', 
                      borderLeft: '4px solid #ea580c', // Orange-600
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      borderRadius: '4px', 
                      padding: '16px', 
                      marginBottom: '20px' 
                    }}>
                      <div style={{ fontWeight: 700, color: '#ea580c', marginBottom: '8px', fontSize: '1.1rem' }}>
                        Payment Due
                      </div>
                      {pendingPaymentReason && (
                        <div style={{ color: '#4b5563', marginBottom: '8px', fontSize: '0.95rem' }}>
                          <strong style={{ color: '#374151' }}>Reason:</strong> {pendingPaymentReason}
                        </div>
                      )}
                      <div style={{ color: '#374151', fontSize: '1rem' }}>
                        <strong style={{ color: '#374151' }}>Amount Due:</strong> <span style={{ fontWeight: 600 }}>${pendingPaymentAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  {!isAddingSpouse && !isAddingKids && !hasPendingPayment && (
                  <div className="payment-item">
                    <span>{priceOverrideEnabled ? 'Registration Total:' : 'Conference Registration:'}</span>
                    <span>
                      ${(priceOverrideEnabled
                        ? Number(formData.totalPrice || 0)
                        : checkoutPackageLines.conference
                      ).toFixed(2)}
                    </span>
                  </div>
                  )}
                  {hasPendingPayment && (
                    <div className="payment-item">
                      <span>Outstanding Balance:</span>
                      <span>${pendingPaymentAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Only show breakdown if price is NOT overridden and NO pending payment */}
                  {!priceOverrideEnabled && !hasPendingPayment && (
                    <>
                      {(formData.spouseDinnerTicket && !isAddingSpouse && !isAddingKids) || isAddingSpouse || (isAddingSpouse && isAddingKids) ? (
                        <div className="payment-item">
                          <span>Spouse Dinner Ticket:</span>
                          <span>${checkoutPackageLines.spouse.toFixed(2)}</span>
                        </div>
                      ) : null}
                      {(kids.length > 0 && !isAddingKids && !isAddingSpouse) || isAddingKids || (isAddingSpouse && isAddingKids) ? (
                        <div className="payment-item">
                          <span>Child/Children Registration ({isAddingKids || (isAddingSpouse && isAddingKids) 
                            ? `${kids.length - originalKidsCount} ${(kids.length - originalKidsCount) === 1 ? 'child' : 'children'}`
                            : `${kids.length} ${kids.length === 1 ? 'child' : 'children'}`}):</span>
                          <span>${(function () {
                            if (isAddingKids || (isAddingSpouse && isAddingKids)) {
                              const now = getCurrentEasternTime();
                              const active = pickActivePricingTier(event.kidsPricing || [], now);
                              const pricePerKid = typeof active?.price === 'number' ? active.price : 0;
                              const kidsCount = kids.length - originalKidsCount;
                              return (pricePerKid * kidsCount).toFixed(2);
                            }
                            return checkoutPackageLines.kids.toFixed(2);
                          })()}</span>
                        </div>
                      ) : null}
                    </>
                  )}
                  {discountCodeData && typeof discountCodeData.discountValue === 'number' && (() => {
                    let discountAmount = 0;
                    if (discountCodeData.discountType === 'percentage') {
                      discountAmount = (baseTotal * discountCodeData.discountValue) / 100;
                    } else {
                      discountAmount = discountCodeData.discountValue;
                    }
                    return discountAmount > 0 ? (
                      <div className="payment-item" style={{ color: '#10b981' }}>
                        <span>Discount ({discountCodeData.code || 'N/A'}):</span>
                        <span>-${discountAmount.toFixed(2)}</span>
                      </div>
                    ) : null;
                  })()}
                  {!hasPendingPayment && (
                    <>
                      {isCard && convenienceFee > 0 && (
                        <div className="payment-item" style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                          <span>Convenience Fee (3.5%):</span>
                          <span>${convenienceFee.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="payment-total">
                        <span>Total {isCard ? 'Charged' : 'Due'}:</span>
                        <span>${totalWithFee.toFixed(2)} USD</span>
                      </div>
                      {isCard && (
                        <div className="payment-fee-note" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                          Base amount: ${finalTotal.toFixed(2)} + ${convenienceFee.toFixed(2)} fee = ${totalWithFee.toFixed(2)} total
                        </div>
                      )}
                    </>
                  )}
                  {hasPendingPayment && (
                    <>
                      {isCard && convenienceFee > 0 && (
                        <div className="payment-item" style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                          <span>Convenience Fee (3.5%):</span>
                          <span>${convenienceFee.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="payment-total">
                        <span>Total {isCard ? 'Charged' : 'Due'}:</span>
                        <span>${totalWithFee.toFixed(2)} USD</span>
                      </div>
                      {isCard && (
                        <div className="payment-fee-note" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                          Base amount: ${pendingPaymentAmount.toFixed(2)} + ${convenienceFee.toFixed(2)} fee = ${totalWithFee.toFixed(2)} total
                        </div>
                      )}
                    </>
                  )}
                </div>
                  );
                })()}
                {/* Only show discount code for new registrations, not updates */}
                {!isEditing && (
                  <div className="form-group">
                    <label className="form-label">Discount Code (Optional)</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <input
                        type="text"
                        className={`form-control ${discountCodeError ? 'error' : ''}`}
                        value={discountCodeInput}
                        onChange={(e) => {
                          const code = e.target.value.toUpperCase();
                          setDiscountCodeInput(code);
                          // Reset validation state when the user edits the code
                          setDiscountCodeError('');
                          setDiscountCodeData(null);
                          handleInputChange('discountCode', '');
                          handleInputChange('discountAmount', undefined);
                        }}
                        placeholder="Enter discount code"
                        disabled={validatingDiscountCode || isSubmitting}
                        style={{ textTransform: 'uppercase' }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!discountCodeInput.trim() || validatingDiscountCode || isSubmitting}
                        onClick={() => validateDiscountCode(discountCodeInput)}
                      >
                        {validatingDiscountCode ? 'Checking...' : 'Apply'}
                      </button>
                    </div>
                    {validatingDiscountCode && (
                      <small className="form-text text-muted" style={{ display: 'block', marginTop: '0.25rem' }}>
                        Validating...
                      </small>
                    )}
                    {discountCodeError && (
                      <div className="error-message" style={{ marginTop: '0.25rem' }}>{discountCodeError}</div>
                    )}
                    {discountCodeData && !discountCodeError && discountCodeData.discountValue !== undefined && typeof discountCodeData.discountValue === 'number' && (
                      <div style={{ marginTop: '0.25rem', color: '#10b981', fontSize: '0.875rem' }}>
                        ✓ Discount code applied: {discountCodeData.discountType === 'percentage' 
                          ? `${discountCodeData.discountValue}% off`
                          : `$${discountCodeData.discountValue.toFixed(2)} off`}
                      </div>
                    )}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <div className="segmented-group">
                    <label className="segmented-label">
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={(formData.paymentMethod || 'Card') === 'Card'}
                        onChange={() => handleInputChange('paymentMethod', 'Card')}
                      />
                      <span>Card</span>
                    </label>
                    <label className="segmented-label">
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={formData.paymentMethod === 'Check'}
                        onChange={() => handleInputChange('paymentMethod', 'Check')}
                      />
                      <span>Check</span>
                    </label>
                  </div>
                  <div className={`mt-half ${((formData.paymentMethod || 'Card') === 'Card') ? '' : 'card-fields-hidden'}`}>
                    {squareSdkLoading && (
                      <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                        Loading payment form...
                      </div>
                    )}
                    <div id="card-container" />
                  </div>
                  {formData.paymentMethod === 'Check' && (
                    <p className="payment-note">If you prefer by check, 
                    <br/>Please mail check prior to deadline to: 
                    <br/>EFBC Conference Inc 
                    <br/>127 Low Country Lane 
                    <br/>The Woodlands, TX 77380, USA </p>
                  )}
                </div>
              </>
                );
              })()}
            </div>
            );
          })()}

          <div className="modal-footer-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onBack} disabled={isSubmitting}>Cancel</button>
            {(() => {
              const paymentMethod = formData.paymentMethod || 'Card';
              const isAddingSpouse = isEditing && !hadSpouseTicket && formData.spouseDinnerTicket && !hadSpousePayment;
              const isAddingKids = isEditing && kids.length > originalKidsCount;
              const isAddingBoth = isAddingSpouse && isAddingKids;
              
              // Show combined payment button if both spouse and kids are being added
              if (!isAdminEdit && isAlreadyPaid && isAddingBoth && paymentMethod === 'Card') {
                return (
                  <button type="button" className="btn btn-primary btn-save" onClick={handleCombinedPayment} disabled={isSubmitting}>
                    {isSubmitting ? 'Processing...' : 'Pay for Spouse & Children Registration'}
                  </button>
                );
              }
              
              // Show spouse payment button only if registration is already paid and adding spouse (but not kids)
              if (!isAdminEdit && isAlreadyPaid && isAddingSpouse && paymentMethod === 'Card' && !isAddingKids) {
                return (
                  <button type="button" className="btn btn-primary btn-save" onClick={handleSpousePayment} disabled={isSubmitting}>
                    {isSubmitting ? 'Processing...' : 'Pay for Spouse Ticket'}
                  </button>
                );
              }
              
              // Show kids payment button only if registration is already paid and adding kids (but not spouse)
              if (!isAdminEdit && isAlreadyPaid && isAddingKids && paymentMethod === 'Card' && !isAddingSpouse) {
                return (
                  <button type="button" className="btn btn-primary btn-save" onClick={handleKidsPayment} disabled={isSubmitting}>
                    {isSubmitting ? 'Processing...' : 'Pay for Children Registration'}
                  </button>
                );
              }
              
              // Show submit button for Check payments, admin edits, or already paid registrations (not adding spouse or kids)
              if (isAdminEdit || (isAlreadyPaid && !isAddingSpouse && !isAddingKids) || paymentMethod === 'Check' || paymentMethod === 'Comp') {
                return (
                  <button className="btn btn-primary btn-save" type="submit" form="registration-form" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : (registration ? 'Update Registration' : 'Complete Registration')}
                  </button>
                );
              }
              
              // Show payment button for unpaid Card payments (including when adding spouse to unpaid registration)
              if (!isAdminEdit && !isAlreadyPaid && paymentMethod === 'Card') {
                return (
                  <button type="button" className="btn btn-primary btn-save" onClick={handleCardPay} disabled={isSubmitting}>
                    {isSubmitting ? 'Processing...' : 'Pay & Complete Registration'}
                  </button>
                );
              }
              
              return null;
            })()}
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserRegistration;


