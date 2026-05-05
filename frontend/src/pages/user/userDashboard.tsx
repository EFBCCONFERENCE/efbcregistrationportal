import React, { useMemo, useState } from 'react';
import { Event, Registration, User } from '../../types';
import { isEventExpired } from '../../types';
import { RegistrationPreview } from '../../components/RegistrationPreview';
import { formatDateShort } from '../../utils/dateUtils';
// Removed modal in favor of dedicated page
import '../../styles/UserDashboard.css';

interface UserDashboardProps {
  events: Event[];
  registrations: Registration[];
  handleSaveRegistration: (regData: Registration) => void;
  handleCancelRegistration: (regId: number) => void;
  user: User;
  onBeginRegistration: (eventId?: number, scrollToPayment?: boolean) => void;
  pendingCancellationIds?: number[];
}

export const UserDashboard: React.FC<UserDashboardProps> = ({ 
  events, 
  registrations, 
  handleSaveRegistration,
  handleCancelRegistration, 
  user,
  onBeginRegistration,
  pendingCancellationIds = [],
}) => {
  const [showPreview, setShowPreview] = useState(false);

  // Debug log to see current events
  console.log('UserDashboard - Current events:', events);

  const activeEvent = useMemo(() => events.find(e => !isEventExpired(e.date)), [events]);
  const userRegistration = useMemo(() => 
    registrations.find(r => r.userId === user.id && r.eventId === activeEvent?.id), 
    [registrations, user, activeEvent]
  );
  const attendeeEditsAllowed = activeEvent?.allowAttendeeEdits !== false;
  const hasPendingBalance = Number((userRegistration as any)?.pendingPaymentAmount || 0) > 0;

  // NOTE: Per requirements, dashboard cards show global event counts now

  // Aggregate event stats (global, not user-specific)
  // const totalEvents = useMemo(() => events.length, [events]);
  // const activeEventsCount = useMemo(
  //   () => events.filter(e => !isEventExpired(e.date)).length,
  //   [events]
  // );

  // Saves are handled in the registration page

  return (
    <div className="container">
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {/* <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{totalEvents}</div>
          <div className="stat-label">Total Events</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{activeEventsCount}</div>
          <div className="stat-label">Active Events</div>
        </div>
      </div> */}

      {activeEvent ? (
        <div className="card event-card">
          <div className="event-header">
            <div className="event-header-left">
              <h2>{activeEvent.name}</h2>
              <span className="event-status status-active">Active</span>
              {userRegistration && (userRegistration as any).status !== 'cancelled' && hasPendingBalance && (
                <span className="event-status status-due">Due</span>
              )}
            </div>
            {userRegistration && (userRegistration as any).status !== 'cancelled' && (
              <button
                className="btn btn-outline btn-preview"
                onClick={() => setShowPreview(true)}
              >
                Preview
              </button>
            )}
          </div>
          <ul className="event-details">
            <li>
              {activeEvent.startDate ? (
                <>
                  <strong>Start Date:</strong> {formatDateShort(activeEvent.startDate)}<br />
                  <strong>End Date:</strong> {formatDateShort(activeEvent.date || activeEvent.endDate || '')}
                </>
              ) : (
                <>
                  <strong>Date:</strong> {formatDateShort(activeEvent.date || activeEvent.endDate || '')}
                </>
              )}
            </li>
          </ul>
          {userRegistration ? (
            <div>
              <h3>Your Registration:</h3>
              <p><strong>Name:</strong> {userRegistration.name}</p>
              <p><strong>Activity:</strong> {userRegistration.category}</p>
              {pendingCancellationIds.includes(userRegistration.id) && (
                <p className="cancellation-reason"><strong>Status:</strong> Cancellation request sent</p>
              )}
              {(userRegistration as any).status === 'cancelled' ? (
                <div>
                  <span className="event-status status-expired">Cancelled</span>
                  { (userRegistration as any).cancellationReason && (
                    <p className="cancellation-reason"><strong>Reason:</strong> {(userRegistration as any).cancellationReason}</p>
                  )}
                </div>
              ) : (
                <div className="event-actions">
                  {attendeeEditsAllowed ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => onBeginRegistration(activeEvent.id, hasPendingBalance)}
                    >
                      {hasPendingBalance ? 'Pay' : 'Edit'}
                    </button>
                  ) : (
                    <p className="form-hint" style={{ margin: 0 }}>
                      Registration updates are closed for attendees. Please contact an administrator for changes.
                    </p>
                  )}
                  {attendeeEditsAllowed && (
                    <button
                      className="btn btn-danger"
                      onClick={() => handleCancelRegistration(userRegistration.id)}
                      disabled={pendingCancellationIds.includes(userRegistration.id)}
                    >
                      {pendingCancellationIds.includes(userRegistration.id) ? 'Request Sent' : 'Request to Cancel'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p>You are not registered for this event.</p>
              <div className="event-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => onBeginRegistration(activeEvent.id)}
                >
                  Register Now
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card no-active-event">
          <h3>No Active Events</h3>
          <p>There are currently no active events available for registration.</p>
        </div>
      )}

      {/* Registration now happens in a dedicated page */}
      {showPreview && userRegistration?.id && activeEvent && (
        <RegistrationPreview
          event={activeEvent}
          registrationId={userRegistration.id}
          initialRegistration={userRegistration}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
};
