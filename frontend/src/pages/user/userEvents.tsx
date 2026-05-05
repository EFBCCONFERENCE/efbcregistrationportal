import React, { useMemo } from 'react';
import { Event, Registration, User } from '../../types';
import { isEventExpired } from '../../types';
import { formatDateShort } from '../../utils/dateUtils';
// Removed modal in favor of dedicated page
import '../../styles/UserEvents.css';

interface UserEventsProps {
  events: Event[];
  registrations: Registration[];
  handleSaveRegistration: (regData: Registration) => void;
  handleCancelRegistration: (regId: number) => void;
  user: User;
  onBeginRegistration: (eventId: number) => void;
  pendingCancellationIds?: number[];
}

export const UserEvents: React.FC<UserEventsProps> = ({ 
  events, 
  registrations, 
  handleSaveRegistration, 
  handleCancelRegistration, 
  user,
  onBeginRegistration,
  pendingCancellationIds = [],
}) => {
  // Local edit state no longer needed here

  // Debug log to see current events
  console.log('UserEvents - Current events:', events);

  const userRegistrations = useMemo(() => 
    registrations.filter(r => r.userId === user.id), 
    [registrations, user]
  );

  // Saves are handled in the registration page

  const handleRegister = (event: Event) => {
    onBeginRegistration(event.id);
  };

  const handleCancel = (regId: number) => {
    if (pendingCancellationIds.includes(regId)) return;
    if (window.confirm("Are you sure you want to cancel your registration for this event?")) {
      handleCancelRegistration(regId);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1>All Events</h1>
      </div>

      {events.length > 0 ? (
        <div className="events-grid">
          {events.map(event => {
            const userReg = userRegistrations.find(r => r.eventId === event.id);
            const isExpired = isEventExpired(event.date);
            const attendeeEditsAllowed = event.allowAttendeeEdits !== false;
            
            return (
              <div key={event.id} className="card event-item">
                <div className="event-item-header">
                  <h3>{event.name}</h3>
                  <span className="event-year">{event.year}</span>
                </div>
                <div className="event-date">
                  {event.startDate ? (
                    <>
                      Start: {formatDateShort(event.startDate)}<br />
                      End: {formatDateShort(event.date || event.endDate || '')}
                    </>
                  ) : (
                    formatDateShort(event.date || event.endDate || '')
                  )}
                </div>
                
                {userReg ? (
                  <div className="registration-info">
                    <h4>Your Registration</h4>
                    <div className="registration-details">
                      <div><strong>Name:</strong> {userReg.name}</div>
                      <div><strong>Category:</strong> {userReg.category}</div>
                    </div>
                    <div className="event-actions">
                      {!isExpired && attendeeEditsAllowed && (
                        <>
                          <button
                            className="btn btn-primary"
                            onClick={() => handleRegister(event)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleCancel(userReg.id)}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {!isExpired && !attendeeEditsAllowed && (
                        <span className="event-status status-expired">Attendee edits closed</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="event-actions">
                    {!isExpired ? (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleRegister(event)}
                      >
                        Register
                      </button>
                    ) : (
                      <span className="event-status status-expired">Event Expired</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card no-events">
          <h3>No Events Available</h3>
          <p>There are currently no events available.</p>
        </div>
      )}

      {/* Registration now happens in a dedicated page */}
    </div>
  );
};
