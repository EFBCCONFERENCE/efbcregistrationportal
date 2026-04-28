import React, { useEffect, useState } from 'react';
import { Event, Registration } from '../types';
import { Modal } from './Modal';
import { registrationsApi } from '../services/apiClient';
import jsPDF from 'jspdf';
import '../styles/RegistrationPreview.css';

interface RegistrationPreviewProps {
  event: Event | undefined;
  registrationId: number | undefined;
  /** When provided (e.g. from dashboard /mine), avoids an extra fetch and works before GET /:id resolves */
  initialRegistration?: Registration | null;
  onClose: () => void;
  showResendButton?: boolean;
}

export const RegistrationPreview: React.FC<RegistrationPreviewProps> = ({
  event,
  registrationId,
  initialRegistration,
  onClose,
  showResendButton = true
}) => {
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [resendingEmail, setResendingEmail] = useState(false);

  useEffect(() => {
    const fetchRegistration = async () => {
      if (!registrationId) {
        setLoading(false);
        return;
      }
      if (initialRegistration != null && initialRegistration.id === registrationId) {
        setRegistration(initialRegistration);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const response = await registrationsApi.getById(registrationId);
        if (response.success && response.data) {
          setRegistration(response.data);
        }
      } catch (error) {
        console.error('Error fetching registration:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRegistration();
  }, [registrationId, initialRegistration]);

  const parseAddress = (addr?: string) => {
    const res = { street: '', city: '', state: '', zip: '', country: '' } as any;
    if (!addr) return res;
    const lines = String(addr).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines[0]) res.street = lines[0];
    if (lines[1]) {
      const m = lines[1].match(/^(.*?)[,]\s*(\w{2,})\s*(\S+)?$/);
      if (m) { res.city = m[1] || ''; res.state = m[2] || ''; res.zip = (m[3] || ''); } else { res.city = lines[1]; }
    }
    if (lines[2]) res.country = lines[2];
    return res;
  };

  const getFrontendPaymentAmount = (reg: Registration): number => {
    const baseAmount = Number((reg as any).totalPrice ?? (reg as any).total_price ?? 0);
    const paymentMethod = String((reg as any).paymentMethod ?? (reg as any).payment_method ?? '');
    if (paymentMethod === 'Card' && baseAmount > 0) {
      return baseAmount + (baseAmount * 0.035);
    }
    return baseAmount;
  };

  const getCompensationScopeLabel = (reg: Registration): string | null => {
    const notes = String((reg as any).updateNotes || '').trim();
    if (!notes) return null;
    const lines = notes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const compLine = lines.find((line) => /^Comp\.\s*/i.test(line));
    if (!compLine) return null;
    return compLine
      .replace(/Comp\.\s*Children/gi, 'Comp. Dependent')
      .replace(/Comp\.\s*Spouse,\s*Dependent/gi, 'Comp. Spouse, Dependent');
  };

  const downloadPDF = async () => {
    if (!registration || !event) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPos = margin;

    // Load and add logo
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      
      // Load image and convert to base64 for jsPDF
      const logoDataUrl = await new Promise<string>((resolve, reject) => {
        logoImg.onload = () => {
          try {
            // Create canvas to convert image to base64
            const canvas = document.createElement('canvas');
            canvas.width = logoImg.naturalWidth;
            canvas.height = logoImg.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(logoImg, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');
              resolve(dataUrl);
            } else {
              reject(new Error('Could not get canvas context'));
            }
          } catch (err) {
            reject(err);
          }
        };
        logoImg.onerror = () => {
          console.warn('Failed to load logo, continuing without it');
          resolve(''); // Return empty string to indicate no logo
        };
        logoImg.src = '/EFBClogo.png';
      });

      // Add logo at the top (centered, max width 50mm, maintain aspect ratio)
      if (logoDataUrl && logoImg.complete && logoImg.naturalWidth > 0) {
        const logoMaxWidth = 50; // mm
        const logoAspectRatio = logoImg.naturalHeight / logoImg.naturalWidth;
        const logoWidth = Math.min(logoMaxWidth, logoImg.naturalWidth * 0.264583); // Convert px to mm (1px = 0.264583mm at 96dpi)
        const logoHeight = logoWidth * logoAspectRatio;
        const logoX = (pageWidth - logoWidth) / 2; // Center horizontally
        
        doc.addImage(logoDataUrl, 'PNG', logoX, yPos, logoWidth, logoHeight);
        yPos += logoHeight + 10; // Add spacing after logo
      }
    } catch (error) {
      console.warn('Error loading logo for PDF:', error);
      // Continue without logo
    }

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Registration Confirmation', pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    // Event Info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Event: ${event.name}`, margin, yPos);
    yPos += 10;

    // Personal Information
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Personal Information', margin, yPos);
    yPos += 8;

    const addr = parseAddress(registration.address);
    const personalData = [
      ['Name', `${registration.firstName} ${registration.lastName}`],
      ['Badge Name', registration.badgeName || ''],
      ['Email', registration.email || ''],
      ...(registration.secondaryEmail ? [['Secondary Email', registration.secondaryEmail]] : []),
      ['Organization', registration.organization || ''],
      ['Job Title', registration.jobTitle || ''],
      ['Address', addr.street || registration.address || ''],
      ...(addr.city ? [['City', addr.city]] : []),
      ...(addr.state ? [['State', addr.state]] : []),
      ...(addr.zip ? [['Zip Code', addr.zip]] : []),
      ...(addr.country ? [['Country', addr.country]] : []),
      ['Mobile', registration.mobile || ''],
      ...(registration.officePhone ? [['Office Phone', registration.officePhone]] : []),
      ['First-time Attending', registration.isFirstTimeAttending ? 'Yes' : 'No'],
      ['Company Type', registration.companyType || ''],
      ...(registration.companyTypeOther ? [['Company Type (Other)', registration.companyTypeOther]] : []),
      ...(registration.emergencyContactName ? [['Emergency Contact Name', registration.emergencyContactName]] : []),
      ...(registration.emergencyContactPhone ? [['Emergency Contact Phone', registration.emergencyContactPhone]] : []),
    ];

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    personalData.forEach(([label, value]) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = margin;
      }
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, margin, yPos);
      doc.setFont('helvetica', 'normal');
      const textLines = doc.splitTextToSize(value || '-', pageWidth - margin * 2 - 60);
      doc.text(textLines, margin + 60, yPos);
      yPos += textLines.length * 5 + 2;
    });

    yPos += 5;

    // Conference Events
    if (yPos > 250) {
      doc.addPage();
      yPos = margin;
    }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Conference Events', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const isPickleball = (registration.wednesdayActivity || '').toLowerCase().includes('pickleball');
    const eventData = [
      ['Selected Activity', registration.wednesdayActivity || ''],
      ...(registration.golfHandicap ? [['Golf Handicap', String(registration.golfHandicap)]] : []),
      ...(registration.clubRentals ? [['Club Rentals', registration.clubRentals]] : []),
      ...((registration as any).massageTimeSlot ? [['Massage Time Slot', (registration as any).massageTimeSlot]] : []),
      ...(isPickleball && (registration as any).pickleballEquipment !== undefined ? [['Pickleball Equipment', (registration as any).pickleballEquipment ? 'I will bring my own' : 'I need equipment']] : []),
    ];

    eventData.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(value || '-', margin + 60, yPos);
      yPos += 6;
    });

    yPos += 5;

    // Conference Meals
    if (yPos > 250) {
      doc.addPage();
      yPos = margin;
    }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Conference Meals', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const mealData = [
      ...((registration as any).tuesdayEarlyReception ? [['Tuesday Early Arrivals Reception', (registration as any).tuesdayEarlyReception]] : []),
      ['Wednesday Reception', registration.wednesdayReception || ''],
      ['Thursday Breakfast', registration.thursdayBreakfast || ''],
      ['Thursday Luncheon', registration.thursdayLuncheon || ''],
      ['Thursday Dinner', registration.thursdayDinner || ''],
      ['Friday Breakfast', registration.fridayBreakfast || ''],
      ...(registration.dietaryRestrictions ? [['Dietary Restrictions', registration.dietaryRestrictions]] : []),
      ...((registration as any).specialRequests ? [['Special Requests', (registration as any).specialRequests]] : []),
    ];

    mealData.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(value || '-', margin + 60, yPos);
      yPos += 6;
    });

    yPos += 5;

    // Additional Information
    if ((registration as any).transportationMethod || (registration as any).transportationDetails || 
        (registration as any).stayingAtBeachClub !== undefined || (registration as any).accommodationDetails ||
        ((registration as any).dietaryRequirements && Array.isArray((registration as any).dietaryRequirements) && (registration as any).dietaryRequirements.length > 0) ||
        (registration as any).dietaryRequirementsOther || (registration as any).specialPhysicalNeeds !== undefined ||
        (registration as any).specialPhysicalNeedsDetails) {
      if (yPos > 250) {
        doc.addPage();
        yPos = margin;
      }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Additional Information', margin, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const additionalData = [
        ...((registration as any).transportationMethod ? [['Transportation Method', (registration as any).transportationMethod]] : []),
        ...((registration as any).transportationDetails ? [['Transportation Details', (registration as any).transportationDetails]] : []),
        ...((registration as any).stayingAtBeachClub !== undefined ? [['Staying at Beach Club Resort', (registration as any).stayingAtBeachClub ? 'Yes' : 'No']] : []),
        ...((registration as any).accommodationDetails ? [['Accommodation Details', (registration as any).accommodationDetails]] : []),
        ...(((registration as any).dietaryRequirements && Array.isArray((registration as any).dietaryRequirements) && (registration as any).dietaryRequirements.length > 0) 
          ? [['Dietary Requirements', ((registration as any).dietaryRequirements.join(', ')) + ((registration as any).dietaryRequirementsOther ? ` (Other: ${(registration as any).dietaryRequirementsOther})` : '')]] 
          : []),
        ...((registration as any).specialPhysicalNeeds !== undefined ? [['Special Physical Needs', (registration as any).specialPhysicalNeeds ? 'Yes' : 'No']] : []),
        ...((registration as any).specialPhysicalNeedsDetails ? [['Special Physical Needs Details', (registration as any).specialPhysicalNeedsDetails]] : []),
      ];

      additionalData.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(`${label}:`, margin, yPos);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(value || '-', 120);
        doc.text(lines, margin + 60, yPos);
        yPos += lines.length * 6;
      });
      yPos += 5;
    }

    // Spouse/Guest
    if (registration.spouseDinnerTicket) {
      if (yPos > 250) {
        doc.addPage();
        yPos = margin;
      }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Spouse/Guest', margin, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setFont('helvetica', 'bold');
      doc.text('Dinner Ticket:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text('Yes', margin + 60, yPos);
      yPos += 6;
      if (registration.spouseFirstName) {
        doc.setFont('helvetica', 'bold');
        doc.text('Spouse First Name:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(registration.spouseFirstName, margin + 60, yPos);
        yPos += 6;
      }
      if (registration.spouseLastName) {
        doc.setFont('helvetica', 'bold');
        doc.text('Spouse Last Name:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(registration.spouseLastName, margin + 60, yPos);
        yPos += 6;
      }
    }

    // Child/Children Information
    const kids = (registration as any).kids && Array.isArray((registration as any).kids) ? (registration as any).kids : [];
    const hasLegacyChild = (registration as any).childLunchTicket || (registration as any).childFirstName || (registration as any).childLastName;
    
    if (kids.length > 0 || hasLegacyChild) {
      if (yPos > 250) {
        doc.addPage();
        yPos = margin;
      }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Child/Children Information', margin, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // New kids array
      if (kids.length > 0) {
        kids.forEach((kid: any, idx: number) => {
          doc.setFont('helvetica', 'bold');
          doc.text(`Child ${idx + 1}:`, margin, yPos);
          yPos += 6;
          if (kid.firstName) {
            doc.setFont('helvetica', 'bold');
            doc.text('  First Name:', margin + 10, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(kid.firstName, margin + 70, yPos);
            yPos += 6;
          }
          if (kid.lastName) {
            doc.setFont('helvetica', 'bold');
            doc.text('  Last Name:', margin + 10, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(kid.lastName, margin + 70, yPos);
            yPos += 6;
          }
          if (kid.badgeName) {
            doc.setFont('helvetica', 'bold');
            doc.text('  Badge Name:', margin + 10, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(kid.badgeName, margin + 70, yPos);
            yPos += 6;
          }
          if (kid.age) {
            doc.setFont('helvetica', 'bold');
            doc.text('  Age:', margin + 10, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(String(kid.age), margin + 70, yPos);
            yPos += 6;
          }
          yPos += 3;
        });
      }
      
      // Legacy child information
      if (hasLegacyChild) {
        doc.setFont('helvetica', 'bold');
        doc.text('Lunch Ticket:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text((registration as any).childLunchTicket ? 'Yes' : 'No', margin + 60, yPos);
        yPos += 6;
        if ((registration as any).childFirstName) {
          doc.setFont('helvetica', 'bold');
          doc.text('Child First Name:', margin, yPos);
          doc.setFont('helvetica', 'normal');
          doc.text((registration as any).childFirstName, margin + 60, yPos);
          yPos += 6;
        }
        if ((registration as any).childLastName) {
          doc.setFont('helvetica', 'bold');
          doc.text('Child Last Name:', margin, yPos);
          doc.setFont('helvetica', 'normal');
          doc.text((registration as any).childLastName, margin + 60, yPos);
          yPos += 6;
        }
      }
    }

    // Payment
    if (yPos > 250) {
      doc.addPage();
      yPos = margin;
    }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Information', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const pdfPendingAmt = Number((registration as any).pendingPaymentAmount || 0);
    const pdfHasPending = pdfPendingAmt > 0;
    const pdfPaidAmt = Number((registration as any).paidAmount || 0);
    const pdfCompScope = getCompensationScopeLabel(registration);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Payment Amount:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`$${getFrontendPaymentAmount(registration).toFixed(2)}`, margin + 60, yPos);
    yPos += 6;
    if (pdfHasPending) {
      doc.setFont('helvetica', 'bold');
      doc.text('Paid Amount:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`$${pdfPaidAmt.toFixed(2)}`, margin + 60, yPos);
      yPos += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Pending Amount:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`$${pdfPendingAmt.toFixed(2)}`, margin + 60, yPos);
      yPos += 6;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Method:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(registration.paymentMethod || '-', margin + 60, yPos);
    yPos += 6;
    if (pdfCompScope) {
      doc.setFont('helvetica', 'bold');
      doc.text('Compensation:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfCompScope, margin + 60, yPos);
      yPos += 6;
    }
    if (typeof (registration as any).paid !== 'undefined') {
      doc.setFont('helvetica', 'bold');
      doc.text('Paid:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfHasPending ? 'Due' : ((registration as any).paid ? 'Yes' : 'No'), margin + 60, yPos);
      yPos += 6;
    }
    if (pdfHasPending && (registration as any).pendingPaymentReason) {
      doc.setFont('helvetica', 'bold');
      doc.text('Reason:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String((registration as any).pendingPaymentReason), margin + 60, yPos);
      yPos += 6;
    }
    if (registration.paymentMethod === 'Card' && (registration as any).squarePaymentId) {
      doc.setFont('helvetica', 'bold');
      doc.text('Square Payment ID:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text((registration as any).squarePaymentId, margin + 60, yPos);
      yPos += 6;
    }
    if ((registration as any).spousePaymentId) {
      doc.setFont('helvetica', 'bold');
      doc.text('Spouse Payment ID:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text((registration as any).spousePaymentId, margin + 60, yPos);
      yPos += 6;
    }
    if ((registration as any).paid && registration.paymentMethod === 'Card') {
      const paidAtDate = (registration as any).paidAt || registration.createdAt;
      if (paidAtDate) {
        const formattedDate = new Date(paidAtDate).toLocaleString('en-US', {
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
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Date/Time (EST):', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(formattedDate, margin + 60, yPos);
        yPos += 6;
      }
    }
    if ((registration as any).spousePaymentId) {
      const spousePaidAtDate = (registration as any).spousePaidAt || registration.createdAt;
      if (spousePaidAtDate) {
        const formattedDate = new Date(spousePaidAtDate).toLocaleString('en-US', {
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
        doc.setFont('helvetica', 'bold');
        doc.text('Spouse Payment Date/Time (EST):', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(formattedDate, margin + 60, yPos);
        yPos += 6;
      }
    }

    // Update Notes
    if ((registration as any).updateNotes) {
      if (yPos > 250) {
        doc.addPage();
        yPos = margin;
      }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Update Notes', margin, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const notesLines = doc.splitTextToSize(String((registration as any).updateNotes), pageWidth - margin * 2);
      notesLines.forEach((line: string) => {
        if (yPos > 275) {
          doc.addPage();
          yPos = margin;
        }
        doc.text(line, margin, yPos);
        yPos += 5;
      });
    }

    // Save PDF
    const fileName = `Registration_${registration.firstName}_${registration.lastName}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  };

  const addr = registration ? parseAddress(registration.address) : { street: '', city: '', state: '', zip: '', country: '' };
  const Line = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="preview-line">
      <div className="preview-label">{label}</div>
      <div className="preview-value">{value || '-'}</div>
    </div>
  );

  const handleResendConfirmation = async () => {
    if (!registration?.id) return;
    try {
      setResendingEmail(true);
      const response = await registrationsApi.resendConfirmation(registration.id);
      if (response.success) {
        alert('Confirmation email sent successfully!');
      } else {
        alert('Failed to send confirmation email. Please try again later.');
      }
    } catch (error) {
      console.error('Error resending confirmation email:', error);
      alert('Failed to send confirmation email. Please try again later.');
    } finally {
      setResendingEmail(false);
    }
  };

  if (loading) {
    return (
      <Modal
        size="xl"
        title="Registration Preview"
        onClose={onClose}
      >
        <div className="preview-loading">Loading registration details...</div>
      </Modal>
    );
  }

  if (!registration) {
    return (
      <Modal
        size="xl"
        title="Registration Preview"
        onClose={onClose}
      >
        <div className="preview-loading">Registration not found.</div>
      </Modal>
    );
  }

  return (
    <Modal
      size="xl"
      title={
        <div className="modal-title-content">
          <div>
            <h2>Registration Preview</h2>
            {event && (
              <p className="modal-subtitle">
                {event.name}
              </p>
            )}
          </div>
        </div>
      }
      onClose={onClose}
      footer={
        <div className="modal-footer-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          {showResendButton && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResendConfirmation}
              disabled={resendingEmail}
            >
              {resendingEmail ? 'Sending...' : 'Resend Confirmation Email'}
            </button>
          )}
          <div style={{ marginLeft: showResendButton ? '0' : 'auto' }}>
            <button type="button" className="btn btn-secondary" onClick={downloadPDF} style={{ marginRight: '8px' }}>
              Download PDF
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      }
    >
      <div className="preview-container">
        <div className="preview-section">
          <h3 className="section-title">Personal Information</h3>
          <Line label="Name" value={`${registration.firstName} ${registration.lastName}`} />
          <Line label="Badge Name" value={registration.badgeName} />
          <Line label="Email" value={registration.email} />
          {registration.secondaryEmail && <Line label="Secondary Email" value={registration.secondaryEmail} />}
          <Line label="Organization" value={registration.organization} />
          <Line label="Job Title" value={registration.jobTitle} />
          <Line label="Address" value={addr.street || registration.address} />
          {addr.city && <Line label="City" value={addr.city} />}
          {addr.state && <Line label="State" value={addr.state} />}
          {addr.zip && <Line label="Zip Code" value={addr.zip} />}
          {addr.country && <Line label="Country" value={addr.country} />}
          <Line label="Mobile" value={registration.mobile} />
          {registration.officePhone && <Line label="Office Phone" value={registration.officePhone} />}
          <Line label="First-time Attending" value={registration.isFirstTimeAttending ? 'Yes' : 'No'} />
          <Line label="Company Type" value={registration.companyType} />
          {registration.companyTypeOther && <Line label="Company Type (Other)" value={registration.companyTypeOther} />}
          {registration.emergencyContactName && <Line label="Emergency Contact Name" value={registration.emergencyContactName} />}
          {registration.emergencyContactPhone && <Line label="Emergency Contact Phone" value={registration.emergencyContactPhone} />}
        </div>

        <div className="preview-section">
          <h3 className="section-title">Conference Events</h3>
          <Line label="Selected Activity" value={registration.wednesdayActivity} />
          {registration.golfHandicap && <Line label="Golf Handicap" value={registration.golfHandicap} />}
          {registration.clubRentals && <Line label="Club Rentals" value={registration.clubRentals} />}
          {(registration as any).massageTimeSlot && <Line label="Massage Time Slot" value={(registration as any).massageTimeSlot} />}
          {((registration.wednesdayActivity || '').toLowerCase().includes('pickleball') && (registration as any).pickleballEquipment !== undefined) && (
            <Line 
              label="Pickleball Equipment" 
              value={(registration as any).pickleballEquipment ? 'I will bring my own' : 'I need equipment'} 
            />
          )}
        </div>

        <div className="preview-section">
          <h3 className="section-title">Conference Meals</h3>
          {(registration as any).tuesdayEarlyReception && <Line label="Tuesday Early Arrivals Reception" value={(registration as any).tuesdayEarlyReception} />}
          <Line label="Wednesday Reception" value={registration.wednesdayReception} />
          <Line label="Thursday Breakfast" value={registration.thursdayBreakfast} />
          <Line label="Thursday Luncheon" value={registration.thursdayLuncheon} />
          <Line label="Thursday Dinner" value={registration.thursdayDinner} />
          <Line label="Friday Breakfast" value={registration.fridayBreakfast} />
          {registration.dietaryRestrictions && <Line label="Dietary Restrictions" value={registration.dietaryRestrictions} />}
          {(registration as any).specialRequests && <Line label="Special Requests" value={(registration as any).specialRequests} />}
        </div>

        {((registration as any).transportationMethod || (registration as any).transportationDetails || 
          (registration as any).stayingAtBeachClub !== undefined || (registration as any).accommodationDetails ||
          ((registration as any).dietaryRequirements && Array.isArray((registration as any).dietaryRequirements) && (registration as any).dietaryRequirements.length > 0) ||
          (registration as any).dietaryRequirementsOther || (registration as any).specialPhysicalNeeds !== undefined ||
          (registration as any).specialPhysicalNeedsDetails) && (
          <div className="preview-section">
            <h3 className="section-title">Additional Information</h3>
            {(registration as any).transportationMethod && <Line label="Transportation Method" value={(registration as any).transportationMethod} />}
            {(registration as any).transportationDetails && <Line label="Transportation Details" value={(registration as any).transportationDetails} />}
            {(registration as any).stayingAtBeachClub !== undefined && <Line label="Staying at Beach Club Resort" value={(registration as any).stayingAtBeachClub ? 'Yes' : 'No'} />}
            {(registration as any).accommodationDetails && <Line label="Accommodation Details" value={(registration as any).accommodationDetails} />}
            {((registration as any).dietaryRequirements && Array.isArray((registration as any).dietaryRequirements) && (registration as any).dietaryRequirements.length > 0) && (
              <Line 
                label="Dietary Requirements" 
                value={((registration as any).dietaryRequirements.join(', ')) + ((registration as any).dietaryRequirementsOther ? ` (Other: ${(registration as any).dietaryRequirementsOther})` : '')} 
              />
            )}
            {(registration as any).specialPhysicalNeeds !== undefined && <Line label="Special Physical Needs" value={(registration as any).specialPhysicalNeeds ? 'Yes' : 'No'} />}
            {(registration as any).specialPhysicalNeedsDetails && <Line label="Special Physical Needs Details" value={(registration as any).specialPhysicalNeedsDetails} />}
          </div>
        )}

        {(((registration as any).kids && Array.isArray((registration as any).kids) && (registration as any).kids.length > 0) || 
          (registration as any).childLunchTicket || (registration as any).childFirstName || (registration as any).childLastName) && (
          <div className="preview-section">
            <h3 className="section-title">Child/Children Information</h3>
            {(registration as any).kids && Array.isArray((registration as any).kids) && (registration as any).kids.length > 0 && (
              <>
                {(registration as any).kids.map((kid: any, idx: number) => (
                  <div key={idx} style={{ marginBottom: '1rem', padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                    <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold' }}>Child {idx + 1}</h4>
                    {kid.firstName && <Line label="First Name" value={kid.firstName} />}
                    {kid.lastName && <Line label="Last Name" value={kid.lastName} />}
                    {kid.badgeName && <Line label="Badge Name" value={kid.badgeName} />}
                    {kid.age && <Line label="Age" value={String(kid.age)} />}
                  </div>
                ))}
              </>
            )}
            {((registration as any).childLunchTicket || (registration as any).childFirstName || (registration as any).childLastName) && (
              <>
                <div className="preview-item">
                  <span className="preview-label">Lunch Ticket:</span>
                  <span className="preview-value">{(registration as any).childLunchTicket ? 'Yes' : 'No'}</span>
                </div>
                {(registration as any).childFirstName && (
                  <div className="preview-item">
                    <span className="preview-label">Child First Name:</span>
                    <span className="preview-value">{(registration as any).childFirstName}</span>
                  </div>
                )}
                {(registration as any).childLastName && (
                  <div className="preview-item">
                    <span className="preview-label">Child Last Name:</span>
                    <span className="preview-value">{(registration as any).childLastName}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {registration.spouseDinnerTicket && (
          <div className="preview-section">
            <h3 className="section-title">Spouse/Guest</h3>
            <Line label="Dinner Ticket" value="Yes" />
            {registration.spouseFirstName && <Line label="Spouse First Name" value={registration.spouseFirstName} />}
            {registration.spouseLastName && <Line label="Spouse Last Name" value={registration.spouseLastName} />}
          </div>
        )}

        <div className="preview-section">
          <h3 className="section-title">Payment</h3>
          {(() => {
            const pendingAmt = Number((registration as any).pendingPaymentAmount || 0);
            const hasPending = pendingAmt > 0;
            const paidAmt = Number((registration as any).paidAmount || 0);
            const compScope = getCompensationScopeLabel(registration);
            return (
              <>
                <Line
                  label="Total Payment Amount"
                  value={`$${getFrontendPaymentAmount(registration).toFixed(2)}`}
                />
                {hasPending && (
                  <>
                    <Line label="Paid Amount" value={`$${paidAmt.toFixed(2)}`} />
                    <Line label="Pending Amount" value={`$${pendingAmt.toFixed(2)}`} />
                  </>
                )}
                <Line label="Payment Method" value={registration.paymentMethod} />
                {compScope && <Line label="Compensation" value={compScope} />}
                {typeof (registration as any).paid !== 'undefined' && (
                  <Line label="Paid" value={hasPending ? 'Due' : ((registration as any).paid ? 'Yes' : 'No')} />
                )}
                {hasPending && (registration as any).pendingPaymentReason && (
                  <Line label="Reason" value={(registration as any).pendingPaymentReason} />
                )}
              </>
            );
          })()}
          {registration.paymentMethod === 'Card' && (registration as any).squarePaymentId && (
            <Line label="Square Payment ID" value={(registration as any).squarePaymentId} />
          )}
          {(registration as any).spousePaymentId && (
            <Line 
              label={`Spouse Payment ID${Array.isArray((registration as any).spousePaymentId) && (registration as any).spousePaymentId.length > 1 ? 's' : ''}`} 
              value={Array.isArray((registration as any).spousePaymentId) 
                ? (registration as any).spousePaymentId.join(', ') 
                : (registration as any).spousePaymentId} 
            />
          )}
          {(registration as any).kidsPaymentId && (
            <Line 
              label={`Children Payment ID${Array.isArray((registration as any).kidsPaymentId) && (registration as any).kidsPaymentId.length > 1 ? 's' : ''}`} 
              value={Array.isArray((registration as any).kidsPaymentId) 
                ? (registration as any).kidsPaymentId.join(', ') 
                : (registration as any).kidsPaymentId} 
            />
          )}
          {(registration as any).paid && registration.paymentMethod === 'Card' && ((registration as any).paidAt || registration.createdAt) && (
            <Line 
              label="Payment Date/Time (EST)" 
              value={new Date((registration as any).paidAt || registration.createdAt).toLocaleString('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
                timeZoneName: 'short'
              })} 
            />
          )}
          {(registration as any).spousePaymentId && ((registration as any).spousePaidAt || registration.createdAt) && (
            <Line 
              label="Spouse Payment Date/Time (EST)" 
              value={new Date((registration as any).spousePaidAt || registration.createdAt).toLocaleString('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
                timeZoneName: 'short'
              })} 
            />
          )}
        </div>

        {(registration as any).updateNotes && (
          <div className="preview-section">
            <h3 className="section-title">Update Notes</h3>
            <div style={{
              whiteSpace: 'pre-wrap',
              fontSize: '14px',
              padding: '12px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              maxHeight: '300px',
              overflowY: 'auto',
              color: '#374151',
              lineHeight: '1.6'
            }}>
              {(registration as any).updateNotes}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default RegistrationPreview;

