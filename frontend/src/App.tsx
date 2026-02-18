import React, { useState, useEffect, useCallback } from 'react';
import { MOCK_REGISTRATIONS } from './data/mockData';
import { LoginPage } from './pages/authentication/login';
import { RegistrationPage } from './pages/authentication/registration';
import ResetPasswordPage from './pages/authentication/resetPassword';
import ResendVerificationPage from './pages/authentication/resendVerification';
import { Sidebar } from './components/Sidebar';
import { Modal } from './components/Modal';
import { UserDashboard } from './pages/user/userDashboard';
import { UserEvents } from './pages/user/userEvents';
import { UserRegistration } from './pages/user/userRegistration';
import { UserProfile } from './pages/user/userProfile';
import { UserSupport } from './pages/user/userSupport';
import { AdminEvents } from './pages/admin/adminEvents';
import { AdminEventForm } from './pages/admin/adminEventForm';
import { AdminAttendees } from './pages/admin/adminAttendees';
import { AdminGroups } from './pages/admin/adminGroups';
import { AdminUsers } from './pages/admin/adminUsers';
import { AdminCustomization, EmailCustomization, ContactCustomization } from './pages/admin/adminCustomization';
import { AdminProfile } from './pages/admin/adminProfile';
import { EventDetailsPage } from './pages/admin/eventsDetails';
import { Event, Registration, Group, User, RegisterForm } from './types';
import apiClient, { authApi } from './services/apiClient';
import { cancelApi, groupsApi } from './services/apiClient';
import { AdminCancellations } from './pages/admin/adminCancellations';

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [authInitializing, setAuthInitializing] = useState<boolean>(true);
  const [view, setView] = useState<string>('');
  const [events, setEvents] = useState<Event[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>(MOCK_REGISTRATIONS);
  const [groups, setGroups] = useState<Group[]>([]);
  const [viewingEventId, setViewingEventId] = useState<number | null>(null);
  const [user, setUser] = useState<User>({ id: 999, name: "Current User", email: "current.user@example.com" });
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationTargetEventId, setRegistrationTargetEventId] = useState<number | null>(null);
  const [adminEditingEvent, setAdminEditingEvent] = useState<Event | null>(null);
  const [adminEditingRegistrationId, setAdminEditingRegistrationId] = useState<number | null>(null);
  const [adminNewRegistrationUser, setAdminNewRegistrationUser] = useState<{ id: number; name: string; email: string } | null>(null);
  const [adminNewRegistrationEventId, setAdminNewRegistrationEventId] = useState<number | null>(null);
  const [pendingCancellationIds, setPendingCancellationIds] = useState<number[]>([]);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelTargetRegId, setCancelTargetRegId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  });
  const [cancellationPendingRows, setCancellationPendingRows] = useState<any[]>([]);
  const [cancellationApprovedRows, setCancellationApprovedRows] = useState<any[]>([]);
  const [cancellationsLoading, setCancellationsLoading] = useState<boolean>(false);
  const [emailCustomizationCache, setEmailCustomizationCache] = useState<EmailCustomization | null>(null);
  const [contactCustomizationCache, setContactCustomizationCache] = useState<ContactCustomization | null>(null);
  const [contactInfoCache, setContactInfoCache] = useState<{ contactEmail: string; contactPhone: string } | null>(null);
  const [faqsCache, setFaqsCache] = useState<any[] | null>(null);
  const [adminUsersCache, setAdminUsersCache] = useState<User[]>([]);
  const [adminUsersPaginationCache, setAdminUsersPaginationCache] = useState<any | null>(null);

  const handleAdminUsersCacheUpdate = useCallback(
    (users: User[], pagination: any | null) => {
      setAdminUsersCache(users);
      setAdminUsersPaginationCache(pagination);
    },
    []
  );

  useEffect(() => {
    document.body.className = `${theme}-theme`;
  }, [theme]);

  // Override default window.alert to use a centered modal
  useEffect(() => {
    const originalAlert = window.alert;
    (window as any).alert = (msg?: any) => {
      setAlertState({
        open: true,
        message: typeof msg === 'string' ? msg : String(msg),
      });
    };
    return () => {
      window.alert = originalAlert;
    };
  }, []);

  // Loader shared so pages can trigger refresh after CRUD
  const loadEventsFromApi = async () => {
    try {
      const response = await apiClient.get<Event[]>(`/events`);
      const apiEvents = (response as any).data || [];
      const parseArr = (v: any) => {
        if (Array.isArray(v)) return v;
        if (typeof v === 'string') {
          try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; }
        }
        return [];
      };
      const numOrUndef = (v: any) => {
        if (v === null || v === undefined || v === '') return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const normalized: Event[] = apiEvents.map((e: any) => ({
        id: e.id,
        year: new Date(e.date || e.startDate || e.endDate).getFullYear(),
        name: e.name,
        date: e.date,
        startDate: e.startDate || undefined,
        endDate: e.endDate || e.date || undefined,
        eventId: e.id,
        activities: Array.isArray(e.activities)
          ? e.activities
          : (typeof e.activities === 'string' && e.activities.trim().startsWith('[')
              ? JSON.parse(e.activities)
              : []),
        location: e.location,
        description: e.description,
        // Normalize pricing fields (handle camelCase/snake_case and stringified JSON)
        registrationPricing: parseArr(e.registrationPricing ?? e.registration_pricing),
        spousePricing: parseArr(e.spousePricing ?? e.spouse_pricing),
        breakfastPrice: numOrUndef(e.breakfastPrice ?? e.breakfast_price),
        breakfastEndDate: (e.breakfastEndDate ?? e.breakfast_end_date) || undefined,
        childLunchPrice: numOrUndef(e.childLunchPrice ?? e.child_lunch_price),
        kidsPricing: parseArr(e.kidsPricing ?? e.kids_pricing),
      }));
      setEvents(normalized);
    } catch (err) {
      console.error('Failed to load events from API:', err);
    }
  };

// Restore session and initial data once on mount
useEffect(() => {
  const init = async () => {
    // Skip auth check if on reset password or resend verification page
    if (window.location.pathname === '/reset-password' || window.location.pathname === '/resend-verification') {
      setAuthInitializing(false);
      return;
    }

    const token = localStorage.getItem('token');

    try {
      if (token) {
        const res = await authApi.me();
        const me = (res as any).data || {};
        if (me.role) {
          setRole(me.role);
          setUser({
            id: me.id || 999,
            name: me.name || 'Current User',
            email: me.email || 'current.user@example.com',
            role: me.role,
          });
          setView(me.role === 'admin' ? 'events' : 'dashboard');
        } else {
          localStorage.removeItem('token');
        }
      } else {
        // no token, stay on auth screens
      }

      // Load shared data regardless of auth so admin/user see latest lists after login
      await Promise.all([loadEventsFromApi(), loadRegistrationsFromApi(), loadGroupsFromApi()]);
    } catch (e) {
      if (token) {
        localStorage.removeItem('token');
      }
    } finally {
      setAuthInitializing(false);
    }
  };

  init();
}, []);

  // Load registrations from backend (persistence)
  const loadRegistrationsFromApi = async () => {
    try {
      // Fetch a large page of registrations so the admin Attendees view
      // can handle its own client-side pagination without being limited
      // by the backend default of 10 per page.
      const response = await apiClient.get<Registration[]>(`/registrations?page=1&limit=1500`);
      const apiRegs = (response as any).data || [];
      const normalized: Registration[] = apiRegs.map((r: any) => ({
        // Required
        id: r.id,
        userId: r.userId ?? r.user_id ?? 0,
        eventId: r.eventId ?? r.event_id ?? r.event ?? 0,
        status: r.status ?? 'active',
        cancellationReason: r.cancellation_reason,
        cancellationAt: r.cancellation_at,
        // Personal
        firstName: r.firstName ?? r.first_name ?? '',
        lastName: r.lastName ?? r.last_name ?? '',
        badgeName: r.badgeName ?? r.badge_name ?? `${r.firstName || ''}`.trim(),
        email: r.email ?? '',
        secondaryEmail: r.secondaryEmail ?? '',
        organization: r.organization ?? '',
        jobTitle: r.jobTitle ?? '',
        address: r.address ?? '',
        addressStreet: r.addressStreet ?? r.address_street ?? '',
        city: r.city ?? '',
        state: r.state ?? '',
        zipCode: r.zipCode ?? r.zip_code ?? '',
        country: r.country ?? '',
        mobile: r.mobile ?? '',
        officePhone: r.officePhone ?? '',
        isFirstTimeAttending: r.isFirstTimeAttending ?? true,
        companyType: r.companyType ?? '',
        companyTypeOther: r.companyTypeOther ?? '',
        emergencyContactName: r.emergencyContactName ?? '',
        emergencyContactPhone: r.emergencyContactPhone ?? '',
        // Conference
        wednesdayActivity: r.wednesdayActivity ?? r.category ?? 'None',
        wednesdayActivityWaitlisted: (() => {
          const v = r.wednesdayActivityWaitlisted ?? r.wednesday_activity_waitlisted;
          return v === true || v === 1 || v === '1';
        })(),
        wednesdayActivityWaitlistedAt: r.wednesdayActivityWaitlistedAt ?? r.wednesday_activity_waitlisted_at ?? undefined,
        golfHandicap: r.golfHandicap ?? '',
        golfClubPreference: r.golfClubPreference ?? 'Own Clubs',
        clubRentals: r.clubRentals ?? r.club_rentals ?? '',
        massageTimeSlot: r.massageTimeSlot ?? r.massage_time_slot ?? '',
        // Meals
        tuesdayEarlyReception: r.tuesdayEarlyReception ?? r.tuesday_early_reception ?? '',
        wednesdayReception: r.wednesdayReception ?? 'I will attend',
        thursdayBreakfast: r.thursdayBreakfast ?? 'I will attend',
        thursdayLuncheon: r.thursdayLuncheon ?? 'I will attend',
        thursdayDinner: r.thursdayDinner ?? 'I will attend',
        fridayBreakfast: r.fridayBreakfast ?? 'I will attend',
        dietaryRestrictions: r.dietaryRestrictions ?? '',
        specialRequests: r.specialRequests ?? r.special_requests ?? '',
        // Spouse
        spouseDinnerTicket: !!(r.spouseDinnerTicket ?? false),
        spouseFirstName: r.spouseFirstName ?? '',
        spouseLastName: r.spouseLastName ?? '',
        // Kids
        kids: r.kids ?? (r.kids_data ? (typeof r.kids_data === 'string' ? JSON.parse(r.kids_data) : r.kids_data) : undefined),
        kidsTotalPrice: r.kidsTotalPrice ?? r.kids_total_price ?? undefined,
        // Additional Information
        transportationMethod: r.transportationMethod ?? r.transportation_method ?? '',
        transportationDetails: r.transportationDetails ?? r.transportation_details ?? '',
        stayingAtBeachClub: r.stayingAtBeachClub !== undefined ? r.stayingAtBeachClub : (r.staying_at_beach_club !== undefined ? !!r.staying_at_beach_club : undefined),
        accommodationDetails: r.accommodationDetails ?? r.accommodation_details ?? '',
        dietaryRequirements: r.dietaryRequirements ?? (r.dietary_requirements ? (typeof r.dietary_requirements === 'string' ? JSON.parse(r.dietary_requirements) : r.dietary_requirements) : []),
        dietaryRequirementsOther: r.dietaryRequirementsOther ?? r.dietary_requirements_other ?? '',
        specialPhysicalNeeds: r.specialPhysicalNeeds !== undefined ? r.specialPhysicalNeeds : (r.special_physical_needs !== undefined ? !!r.special_physical_needs : undefined),
        specialPhysicalNeedsDetails: r.specialPhysicalNeedsDetails ?? r.special_physical_needs_details ?? '',
        // Payment
        totalPrice: Number(r.totalPrice ?? 675),
        paymentMethod: r.paymentMethod ?? 'Card',
        paid: r.paid ?? false,
        paidAt: r.paidAt ?? r.paid_at,
        squarePaymentId: r.squarePaymentId ?? r.square_payment_id,
        spousePaymentId: r.spousePaymentId ?? r.spouse_payment_id,
        spousePaidAt: r.spousePaidAt ?? r.spouse_paid_at,
        kidsPaymentId: r.kidsPaymentId ?? r.kids_payment_id,
        kidsPaidAt: r.kidsPaidAt ?? r.kids_paid_at,
        discountCode: r.discountCode ?? r.discount_code,
        discountAmount: r.discountAmount ?? r.discount_amount ?? undefined,
        // Tier tracking (optional)
        registrationTierLabel: r.registrationTierLabel ?? r.registration_tier_label ?? undefined,
        spouseTierLabel: r.spouseTierLabel ?? r.spouse_tier_label ?? undefined,
        spouseAddedAt: r.spouseAddedAt ?? r.spouse_added_at ?? undefined,
        kidsTierLabel: r.kidsTierLabel ?? r.kids_tier_label ?? undefined,
        kidsAddedAt: r.kidsAddedAt ?? r.kids_added_at ?? undefined,
        groupAssigned: r.groupAssigned ?? r.group_assigned ?? undefined,
        // Pending Payment
        originalTotalPrice: r.originalTotalPrice ?? r.original_total_price ?? undefined,
        paidAmount: r.paidAmount ?? r.paid_amount ?? undefined,
        pendingPaymentAmount: r.pendingPaymentAmount ?? r.pending_payment_amount ?? undefined,
        pendingPaymentReason: r.pendingPaymentReason ?? r.pending_payment_reason ?? undefined,
        pendingPaymentCreatedAt: r.pendingPaymentCreatedAt ?? r.pending_payment_created_at ?? undefined,
        // Timestamps
        createdAt: r.createdAt ?? r.created_at,
        updatedAt: r.updatedAt ?? r.updated_at,
        // Legacy
        name: r.name ?? `${r.firstName || ''} ${r.lastName || ''}`.trim(),
        category: r.category ?? (r.wednesdayActivity ?? 'Networking'),
      }));
      setRegistrations(normalized);

      // Also load any pending cancellation requests for the current user
      try {
        const pendingRes: any = await cancelApi.listMinePending();
        const pendingData = (pendingRes as any).data || pendingRes?.data || [];
        const regIds = Array.isArray(pendingData)
          ? pendingData.map((r: any) => Number(r.registration_id)).filter((id: any) => Number.isFinite(id))
          : [];
        setPendingCancellationIds(regIds);
      } catch (err) {
        console.warn('Failed to load pending cancellation requests for user:', err);
      }
    } catch (err) {
      console.error('Failed to load registrations from API:', err);
    }
  };

  const loadCancellationRequestsFromApi = async () => {
    setCancellationsLoading(true);
    try {
      const resPending: any = await cancelApi.list('pending');
      const dataPending = (resPending as any).data || resPending?.data || [];
      setCancellationPendingRows(Array.isArray(dataPending) ? dataPending : []);
      const resApproved: any = await cancelApi.list('approved');
      const dataApproved = (resApproved as any).data || resApproved?.data || [];
      setCancellationApprovedRows(Array.isArray(dataApproved) ? dataApproved : []);
    } catch (err) {
      console.warn('Failed to load cancellation requests:', err);
    } finally {
      setCancellationsLoading(false);
    }
  };

  const loadGroupsFromApi = async () => {
    try {
      const res: any = await groupsApi.list({ page: 1, limit: 500 });
      const data = (res as any).data || res?.data || [];
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load groups from API:', err);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleLogin = async (selectedRole: 'admin' | 'user') => {
    try {
      const res = await authApi.me();
      const me = (res as any).data || {};
      if (me && (me.id || me.email)) {
        setUser({ id: me.id || 0, name: me.name || 'Current User', email: me.email || '', role: me.role || selectedRole });
        setRole((me.role as any) || selectedRole);
      } else {
        setRole(selectedRole);
      }
    } catch {
      setRole(selectedRole);
    }
    // Ensure we load fresh data right after login
    await loadEventsFromApi();
    await loadRegistrationsFromApi();
    setView(selectedRole === 'admin' ? 'events' : 'dashboard');
  };

const handleLogout = () => {
    setRole(null);
    setView('');
    setShowRegistration(false);
  localStorage.removeItem('token');
  // Ensure auth pages default to light theme
  setTheme('light');
  };

  const handleRegister = async (formData: RegisterForm) => {
    try {
      // Registration page already stored token after calling /users/register + login
      const res = await authApi.me();
      const payload: any = (res as any).data || res;
      const me = payload?.data || payload;
      const newUser: User = {
        id: me.id,
        name: me.name || `${(formData as any).firstName} ${(formData as any).lastName}`.trim(),
        email: me.email || formData.email,
        role: me.role || 'user'
      };
      setUser(newUser);
      setRole(newUser.role as any);
      setView('dashboard');
      setShowRegistration(false);
      alert(`Welcome to EFBC Conference Portal, ${newUser.name}! Your account has been created successfully.`);
    } catch {
      // Fallback if /auth/me not available yet; still proceed with minimal state
      setUser({ id: 0, name: `${(formData as any).firstName} ${(formData as any).lastName}`.trim(), email: formData.email, role: 'user' });
      setRole('user');
      setView('dashboard');
      setShowRegistration(false);
      alert(`Welcome to EFBC Conference Portal, ${(formData as any).firstName}! Your account has been created successfully.`);
    }
  };

  const handleBackToLogin = () => {
    setShowRegistration(false);
  };

  const handleShowRegistration = () => {
    setShowRegistration(true);
  };

  const beginRegistration = (eventId?: number) => {
    setRegistrationTargetEventId(eventId ?? null);
    setView('registration');
  };
  
  const beginAdminEditRegistration = (registrationId: number) => {
    setAdminEditingRegistrationId(registrationId);
    setView('editRegistration');
  };

  const beginAdminCreateRegistrationForUser = (userInfo: { id: number; name: string; email: string }, eventId: number) => {
    setAdminNewRegistrationUser(userInfo);
    setAdminNewRegistrationEventId(eventId);
    setView('createRegistration');
  };
  const openAdminEventForm = (ev?: Event | null) => {
    setAdminEditingEvent(ev || null);
    setView('eventForm');
  };

  const handleSaveAdminEvent = async (eventData: Event) => {
    try {
      if (eventData.id && adminEditingEvent) {
        const { createdAt, updatedAt, ...updatePayload } = eventData as any;
        const res = await apiClient.put(`/events/${eventData.id}`, updatePayload);
        if (!res.success) throw new Error('Update failed');
        alert('Event updated successfully!');
      } else {
        const { id, createdAt, updatedAt, ...createPayload } = eventData as any;
        const res = await apiClient.post(`/events`, createPayload);
        if (!res.success) throw new Error('Create failed');
        alert('Event created successfully!');
      }
      await loadEventsFromApi();
      setAdminEditingEvent(null);
      setView('events');
    } catch (e) {
      console.error('Failed to save event', e);
      alert('Failed to save event');
    }
  };
  
  const handleSaveRegistration = (regData: Registration, currentUserId?: number) => {
    const userId = regData.userId || currentUserId || user.id;
    const finalRegistration: Registration = { ...regData, userId, id: regData.id || 0 } as any;

    // Persist to backend and then refresh list.
    const save = async () => {
      try {
        // Do not send timestamps on write
        const { createdAt, updatedAt, ...payload } = finalRegistration as any;

        // Decide create vs update based on existing local registration
        const existing = registrations.find(r => r.userId === userId && r.eventId === (payload.eventId as number));
        if (existing || regData.id) {
          const idToUpdate = regData.id || existing?.id;
          if (!idToUpdate) {
            // should not happen, but fall back to create
            const { id, ...createPayload } = payload as any;
            await apiClient.post(`/registrations`, createPayload);
          } else {
            try {
              await apiClient.put(`/registrations/${idToUpdate}`, { ...payload, id: idToUpdate });
            } catch (err: any) {
              if (err?.status === 404 || err?.response?.status === 404) {
                const { id, ...createPayload } = payload as any;
                await apiClient.post(`/registrations`, createPayload);
              } else {
                throw err;
              }
            }
          }
        } else {
          const { id, ...createPayload } = payload as any;
          await apiClient.post(`/registrations`, createPayload);
        }
      } catch (e) {
        console.error('Failed to save registration to API, falling back to local:', e);
        // Fallback local upsert if API fails
        const localId = regData.id || Date.now();
        const localFinal = { ...finalRegistration, id: localId } as Registration;
        setRegistrations(prev => {
          const exists = prev.some(r => r.id === localId);
          if (exists) return prev.map(r => (r.id === localId ? localFinal : r));
          return [...prev, localFinal];
        });
        return;
      }
      await loadRegistrationsFromApi();
    };
    save();
  };

  const handleCancelRegistration = (regId: number) => {
    setCancelTargetRegId(regId);
    setCancelReason('');
    setCancelError(null);
    setCancelModalOpen(true);
  };

  const confirmCancelRegistration = async () => {
    if (!cancelTargetRegId) return;
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      await cancelApi.request(cancelTargetRegId, cancelReason.trim());
      setPendingCancellationIds(prev =>
        prev.includes(cancelTargetRegId) ? prev : [...prev, cancelTargetRegId],
      );
      setCancelModalOpen(false);
    } catch (e: any) {
      setCancelError(e?.response?.data?.error || 'Failed to submit cancellation request');
    } finally {
      setCancelSubmitting(false);
    }
  };

  const handleUpdateProfile = async (updatedData: Partial<User>) => {
    try {
      const res = await authApi.updateProfile({
        name: updatedData.name || user.name,
        email: updatedData.email || user.email
      });
      const payload: any = (res as any).data || {};
      const newUser = payload.user || payload;
      const newToken = payload.token;
      if (newToken) localStorage.setItem('token', newToken);
      if (newUser) setUser(prev => ({ ...prev, ...newUser }));

      setRegistrations(regs => regs.map(r => {
        if (r.userId === user.id) {
          return { ...r, name: newUser?.name || updatedData.name || r.name, email: newUser?.email || updatedData.email || r.email };
        }
        return r;
      }));
      alert('Profile updated successfully!');
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to update profile');
    }
  };

  // Removed unused handleDeleteEvent to satisfy CI lint rules

  const handleDeleteGroup = async (groupId: number) => {
    if (!window.confirm("Are you sure you want to delete this group? All members will become unassigned.")) {
      return;
    }
    try {
      await groupsApi.remove(groupId);
      setGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (e) {
      console.error('Failed to delete group', e);
      alert('Failed to delete group. Please try again.');
    }
  };

  const handleCreateGroup = async (groupData: Omit<Group, 'id'>) => {
    try {
      const res: any = await groupsApi.create(groupData);
      const created = (res as any).data || res?.data;
      if (created) {
        setGroups(prev => [...prev, created as Group]);
      } else {
        // Fallback: reload from API
        await loadGroupsFromApi();
      }
    } catch (e) {
      console.error('Failed to create group', e);
      alert('Failed to create group. Please try again.');
    }
  };
  
  const handleDeleteRegistrations = (regIds: number[]) => {
    setRegistrations(regs => regs.filter(r => !regIds.includes(r.id)));
    setGroups(grps => grps.map(g => ({
      ...g,
      members: g.members.filter(m => !regIds.includes(m))
    })));
  };

  const handleBulkAssignGroup = (regIds: number[], targetGroupId: number) => {
    const targetGroup = groups.find(g => g.id === targetGroupId);
    if (!targetGroup) return;

    const validRegsToMove = registrations
      .filter(r => regIds.includes(r.id) && r.category === targetGroup.category)
      .map(r => r.id);

    if (validRegsToMove.length === 0) {
      alert(`None of the selected attendees are in the "${targetGroup.category}" category.`);
      return;
    }

    setGroups(currentGroups => {
      const cleanedGroups = currentGroups.map(g => {
        if (g.id === targetGroupId) return g;
        return { ...g, members: g.members.filter(m => !validRegsToMove.includes(m)) };
      });

      return cleanedGroups.map(g => {
        if (g.id === targetGroupId) {
          const newMembers = [...g.members];
          validRegsToMove.forEach(memberId => {
            if (!newMembers.includes(memberId)) newMembers.push(memberId);
          });
          return { ...g, members: newMembers };
        }
        return g;
      });
    });
    
    alert(`Successfully assigned ${validRegsToMove.length} attendee(s) to "${targetGroup.name}".`);
  };

  const loadContactCustomizationFromApi = async () => {
    try {
      const response = await apiClient.get('/customization/contact') as any;
      if (response.success && response.data) {
        setContactCustomizationCache({
          id: response.data.id,
          contactEmail: response.data.contactEmail || '',
          contactPhone: response.data.contactPhone || '',
          updatedAt: response.data.updatedAt,
        });
      }
    } catch (err) {
      console.warn('Failed to load contact customization:', err);
    }
  };

  const loadContactInfoFromApi = async () => {
    if (contactInfoCache) return; // Already loaded
    try {
      const response = await apiClient.get('/customization/contact/public') as any;
      if (response.success && response.data) {
        setContactInfoCache({
          contactEmail: response.data.contactEmail || 'info@efbcconference.org',
          contactPhone: response.data.contactPhone || '',
        });
      } else {
        // Set default if no data
        setContactInfoCache({
          contactEmail: 'info@efbcconference.org',
          contactPhone: '',
        });
      }
    } catch (err) {
      console.warn('Failed to load contact info:', err);
      // Set default on error
      setContactInfoCache({
        contactEmail: 'info@efbcconference.org',
        contactPhone: '',
      });
    }
  };

  const loadFaqsFromApi = async () => {
    if (faqsCache !== null) return; // Already loaded
    try {
      const response = await apiClient.get('/customization/faq/public') as any;
      if (response.success && response.data) {
        setFaqsCache(Array.isArray(response.data) ? response.data : []);
      } else {
        setFaqsCache([]);
      }
    } catch (err) {
      console.warn('Failed to load FAQs:', err);
      setFaqsCache([]);
    }
  };

  const loadEmailCustomizationFromApi = async () => {
    try {
      const response = await apiClient.get('/customization/email') as any;
      if (response.success && response.data) {
        setEmailCustomizationCache({
          id: response.data.id,
          headerText: response.data.headerText || '',
          footerText: response.data.footerText || '',
          updatedAt: response.data.updatedAt,
        });
      }
    } catch (err) {
      console.warn('Failed to load email customization:', err);
    }
  };

  const handleSetActiveView = (newView: string) => {
    setViewingEventId(null);
    setView(newView);
    setMobileSidebarOpen(false);
    
    // Scroll to top when view changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if (role === 'admin' && newView === 'cancellations') {
      // Only load from API if we don't already have data cached
      if (
        !cancellationsLoading &&
        cancellationPendingRows.length === 0 &&
        cancellationApprovedRows.length === 0
      ) {
        loadCancellationRequestsFromApi();
      }
    }
    if (role === 'admin' && newView === 'customization') {
      if (!emailCustomizationCache) {
        loadEmailCustomizationFromApi();
      }
      if (!contactCustomizationCache) {
        loadContactCustomizationFromApi();
      }
    }
    if (role === 'user' && newView === 'support') {
      // Load support page data only once
      loadContactInfoFromApi();
      loadFaqsFromApi();
    }
  };

  const renderView = () => {
    if (role === 'user') {
      switch(view) {
        case 'events':
          return <UserEvents
            events={events}
            registrations={registrations}
            handleSaveRegistration={(regData) => handleSaveRegistration(regData, user.id)}
            handleCancelRegistration={handleCancelRegistration}
            user={user}
            onBeginRegistration={(eventId?: number) => beginRegistration(eventId)}
            pendingCancellationIds={pendingCancellationIds}
          />;
        case 'profile':
          return <UserProfile user={user} onUpdateProfile={handleUpdateProfile} />;
        case 'support':
          return <UserSupport 
            initialContactInfo={contactInfoCache}
            initialFaqs={faqsCache}
            onLoadContactInfo={loadContactInfoFromApi}
            onLoadFaqs={loadFaqsFromApi}
          />;
        case 'dashboard':
        default:
          return <UserDashboard 
            events={events} 
            registrations={registrations} 
            handleSaveRegistration={(regData) => handleSaveRegistration(regData, user.id)}
            handleCancelRegistration={handleCancelRegistration}
            user={user} 
            onBeginRegistration={() => beginRegistration()}
            pendingCancellationIds={pendingCancellationIds}
          />;
        case 'registration':
          return <UserRegistration
            events={events}
            registrations={registrations}
            user={user}
            targetEventId={registrationTargetEventId}
            onBack={() => setView('dashboard')}
            onSave={(regData) => handleSaveRegistration(regData, user.id)}
          />;
      }
    }
    if (role === 'admin') {
      if (view === 'events' && viewingEventId) {
        const event = events.find(e => e.id === viewingEventId);
        if (!event) {
          setViewingEventId(null);
          return null;
        }
        return <EventDetailsPage 
          event={event} 
          registrations={registrations}
          groups={groups}
          onBack={() => setViewingEventId(null)}
          onRefreshRegistrations={loadRegistrationsFromApi}
        />;
      }

      switch(view) {
        case 'events':
          return <AdminEvents 
            events={events}
            onViewEvent={setViewingEventId}
            onRefreshEvents={loadEventsFromApi}
            onOpenEventForm={openAdminEventForm}
          />;
        case 'eventForm':
          return <AdminEventForm 
            event={adminEditingEvent}
            onCancel={()=>{ setAdminEditingEvent(null); setView('events'); }}
            onSave={handleSaveAdminEvent}
          />;
        case 'profile':
          return <AdminProfile user={user} onUpdateProfile={handleUpdateProfile} />;
        case 'attendees':
          return <AdminAttendees 
            registrations={registrations}
            events={events}
            groups={groups}
            handleSaveRegistration={handleSaveRegistration}
            handleDeleteRegistrations={handleDeleteRegistrations}
            handleBulkAssignGroup={handleBulkAssignGroup}
            user={user}
            onEditRegistration={beginAdminEditRegistration}
            onAddRegistration={beginAdminCreateRegistrationForUser}
          />;
        case 'groups':
          return <AdminGroups 
            registrations={registrations} 
            groups={groups} 
            events={events}
            setGroups={setGroups} 
            handleDeleteGroup={handleDeleteGroup}
            handleCreateGroup={handleCreateGroup}
          />;
        case 'cancellations':
          return (
            <AdminCancellations
              pendingRows={cancellationPendingRows}
              approvedRows={cancellationApprovedRows}
              loading={cancellationsLoading}
              onReload={loadCancellationRequestsFromApi}
              onChanged={loadRegistrationsFromApi}
            />
          );
        case 'allUsers':
          return (
            <AdminUsers
              initialUsers={adminUsersCache}
              initialPagination={adminUsersPaginationCache}
              onCacheUpdate={handleAdminUsersCacheUpdate}
            />
          );
        case 'customization':
          return (
            <AdminCustomization
              initialCustomization={emailCustomizationCache}
              initialContactCustomization={contactCustomizationCache}
              onCacheUpdate={(c) => setEmailCustomizationCache(c)}
              onContactCacheUpdate={(c) => setContactCustomizationCache(c)}
            />
          );
        case 'editRegistration':
          const editingReg = registrations.find(r => r.id === adminEditingRegistrationId);
          if (!editingReg) {
            setView('attendees');
            return null;
          }
          const regUser = { id: editingReg.userId, name: editingReg.name, email: editingReg.email };
          return <UserRegistration
            events={events}
            registrations={registrations}
            user={regUser}
            targetEventId={editingReg.eventId}
            onBack={() => {
              setAdminEditingRegistrationId(null);
              setView('attendees');
            }}
            onSave={(regData) => {
              handleSaveRegistration(regData);
              setAdminEditingRegistrationId(null);
              setView('attendees');
            }}
            isAdminEdit={true}
          />;
        case 'createRegistration':
          if (!adminNewRegistrationUser || !adminNewRegistrationEventId) {
            setView('attendees');
            return null;
          }
          return (
            <UserRegistration
              events={events}
              registrations={registrations}
              user={adminNewRegistrationUser}
              targetEventId={adminNewRegistrationEventId}
              onBack={() => {
                setAdminNewRegistrationUser(null);
                setAdminNewRegistrationEventId(null);
                setView('attendees');
              }}
              onSave={(regData) => {
                handleSaveRegistration(regData, adminNewRegistrationUser.id);
                setAdminNewRegistrationUser(null);
                setAdminNewRegistrationEventId(null);
                setView('attendees');
              }}
              isAdminEdit={true}
            />
          );
        default:
          return <AdminEvents 
            events={events}
            onViewEvent={setViewingEventId}
            onRefreshEvents={loadEventsFromApi}
          />;
      }
    }
    return null;
  };

  if (authInitializing) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  if (!role) {
    if (window.location.pathname === '/reset-password') {
      return <ResetPasswordPage />;
    }
    if (window.location.pathname === '/resend-verification') {
      return <ResendVerificationPage />;
    }
    if (showRegistration) {
      return <RegistrationPage onRegister={handleRegister} onBackToLogin={handleBackToLogin} />;
    }
    return <LoginPage onLogin={handleLogin} onShowRegistration={handleShowRegistration} />;
  }

  return (
    <div className="app-layout">
      <Sidebar 
        role={role} 
        onLogout={handleLogout} 
        theme={theme} 
        toggleTheme={toggleTheme} 
        activeView={view}
        setActiveView={handleSetActiveView}
        isMobileOpen={isMobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />
      <main className="main-content">
        <header className="mobile-header no-print">
          <div className="logo">EFBC</div>
          <button className="icon-btn menu-toggle" onClick={() => setMobileSidebarOpen(true)} aria-label="Open menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        </header>
        {renderView()}
        {cancelModalOpen && (
          <Modal
            title="Cancel Registration"
            onClose={() => !cancelSubmitting && setCancelModalOpen(false)}
          >
            <div className="form-group">
              <p>Please share a brief reason for your cancellation request and we will be in touch soon.</p>
              <label htmlFor="cancelReason" className="form-label">Reason for cancellation</label>
              <textarea
                id="cancelReason"
                className="form-control"
                rows={4}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Example: schedule conflict, travel issues, etc."
                disabled={cancelSubmitting}
              />
            </div>
            {cancelError && <div className="error-message" style={{ marginTop: '0.5rem' }}>{cancelError}</div>}
            <div className="modal-footer-actions" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCancelModalOpen(false)}
                disabled={cancelSubmitting}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmCancelRegistration}
                disabled={cancelSubmitting}
              >
                {cancelSubmitting ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </Modal>
        )}
        {alertState.open && (
          <Modal
            title="Notification"
            onClose={() => setAlertState({ open: false, message: '' })}
          >
            <p>{alertState.message}</p>
            <div className="modal-footer-actions" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setAlertState({ open: false, message: '' })}
              >
                OK
              </button>
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
};

export default App;
