import React, { useEffect, useState } from 'react';
import { Event, DiscountCode } from '../../types';
import { normalizeActivities, normalizeRibbons } from '../../utils/eventUtils';
import { Modal } from '../../components/Modal';
import apiClient from '../../services/apiClient';
import '../../styles/EventFormModal.css';

type KidsPricingTier = {
  label: string;
  price?: number;
  startDate?: string;
  endDate?: string;
  appliesTo?: 'child' | 'family' | 'both';
  minAge?: number;
  maxAge?: number;
};

interface AdminEventFormProps {
  event?: Event | null;
  onCancel: () => void;
  onSave: (eventData: Event) => void;
}

export const AdminEventForm: React.FC<AdminEventFormProps> = ({ event, onCancel, onSave }) => {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState<string[]>([]);
  // Activities state: Fixed to use object array format for type safety (supports both old string[] and new object[] formats)
  const [activities, setActivities] = useState<Array<{ name: string; seatLimit?: number }>>([]);
  const [ribbons, setRibbons] = useState<string[]>([]);
  const [newActivity, setNewActivity] = useState('');
  const [newRibbon, setNewRibbon] = useState('');
  const [newActivitySeatLimit, setNewActivitySeatLimit] = useState<number | ''>('');
  const [editingActivityIndex, setEditingActivityIndex] = useState<number | null>(null);
  const [editActivityName, setEditActivityName] = useState<string>('');
  const [editActivitySeatLimit, setEditActivitySeatLimit] = useState<number | ''>('');
  const [activityToDelete, setActivityToDelete] = useState<string | null>(null);
  const [registrationPricing, setRegistrationPricing] = useState<Array<{ label: string; price?: number; startDate?: string; endDate?: string }>>([
    { label: 'Priority Registration Fee', price: undefined },
    { label: 'Early Bird Registration Fee', price: undefined },
    { label: 'Advance Registration Fee', price: undefined },
    { label: 'Registration Fee', price: undefined },
  ]);
  const [spousePricing, setSpousePricing] = useState<Array<{ label: string; price?: number; startDate?: string; endDate?: string }>>([
    { label: 'Early Bird Dinner Ticket', price: undefined },
    { label: 'Dinner Ticket', price: undefined },
    { label: 'On-Site Dinner Ticket', price: undefined },
  ]);
  const [kidsPricing, setKidsPricing] = useState<KidsPricingTier[]>([
    { label: 'Child Dinner Ticket (Ages 0-2)', price: undefined, appliesTo: 'child', minAge: 0, maxAge: 2 },
    { label: 'Child Dinner Ticket (Ages 3-9)', price: undefined, appliesTo: 'child', minAge: 3, maxAge: 9 },
    { label: 'Family Member Dinner Ticket', price: undefined, appliesTo: 'family' },
  ]);
  // const [childLunchPrice, setChildLunchPrice] = useState<number | undefined>(undefined);
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [newDiscountCode, setNewDiscountCode] = useState({
    code: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: 0,
    expiryDate: '',
    usageLimit: '',
  });
  const [errors, setErrors] = useState<{ name?: string; startDate?: string; endDate?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // hydrate from incoming event once on mount
  useEffect(() => {
    if (!event) return;
    setName(event.name || '');
    // Ensure date strings are in YYYY-MM-DD for input[type=date]
    const normalizedEndDate = (event.date || event.endDate || '').toString();
    setEndDate(normalizedEndDate.includes('T') ? normalizedEndDate.slice(0, 10) : normalizedEndDate);
    const normalizedStartDate = (event.startDate || '').toString();
    setStartDate(normalizedStartDate.includes('T') ? normalizedStartDate.slice(0, 10) : normalizedStartDate);
    setLocation(event.location || '');
    setDescription(Array.isArray(event.description) ? event.description : (event.description ? [event.description] : []));
    // Handle both old format (string[]) and new format (object[]) using normalizeActivities
    // This ensures type safety by converting both formats to the object array format
    // IMPORTANT: This fix resolves the TypeScript compilation error for activities initialization
    setActivities(normalizeActivities(event.activities));
    setRibbons(normalizeRibbons(event.ribbons));
    setRegistrationPricing(event.registrationPricing || registrationPricing);
    setSpousePricing(event.spousePricing && event.spousePricing.length ? event.spousePricing : spousePricing);
    setKidsPricing(event.kidsPricing && event.kidsPricing.length ? (event.kidsPricing as KidsPricingTier[]) : kidsPricing);
    // setChildLunchPrice(event.childLunchPrice);
    
    // Load discount codes for this event
    if (event?.id) {
      loadDiscountCodes(event.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const loadDiscountCodes = async (eventId: number) => {
    try {
      const data = await apiClient.get<DiscountCode[]>(`/discount-codes/events/${eventId}`);
      if (data.success) {
        setDiscountCodes((data.data as DiscountCode[]) || []);
      }
    } catch (error) {
      console.error('Error loading discount codes:', error);
    }
  };
  
  const addDiscountCode = async () => {
    if (!event?.id || !newDiscountCode.code.trim() || newDiscountCode.discountValue <= 0) {
      alert('Please fill in all required fields (code and discount value)');
      return;
    }
    
    try {
      // Prepare the payload, converting empty strings and undefined to null
      const payload: any = {
        code: newDiscountCode.code.trim().toUpperCase(),
        discountType: newDiscountCode.discountType,
        discountValue: newDiscountCode.discountValue,
        eventId: event.id,
      };
      
      // Only include optional fields if they have values, otherwise set to null
      payload.usageLimit = newDiscountCode.usageLimit && newDiscountCode.usageLimit.trim() 
        ? parseInt(newDiscountCode.usageLimit) 
        : null;
      payload.expiryDate = newDiscountCode.expiryDate && newDiscountCode.expiryDate.trim()
        ? newDiscountCode.expiryDate
        : null;
      
      const data = await apiClient.post<DiscountCode>('/discount-codes', payload);
      if (data.success) {
        setDiscountCodes([...discountCodes, data.data as DiscountCode]);
        setNewDiscountCode({
          code: '',
          discountType: 'percentage',
          discountValue: 0,
          expiryDate: '',
          usageLimit: '',
        });
      } else {
        alert(data.error || 'Failed to create discount code');
      }
    } catch (error) {
      console.error('Error creating discount code:', error);
      alert('Failed to create discount code');
    }
  };
  
  const deleteDiscountCode = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this discount code?')) return;
    
    try {
      const data = await apiClient.delete(`/discount-codes/${id}`);
      if (data.success) {
        setDiscountCodes(discountCodes.filter(dc => dc.id !== id));
      } else {
        alert(data.error || 'Failed to delete discount code');
      }
    } catch (error) {
      console.error('Error deleting discount code:', error);
      alert('Failed to delete discount code');
    }
  };

  useEffect(() => { if (errors.name && name.trim()) setErrors(prev => ({ ...prev, name: undefined })); }, [name, errors.name]);
  useEffect(() => { if (errors.startDate && startDate) setErrors(prev => ({ ...prev, startDate: undefined })); }, [startDate, errors.startDate]);
  useEffect(() => { if (errors.endDate && endDate) setErrors(prev => ({ ...prev, endDate: undefined })); }, [endDate, errors.endDate]);

  const addActivity = () => {
    const a = newActivity.trim();
    if (!a) return;
    const seatLimit = newActivitySeatLimit === '' ? undefined : Number(newActivitySeatLimit);
    if (!activities.some(act => act.name === a)) {
      setActivities(prev => [...prev, { name: a, seatLimit }]);
    }
    setNewActivity('');
    setNewActivitySeatLimit('');
  };

  const addRibbon = () => {
    const ribbonName = newRibbon.trim();
    if (!ribbonName) return;
    setRibbons(prev => normalizeRibbons([...prev, ribbonName]));
    setNewRibbon('');
  };

  const removeRibbon = (ribbonName: string) => {
    setRibbons(prev => prev.filter(ribbon => ribbon.toLowerCase() !== ribbonName.toLowerCase()));
  };
  const handleRemoveActivityClick = (activityName: string) => {
    setActivityToDelete(activityName);
  };

  const confirmRemoveActivity = () => {
    if (activityToDelete) {
      setActivities(prev => prev.filter(x => x.name !== activityToDelete));
      setActivityToDelete(null);
    }
  };

  const cancelRemoveActivity = () => {
    setActivityToDelete(null);
  };
  
  const startEditActivity = (index: number) => {
    setEditingActivityIndex(index);
    setEditActivityName(activities[index].name);
    setEditActivitySeatLimit(activities[index].seatLimit || '');
  };
  
  const saveEditActivity = () => {
    if (editingActivityIndex === null) return;
    
    const newLimit = editActivitySeatLimit === '' ? undefined : Number(editActivitySeatLimit);
    const newName = editActivityName.trim();
    
    if (!newName) {
      alert('Activity name cannot be empty');
      return;
    }
    
    // Check if the new name conflicts with another activity (excluding the current one)
    const nameExists = activities.some((act, i) => 
      i !== editingActivityIndex && act.name.toLowerCase() === newName.toLowerCase()
    );
    
    if (nameExists) {
      alert('An activity with this name already exists');
      return;
    }
    
    setActivities(prev => prev.map((act, i) => 
      i === editingActivityIndex ? { name: newName, seatLimit: newLimit } : act
    ));
    
    setEditingActivityIndex(null);
    setEditActivityName('');
    setEditActivitySeatLimit('');
  };

  const cancelEditActivity = () => {
    setEditingActivityIndex(null);
    setEditActivityName('');
    setEditActivitySeatLimit('');
  };

  const validate = () => {
    const e: { name?: string; startDate?: string; endDate?: string } = {};
    if (!name.trim()) e.name = 'Event name is required';
    if (!startDate) e.startDate = 'Start date is required';
    if (!endDate) e.endDate = 'End date is required';
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      e.endDate = 'End date must be after start date';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const year = new Date(endDate || startDate).getFullYear();
      // Ensure description is always an array
      const descriptionArray: string[] = Array.isArray(description) 
        ? description.filter(d => d.trim().length > 0)
        : [];
      onSave({
        ...event,
        id: event?.id || Date.now(),
        name: name.trim(),
        date: endDate, // End date
        startDate: startDate,
        endDate: endDate,
        year,
        location: location.trim(),
        description: descriptionArray,
        activities,
        ribbons,
        registrationPricing,
        spousePricing,
        kidsPricing,
        // childLunchPrice,
      } as Event);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1>{event ? 'Edit Event' : 'Create New Event'}</h1>
      </div>

      <div className="event-form-container">
        <form id="admin-event-form" className="event-form" onSubmit={submit}>
          <div className="form-section">
            <div className="form-group">
              <label htmlFor="name" className="form-label">Event Name <span className="required-asterisk">*</span></label>
              <input id="name" type="text" className={`form-control ${errors.name ? 'error' : ''}`} value={name} onChange={(e)=>setName(e.target.value)} required disabled={isSubmitting} />
              {errors.name && <div className="error-message">{errors.name}</div>}
            </div>

            <div className="form-group">
              <label htmlFor="startDate" className="form-label">Start Date <span className="required-asterisk">*</span></label>
              <input id="startDate" type="date" className={`form-control ${errors.startDate ? 'error' : ''}`} value={startDate} onChange={(e)=>setStartDate(e.target.value)} required disabled={isSubmitting} />
              {errors.startDate && <div className="error-message">{errors.startDate}</div>}
            </div>

            <div className="form-group">
              <label htmlFor="endDate" className="form-label">End Date <span className="required-asterisk">*</span></label>
              <input id="endDate" type="date" className={`form-control ${errors.endDate ? 'error' : ''}`} value={endDate} onChange={(e)=>setEndDate(e.target.value)} required disabled={isSubmitting} min={startDate} />
              {errors.endDate && <div className="error-message">{errors.endDate}</div>}
            </div>

            <div className="form-group">
              <label htmlFor="location" className="form-label">Event Location</label>
              <input id="location" type="text" className="form-control" value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="e.g., Disney's Yacht & Beach Club Resorts, Orlando, Florida" disabled={isSubmitting} />
            </div>

            <div className="form-group">
              <label className="form-label">Registration Form Includes</label>
              <div className="description-items">
                {description.map((item, idx) => (
                  <div key={idx} className="description-item-row">
                    <input
                      className="form-control description-item-input"
                      type="text"
                      placeholder="e.g., All Education Sessions"
                      aria-label="Description item"
                      value={item}
                      onChange={(e) => {
                        const v = [...description];
                        v[idx] = e.target.value;
                        setDescription(v);
                      }}
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      aria-label="Remove description item"
                      onClick={() => {
                        const v = [...description];
                        v.splice(idx, 1);
                        setDescription(v);
                      }}
                      disabled={isSubmitting}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setDescription([...description, ''])}
                  disabled={isSubmitting}
                >
                  Add Item
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Activities & Sports</label>
              <div className="activity-input-group">
                <input 
                  className="form-control" 
                  type="text" 
                  value={newActivity} 
                  onChange={(e) => setNewActivity(e.target.value)} 
                  placeholder="Activity name (e.g., Golf, Fishing)" 
                  disabled={isSubmitting} 
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addActivity())} 
                />
                <input
                  className="form-control"
                  type="number"
                  value={newActivitySeatLimit}
                  onChange={(e) => setNewActivitySeatLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Seat limit (optional)"
                  min="1"
                  disabled={isSubmitting}
                  style={{ width: '150px' }}
                />
                <button type="button" className="btn btn-secondary btn-add-activity" onClick={addActivity} disabled={isSubmitting || !newActivity.trim()}>Add</button>
              </div>
              {activities.length > 0 && (
                <div className="activities-list">
                  <h4 className="activities-title">Current Activities:</h4>
                  <div className="activities-tags">
                    {activities.map((activity, i) => (
                      <span key={i} className="activity-tag">
                        {activity.name}
                        {activity.seatLimit && (
                          <span style={{ marginLeft: '8px', fontSize: '0.85em', color: '#666' }}>
                            (Limit: {activity.seatLimit})
                          </span>
                        )}
                        <button
                          type="button"
                          className="activity-edit"
                          onClick={() => startEditActivity(i)}
                          disabled={isSubmitting}
                          title="Edit activity"
                          aria-label={`Edit activity ${activity.name}`}
                        >
                          <img src="/edit.png" alt="" className="activity-action-img" width={18} height={18} />
                        </button>
                        <button
                          type="button"
                          className="activity-remove"
                          onClick={() => handleRemoveActivityClick(activity.name)}
                          disabled={isSubmitting}
                          aria-label={`Remove activity ${activity.name}`}
                        >
                          <img src="/bin.png" alt="" className="activity-action-img" width={18} height={18} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Ribbon</label>
              <div className="activity-input-group">
                <input
                  className="form-control"
                  type="text"
                  value={newRibbon}
                  onChange={(e) => setNewRibbon(e.target.value)}
                  placeholder="Ribbon name (e.g., Sponsors, Speakers, Committee)"
                  disabled={isSubmitting}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRibbon())}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-add-activity"
                  onClick={addRibbon}
                  disabled={isSubmitting || !newRibbon.trim()}
                >
                  Add
                </button>
              </div>
              <small className="form-hint" style={{ display: 'block', marginTop: '0.4rem' }}>
                Add reusable attendee tags such as Sponsors, Speakers, or Committee.
              </small>
              {ribbons.length > 0 && (
                <div className="activities-list">
                  <h4 className="activities-title">Current Ribbons:</h4>
                  <div className="activities-tags">
                    {ribbons.map((ribbon) => (
                      <span key={ribbon} className="activity-tag">
                        {ribbon}
                        <button
                          type="button"
                          className="activity-remove"
                          onClick={() => removeRibbon(ribbon)}
                          disabled={isSubmitting}
                          aria-label={`Remove ribbon ${ribbon}`}
                        >
                          <img src="/bin.png" alt="" className="activity-action-img" width={18} height={18} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

 
            <div className="form-group">
              <label className="form-label">Registration Pricing Tiers</label>
              <div className="pricing-tiers">
                {registrationPricing.map((tier, idx) => (
                  <div key={idx} className="tier-row">
                    <input
                      className="form-control tier-label"
                      type="text"
                      placeholder="Label (e.g., SUPER Early bird)"
                      aria-label="Registration Tier Label"
                      value={tier.label}
                      onChange={(e)=>{ const v=[...registrationPricing]; v[idx]={...v[idx], label:e.target.value}; setRegistrationPricing(v); }}
                      disabled={isSubmitting}
                    />
                    <input
                      className="form-control tier-price"
                      type="number"
                      placeholder="Price"
                      aria-label="Registration Tier Price"
                      min={0}
                      value={tier.price ?? ''}
                      onChange={(e)=>{ const raw=e.target.value; const v=[...registrationPricing]; v[idx]={...v[idx], price: raw === '' ? undefined : Number(raw)}; setRegistrationPricing(v); }}
                      disabled={isSubmitting}
                    />
                    <input
                      className="form-control tier-date"
                      type="date"
                      aria-label="Registration Tier Start Date"
                      value={tier.startDate || ''}
                      onChange={(e)=>{ const v=[...registrationPricing]; v[idx]={...v[idx], startDate:e.target.value}; setRegistrationPricing(v); }}
                      disabled={isSubmitting}
                    />
                    <input
                      className="form-control tier-date"
                      type="date"
                      aria-label="Registration Tier End Date"
                      value={tier.endDate || ''}
                      onChange={(e)=>{ const v=[...registrationPricing]; v[idx]={...v[idx], endDate:e.target.value}; setRegistrationPricing(v); }}
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      aria-label="Remove registration tier"
                      onClick={()=>{ const v=[...registrationPricing]; v.splice(idx,1); setRegistrationPricing(v); }}
                      disabled={isSubmitting}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={()=>setRegistrationPricing([...registrationPricing,{label:'',price:undefined}])} disabled={isSubmitting}>Add Tier</button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Spouse Ticket Pricing Tiers</label>
              <div className="pricing-tiers">
                {spousePricing.map((tier, idx) => (
                  <div key={idx} className="tier-row">
                    <input
                      className="form-control tier-label"
                      type="text"
                      placeholder="Label (e.g., Early Bird)"
                      aria-label="Spouse Tier Label"
                      value={tier.label}
                      onChange={(e)=>{ const v=[...spousePricing]; v[idx]={...v[idx], label:e.target.value}; setSpousePricing(v); }}
                      disabled={isSubmitting}
                    />
                    <input
                      className="form-control tier-price"
                      type="number"
                      placeholder="Price"
                      aria-label="Spouse Tier Price"
                      min={0}
                      value={tier.price ?? ''}
                      onChange={(e)=>{ const raw=e.target.value; const v=[...spousePricing]; v[idx]={...v[idx], price: raw === '' ? undefined : Number(raw)}; setSpousePricing(v); }}
                      disabled={isSubmitting}
                    />
                    <input
                      className="form-control tier-date"
                      type="date"
                      aria-label="Spouse Tier Start Date"
                      value={tier.startDate || ''}
                      onChange={(e)=>{ const v=[...spousePricing]; v[idx]={...v[idx], startDate:e.target.value}; setSpousePricing(v); }}
                      disabled={isSubmitting}
                    />
                    <input
                      className="form-control tier-date"
                      type="date"
                      aria-label="Spouse Tier End Date"
                      value={tier.endDate || ''}
                      onChange={(e)=>{ const v=[...spousePricing]; v[idx]={...v[idx], endDate:e.target.value}; setSpousePricing(v); }}
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      aria-label="Remove spouse tier"
                      onClick={()=>{ const v=[...spousePricing]; v.splice(idx,1); setSpousePricing(v); }}
                      disabled={isSubmitting}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={()=>setSpousePricing([...spousePricing,{label:'',price:undefined}])} disabled={isSubmitting}>Add Tier</button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Child &amp; Family Member Pricing Tiers</label>
              <div className="pricing-tiers">
                {kidsPricing.map((tier, idx) => (
                  <div key={idx} className="tier-row">
                    <input
                      className="form-control tier-label"
                      type="text"
                      placeholder="Label (e.g., Early Bird)"
                      aria-label="Child/Children Tier Label"
                      value={tier.label}
                      onChange={(e)=>{ const v=[...kidsPricing]; v[idx]={...v[idx], label:e.target.value}; setKidsPricing(v); }}
                      disabled={isSubmitting}
                    />
                    <input
                      className="form-control tier-price"
                      type="number"
                      placeholder="Price"
                      aria-label="Child/Children Tier Price"
                      min={0}
                      value={tier.price ?? ''}
                      onChange={(e)=>{ const raw=e.target.value; const v=[...kidsPricing]; v[idx]={...v[idx], price: raw === '' ? undefined : Number(raw)}; setKidsPricing(v); }}
                      disabled={isSubmitting}
                    />
                    <input
                      className="form-control tier-date"
                      type="date"
                      aria-label="Child/Children Tier Start Date"
                      value={tier.startDate || ''}
                      onChange={(e)=>{ const v=[...kidsPricing]; v[idx]={...v[idx], startDate:e.target.value}; setKidsPricing(v); }}
                      disabled={isSubmitting}
                    />
                    <input
                      className="form-control tier-date"
                      type="date"
                      aria-label="Child/Children Tier End Date"
                      value={tier.endDate || ''}
                      onChange={(e)=>{ const v=[...kidsPricing]; v[idx]={...v[idx], endDate:e.target.value}; setKidsPricing(v); }}
                      disabled={isSubmitting}
                    />
                    <select
                      className="form-control"
                      aria-label="Tier Applies To"
                      value={tier.appliesTo || 'child'}
                      onChange={(e)=>{ const v=[...kidsPricing]; v[idx]={...v[idx], appliesTo: e.target.value as KidsPricingTier['appliesTo']}; setKidsPricing(v); }}
                      disabled={isSubmitting}
                      style={{ minWidth: '140px' }}
                    >
                      <option value="child">Child</option>
                      <option value="family">Family Member</option>
                      <option value="both">Both</option>
                    </select>
                    <input
                      className="form-control tier-price"
                      type="number"
                      placeholder="Min Age"
                      aria-label="Minimum Age"
                      min={0}
                      value={tier.minAge ?? ''}
                      onChange={(e)=>{ const raw=e.target.value; const v=[...kidsPricing]; v[idx]={...v[idx], minAge: raw === '' ? undefined : Number(raw)}; setKidsPricing(v); }}
                      disabled={isSubmitting || tier.appliesTo === 'family'}
                    />
                    <input
                      className="form-control tier-price"
                      type="number"
                      placeholder="Max Age"
                      aria-label="Maximum Age"
                      min={0}
                      value={tier.maxAge ?? ''}
                      onChange={(e)=>{ const raw=e.target.value; const v=[...kidsPricing]; v[idx]={...v[idx], maxAge: raw === '' ? undefined : Number(raw)}; setKidsPricing(v); }}
                      disabled={isSubmitting || tier.appliesTo === 'family'}
                    />
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      aria-label="Remove child/children tier"
                      onClick={()=>{ const v=[...kidsPricing]; v.splice(idx,1); setKidsPricing(v); }}
                      disabled={isSubmitting}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={()=>setKidsPricing([...kidsPricing,{label:'',price:undefined, appliesTo:'child'}])} disabled={isSubmitting}>Add Tier</button>
              </div>
              <small className="form-hint" style={{ display: 'block', marginTop: '0.4rem' }}>
                Define age rules for child tiers. Family Member tiers can leave age blank.
              </small>
            </div>
            
            {/* <div className="form-group">
              <label className="form-label" htmlFor="childLunchPrice">Child Lunch Price</label>
              <input
                id="childLunchPrice"
                type="number"
                className="form-control"
                placeholder="Enter child lunch price"
                min={0}
                step="0.01"
                value={childLunchPrice ?? ''}
                onChange={(e) => setChildLunchPrice(e.target.value === '' ? undefined : Number(e.target.value))}
                disabled={isSubmitting}
              />
            </div> */}

            {/* Discount Codes Section */}
            {event?.id && (
              <div className="form-section">
                <h3 className="section-title">Discount Codes</h3>
                <div className="discount-codes-list" style={{ marginBottom: '1rem' }}>
                  {discountCodes.map((dc) => (
                    <div key={dc.id} className="discount-code-item" style={{ 
                      border: '1px solid #ddd', 
                      padding: '0.75rem', 
                      marginBottom: '0.5rem', 
                      borderRadius: '4px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <strong>{dc.code}</strong> - {dc.discountType === 'percentage' ? `${dc.discountValue}%` : `$${dc.discountValue}`} off
                        {dc.expiryDate && <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>(Expires: {new Date(dc.expiryDate).toLocaleDateString()})</span>}
                        {dc.usageLimit && <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>(Limit: {dc.usedCount || 0}/{dc.usageLimit})</span>}
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => dc.id && deleteDiscountCode(dc.id)}
                        disabled={isSubmitting}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
                <div className="form-group">
                  <label className="form-label">Add New Discount Code</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Code (e.g., SAVE10)"
                      value={newDiscountCode.code}
                      onChange={(e) => setNewDiscountCode({ ...newDiscountCode, code: e.target.value.toUpperCase() })}
                      disabled={isSubmitting}
                    />
                    <select
                      className="form-control"
                      value={newDiscountCode.discountType}
                      onChange={(e) => setNewDiscountCode({ ...newDiscountCode, discountType: e.target.value as 'percentage' | 'fixed' })}
                      disabled={isSubmitting}
                      aria-label="Discount Type"
                      title="Discount Type"
                    >
                      <option value="percentage">%</option>
                      <option value="fixed">$</option>
                    </select>
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Value"
                      min="0"
                      step="0.01"
                      value={newDiscountCode.discountValue || ''}
                      onChange={(e) => setNewDiscountCode({ ...newDiscountCode, discountValue: parseFloat(e.target.value) || 0 })}
                      disabled={isSubmitting}
                    />
                    <input
                      type="date"
                      className="form-control"
                      placeholder="Expiry (optional)"
                      value={newDiscountCode.expiryDate}
                      onChange={(e) => setNewDiscountCode({ ...newDiscountCode, expiryDate: e.target.value })}
                      disabled={isSubmitting}
                    />
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Usage limit (optional)"
                      min="1"
                      value={newDiscountCode.usageLimit}
                      onChange={(e) => setNewDiscountCode({ ...newDiscountCode, usageLimit: e.target.value })}
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={addDiscountCode}
                      disabled={isSubmitting || !newDiscountCode.code.trim() || newDiscountCode.discountValue <= 0}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Spouse breakfast/lunch fields removed per requirement */}

          </div>
        </form>
      </div>

      <div className="page-actions" style={{ marginTop: '20px', padding: '20px', borderTop: '1px solid #e0e0e0' }}>
        <button className="btn btn-secondary" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
        <button className="btn btn-primary" form="admin-event-form" type="submit" disabled={isSubmitting}>{isSubmitting ? (event ? 'Updating...' : 'Creating...') : (event ? 'Update Event' : 'Create Event')}</button>
      </div>

      {editingActivityIndex !== null && (
        <Modal
          title="Edit Activity"
          onClose={cancelEditActivity}
          footer={
            <div className="modal-footer-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cancelEditActivity}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveEditActivity}
              >
                Save Changes
              </button>
            </div>
          }
        >
          <div className="form-group">
            <label htmlFor="editActivityName" className="form-label">
              Activity Name
              <span className="required-asterisk">*</span>
            </label>
            <input
              id="editActivityName"
              type="text"
              className="form-control"
              value={editActivityName}
              onChange={(e) => setEditActivityName(e.target.value)}
              placeholder="e.g., Golf, Fishing"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="editActivitySeatLimit" className="form-label">
              Seat Limit (Optional)
            </label>
            <input
              id="editActivitySeatLimit"
              type="number"
              className="form-control"
              value={editActivitySeatLimit}
              onChange={(e) => setEditActivitySeatLimit(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Leave empty for unlimited"
              min="1"
            />
            <small style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
              Set a limit to restrict the number of registrations for this activity
            </small>
          </div>
        </Modal>
      )}

      {activityToDelete && (
        <Modal
          title="Delete Activity"
          onClose={cancelRemoveActivity}
          footer={
            <div className="modal-footer-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cancelRemoveActivity}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmRemoveActivity}
              >
                Delete
              </button>
            </div>
          }
        >
          <p>
            Are you sure you want to delete <strong>"{activityToDelete}"</strong>?
          </p>
          <p className="modal-helper-text" style={{ color: '#e74c3c', fontWeight: '500' }}>
            This action cannot be undone. All registrations associated with this activity will be affected.
          </p>
        </Modal>
      )}
    </div>
  );
};

export default AdminEventForm;


