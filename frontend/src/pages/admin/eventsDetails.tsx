import React, { useMemo, useEffect, useState } from 'react';
import { Event, Registration, DiscountCode } from '../../types';
import { getActivityNames, getActivitySeatLimit } from '../../utils/eventUtils';
import { formatDateShort } from '../../utils/dateUtils';
import apiClient from '../../services/apiClient';
import { Modal } from '../../components/Modal';
import * as XLSX from 'xlsx';

type PricingTier = { label?: string; price?: number; startDate?: string; endDate?: string };

const getEasternYmd = (dateValue?: any): string => {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value || '';
  const m = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  return y && m && day ? `${y}-${m}-${day}` : '';
};

const normalizeTierDate = (d?: string): string | null => {
  if (!d) return null;
  // Accept YYYY-MM-DD or ISO strings; keep just the date part for comparisons
  const s = String(d).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
};

const inferTierLabelFromDate = (tiersRaw: PricingTier[] | undefined, dateValue?: any): string => {
  const tiers = Array.isArray(tiersRaw) ? tiersRaw : [];
  if (tiers.length === 0) return 'N/A';

  const ymd = getEasternYmd(dateValue);
  if (!ymd) return 'N/A';

  const mapped = tiers
    .map(t => ({
      label: t.label || 'N/A',
      s: normalizeTierDate(t.startDate) || '0000-01-01',
      e: normalizeTierDate(t.endDate) || '9999-12-31',
    }))
    .sort((a, b) => a.s.localeCompare(b.s));

  const hit = mapped.find(t => ymd >= t.s && ymd <= t.e);
  if (hit) return hit.label;

  // If outside all ranges, clamp to nearest end.
  const first = mapped[0];
  const last = mapped[mapped.length - 1];
  if (ymd < first.s) return first.label;
  if (ymd > last.e) return last.label;
  return 'N/A';
};

interface EventDetailsPageProps {
  event: Event;
  registrations: Registration[];
  groups: any[];
  onBack: () => void;
  onRefreshRegistrations?: () => Promise<void> | void;
}

export const EventDetailsPage: React.FC<EventDetailsPageProps> = ({ 
  event, 
  registrations, 
  groups, 
  onBack,
  onRefreshRegistrations
}) => {
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [discountUsersCode, setDiscountUsersCode] = useState<DiscountCode | null>(null);
  const [discountUsersSearch, setDiscountUsersSearch] = useState('');
  const [tierUsersModal, setTierUsersModal] = useState<{ type: 'Registration' | 'Spouse' | 'Children'; label: string } | null>(null);
  const [tierUsersSearch, setTierUsersSearch] = useState('');
  const [waitlistActivity, setWaitlistActivity] = useState<string | null>(null);
  const [waitlistSearch, setWaitlistSearch] = useState('');
  const [promoteLoadingId, setPromoteLoadingId] = useState<number | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Load discount codes for this event
  useEffect(() => {
    if (event?.id) {
      loadDiscountCodes(event.id);
    }
  }, [event?.id]);

  const loadDiscountCodes = async (eventId: number) => {
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/discount-codes/events/${eventId}`);
      const data = await res.json();
      if (data.success) {
        setDiscountCodes(data.data || []);
      } else {
        console.error('Failed to load discount codes:', data.error);
        setDiscountCodes([]);
      }
    } catch (error) {
      console.error('Error loading discount codes:', error);
      setDiscountCodes([]);
    }
  };

  // Get active registrations for this event (excluding cancelled)
  const activeRegistrations = useMemo(() => {
    return registrations.filter(r => 
      r.eventId === event.id && 
      r.status !== 'cancelled' &&
      !(r as any).cancellationAt
    );
  }, [registrations, event.id]);

  // Registrations that used a discount code (per code)
  const discountUseCounts = useMemo(() => {
    const map: Record<string, number> = {};
    registrations
      .filter(r => r.eventId === event.id)
      .forEach(r => {
        const c = (r.discountCode || '').toUpperCase().trim();
        if (!c) return;
        map[c] = (map[c] || 0) + 1;
      });
    return map;
  }, [registrations, event.id]);

  const discountCodeUsers = useMemo(() => {
    if (!discountUsersCode?.code) return [];
    const code = discountUsersCode.code.toUpperCase().trim();
    const q = discountUsersSearch.trim().toLowerCase();

    return registrations
      .filter(r => r.eventId === event.id)
      .filter(r => (r.discountCode || '').toUpperCase().trim() === code)
      .filter(r => {
        if (!q) return true;
        const hay = [
          r.badgeName,
          r.firstName,
          r.lastName,
          r.email,
          r.organization,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort(
        (a, b) =>
          (a.lastName || '').localeCompare(b.lastName || '') ||
          (a.firstName || '').localeCompare(b.firstName || '')
      );
  }, [discountUsersCode, discountUsersSearch, registrations, event.id]);

  // ---------- Pricing tier users (Registration / Spouse / Children) ----------
  const registrationTierUseCounts = useMemo(() => {
    const map: Record<string, number> = {};
    registrations
      .filter(r => r.eventId === event.id)
      .forEach(r => {
        const createdAt = (r as any).createdAt || (r as any).created_at;
        const stored = (r as any).registrationTierLabel;
        const label = stored || inferTierLabelFromDate(event.registrationPricing, createdAt) || 'N/A';
        map[label] = (map[label] || 0) + 1;
      });
    return map;
  }, [registrations, event.id, event.registrationPricing]);

  const spouseTierUseCounts = useMemo(() => {
    const map: Record<string, number> = {};
    registrations
      .filter(r => r.eventId === event.id)
      .forEach(r => {
        const hasSpouse = !!(r as any).spouseDinnerTicket;
        if (!hasSpouse) return;
        const createdAt = (r as any).createdAt || (r as any).created_at;
        const spouseAddedAt = (r as any).spouseAddedAt || createdAt;
        const stored = (r as any).spouseTierLabel;
        const label = stored || inferTierLabelFromDate(event.spousePricing, spouseAddedAt) || 'N/A';
        map[label] = (map[label] || 0) + 1;
      });
    return map;
  }, [registrations, event.id, event.spousePricing]);

  const kidsTierUseCounts = useMemo(() => {
    const map: Record<string, number> = {};
    registrations
      .filter(r => r.eventId === event.id)
      .forEach(r => {
        const kidsCount = Array.isArray((r as any).kids) ? (r as any).kids.length : 0;
        if (kidsCount <= 0) return;
        const createdAt = (r as any).createdAt || (r as any).created_at;
        const kidsAddedAt = (r as any).kidsAddedAt || createdAt;
        const stored = (r as any).kidsTierLabel;
        const label = stored || inferTierLabelFromDate(event.kidsPricing, kidsAddedAt) || 'N/A';
        map[label] = (map[label] || 0) + 1;
      });
    return map;
  }, [registrations, event.id, event.kidsPricing]);

  const tierUsers = useMemo(() => {
    if (!tierUsersModal) return [];
    const q = tierUsersSearch.trim().toLowerCase();
    const { type, label } = tierUsersModal;

    return registrations
      .filter(r => r.eventId === event.id)
      .filter(r => {
        if (type === 'Registration') {
          const createdAt = (r as any).createdAt || (r as any).created_at;
          const stored = (r as any).registrationTierLabel;
          const effective = stored || inferTierLabelFromDate(event.registrationPricing, createdAt) || 'N/A';
          return effective === label;
        }
        if (type === 'Spouse') {
          const hasSpouse = !!(r as any).spouseDinnerTicket;
          if (!hasSpouse) return false;
          const createdAt = (r as any).createdAt || (r as any).created_at;
          const spouseAddedAt = (r as any).spouseAddedAt || createdAt;
          const stored = (r as any).spouseTierLabel;
          const effective = stored || inferTierLabelFromDate(event.spousePricing, spouseAddedAt) || 'N/A';
          return effective === label;
        }
        // Children
        const kidsCount = Array.isArray((r as any).kids) ? (r as any).kids.length : 0;
        if (kidsCount <= 0) return false;
        const createdAt = (r as any).createdAt || (r as any).created_at;
        const kidsAddedAt = (r as any).kidsAddedAt || createdAt;
        const stored = (r as any).kidsTierLabel;
        const effective = stored || inferTierLabelFromDate(event.kidsPricing, kidsAddedAt) || 'N/A';
        return effective === label;
      })
      .filter(r => {
        if (!q) return true;
        const hay = [
          r.badgeName,
          r.firstName,
          r.lastName,
          r.email,
          r.organization,
          (r as any).spouseFirstName,
          (r as any).spouseLastName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort(
        (a, b) =>
          (a.lastName || '').localeCompare(b.lastName || '') ||
          (a.firstName || '').localeCompare(b.firstName || '')
      );
  }, [
    tierUsersModal,
    tierUsersSearch,
    registrations,
    event.id,
    event.registrationPricing,
    event.spousePricing,
    event.kidsPricing,
  ]);

  const exportTierUsersXlsx = () => {
    if (!tierUsersModal) return;

    const safe = (s: string) =>
      String(s || '')
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);

    const nowEst = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    const titleRows: any[][] = [
      ['TIER TYPE', tierUsersModal.type],
      ['TIER', tierUsersModal.label],
      ['EVENT', event.name],
      ['EXPORTED AT (EST)', nowEst],
      [],
    ];

    const baseHeaders = ['ID', 'Badge Name', 'First', 'Last', 'Email', 'Organization', 'Created At (EST)', 'Status'];
    const spouseHeaders = ['Spouse First', 'Spouse Last', 'Spouse Added At (EST)'];
    const kidsHeaders = ['Kids Count', 'Kids Added At (EST)'];

    const headers =
      tierUsersModal.type === 'Spouse'
        ? [...baseHeaders, ...spouseHeaders]
        : tierUsersModal.type === 'Children'
          ? [...baseHeaders, ...kidsHeaders]
          : baseHeaders;

    const rows = tierUsers.map((r) => {
      const isCancelled = r.status === 'cancelled' || !!(r as any).cancellationAt;
      const createdAt = (r as any).createdAt || (r as any).created_at;
      const base = [
        r.id,
        r.badgeName || `${r.firstName} ${r.lastName}`.trim(),
        r.firstName,
        r.lastName,
        r.email,
        r.organization,
        formatDateTimeEST(createdAt),
        isCancelled ? 'Cancelled' : 'Active',
      ];

      if (tierUsersModal.type === 'Spouse') {
        const spouseAddedAt = (r as any).spouseAddedAt || createdAt;
        return [
          ...base,
          (r as any).spouseFirstName || '',
          (r as any).spouseLastName || '',
          formatDateTimeEST(spouseAddedAt),
        ];
      }

      if (tierUsersModal.type === 'Children') {
        const kidsAddedAt = (r as any).kidsAddedAt || createdAt;
        const kidsCount = Array.isArray((r as any).kids) ? (r as any).kids.length : 0;
        return [...base, kidsCount, formatDateTimeEST(kidsAddedAt)];
      }

      return base;
    });

    const ws = XLSX.utils.aoa_to_sheet([...titleRows, headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tier Users');

    const fileName = `TierUsers_${safe(event.name)}_${safe(tierUsersModal.type)}_${safe(tierUsersModal.label)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Get activity details with seat availability
  const activityDetails = useMemo(() => {
    const activities = getActivityNames(event.activities || []);
    
    // Count registrations per activity (moved inside useMemo to avoid dependency issues)
    const getConfirmedCount = (activityName: string): number => {
      return activeRegistrations.filter(reg =>
        reg.wednesdayActivity === activityName &&
        !(reg as any).wednesdayActivityWaitlisted
      ).length;
    };

    const getWaitlistedCount = (activityName: string): number => {
      return activeRegistrations.filter(reg =>
        reg.wednesdayActivity === activityName &&
        !!(reg as any).wednesdayActivityWaitlisted
      ).length;
    };
    
    return activities.map(activityName => {
      const seatLimit = getActivitySeatLimit(event.activities, activityName);
      const confirmedCount = getConfirmedCount(activityName);
      const waitlistedCount = getWaitlistedCount(activityName);
      const remaining = seatLimit !== undefined ? seatLimit - confirmedCount : null;
      
      return {
        name: activityName,
        seatLimit,
        confirmedCount,
        waitlistedCount,
        remaining,
        isFull: seatLimit !== undefined && remaining !== null && remaining <= 0
      };
    });
  }, [event.activities, activeRegistrations]);

  const startDateStr = event.startDate ? formatDateShort(event.startDate) : null;
  const endDateStr = formatDateShort(event.date || event.endDate || '');
  const dateDisplay = startDateStr ? `${startDateStr} - ${endDateStr}` : endDateStr;

  const selectedActivityDetails = useMemo(() => {
    if (!waitlistActivity) return null;
    return activityDetails.find(a => a.name === waitlistActivity) || null;
  }, [waitlistActivity, activityDetails]);

  const formatDateTimeEST = (dateValue?: string): string => {
    if (!dateValue) return '';
    try {
      return new Date(dateValue).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      });
    } catch {
      return '';
    }
  };

  const waitlistedRegistrations = useMemo(() => {
    if (!waitlistActivity) return [];
    const q = waitlistSearch.trim().toLowerCase();

    const filtered = activeRegistrations.filter(r => {
      if (r.wednesdayActivity !== waitlistActivity) return false;
      if (!(r as any).wednesdayActivityWaitlisted) return false;

      if (!q) return true;
      const hay = [
        r.badgeName,
        r.firstName,
        r.lastName,
        r.email,
        r.organization,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    const getMs = (r: Registration) => {
      const raw = (r as any).wednesdayActivityWaitlistedAt || r.createdAt || (r as any).created_at;
      const d = raw ? new Date(raw) : null;
      const ms = d && !isNaN(d.getTime()) ? d.getTime() : 0;
      return ms;
    };

    return filtered.sort((a, b) => getMs(a) - getMs(b));
  }, [waitlistActivity, waitlistSearch, activeRegistrations]);

  const handlePromoteFromWaitlist = async (registrationId: number) => {
    setPromoteError(null);
    setPromoteLoadingId(registrationId);
    try {
      const res: any = await apiClient.post(`/registrations/${registrationId}/promote-waitlist`, {});
      if (!res?.success) {
        throw new Error(res?.error || 'Failed to promote from waitlist');
      }
      if (onRefreshRegistrations) {
        await onRefreshRegistrations();
      }
    } catch (e: any) {
      setPromoteError(e?.message || 'Failed to promote from waitlist');
    } finally {
      setPromoteLoadingId(null);
    }
  };

  return (
    <div className="container event-details-page">
      <div className="page-header">
        <div>
          <button onClick={onBack} className="btn btn-secondary back-button">← Back to Events</button>
          <h1>{event.name} - Event Details</h1>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Basic Event Information */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ marginTop: '0', marginBottom: '20px', borderBottom: '2px solid #e0e0e0', paddingBottom: '10px' }}>
            Basic Information
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '15px', alignItems: 'start' }}>
            <strong>Event Name:</strong>
            <div>{event.name}</div>

            <strong>Dates:</strong>
            <div>{dateDisplay}</div>

            {event.location && (
              <>
                <strong>Location:</strong>
                <div>{event.location}</div>
              </>
            )}

            {event.year && (
              <>
                <strong>Year:</strong>
                <div>{event.year}</div>
              </>
            )}

            {event.description && (
              <>
                <strong>Description:</strong>
                <div>
                  {Array.isArray(event.description) ? (
                    event.description.length > 0 ? (
                      <ul style={{ margin: '0', paddingLeft: '20px' }}>
                        {event.description.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    ) : null
                  ) : (
                    <p style={{ margin: '0', whiteSpace: 'pre-line' }}>{event.description}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Activities & Seat Availability */}
        {activityDetails.length > 0 && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <h2 style={{ marginTop: '0', marginBottom: '20px', borderBottom: '2px solid #e0e0e0', paddingBottom: '10px' }}>
              Activities & Seat Availability
            </h2>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Activity Name</th>
                    <th>Seat Limit</th>
                    <th>Registered</th>
                    <th>Waitlisted</th>
                    <th>Remaining</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activityDetails.map((activity, idx) => (
                    <tr key={idx}>
                      <td><strong>{activity.name}</strong></td>
                      <td>{activity.seatLimit !== undefined ? activity.seatLimit : 'Unlimited'}</td>
                      <td>{activity.confirmedCount}</td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          disabled={!activity.waitlistedCount}
                          onClick={() => {
                            setPromoteError(null);
                            setWaitlistSearch('');
                            setWaitlistActivity(activity.name);
                          }}
                          title={activity.waitlistedCount ? 'View waitlisted attendees' : 'No one is waitlisted for this activity'}
                        >
                          Waitlisted ({activity.waitlistedCount})
                        </button>
                      </td>
                      <td>
                        {activity.remaining !== null ? (
                          <span style={{ 
                            color: activity.isFull ? '#e74c3c' : activity.remaining <= 5 ? '#f39c12' : '#27ae60',
                            fontWeight: '600'
                          }}>
                            {activity.remaining}
                          </span>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td>
                        {activity.isFull ? (
                          <span style={{ color: '#e74c3c', fontWeight: '600' }}>FULL</span>
                        ) : activity.remaining !== null && activity.remaining <= 5 ? (
                          <span style={{ color: '#f39c12', fontWeight: '600' }}>LOW</span>
                        ) : (
                          <span style={{ color: '#27ae60', fontWeight: '600' }}>Available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Waitlisted modal */}
        {waitlistActivity && (
          <Modal
            title={
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>Waitlisted — {waitlistActivity}</div>
                {selectedActivityDetails?.seatLimit !== undefined ? (
                  <div style={{ marginTop: '4px', fontSize: '13px', color: '#6b7280' }}>
                    Confirmed: {selectedActivityDetails.confirmedCount}/{selectedActivityDetails.seatLimit} • Remaining:{' '}
                    {selectedActivityDetails.remaining ?? 0} • Waitlisted: {selectedActivityDetails.waitlistedCount}
                  </div>
                ) : (
                  <div style={{ marginTop: '4px', fontSize: '13px', color: '#6b7280' }}>
                    Unlimited seats • Waitlisted: {selectedActivityDetails?.waitlistedCount ?? waitlistedRegistrations.length}
                  </div>
                )}
              </div>
            }
            onClose={() => {
              setWaitlistActivity(null);
              setWaitlistSearch('');
              setPromoteError(null);
              setPromoteLoadingId(null);
            }}
            size="xl"
            footer={
              <button className="btn btn-secondary" onClick={() => setWaitlistActivity(null)}>
                Close
              </button>
            }
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search waitlisted (name, email, organization)..."
                value={waitlistSearch}
                onChange={(e) => setWaitlistSearch(e.target.value)}
              />
              {selectedActivityDetails?.seatLimit !== undefined && (
                <div style={{ fontSize: '13px', color: selectedActivityDetails.remaining && selectedActivityDetails.remaining > 0 ? '#065f46' : '#b91c1c' }}>
                  {selectedActivityDetails.remaining && selectedActivityDetails.remaining > 0
                    ? `${selectedActivityDetails.remaining} seat(s) available to promote`
                    : 'No seats available (increase seat limit or free a seat first)'}
                </div>
              )}
            </div>

            {promoteError && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '6px' }}>
                {promoteError}
              </div>
            )}

            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Badge Name</th>
                    <th>First</th>
                    <th>Last</th>
                    <th>Email</th>
                    <th>Organization</th>
                    <th>Mobile</th>
                    <th>Waitlisted At (EST)</th>
                    <th>Paid?</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlistedRegistrations.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: '16px', color: '#6b7280' }}>
                        No waitlisted registrations found for this activity.
                      </td>
                    </tr>
                  ) : (
                    waitlistedRegistrations.map((r) => {
                      const waitlistedAt = (r as any).wednesdayActivityWaitlistedAt;
                      const canPromote =
                        selectedActivityDetails?.seatLimit === undefined ||
                        ((selectedActivityDetails?.remaining ?? 0) > 0);
                      const isPromoting = promoteLoadingId === r.id;
                      return (
                        <tr key={r.id}>
                          <td>{r.id}</td>
                          <td><strong>{r.badgeName || `${r.firstName} ${r.lastName}`.trim()}</strong></td>
                          <td>{r.firstName}</td>
                          <td>{r.lastName}</td>
                          <td>{r.email}</td>
                          <td>{r.organization}</td>
                          <td>{r.mobile}</td>
                          <td>{formatDateTimeEST(waitlistedAt || r.createdAt)}</td>
                          <td>{(r as any).paid ? 'Yes' : 'No'}</td>
                          <td>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              disabled={!canPromote || !!promoteLoadingId}
                              onClick={() => handlePromoteFromWaitlist(r.id)}
                              title={!canPromote ? 'No seats available to promote' : 'Promote to confirmed'}
                            >
                              {isPromoting ? 'Promoting…' : 'Promote'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Modal>
        )}

        {/* Registration Pricing Tiers */}
        {event.registrationPricing && Array.isArray(event.registrationPricing) && event.registrationPricing.length > 0 && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <h2 style={{ marginTop: '0', marginBottom: '20px', borderBottom: '2px solid #e0e0e0', paddingBottom: '10px' }}>
              Registration Pricing Tiers
            </h2>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tier Name</th>
                    <th>Price</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Users</th>
                  </tr>
                </thead>
                <tbody>
                  {event.registrationPricing.map((tier, idx) => (
                    <tr key={idx}>
                      <td>{tier.label || 'N/A'}</td>
                      <td>${(typeof tier.price === 'number' ? tier.price : 0).toFixed(2)}</td>
                      <td>{tier.startDate ? formatDateShort(tier.startDate) : 'N/A'}</td>
                      <td>{tier.endDate ? formatDateShort(tier.endDate) : 'N/A'}</td>
                      <td>
                        {(() => {
                          const label = tier.label || 'N/A';
                          const usedBy = registrationTierUseCounts[label] || 0;
                          return (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              disabled={usedBy === 0}
                              onClick={() => {
                                setTierUsersModal({ type: 'Registration', label });
                                setTierUsersSearch('');
                              }}
                              title={usedBy ? 'View users in this tier' : 'No registrations in this tier'}
                            >
                              Users ({usedBy})
                            </button>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Spouse Pricing Tiers */}
        {event.spousePricing && Array.isArray(event.spousePricing) && event.spousePricing.length > 0 && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <h2 style={{ marginTop: '0', marginBottom: '20px', borderBottom: '2px solid #e0e0e0', paddingBottom: '10px' }}>
              Spouse/Guest Pricing Tiers
            </h2>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tier Name</th>
                    <th>Price</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Users</th>
                  </tr>
                </thead>
                <tbody>
                  {event.spousePricing.map((tier, idx) => (
                    <tr key={idx}>
                      <td>{tier.label || 'N/A'}</td>
                      <td>${(typeof tier.price === 'number' ? tier.price : 0).toFixed(2)}</td>
                      <td>{tier.startDate ? formatDateShort(tier.startDate) : 'N/A'}</td>
                      <td>{tier.endDate ? formatDateShort(tier.endDate) : 'N/A'}</td>
                      <td>
                        {(() => {
                          const label = tier.label || 'N/A';
                          const usedBy = spouseTierUseCounts[label] || 0;
                          return (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              disabled={usedBy === 0}
                              onClick={() => {
                                setTierUsersModal({ type: 'Spouse', label });
                                setTierUsersSearch('');
                              }}
                              title={usedBy ? 'View users in this tier' : 'No spouse tickets in this tier'}
                            >
                              Users ({usedBy})
                            </button>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Children Pricing Tiers */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ marginTop: '0', marginBottom: '20px', borderBottom: '2px solid #e0e0e0', paddingBottom: '10px' }}>
            Child/Children Pricing Tiers
          </h2>
          {event.kidsPricing && Array.isArray(event.kidsPricing) && event.kidsPricing.length > 0 ? (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tier Name</th>
                    <th>Price</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Users</th>
                  </tr>
                </thead>
                <tbody>
                  {event.kidsPricing.map((tier, idx) => (
                    <tr key={idx}>
                      <td>{tier.label || 'N/A'}</td>
                      <td>${(typeof tier.price === 'number' ? tier.price : 0).toFixed(2)}</td>
                      <td>{tier.startDate ? formatDateShort(tier.startDate) : 'N/A'}</td>
                      <td>{tier.endDate ? formatDateShort(tier.endDate) : 'N/A'}</td>
                      <td>
                        {(() => {
                          const label = tier.label || 'N/A';
                          const usedBy = kidsTierUseCounts[label] || 0;
                          return (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              disabled={usedBy === 0}
                              onClick={() => {
                                setTierUsersModal({ type: 'Children', label });
                                setTierUsersSearch('');
                              }}
                              title={usedBy ? 'View users in this tier' : 'No children purchases in this tier'}
                            >
                              Users ({usedBy})
                            </button>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No children pricing tiers configured for this event.</p>
          )}
        </div>

        {/* Discount Codes */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ marginTop: '0', marginBottom: '20px', borderBottom: '2px solid #e0e0e0', paddingBottom: '10px' }}>
            Discount Codes
          </h2>
          {discountCodes.length > 0 ? (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Value</th>
                    <th>Expiry Date</th>
                    <th>Usage Limit</th>
                    <th>Used</th>
                    <th>Users</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {discountCodes.map((code) => {
                    const isExpired = code.expiryDate ? new Date(code.expiryDate) < new Date() : false;
                    const isLimitReached = code.usageLimit !== undefined && code.usedCount !== undefined && code.usedCount >= code.usageLimit;
                    const isActive = !isExpired && !isLimitReached;
                    const usedBy = discountUseCounts[(code.code || '').toUpperCase().trim()] || 0;
                    return (
                      <tr key={code.id ?? code.code}>
                        <td><strong>{code.code}</strong></td>
                        <td>{code.discountType === 'percentage' ? 'Percentage' : 'Fixed Amount'}</td>
                        <td>
                          {code.discountType === 'percentage' 
                            ? `${code.discountValue || 0}%` 
                            : `$${(typeof code.discountValue === 'number' ? code.discountValue : 0).toFixed(2)}`}
                        </td>
                        <td>{code.expiryDate ? formatDateShort(code.expiryDate) : 'No expiry'}</td>
                        <td>{code.usageLimit || 'Unlimited'}</td>
                        <td>{code.usedCount || 0}</td>
                        <td>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                            disabled={usedBy === 0}
                            onClick={() => {
                              setDiscountUsersCode(code);
                              setDiscountUsersSearch('');
                            }}
                            title={usedBy ? 'View users who used this code' : 'No registrations used this code'}
                          >
                            Users ({usedBy})
                          </button>
                        </td>
                        <td>
                          <span style={{ 
                            color: isActive ? '#27ae60' : '#e74c3c',
                            fontWeight: '600'
                          }}>
                            {isActive ? 'Active' : isExpired ? 'Expired' : 'Limit Reached'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No discount codes configured for this event.</p>
          )}
        </div>

        {/* Discount code users modal */}
        {discountUsersCode && (
          <Modal
            title={`Discount Code Users — ${discountUsersCode.code}`}
            onClose={() => {
              setDiscountUsersCode(null);
              setDiscountUsersSearch('');
            }}
            size="xl"
            footer={
              <button className="btn btn-secondary" onClick={() => setDiscountUsersCode(null)}>
                Close
              </button>
            }
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search (name, email, organization)..."
                value={discountUsersSearch}
                onChange={(e) => setDiscountUsersSearch(e.target.value)}
              />
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                {discountCodeUsers.length} user(s)
              </div>
            </div>

            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Badge Name</th>
                    <th>First</th>
                    <th>Last</th>
                    <th>Email</th>
                    <th>Organization</th>
                    <th>Discount Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {discountCodeUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '16px', color: '#6b7280' }}>
                        No registrations found for this code.
                      </td>
                    </tr>
                  ) : (
                    discountCodeUsers.map((r) => {
                      const isCancelled = r.status === 'cancelled' || !!(r as any).cancellationAt;
                      return (
                        <tr key={r.id}>
                          <td>{r.id}</td>
                          <td><strong>{r.badgeName || `${r.firstName} ${r.lastName}`.trim()}</strong></td>
                          <td>{r.firstName}</td>
                          <td>{r.lastName}</td>
                          <td>{r.email}</td>
                          <td>{r.organization}</td>
                          <td>${Number(r.discountAmount || 0).toFixed(2)}</td>
                          <td>{isCancelled ? 'Cancelled' : 'Active'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Modal>
        )}

        {/* Tier users modal */}
        {tierUsersModal && (
          <Modal
            title={`${tierUsersModal.type} Tier Users — ${tierUsersModal.label}`}
            onClose={() => {
              setTierUsersModal(null);
              setTierUsersSearch('');
            }}
            size="xl"
            footer={
              <button className="btn btn-secondary" onClick={() => setTierUsersModal(null)}>
                Close
              </button>
            }
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search (name, email, organization)..."
                value={tierUsersSearch}
                onChange={(e) => setTierUsersSearch(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary"
                style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}
                onClick={exportTierUsersXlsx}
                disabled={tierUsers.length === 0}
                title={tierUsers.length ? 'Download this tier list as XLSX' : 'No users to export'}
              >
                Export XLSX
              </button>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                {tierUsers.length} user(s)
              </div>
            </div>

            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Badge Name</th>
                    <th>First</th>
                    <th>Last</th>
                    <th>Email</th>
                    <th>Organization</th>
                    {tierUsersModal.type === 'Spouse' && (
                      <>
                        <th>Spouse First</th>
                        <th>Spouse Last</th>
                        <th>Spouse Added At</th>
                      </>
                    )}
                    {tierUsersModal.type === 'Children' && (
                      <>
                        <th>Kids Count</th>
                        <th>Kids Added At</th>
                      </>
                    )}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tierUsers.length === 0 ? (
                    <tr>
                      <td colSpan={tierUsersModal.type === 'Registration' ? 7 : tierUsersModal.type === 'Spouse' ? 10 : 9} style={{ padding: '16px', color: '#6b7280' }}>
                        No registrations found for this tier.
                      </td>
                    </tr>
                  ) : (
                    tierUsers.map((r) => {
                      const isCancelled = r.status === 'cancelled' || !!(r as any).cancellationAt;
                      const spouseAddedAt = (r as any).spouseAddedAt || (r as any).createdAt;
                      const kidsAddedAt = (r as any).kidsAddedAt || (r as any).createdAt;
                      const kidsCount = Array.isArray((r as any).kids) ? (r as any).kids.length : 0;
                      return (
                        <tr key={r.id}>
                          <td>{r.id}</td>
                          <td><strong>{r.badgeName || `${r.firstName} ${r.lastName}`.trim()}</strong></td>
                          <td>{r.firstName}</td>
                          <td>{r.lastName}</td>
                          <td>{r.email}</td>
                          <td>{r.organization}</td>
                          {tierUsersModal.type === 'Spouse' && (
                            <>
                              <td>{(r as any).spouseFirstName || ''}</td>
                              <td>{(r as any).spouseLastName || ''}</td>
                              <td>{formatDateTimeEST(spouseAddedAt)}</td>
                            </>
                          )}
                          {tierUsersModal.type === 'Children' && (
                            <>
                              <td>{kidsCount}</td>
                              <td>{formatDateTimeEST(kidsAddedAt)}</td>
                            </>
                          )}
                          <td>{isCancelled ? 'Cancelled' : 'Active'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Modal>
        )}

        {/* Additional Event Information */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ marginTop: '0', marginBottom: '20px', borderBottom: '2px solid #e0e0e0', paddingBottom: '10px' }}>
            Additional Information
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '15px', alignItems: 'start' }}>
            {event.breakfastPrice !== undefined && event.breakfastPrice !== null && typeof event.breakfastPrice === 'number' && (
              <>
                <strong>Breakfast Price:</strong>
                <div>${event.breakfastPrice.toFixed(2)}</div>
              </>
            )}

            {event.breakfastEndDate && (
              <>
                <strong>Breakfast End Date:</strong>
                <div>{formatDateShort(event.breakfastEndDate)}</div>
              </>
            )}

            {event.childLunchPrice !== undefined && event.childLunchPrice !== null && typeof event.childLunchPrice === 'number' && (
              <>
                <strong>Child Lunch Price:</strong>
                <div>${event.childLunchPrice.toFixed(2)}</div>
              </>
            )}

            <strong>Total Active Registrations:</strong>
            <div style={{ fontWeight: '600', fontSize: '1.1em' }}>{activeRegistrations.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
