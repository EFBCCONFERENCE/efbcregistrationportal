"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmailQueueStatus = exports.queueEmail = void 0;
exports.sendVerificationEmail = sendVerificationEmail;
exports.sendVerificationCompleteEmail = sendVerificationCompleteEmail;
exports.sendRegistrationConfirmationEmail = sendRegistrationConfirmationEmail;
exports.sendRegistrationUpdateEmail = sendRegistrationUpdateEmail;
exports.sendAdminCreatedUserEmail = sendAdminCreatedUserEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
exports.sendCancellationRequestAdminEmail = sendCancellationRequestAdminEmail;
exports.sendPairingRequestAdminEmail = sendPairingRequestAdminEmail;
exports.sendCancellationRequestConfirmationEmail = sendCancellationRequestConfirmationEmail;
exports.sendCancellationDecisionEmail = sendCancellationDecisionEmail;
exports.sendRegistrationRestoredEmail = sendRegistrationRestoredEmail;
exports.sendPendingPaymentEmail = sendPendingPaymentEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
if ((process.env.NODE_ENV || '').toLowerCase() !== 'production') {
    dotenv_1.default.config();
}
const ensureTransporter = () => {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
        const missing = [];
        if (!host)
            missing.push('SMTP_HOST');
        if (!user)
            missing.push('SMTP_USER');
        if (!pass)
            missing.push('SMTP_PASS');
        console.warn('SMTP not fully configured. Missing:', missing.join(', ') || 'none', '- emails will be logged to console.');
        return null;
    }
    const secure = (process.env.SMTP_SECURE || '').length
        ? /^(1|true|yes)$/i.test(process.env.SMTP_SECURE)
        : port === 465;
    const familyEnv = process.env.SMTP_FAMILY;
    const family = familyEnv ? Number(familyEnv) : 4;
    const transport = nodemailer_1.default.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        requireTLS: !secure,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        ...(family ? { family } : {}),
        tls: secure ? { minVersion: 'TLSv1.2', servername: host } : { minVersion: 'TLSv1.2', servername: host },
        logger: /^(1|true|yes)$/i.test(process.env.SMTP_DEBUG || ''),
        debug: /^(1|true|yes)$/i.test(process.env.SMTP_DEBUG || ''),
    });
    return transport;
};
const transporter = ensureTransporter();
let smtpVerifiedLogged = false;
const getAdminEmail = () => {
    return process.env.ADMIN_NOTIFY_EMAIL ||
        process.env.ADMIN_EMAIL ||
        process.env.SUPPORT_EMAIL ||
        'planner@efbcconference.org';
};
const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const SPAM_TRIGGER_WORDS = [
    'free', 'act now', 'limited time', 'urgent', 'click here', 'winner',
    'congratulations', 'guaranteed', 'no risk', 'special promotion',
    'exclusive offer', 'buy now', 'order now', 'deal', 'discount', 'save',
    'win', 'prize', 'cash', 'money', '$$$', '!!!', 'asap', 'limited offer',
    'one time', 'once in a lifetime', 'risk free', 'no obligation',
    'act immediately', 'call now', 'order today', 'buy today', 'sale',
    'clearance', 'lowest price', 'best price', 'cheap', 'affordable',
    'amazing', 'incredible', 'unbelievable', 'shocking', 'secret',
    'hidden', 'exclusive', 'private', 'insider', 'members only'
];
const sanitizeSubjectLine = (subject) => {
    let sanitized = subject.trim();
    const lowerSubject = sanitized.toLowerCase();
    SPAM_TRIGGER_WORDS.forEach(spamWord => {
        const regex = new RegExp(`\\b${spamWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        if (regex.test(lowerSubject)) {
            const replacements = {
                'free': 'complimentary',
                'act now': 'please review',
                'urgent': 'important',
                'click here': 'view details',
                'winner': 'selected',
                'congratulations': 'thank you',
                'guaranteed': 'confirmed',
                'special promotion': 'information',
                'exclusive offer': 'details',
                'buy now': 'register',
                'order now': 'register',
                'deal': 'information',
                'discount': 'pricing',
                'save': 'information',
                'win': 'selected',
                'prize': 'award',
                'cash': 'payment',
                'money': 'payment',
                'sale': 'information',
                'amazing': 'important',
                'incredible': 'important',
                'unbelievable': 'important',
                'shocking': 'important',
                'secret': 'information',
                'hidden': 'additional',
                'exclusive': 'important',
                'private': 'personal',
                'insider': 'important',
                'members only': 'for attendees'
            };
            const replacement = replacements[spamWord.toLowerCase()] || 'information';
            sanitized = sanitized.replace(regex, replacement);
        }
    });
    sanitized = sanitized.replace(/([A-Z]{4,})/g, (match) => {
        const commonAcronyms = ['EFBC', 'API', 'HTTP', 'HTTPS', 'SMTP', 'URL', 'PDF', 'HTML', 'CSS', 'JS', 'JSON', 'XML'];
        if (commonAcronyms.includes(match)) {
            return match;
        }
        return match.charAt(0) + match.slice(1).toLowerCase();
    });
    sanitized = sanitized.replace(/[!?]{2,}/g, (match) => match.charAt(0));
    sanitized = sanitized.replace(/\s+/g, ' ');
    sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
    if (sanitized.length > 60) {
        sanitized = sanitized.substring(0, 57) + '...';
    }
    return sanitized.trim();
};
const sendUsingTransporter = async (payload) => {
    if (!transporter)
        throw new Error('No SMTP transporter');
    if (!smtpVerifiedLogged) {
        try {
            await transporter.verify();
            console.log('SMTP OK - transporter verified');
        }
        catch (e) {
            const msg = e?.message || String(e);
            console.error('SMTP FAIL -', msg);
        }
        finally {
            smtpVerifiedLogged = true;
        }
    }
    const from = process.env.EMAIL_FROM || 'no-reply@efbc.local';
    await transporter.sendMail({ from, ...payload });
};
const sendUsingBrevo = async (payload) => {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey)
        throw new Error('BREVO_API_KEY not set');
    const from = process.env.EMAIL_FROM || 'no-reply@efbc.local';
    const fromName = process.env.EMAIL_FROM_NAME || 'EFBC Conference';
    let fromEmail = from;
    let fromNameValue = fromName;
    const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
    if (fromMatch) {
        fromNameValue = fromMatch[1].trim();
        fromEmail = fromMatch[2].trim();
    }
    const fetchAny = globalThis.fetch;
    const res = await fetchAny('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            sender: {
                name: fromNameValue,
                email: fromEmail
            },
            to: [
                {
                    email: payload.to
                }
            ],
            subject: payload.subject,
            htmlContent: payload.html,
            textContent: payload.text
        })
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Brevo API failed (${res.status}): ${body}`);
    }
    const responseData = await res.json();
    console.log(`[BREVO] Email sent successfully. Message ID: ${responseData.messageId || 'N/A'}`);
};
const sendMail = async (payload) => {
    try {
        if (transporter) {
            await sendUsingTransporter(payload);
            return;
        }
    }
    catch (e) {
        console.error('SMTP send failed, falling back to HTTP API:', e?.message || e);
    }
    if (process.env.BREVO_API_KEY) {
        await sendUsingBrevo(payload);
        return;
    }
    console.warn('No email transport available (SMTP or BREVO_API_KEY). Email not sent.');
    throw new Error('No email transport available');
};
class EmailQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.delayBetweenEmails = 1000;
    }
    enqueue(payload, maxRetries = 3) {
        const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
        this.queue.push({
            payload,
            retries: 0,
            maxRetries,
            id
        });
        console.log(`[EMAIL QUEUE] Email queued for ${payload.to}. Queue length: ${this.queue.length}`);
        if (!this.processing) {
            this.processQueue();
        }
    }
    async processQueue() {
        if (this.processing)
            return;
        this.processing = true;
        while (this.queue.length > 0) {
            const email = this.queue.shift();
            if (!email)
                break;
            try {
                console.log(`[EMAIL QUEUE] Processing email ${email.id} to ${email.payload.to} (attempt ${email.retries + 1}/${email.maxRetries + 1})`);
                await sendMail(email.payload);
                console.log(`[EMAIL QUEUE] Successfully sent email ${email.id} to ${email.payload.to}`);
            }
            catch (error) {
                email.retries++;
                const errorMsg = error?.message || String(error);
                console.error(`[EMAIL QUEUE] Failed to send email ${email.id} to ${email.payload.to} (attempt ${email.retries}/${email.maxRetries + 1}):`, errorMsg);
                const isRateLimit = errorMsg.includes('429') ||
                    errorMsg.includes('rate_limit') ||
                    errorMsg.includes('rate_limit_exceeded') ||
                    errorMsg.includes('Too many requests') ||
                    errorMsg.includes('quota') ||
                    errorMsg.includes('limit');
                if (email.retries <= email.maxRetries) {
                    const retryDelay = isRateLimit
                        ? 60000 + (email.retries * 30000)
                        : Math.min(1000 * email.retries, 5000);
                    console.log(`[EMAIL QUEUE] Retrying email ${email.id} in ${retryDelay}ms...${isRateLimit ? ' (rate limit detected)' : ''}`);
                    setTimeout(() => {
                        this.queue.unshift(email);
                        if (!this.processing) {
                            this.processQueue();
                        }
                    }, retryDelay);
                }
                else {
                    console.error(`[EMAIL QUEUE] Max retries exceeded for email ${email.id} to ${email.payload.to}. Email will not be sent.`);
                }
            }
            if (this.queue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.delayBetweenEmails));
            }
        }
        this.processing = false;
        if (this.queue.length > 0) {
            this.processQueue();
        }
    }
    getStatus() {
        return {
            queueLength: this.queue.length,
            processing: this.processing
        };
    }
}
const emailQueue = new EmailQueue();
const queueEmail = (payload, maxRetries = 3) => {
    const sanitizedPayload = {
        ...payload,
        subject: sanitizeSubjectLine(payload.subject)
    };
    emailQueue.enqueue(sanitizedPayload, maxRetries);
};
exports.queueEmail = queueEmail;
const getEmailQueueStatus = () => emailQueue.getStatus();
exports.getEmailQueueStatus = getEmailQueueStatus;
const sendMailWithAdminCopy = async (payload, sendAdminCopy = true) => {
    emailQueue.enqueue(payload);
    if (sendAdminCopy) {
        const adminEmail = getAdminEmail();
        if (adminEmail && adminEmail !== payload.to) {
            emailQueue.enqueue({ ...payload, to: adminEmail });
        }
    }
};
const getCustomFooter = async () => {
    try {
        const db = globalThis.databaseService;
        if (!db)
            return '';
        const result = await db.query('SELECT footer_text FROM email_customizations WHERE id = 1 LIMIT 1');
        if (Array.isArray(result) && result.length > 0 && result[0].footer_text) {
            return result[0].footer_text;
        }
    }
    catch (error) {
    }
    return '';
};
const renderEmailTemplate = async (params) => {
    const brand = (process.env.EMAIL_BRAND || 'EFBC Conference').trim();
    const heading = params.heading || brand;
    const preheader = params.preheader || '';
    const customFooter = params.footerHtml !== undefined ? params.footerHtml : await getCustomFooter();
    const footerHtml = customFooter || '';
    const buttonHtml = params.cta
        ? `
      <a href="${params.cta.url}"
         style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
        ${params.cta.label}
      </a>
    `
        : '';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const logoUrl = `${frontendUrl}/EFBClogoemail.png`;
    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${params.subject || heading}</title>
    <style></style>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif;">
    <span style="display:none;opacity:0;visibility:hidden;mso-hide:all;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px;text-align:center;background:#ffffff;">
                <img src="${logoUrl}" alt="${brand}" style="max-width:150px;height:auto;display:block;margin:0 auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#ffffff;">
                <h1 style="margin:0;color:#111827;font-size:18px;">${brand}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <h2 style="margin:0 0 8px 0;color:#111827;font-size:20px;line-height:1.4;">${heading}</h2>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 8px 24px;color:#374151;font-size:14px;line-height:1.7;">
                ${params.contentHtml}
              </td>
            </tr>
            ${params.cta ? `<tr><td style="padding:16px 24px 8px 24px;">${buttonHtml}</td></tr>` : ''}
            <tr>
              <td style="padding:20px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
                ${footerHtml}
              </td>
            </tr>
          </table>
          <div style="color:#6b7280;font-size:11px;margin-top:12px;">© ${new Date().getFullYear()} ${brand}. All rights reserved.</div>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};
async function sendVerificationEmail(to, token) {
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || '5000'}`;
    const encodedToken = encodeURIComponent(token);
    const verifyPath = `/api/auth/verify-email?token=${encodedToken}`;
    const link = `${backendUrl}${verifyPath}`;
    console.log(`[EMAIL] Sending verification email to ${to} with token prefix: ${token.substring(0, 10)}...`);
    console.log(`[EMAIL] Verification link: ${backendUrl}${verifyPath.substring(0, 50)}...`);
    const from = process.env.EMAIL_FROM || 'no-reply@efbc.local';
    const subject = sanitizeSubjectLine('Verify your email address');
    const html = await renderEmailTemplate({
        subject,
        heading: 'Verify your email',
        preheader: 'Confirm your email to finish setting up your account',
        contentHtml: `
      <p style="margin:0 0 12px 0;">Welcome to the EFBC Conference! Please confirm your email address to activate your account.</p>
      <p style="margin:0;opacity:.8;">This link expires in 30 minutes.</p>
    `,
        cta: { label: 'Verify Email', url: link },
        footerHtml: '',
    });
    const text = `Verify your email: ${link}`;
    (0, exports.queueEmail)({ to, subject, text, html });
}
async function sendVerificationCompleteEmail(to, userName) {
    const from = process.env.EMAIL_FROM || 'no-reply@efbc.local';
    const subject = sanitizeSubjectLine('Email verification complete');
    const loginUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/login';
    const html = await renderEmailTemplate({
        subject,
        heading: 'Email verified successfully',
        preheader: 'Your email address has been verified. You can now access your account.',
        contentHtml: `
      <p style="margin:0 0 12px 0;">Hi ${userName || 'there'},</p>
      <p style="margin:0 0 8px 0;">Your email address has been successfully verified.</p>
      <p style="margin:0 0 8px 0;">You can now sign in to your EFBC Conference account</p>
    `,
        cta: { label: 'Sign In', url: loginUrl },
        footerHtml: '',
    });
    const text = [
        `Hi ${userName || 'there'},`,
        'Your email address has been successfully verified.',
        'You can now sign in to your EFBC Conference account.',
        `Sign in: ${loginUrl}`
    ].join('\n');
    (0, exports.queueEmail)({ to, subject, text, html });
}
const formatDateInEST = (dateString) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleString('en-US', {
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
};
const formatEventDateRange = (startDate, endDate) => {
    if (!startDate && !endDate)
        return '';
    if (startDate && !endDate) {
        try {
            const date = new Date(startDate);
            if (isNaN(date.getTime()))
                return startDate;
            const day = date.getDate();
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            return `${day} ${monthNames[date.getMonth()]}`;
        }
        catch {
            return startDate;
        }
    }
    if (!startDate && endDate) {
        try {
            const date = new Date(endDate);
            if (isNaN(date.getTime()))
                return endDate;
            const day = date.getDate();
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            return `${day} ${monthNames[date.getMonth()]}`;
        }
        catch {
            return endDate;
        }
    }
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return `${startDate} to ${endDate}`;
        }
        const startDay = start.getDate();
        const endDay = end.getDate();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const startMonth = start.getMonth();
        const endMonth = end.getMonth();
        if (startMonth === endMonth) {
            return `${startDay} to ${endDay} ${monthNames[startMonth]}`;
        }
        else {
            return `${startDay} ${monthNames[startMonth]} to ${endDay} ${monthNames[endMonth]}`;
        }
    }
    catch {
        return `${startDate} to ${endDate}`;
    }
};
async function sendRegistrationConfirmationEmail(params) {
    const { to, name, eventName, eventDate, eventStartDate, totalPrice, registration } = params;
    const from = process.env.EMAIL_FROM || 'no-reply@efbc.local';
    const subject = sanitizeSubjectLine('Your EFBC Conference Registration is Confirmed');
    const paymentAmount = totalPrice !== undefined && totalPrice !== null
        ? Number(totalPrice)
        : (registration?.totalPrice !== undefined && registration?.totalPrice !== null
            ? Number(registration.totalPrice)
            : (registration?.total_price !== undefined && registration?.total_price !== null
                ? Number(registration.total_price)
                : 0));
    const priceText = paymentAmount > 0 ? `Total: $${paymentAmount.toFixed(2)}` : '';
    const paymentMethod = registration?.paymentMethod || registration?.payment_method || '';
    const squarePaymentId = registration?.squarePaymentId || registration?.square_payment_id || '';
    const isCardPayment = paymentMethod === 'Card';
    const convenienceFee = isCardPayment && paymentAmount > 0 ? paymentAmount * 0.035 : 0;
    const totalWithFee = paymentAmount + convenienceFee;
    const formattedEventDate = formatEventDateRange(eventStartDate || null, eventDate || null);
    const wednesdayActivity = registration?.wednesdayActivity || registration?.wednesday_activity || '';
    const wednesdayActivityWaitlistedRaw = registration?.wednesdayActivityWaitlisted ?? registration?.wednesday_activity_waitlisted;
    const isActivityWaitlisted = !!wednesdayActivity &&
        (wednesdayActivityWaitlistedRaw === true ||
            wednesdayActivityWaitlistedRaw === 1 ||
            wednesdayActivityWaitlistedRaw === '1');
    const clubRentals = registration?.clubRentals || registration?.club_rentals || '';
    const golfHandicap = registration?.golfHandicap || registration?.golf_handicap || '';
    const massageTimeSlot = registration?.massageTimeSlot || registration?.massage_time_slot || '';
    const pickleballEquipment = registration?.pickleballEquipment || registration?.pickleball_equipment;
    const dietaryRestrictions = registration?.dietaryRestrictions || registration?.dietary_restrictions || '';
    const specialRequests = registration?.specialRequests || registration?.special_requests || '';
    const emergencyContactName = registration?.emergencyContactName || registration?.emergency_contact_name || '';
    const emergencyContactPhone = registration?.emergencyContactPhone || registration?.emergency_contact_phone || '';
    const isFirstTimeAttending = registration?.isFirstTimeAttending !== undefined
        ? registration.isFirstTimeAttending
        : (registration?.is_first_time_attending !== undefined
            ? registration.is_first_time_attending
            : null);
    const companyType = registration?.companyType || registration?.company_type || '';
    const companyTypeOther = registration?.companyTypeOther || registration?.company_type_other || '';
    const officePhone = registration?.officePhone || registration?.office_phone || '';
    const firstName = registration?.firstName || registration?.first_name || '';
    const lastName = registration?.lastName || registration?.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const addressStreet = registration?.addressStreet || registration?.address_street || '';
    const city = registration?.city || '';
    const state = registration?.state || '';
    const zipCode = registration?.zipCode || registration?.zip_code || '';
    const country = registration?.country || '';
    const spouseFirstName = registration?.spouseFirstName || registration?.spouse_first_name || '';
    const spouseLastName = registration?.spouseLastName || registration?.spouse_last_name || '';
    const spouseDinnerTicket = registration?.spouseDinnerTicket !== undefined
        ? registration.spouseDinnerTicket
        : (registration?.spouse_dinner_ticket !== undefined ? registration.spouse_dinner_ticket : false);
    const kids = registration?.kids || (registration?.kids_data ? (typeof registration.kids_data === 'string' ? JSON.parse(registration.kids_data) : registration.kids_data) : []);
    const transportationMethod = registration?.transportationMethod || registration?.transportation_method || '';
    const transportationDetails = registration?.transportationDetails || registration?.transportation_details || '';
    const stayingAtBeachClub = registration?.stayingAtBeachClub !== undefined
        ? registration.stayingAtBeachClub
        : (registration?.staying_at_beach_club !== undefined ? !!registration.staying_at_beach_club : undefined);
    const accommodationDetails = registration?.accommodationDetails || registration?.accommodation_details || '';
    const dietaryRequirements = registration?.dietaryRequirements || (registration?.dietary_requirements ? (typeof registration.dietary_requirements === 'string' ? JSON.parse(registration.dietary_requirements) : registration.dietary_requirements) : []);
    const dietaryRequirementsOther = registration?.dietaryRequirementsOther || registration?.dietary_requirements_other || '';
    const specialPhysicalNeeds = registration?.specialPhysicalNeeds !== undefined
        ? registration.specialPhysicalNeeds
        : (registration?.special_physical_needs !== undefined ? !!registration.special_physical_needs : undefined);
    const specialPhysicalNeedsDetails = registration?.specialPhysicalNeedsDetails || registration?.special_physical_needs_details || '';
    const updateNotes = registration?.updateNotes || registration?.update_notes || '';
    const detailsHtml = registration
        ? `
      <table role="presentation" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        ${fullName ? `<tr><td style="color:#6b7280;">Name</td><td><strong>${escapeHtml(fullName)}</strong></td></tr>` : ''}
        ${registration.badgeName ? `<tr><td style="color:#6b7280;">Badge Name</td><td><strong>${escapeHtml(registration.badgeName)}</strong></td></tr>` : ''}
        ${registration.email ? `<tr><td style="color:#6b7280;">Email</td><td>${escapeHtml(registration.email)}</td></tr>` : ''}
        ${registration.secondaryEmail ? `<tr><td style="color:#6b7280;">Secondary Email</td><td>${escapeHtml(registration.secondaryEmail)}</td></tr>` : ''}
        ${registration.organization ? `<tr><td style="color:#6b7280;">Organization</td><td>${escapeHtml(registration.organization)}</td></tr>` : ''}
        ${registration.jobTitle ? `<tr><td style="color:#6b7280;">Job Title</td><td>${escapeHtml(registration.jobTitle)}</td></tr>` : ''}
        ${addressStreet || registration.address ? `<tr><td style="color:#6b7280;">Address</td><td>${escapeHtml(addressStreet || String(registration.address || '')).replace(/\n/g, '<br/>')}</td></tr>` : ''}
        ${city ? `<tr><td style="color:#6b7280;">City</td><td>${escapeHtml(city)}</td></tr>` : ''}
        ${state ? `<tr><td style="color:#6b7280;">State</td><td>${escapeHtml(state)}</td></tr>` : ''}
        ${zipCode ? `<tr><td style="color:#6b7280;">Zip Code</td><td>${escapeHtml(zipCode)}</td></tr>` : ''}
        ${country ? `<tr><td style="color:#6b7280;">Country</td><td>${escapeHtml(country)}</td></tr>` : ''}
        ${registration.mobile ? `<tr><td style="color:#6b7280;">Mobile</td><td>${escapeHtml(registration.mobile)}</td></tr>` : ''}
        ${officePhone ? `<tr><td style="color:#6b7280;">Office Phone</td><td>${escapeHtml(officePhone)}</td></tr>` : ''}
        ${isFirstTimeAttending !== null ? `<tr><td style="color:#6b7280;">First Time Attending?</td><td>${isFirstTimeAttending ? 'Yes' : 'No'}</td></tr>` : ''}
        ${companyType ? `<tr><td style="color:#6b7280;">Company Type</td><td>${escapeHtml(companyType)}</td></tr>` : ''}
        ${companyTypeOther ? `<tr><td style="color:#6b7280;">Company Type (Other)</td><td>${escapeHtml(companyTypeOther)}</td></tr>` : ''}
        ${wednesdayActivity ? `<tr><td style="color:#6b7280;">Selected Activity</td><td>${escapeHtml(wednesdayActivity)}${isActivityWaitlisted ? ' <strong style="color:#b91c1c;">(WAITLISTED)</strong>' : ''}</td></tr>` : ''}
        ${wednesdayActivity && wednesdayActivity.toLowerCase().includes('golf') && golfHandicap ? `<tr><td style="color:#6b7280;">Golf Handicap</td><td>${escapeHtml(golfHandicap)}</td></tr>` : ''}
        ${wednesdayActivity && wednesdayActivity.toLowerCase().includes('golf') && clubRentals ? `<tr><td style="color:#6b7280;">Golf Club Preference</td><td>${escapeHtml(clubRentals)}</td></tr>` : ''}
        ${wednesdayActivity && wednesdayActivity.toLowerCase().includes('massage') && massageTimeSlot ? `<tr><td style="color:#6b7280;">Massage Time Slot</td><td>${escapeHtml(massageTimeSlot)}</td></tr>` : ''}
        ${wednesdayActivity && wednesdayActivity.toLowerCase().includes('pickleball') && pickleballEquipment !== undefined ? `<tr><td style="color:#6b7280;">Pickleball Equipment</td><td>${pickleballEquipment ? 'I will bring my own' : 'I need equipment'}</td></tr>` : ''}
        ${registration.tuesdayEarlyReception ? `<tr><td style="color:#6b7280;">Tuesday Early Arrivals Reception</td><td>${escapeHtml(registration.tuesdayEarlyReception)}</td></tr>` : ''}
        ${registration.wednesdayReception ? `<tr><td style="color:#6b7280;">Wednesday Reception</td><td>${escapeHtml(registration.wednesdayReception)}</td></tr>` : ''}
        ${registration.thursdayBreakfast ? `<tr><td style="color:#6b7280;">Thursday Breakfast</td><td>${escapeHtml(registration.thursdayBreakfast)}</td></tr>` : ''}
        ${registration.thursdayLuncheon ? `<tr><td style="color:#6b7280;">Thursday Luncheon</td><td>${escapeHtml(registration.thursdayLuncheon)}</td></tr>` : ''}
        ${registration.thursdayDinner ? `<tr><td style="color:#6b7280;">Thursday Dinner</td><td>${escapeHtml(registration.thursdayDinner)}</td></tr>` : ''}
        ${registration.fridayBreakfast ? `<tr><td style="color:#6b7280;">Friday Breakfast</td><td>${escapeHtml(registration.fridayBreakfast)}</td></tr>` : ''}
        ${dietaryRestrictions ? `<tr><td style="color:#6b7280;">Dietary Restrictions</td><td>${escapeHtml(dietaryRestrictions)}</td></tr>` : ''}
        ${specialRequests ? `<tr><td style="color:#6b7280;">Special Requests</td><td>${escapeHtml(specialRequests)}</td></tr>` : ''}
        ${transportationMethod ? `<tr><td style="color:#6b7280;">Transportation Method</td><td>${escapeHtml(transportationMethod)}</td></tr>` : ''}
        ${transportationDetails ? `<tr><td style="color:#6b7280;">Transportation Details</td><td>${escapeHtml(transportationDetails)}</td></tr>` : ''}
        ${stayingAtBeachClub !== undefined ? `<tr><td style="color:#6b7280;">Staying at Beach Club Resort</td><td>${stayingAtBeachClub ? 'Yes' : 'No'}</td></tr>` : ''}
        ${accommodationDetails ? `<tr><td style="color:#6b7280;">Accommodation Details</td><td>${escapeHtml(accommodationDetails)}</td></tr>` : ''}
        ${dietaryRequirements && Array.isArray(dietaryRequirements) && dietaryRequirements.length > 0 ? `<tr><td style="color:#6b7280;">Dietary Requirements</td><td>${escapeHtml(dietaryRequirements.join(', '))}${dietaryRequirementsOther ? ` (Other: ${escapeHtml(dietaryRequirementsOther)})` : ''}</td></tr>` : ''}
        ${specialPhysicalNeeds !== undefined ? `<tr><td style="color:#6b7280;">Special Physical Needs</td><td>${specialPhysicalNeeds ? 'Yes' : 'No'}</td></tr>` : ''}
        ${specialPhysicalNeedsDetails ? `<tr><td style="color:#6b7280;">Special Physical Needs Details</td><td>${escapeHtml(specialPhysicalNeedsDetails)}</td></tr>` : ''}
        ${emergencyContactName ? `<tr><td style="color:#6b7280;">Emergency Contact Name</td><td>${escapeHtml(emergencyContactName)}</td></tr>` : ''}
        ${emergencyContactPhone ? `<tr><td style="color:#6b7280;">Emergency Contact Phone</td><td>${escapeHtml(emergencyContactPhone)}</td></tr>` : ''}
        ${spouseDinnerTicket ? `<tr><td style="color:#6b7280;padding-top:12px;" colspan="2"><strong>Spouse/Guest Information</strong></td></tr>` : ''}
        ${spouseDinnerTicket ? `<tr><td style="color:#6b7280;">Spouse Dinner Ticket</td><td>Yes</td></tr>` : ''}
        ${spouseFirstName ? `<tr><td style="color:#6b7280;">Spouse First Name</td><td>${escapeHtml(spouseFirstName)}</td></tr>` : ''}
        ${spouseLastName ? `<tr><td style="color:#6b7280;">Spouse Last Name</td><td>${escapeHtml(spouseLastName)}</td></tr>` : ''}
        ${kids && Array.isArray(kids) && kids.length > 0 ? `<tr><td style="color:#6b7280;padding-top:12px;" colspan="2"><strong>Child/Children Information</strong></td></tr>` : ''}
        ${kids && Array.isArray(kids) && kids.length > 0 ? kids.map((kid, idx) => `
          <tr><td style="color:#6b7280;padding-top:${idx === 0 ? '0' : '8'}px;" colspan="2"><strong>Child ${idx + 1}</strong></td></tr>
          ${kid.firstName ? `<tr><td style="color:#6b7280;">First Name</td><td>${escapeHtml(kid.firstName)}</td></tr>` : ''}
          ${kid.lastName ? `<tr><td style="color:#6b7280;">Last Name</td><td>${escapeHtml(kid.lastName)}</td></tr>` : ''}
          ${kid.badgeName ? `<tr><td style="color:#6b7280;">Badge Name</td><td>${escapeHtml(kid.badgeName)}</td></tr>` : ''}
          ${kid.age ? `<tr><td style="color:#6b7280;">Age</td><td>${escapeHtml(String(kid.age))}</td></tr>` : ''}
        `).join('') : ''}
        ${paymentAmount > 0 ? `<tr><td style="color:#6b7280;padding-top:12px;" colspan="2"><strong>Payment Information</strong></td></tr>` : ''}
        ${paymentAmount > 0 ? `<tr><td style="color:#6b7280;">Total Payment Amount</td><td><strong style="color:#111827;font-size:16px;">$${totalWithFee.toFixed(2)}</strong></td></tr>` : ''}
        ${paymentMethod ? `<tr><td style="color:#6b7280;">Payment Method</td><td>${escapeHtml(paymentMethod)}</td></tr>` : ''}
        ${paymentMethod === 'Card' && squarePaymentId ? `<tr><td style="color:#6b7280;">Square Payment ID</td><td><code>${escapeHtml(squarePaymentId)}</code></td></tr>` : ''}
        ${paymentMethod === 'Card' && registration?.spousePaymentId ? `<tr><td style="color:#6b7280;">Spouse Payment ID</td><td><code>${escapeHtml(registration.spousePaymentId)}</code></td></tr>` : ''}
        ${paymentMethod === 'Card' && registration?.paid && (registration?.paidAt || registration?.createdAt || registration?.created_at) ? `<tr><td style="color:#6b7280;">Payment Date/Time (EST)</td><td>${formatDateInEST(registration.paidAt || registration.createdAt || registration.created_at)}</td></tr>` : ''}
        ${registration?.spousePaymentId && (registration?.spousePaidAt || registration?.createdAt || registration?.created_at) ? `<tr><td style="color:#6b7280;">Spouse Payment Date/Time (EST)</td><td>${formatDateInEST(registration.spousePaidAt || registration.createdAt || registration.created_at)}</td></tr>` : ''}
        ${updateNotes ? `<tr><td style="color:#6b7280;padding-top:12px;" colspan="2"><strong>Update Notes</strong></td></tr>
        <tr><td colspan="2"><div style="white-space:pre-wrap;font-size:14px;margin:0;padding:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;color:#374151;">${escapeHtml(updateNotes)}</div></td></tr>` : ''}
      </table>
    `
        : '';
    const html = await renderEmailTemplate({
        subject,
        heading: 'Registration Confirmed',
        preheader: 'Your EFBC Conference registration is confirmed',
        contentHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(fullName || 'Attendee')},</p>
      <p style="margin:0 0 8px 0;">Thank you for registering for the EFBC Conference.</p>
      ${eventName ? `<p style=\"margin:0;\"><strong>Event:</strong> ${escapeHtml(eventName)}</p>` : ''}
      ${formattedEventDate ? `<p style=\"margin:4px 0 0 0;\"><strong>Date:</strong> ${escapeHtml(formattedEventDate)}</p>` : ''}
      ${paymentAmount > 0 ? `<p style=\"margin:12px 0 8px 0;padding:12px;background:#f0f9ff;border-left:4px solidrgba(59, 131, 246, 0);border-radius:4px;\"><strong style=\"color:#111827;font-size:16px;\">Total Payment Amount: $${totalWithFee.toFixed(2)}</strong></p>` : ''}
      ${detailsHtml}
      ${paymentMethod === 'Check' ? `
        <div style="margin:20px 0;padding:16px;background:#f9fafb;border-left:4px solidrgba(59, 131, 246, 0);border-radius:4px;">
          <p style="margin:0;color:#374151;">Please mail check prior to deadline to:</p>
          <p style="margin:8px 0 0 0;color:#111827;font-weight:500;">
            EFBC Conference Inc<br/>
            127 Low Country Lane<br/>
            The Woodlands, TX 77380, USA
          </p>
        </div>
      ` : ''}
      
    `,
    });
    const parts = [];
    parts.push('Thank you for registering for EFBC Conference.');
    if (eventName)
        parts.push(`Event: ${eventName}.`);
    if (formattedEventDate)
        parts.push(`Date: ${formattedEventDate}.`);
    if (paymentAmount > 0) {
        parts.push(`Total Payment Amount: $${totalWithFee.toFixed(2)}.`);
    }
    if (paymentMethod)
        parts.push(`Payment method: ${paymentMethod}.`);
    if (paymentMethod === 'Card' && squarePaymentId) {
        parts.push(`Square payment ID: ${squarePaymentId}.`);
    }
    if (paymentMethod === 'Check') {
        parts.push('\n\nIf you prefer by check, please mail check prior to deadline to:\nEFBC Conference Inc\n127 Low Country Lane\nThe Woodlands, TX 77380, USA');
    }
    const text = parts.join(' ').trim();
    (0, exports.queueEmail)({ to, subject, text, html });
}
async function sendRegistrationUpdateEmail(params) {
    const { to, name, eventName, eventDate, eventStartDate, totalPrice, registration } = params;
    const from = process.env.EMAIL_FROM || 'no-reply@efbc.local';
    const subject = sanitizeSubjectLine('Your EFBC Conference registration has been updated');
    const paymentAmount = totalPrice !== undefined && totalPrice !== null
        ? Number(totalPrice)
        : (registration?.totalPrice !== undefined && registration?.totalPrice !== null
            ? Number(registration.totalPrice)
            : (registration?.total_price !== undefined && registration?.total_price !== null
                ? Number(registration.total_price)
                : 0));
    const priceText = paymentAmount > 0 ? `Total: $${paymentAmount.toFixed(2)}` : '';
    const paymentMethod = registration?.paymentMethod || registration?.payment_method || '';
    const squarePaymentId = registration?.squarePaymentId || registration?.square_payment_id || '';
    const isCardPayment = paymentMethod === 'Card';
    const convenienceFee = isCardPayment && paymentAmount > 0 ? paymentAmount * 0.035 : 0;
    const totalWithFee = paymentAmount + convenienceFee;
    const formattedEventDate = formatEventDateRange(eventStartDate || null, eventDate || null);
    const wednesdayActivity = registration?.wednesdayActivity || registration?.wednesday_activity || '';
    const wednesdayActivityWaitlistedRaw = registration?.wednesdayActivityWaitlisted ?? registration?.wednesday_activity_waitlisted;
    const isActivityWaitlisted = !!wednesdayActivity &&
        (wednesdayActivityWaitlistedRaw === true ||
            wednesdayActivityWaitlistedRaw === 1 ||
            wednesdayActivityWaitlistedRaw === '1');
    const clubRentals = registration?.clubRentals || registration?.club_rentals || '';
    const golfHandicap = registration?.golfHandicap || registration?.golf_handicap || '';
    const massageTimeSlot = registration?.massageTimeSlot || registration?.massage_time_slot || '';
    const pickleballEquipment = registration?.pickleballEquipment || registration?.pickleball_equipment;
    const dietaryRestrictions = registration?.dietaryRestrictions || registration?.dietary_restrictions || '';
    const specialRequests = registration?.specialRequests || registration?.special_requests || '';
    const emergencyContactName = registration?.emergencyContactName || registration?.emergency_contact_name || '';
    const emergencyContactPhone = registration?.emergencyContactPhone || registration?.emergency_contact_phone || '';
    const isFirstTimeAttending = registration?.isFirstTimeAttending !== undefined
        ? registration.isFirstTimeAttending
        : (registration?.is_first_time_attending !== undefined
            ? registration.is_first_time_attending
            : null);
    const companyType = registration?.companyType || registration?.company_type || '';
    const companyTypeOther = registration?.companyTypeOther || registration?.company_type_other || '';
    const officePhone = registration?.officePhone || registration?.office_phone || '';
    const firstName = registration?.firstName || registration?.first_name || '';
    const lastName = registration?.lastName || registration?.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const addressStreet = registration?.addressStreet || registration?.address_street || '';
    const city = registration?.city || '';
    const state = registration?.state || '';
    const zipCode = registration?.zipCode || registration?.zip_code || '';
    const country = registration?.country || '';
    const spouseFirstName = registration?.spouseFirstName || registration?.spouse_first_name || '';
    const spouseLastName = registration?.spouseLastName || registration?.spouse_last_name || '';
    const spouseDinnerTicket = registration?.spouseDinnerTicket !== undefined
        ? registration.spouseDinnerTicket
        : (registration?.spouse_dinner_ticket !== undefined ? registration.spouse_dinner_ticket : false);
    const kids = registration?.kids || (registration?.kids_data ? (typeof registration.kids_data === 'string' ? JSON.parse(registration.kids_data) : registration.kids_data) : []);
    const transportationMethod = registration?.transportationMethod || registration?.transportation_method || '';
    const transportationDetails = registration?.transportationDetails || registration?.transportation_details || '';
    const stayingAtBeachClub = registration?.stayingAtBeachClub !== undefined
        ? registration.stayingAtBeachClub
        : (registration?.staying_at_beach_club !== undefined ? !!registration.staying_at_beach_club : undefined);
    const accommodationDetails = registration?.accommodationDetails || registration?.accommodation_details || '';
    const dietaryRequirements = registration?.dietaryRequirements || (registration?.dietary_requirements ? (typeof registration.dietary_requirements === 'string' ? JSON.parse(registration.dietary_requirements) : registration.dietary_requirements) : []);
    const dietaryRequirementsOther = registration?.dietaryRequirementsOther || registration?.dietary_requirements_other || '';
    const specialPhysicalNeeds = registration?.specialPhysicalNeeds !== undefined
        ? registration.specialPhysicalNeeds
        : (registration?.special_physical_needs !== undefined ? !!registration.special_physical_needs : undefined);
    const specialPhysicalNeedsDetails = registration?.specialPhysicalNeedsDetails || registration?.special_physical_needs_details || '';
    const updateNotes = registration?.updateNotes || registration?.update_notes || '';
    const detailsHtml = registration
        ? `
      <table role="presentation" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        ${fullName ? `<tr><td style="color:#6b7280;">Full Name</td><td><strong>${escapeHtml(fullName)}</strong></td></tr>` : ''}
        ${registration.badgeName ? `<tr><td style="color:#6b7280;">Badge Name</td><td><strong>${escapeHtml(registration.badgeName)}</strong></td></tr>` : ''}
        ${registration.email ? `<tr><td style="color:#6b7280;">Email</td><td>${escapeHtml(registration.email)}</td></tr>` : ''}
        ${registration.secondaryEmail ? `<tr><td style="color:#6b7280;">Secondary Email</td><td>${escapeHtml(registration.secondaryEmail)}</td></tr>` : ''}
        ${registration.organization ? `<tr><td style="color:#6b7280;">Organization</td><td>${escapeHtml(registration.organization)}</td></tr>` : ''}
        ${registration.jobTitle ? `<tr><td style="color:#6b7280;">Job Title</td><td>${escapeHtml(registration.jobTitle)}</td></tr>` : ''}
        ${addressStreet || registration.address ? `<tr><td style="color:#6b7280;">Address</td><td>${escapeHtml(addressStreet || String(registration.address || '')).replace(/\n/g, '<br/>')}</td></tr>` : ''}
        ${city ? `<tr><td style="color:#6b7280;">City</td><td>${escapeHtml(city)}</td></tr>` : ''}
        ${state ? `<tr><td style="color:#6b7280;">State</td><td>${escapeHtml(state)}</td></tr>` : ''}
        ${zipCode ? `<tr><td style="color:#6b7280;">Zip Code</td><td>${escapeHtml(zipCode)}</td></tr>` : ''}
        ${country ? `<tr><td style="color:#6b7280;">Country</td><td>${escapeHtml(country)}</td></tr>` : ''}
        ${registration.mobile ? `<tr><td style="color:#6b7280;">Mobile</td><td>${escapeHtml(registration.mobile)}</td></tr>` : ''}
        ${officePhone ? `<tr><td style="color:#6b7280;">Office Phone</td><td>${escapeHtml(officePhone)}</td></tr>` : ''}
        ${isFirstTimeAttending !== null ? `<tr><td style="color:#6b7280;">First Time Attending?</td><td>${isFirstTimeAttending ? 'Yes' : 'No'}</td></tr>` : ''}
        ${companyType ? `<tr><td style="color:#6b7280;">Company Type</td><td>${escapeHtml(companyType)}</td></tr>` : ''}
        ${companyTypeOther ? `<tr><td style="color:#6b7280;">Company Type (Other)</td><td>${escapeHtml(companyTypeOther)}</td></tr>` : ''}
        ${wednesdayActivity ? `<tr><td style="color:#6b7280;">Selected Activity</td><td>${escapeHtml(wednesdayActivity)}${isActivityWaitlisted ? ' <strong style="color:#b91c1c;">(WAITLISTED)</strong>' : ''}</td></tr>` : ''}
        ${wednesdayActivity && wednesdayActivity.toLowerCase().includes('golf') && golfHandicap ? `<tr><td style="color:#6b7280;">Golf Handicap</td><td>${escapeHtml(golfHandicap)}</td></tr>` : ''}
        ${wednesdayActivity && wednesdayActivity.toLowerCase().includes('golf') && clubRentals ? `<tr><td style="color:#6b7280;">Golf Club Preference</td><td>${escapeHtml(clubRentals)}</td></tr>` : ''}
        ${wednesdayActivity && wednesdayActivity.toLowerCase().includes('massage') && massageTimeSlot ? `<tr><td style="color:#6b7280;">Massage Time Slot</td><td>${escapeHtml(massageTimeSlot)}</td></tr>` : ''}
        ${wednesdayActivity && wednesdayActivity.toLowerCase().includes('pickleball') && pickleballEquipment !== undefined ? `<tr><td style="color:#6b7280;">Pickleball Equipment</td><td>${pickleballEquipment ? 'I will bring my own' : 'I need equipment'}</td></tr>` : ''}
        ${registration.tuesdayEarlyReception ? `<tr><td style="color:#6b7280;">Tuesday Early Arrivals Reception</td><td>${escapeHtml(registration.tuesdayEarlyReception)}</td></tr>` : ''}
        ${registration.wednesdayReception ? `<tr><td style="color:#6b7280;">Wednesday Reception</td><td>${escapeHtml(registration.wednesdayReception)}</td></tr>` : ''}
        ${registration.thursdayBreakfast ? `<tr><td style="color:#6b7280;">Thursday Breakfast</td><td>${escapeHtml(registration.thursdayBreakfast)}</td></tr>` : ''}
        ${registration.thursdayLuncheon ? `<tr><td style="color:#6b7280;">Thursday Luncheon</td><td>${escapeHtml(registration.thursdayLuncheon)}</td></tr>` : ''}
        ${registration.thursdayDinner ? `<tr><td style="color:#6b7280;">Thursday Dinner</td><td>${escapeHtml(registration.thursdayDinner)}</td></tr>` : ''}
        ${registration.fridayBreakfast ? `<tr><td style="color:#6b7280;">Friday Breakfast</td><td>${escapeHtml(registration.fridayBreakfast)}</td></tr>` : ''}
        ${dietaryRestrictions ? `<tr><td style="color:#6b7280;">Dietary Restrictions</td><td>${escapeHtml(dietaryRestrictions)}</td></tr>` : ''}
        ${specialRequests ? `<tr><td style="color:#6b7280;">Special Requests</td><td>${escapeHtml(specialRequests)}</td></tr>` : ''}
        ${transportationMethod ? `<tr><td style="color:#6b7280;">Transportation Method</td><td>${escapeHtml(transportationMethod)}</td></tr>` : ''}
        ${transportationDetails ? `<tr><td style="color:#6b7280;">Transportation Details</td><td>${escapeHtml(transportationDetails)}</td></tr>` : ''}
        ${stayingAtBeachClub !== undefined ? `<tr><td style="color:#6b7280;">Staying at Beach Club Resort</td><td>${stayingAtBeachClub ? 'Yes' : 'No'}</td></tr>` : ''}
        ${accommodationDetails ? `<tr><td style="color:#6b7280;">Accommodation Details</td><td>${escapeHtml(accommodationDetails)}</td></tr>` : ''}
        ${dietaryRequirements && Array.isArray(dietaryRequirements) && dietaryRequirements.length > 0 ? `<tr><td style="color:#6b7280;">Dietary Requirements</td><td>${escapeHtml(dietaryRequirements.join(', '))}${dietaryRequirementsOther ? ` (Other: ${escapeHtml(dietaryRequirementsOther)})` : ''}</td></tr>` : ''}
        ${specialPhysicalNeeds !== undefined ? `<tr><td style="color:#6b7280;">Special Physical Needs</td><td>${specialPhysicalNeeds ? 'Yes' : 'No'}</td></tr>` : ''}
        ${specialPhysicalNeedsDetails ? `<tr><td style="color:#6b7280;">Special Physical Needs Details</td><td>${escapeHtml(specialPhysicalNeedsDetails)}</td></tr>` : ''}
        ${emergencyContactName ? `<tr><td style="color:#6b7280;">Emergency Contact Name</td><td>${escapeHtml(emergencyContactName)}</td></tr>` : ''}
        ${emergencyContactPhone ? `<tr><td style="color:#6b7280;">Emergency Contact Phone</td><td>${escapeHtml(emergencyContactPhone)}</td></tr>` : ''}
        ${spouseDinnerTicket ? `<tr><td style="color:#6b7280;padding-top:12px;" colspan="2"><strong>Spouse/Guest Information</strong></td></tr>` : ''}
        ${spouseDinnerTicket ? `<tr><td style="color:#6b7280;">Spouse Dinner Ticket</td><td>Yes</td></tr>` : ''}
        ${spouseFirstName ? `<tr><td style="color:#6b7280;">Spouse First Name</td><td>${escapeHtml(spouseFirstName)}</td></tr>` : ''}
        ${spouseLastName ? `<tr><td style="color:#6b7280;">Spouse Last Name</td><td>${escapeHtml(spouseLastName)}</td></tr>` : ''}
        ${kids && Array.isArray(kids) && kids.length > 0 ? `<tr><td style="color:#6b7280;padding-top:12px;" colspan="2"><strong>Child/Children Information</strong></td></tr>` : ''}
        ${kids && Array.isArray(kids) && kids.length > 0 ? kids.map((kid, idx) => `
          <tr><td style="color:#6b7280;padding-top:${idx === 0 ? '0' : '8'}px;" colspan="2"><strong>Child ${idx + 1}</strong></td></tr>
          ${kid.firstName ? `<tr><td style="color:#6b7280;">First Name</td><td>${escapeHtml(kid.firstName)}</td></tr>` : ''}
          ${kid.lastName ? `<tr><td style="color:#6b7280;">Last Name</td><td>${escapeHtml(kid.lastName)}</td></tr>` : ''}
          ${kid.badgeName ? `<tr><td style="color:#6b7280;">Badge Name</td><td>${escapeHtml(kid.badgeName)}</td></tr>` : ''}
          ${kid.age ? `<tr><td style="color:#6b7280;">Age</td><td>${escapeHtml(String(kid.age))}</td></tr>` : ''}
        `).join('') : ''}
        ${paymentAmount > 0 ? `<tr><td style="color:#6b7280;padding-top:12px;" colspan="2"><strong>Payment Information</strong></td></tr>` : ''}
        ${paymentAmount > 0 ? `<tr><td style="color:#6b7280;">Total Payment Amount</td><td><strong style="color:#111827;font-size:16px;">$${totalWithFee.toFixed(2)}</strong></td></tr>` : ''}
        ${paymentMethod ? `<tr><td style="color:#6b7280;">Payment Method</td><td>${escapeHtml(paymentMethod)}</td></tr>` : ''}
        ${paymentMethod === 'Card' && squarePaymentId ? `<tr><td style="color:#6b7280;">Square Payment ID</td><td><code>${escapeHtml(squarePaymentId)}</code></td></tr>` : ''}
        ${paymentMethod === 'Card' && registration?.spousePaymentId ? `<tr><td style="color:#6b7280;">Spouse Payment ID</td><td><code>${escapeHtml(registration.spousePaymentId)}</code></td></tr>` : ''}
        ${paymentMethod === 'Card' && registration?.paid && (registration?.paidAt || registration?.createdAt || registration?.created_at) ? `<tr><td style="color:#6b7280;">Payment Date/Time (EST)</td><td>${formatDateInEST(registration.paidAt || registration.createdAt || registration.created_at)}</td></tr>` : ''}
        ${registration?.spousePaymentId && (registration?.spousePaidAt || registration?.createdAt || registration?.created_at) ? `<tr><td style="color:#6b7280;">Spouse Payment Date/Time (EST)</td><td>${formatDateInEST(registration.spousePaidAt || registration.createdAt || registration.created_at)}</td></tr>` : ''}
        ${updateNotes ? `<tr><td style="color:#6b7280;padding-top:12px;" colspan="2"><strong>Update Notes</strong></td></tr>
        <tr><td colspan="2"><div style="white-space:pre-wrap;font-size:14px;margin:0;padding:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;color:#374151;">${escapeHtml(updateNotes)}</div></td></tr>` : ''}
      </table>
    `
        : '';
    const html = await renderEmailTemplate({
        subject,
        heading: 'Registration Updated',
        preheader: 'Your EFBC Conference registration has been updated',
        contentHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(fullName || 'Attendee')},</p>
      ${eventName ? `<p style=\"margin:0;\"><strong>Event:</strong> ${escapeHtml(eventName)}</p>` : ''}
      ${formattedEventDate ? `<p style=\"margin:4px 0 0 0;\"><strong>Date:</strong> ${escapeHtml(formattedEventDate)}</p>` : ''}
      ${paymentAmount > 0 ? `<p style=\"margin:12px 0 8px 0;padding:12px;background:#f0f9ff;border-left:4px solidrgba(59, 131, 246, 0);border-radius:4px;\"><strong style=\"color:#111827;font-size:16px;\">Total Payment Amount: $${totalWithFee.toFixed(2)}</strong></p>` : ''}
      ${detailsHtml}
      ${paymentMethod === 'Check' ? `
        <div style="margin:20px 0;padding:16px;background:#f9fafb;border-left:4px solidrgba(59, 131, 246, 0);border-radius:4px;">
          <p style="margin:0;color:#374151;">Please mail check prior to deadline to:</p>
          <p style="margin:8px 0 0 0;color:#111827;font-weight:500;">
            EFBC Conference Inc<br/>
            127 Low Country Lane<br/>
            The Woodlands, TX 77380, USA
          </p>
        </div>
      ` : ''}
      
    `,
    });
    const parts = [];
    if (eventName)
        parts.push(`Event: ${eventName}.`);
    if (formattedEventDate)
        parts.push(`Date: ${formattedEventDate}.`);
    if (paymentAmount > 0) {
        parts.push(`Total Payment Amount: $${totalWithFee.toFixed(2)}.`);
    }
    if (paymentMethod)
        parts.push(`Payment method: ${paymentMethod}.`);
    if (paymentMethod === 'Card' && squarePaymentId) {
        parts.push(`Square payment ID: ${squarePaymentId}.`);
    }
    if (paymentMethod === 'Check') {
        parts.push('\n\nIf you prefer by check, please mail check prior to deadline to:\nEFBC Conference Inc\n127 Low Country Lane\nThe Woodlands, TX 77380, USA');
    }
    const text = parts.join(' ').trim();
    (0, exports.queueEmail)({ to, subject, text, html });
}
async function sendAdminCreatedUserEmail(params) {
    const { to, name, tempPassword, role } = params;
    const brand = (process.env.EMAIL_BRAND || 'EFBC Conference').trim();
    const from = process.env.EMAIL_FROM || 'no-reply@efbc.local';
    const subject = sanitizeSubjectLine(`${brand} account created for you`);
    const loginUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/login';
    const html = await renderEmailTemplate({
        subject,
        heading: 'Your account has been created',
        preheader: `An administrator has created a ${brand} account for you.`,
        contentHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(name || 'there')},</p>
      <p style="margin:0 0 8px 0;">An administrator has created an account for you in the ${escapeHtml(brand)} portal.</p>
      <p style="margin:0 0 8px 0;">You can sign in using the details below:</p>
      <table role="presentation" cellpadding="6" cellspacing="0" style="margin:0 0 8px 0;font-size:14px;">
        <tr>
          <td style="color:#6b7280;">Login URL</td>
          <td><a href="${loginUrl}" style="color:#2563eb;text-decoration:none;">${escapeHtml(loginUrl)}</a></td>
        </tr>
        <tr>
          <td style="color:#6b7280;">Email</td>
          <td><strong>${escapeHtml(to)}</strong></td>
        </tr>
        <tr>
          <td style="color:#6b7280;">Temporary password</td>
          <td><strong>${escapeHtml(tempPassword)}</strong></td>
        </tr>
        ${role ? `<tr><td style="color:#6b7280;">Role</td><td>${escapeHtml(role)}</td></tr>` : ''}
      </table>
      <p style="margin:8px 0 0 0;">For your security, please sign in and change this password as soon as possible from your profile settings.</p>
    `,
    });
    const text = [
        `Hi ${name || 'there'},`,
        `An administrator has created an account for you in the ${brand} portal.`,
        `Login URL: ${loginUrl}`,
        `Email: ${to}`,
        `Temporary password: ${tempPassword}`,
        `Please sign in and change this password as soon as possible.`,
    ].join('\n');
    (0, exports.queueEmail)({ to, subject, text, html });
}
async function sendPasswordResetEmail(to, token) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const from = process.env.EMAIL_FROM || 'no-reply@efbc.local';
    const subject = sanitizeSubjectLine('Reset your EFBC Conference password');
    const html = await renderEmailTemplate({
        subject,
        heading: 'Reset your password',
        preheader: 'Password reset instructions for your EFBC account',
        contentHtml: `
      <p style="margin:0 0 8px 0;">You requested a password reset for your EFBC account.</p>
      <p style="margin:0;opacity:.85;">This link expires in 1 hour.</p>
    `,
        cta: { label: 'Reset Password', url: link },
        footerHtml: '',
    });
    const text = `Reset your password: ${link}`;
    (0, exports.queueEmail)({ to, subject, text, html });
}
async function sendCancellationRequestAdminEmail(params) {
    const brand = (process.env.EMAIL_BRAND || 'EFBC Conference').trim();
    const to = process.env.ADMIN_EMAIL ||
        process.env.ADMIN_NOTIFY_EMAIL ||
        process.env.SUPPORT_EMAIL ||
        'planner@efbcconference.org';
    const subject = sanitizeSubjectLine(`New cancellation request for ${params.eventName || 'event'} (#${params.registrationId})`);
    const html = await renderEmailTemplate({
        subject,
        heading: 'New cancellation request',
        preheader: 'A user has requested to cancel a registration.',
        contentHtml: `
      <p style="margin:0 0 8px 0;">A new cancellation request has been submitted in the ${brand} portal.</p>
      <table role="presentation" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="color:#6b7280;">Registration ID</td>
          <td><strong>#${params.registrationId}</strong></td>
        </tr>
        ${params.userName ? `<tr><td style="color:#6b7280;">User</td><td>${escapeHtml(params.userName)}</td></tr>` : ''}
        ${params.userEmail ? `<tr><td style="color:#6b7280;">Email</td><td>${escapeHtml(params.userEmail)}</td></tr>` : ''}
        ${params.eventName ? `<tr><td style="color:#6b7280;">Event</td><td>${escapeHtml(params.eventName)}</td></tr>` : ''}
        ${params.reason ? `<tr><td style="color:#6b7280;">Reason</td><td>${escapeHtml(params.reason)}</td></tr>` : ''}
      </table>
      <p style="margin:12px 0 0 0;">You can review and approve or reject this request from the admin Cancellation Requests page.</p>
    `,
    });
    const lines = [];
    lines.push(`New cancellation request in ${brand}.`);
    lines.push(`Registration ID: #${params.registrationId}.`);
    if (params.userName)
        lines.push(`User: ${params.userName}.`);
    if (params.userEmail)
        lines.push(`Email: ${params.userEmail}.`);
    if (params.eventName)
        lines.push(`Event: ${params.eventName}.`);
    if (params.reason)
        lines.push(`Reason: ${params.reason}.`);
    const text = lines.join(' ');
    (0, exports.queueEmail)({ to, subject, text, html });
}
async function sendPairingRequestAdminEmail(params) {
    const brand = (process.env.EMAIL_BRAND || 'EFBC Conference').trim();
    const to = process.env.PAIRING_REQUEST_EMAIL ||
        process.env.ADMIN_NOTIFY_EMAIL ||
        process.env.ADMIN_EMAIL ||
        process.env.SUPPORT_EMAIL ||
        'event@efbcconference.org';
    const subject = sanitizeSubjectLine(`Pairing request for ${params.activityLabel}  ${params.eventName || 'EFBC Conference'})`);
    const groupMemberNames = [
        ...(params.registrantName?.trim() ? [params.registrantName.trim()] : []),
        ...params.partnerNames.map((n) => String(n).trim()).filter(Boolean),
    ];
    const partnersList = groupMemberNames.length > 0
        ? `<ul style="margin:8px 0;padding-left:20px;">${groupMemberNames.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
        : '<p style="margin:8px 0;color:#6b7280;">(no names listed)</p>';
    const html = await renderEmailTemplate({
        subject,
        heading: 'Activity pairing request',
        preheader: 'A registrant submitted a pairing / group request.',
        contentHtml: `
      <p style="margin:0 0 8px 0;">A pairing request was submitted through the ${brand} portal.</p>
      <table role="presentation" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        ${params.eventName ? `<tr><td style="color:#6b7280;">Event</td><td>${escapeHtml(params.eventName)}</td></tr>` : ''}
        ${params.wednesdayActivity ? `<tr><td style="color:#6b7280;">Wednesday activity</td><td>${escapeHtml(String(params.wednesdayActivity))}</td></tr>` : ''}
        ${params.registrantName ? `<tr><td style="color:#6b7280;">Requestor</td><td><strong>${escapeHtml(params.registrantName)}</strong></td></tr>` : ''}
        ${params.registrantEmail ? `<tr><td style="color:#6b7280;">Email</td><td>${escapeHtml(params.registrantEmail)}</td></tr>` : ''}
      </table>
      <p style="margin:12px 0 4px 0;"><strong>Requested Group Members</strong></p>
      ${partnersList}
      ${params.additionalNotes
            ? `<p style="margin:12px 0 4px 0;"><strong>Additional notes</strong></p><p style="margin:0;white-space:pre-wrap;">${escapeHtml(params.additionalNotes)}</p>`
            : ''}
      <p style="margin:12px 0 0 0;">Assign groups from the admin <strong>Groups</strong> page when ready.</p>
    `,
    });
    const lines = [];
    lines.push(`Pairing request in ${brand}.`);
    lines.push(`Request #${params.requestId}, Registration #${params.registrationId}.`);
    if (params.eventName)
        lines.push(`Event: ${params.eventName}.`);
    lines.push(`Activity: ${params.activityLabel}.`);
    if (params.registrantEmail)
        lines.push(`Email: ${params.registrantEmail}.`);
    if (groupMemberNames.length)
        lines.push(`Names: ${groupMemberNames.join('; ')}.`);
    if (params.boatPreference)
        lines.push(`Boat: ${params.boatPreference}.`);
    if (params.additionalNotes)
        lines.push(`Notes: ${params.additionalNotes}.`);
    const text = lines.join(' ');
    (0, exports.queueEmail)({ to, subject, text, html });
}
async function sendCancellationRequestConfirmationEmail(params) {
    const brand = (process.env.EMAIL_BRAND || 'EFBC Conference').trim();
    const subject = sanitizeSubjectLine(`Cancellation request submitted for ${params.eventName || 'event'}`);
    const html = await renderEmailTemplate({
        subject,
        heading: 'Cancellation request received',
        preheader: 'Your cancellation request has been submitted and is under review.',
        contentHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(params.userName || 'there')},</p>
      <p style="margin:0 0 8px 0;">We have received your request to cancel your registration${params.eventName ? ` for <strong>${escapeHtml(params.eventName)}</strong>` : ''}.</p>
      <p style="margin:0 0 8px 0;">Your cancellation request (Registration #${params.registrationId}) is now under review by our team.</p>
      ${params.reason ? `<p style="margin:8px 0 0 0;"><strong>Reason provided:</strong></p><p style="margin:4px 0 8px 0;white-space:pre-line;">${escapeHtml(params.reason)}</p>` : ''}
      <p style="margin:12px 0 0 0;">You will receive an email notification once your request has been reviewed and a decision has been made.</p>
      <p style="margin:8px 0 0 0;">If you have any questions, please contact the conference organizers.</p>
    `,
    });
    const lines = [];
    lines.push(`Hi ${params.userName || 'there'},`);
    lines.push(`We have received your request to cancel your registration${params.eventName ? ` for ${params.eventName}` : ''}.`);
    lines.push(`Your cancellation request (Registration #${params.registrationId}) is now under review.`);
    if (params.reason)
        lines.push(`Reason: ${params.reason}.`);
    lines.push('You will receive an email notification once your request has been reviewed.');
    const text = lines.join(' ');
    await sendMailWithAdminCopy({ to: params.to, subject, text, html }, true);
}
async function sendCancellationDecisionEmail(params) {
    const brand = (process.env.EMAIL_BRAND || 'EFBC Conference').trim();
    const subject = sanitizeSubjectLine(params.status === 'approved'
        ? 'Your registration cancellation has been approved'
        : 'Your registration cancellation has been reviewed');
    const statusText = params.status === 'approved' ? 'approved' : 'not approved';
    const html = await renderEmailTemplate({
        subject,
        heading: 'Cancellation request update',
        preheader: `Your cancellation request has been ${statusText}.`,
        contentHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(params.userName || 'there')},</p>
      <p style="margin:0 0 8px 0;">This is an update regarding your recent request to cancel your registration${params.eventName ? ` for <strong>${escapeHtml(params.eventName)}</strong>` : ''}.</p>
      <p style="margin:0 0 8px 0;">Status: <strong style="text-transform:capitalize;">${escapeHtml(statusText)}</strong></p>
      ${params.reason
            ? `<p style="margin:0 0 8px 0;">Your original reason for cancellation:</p>
             <p style="margin:0 0 8px 0;white-space:pre-line;">${escapeHtml(params.reason)}</p>`
            : ''}
      ${params.adminNote
            ? `<p style="margin:0 0 8px 0;">Admin note:</p>
             <p style="margin:0 0 8px 0;white-space:pre-line;">${escapeHtml(params.adminNote)}</p>`
            : ''}
      <p style="margin:12px 0 0 0;">If you have any questions, please contact the conference organizers.</p>
    `,
    });
    const lines = [];
    lines.push(`Your cancellation request has been ${statusText}.`);
    if (params.eventName)
        lines.push(`Event: ${params.eventName}.`);
    if (params.reason)
        lines.push(`Your reason: ${params.reason}.`);
    if (params.adminNote)
        lines.push(`Admin note: ${params.adminNote}.`);
    const text = lines.join(' ');
    await sendMailWithAdminCopy({ to: params.to, subject, text, html }, true);
}
async function sendRegistrationRestoredEmail(params) {
    const brand = (process.env.EMAIL_BRAND || 'EFBC Conference').trim();
    const subject = sanitizeSubjectLine('Your registration has been restored');
    const html = await renderEmailTemplate({
        subject,
        heading: 'Registration restored',
        preheader: 'Your conference registration has been restored.',
        contentHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(params.userName || 'there')},</p>
      <p style="margin:0 0 8px 0;">Good news! Your registration${params.eventName ? ` for <strong>${escapeHtml(params.eventName)}</strong>` : ''} has been restored.</p>
      <p style="margin:0 0 8px 0;">You are once again listed as an active attendee for this event.</p>
      <p style="margin:12px 0 0 0;">If you have any questions or need to make changes to your registration, you can log in to the portal at any time.</p>
    `,
    });
    const lines = [];
    lines.push('Your registration has been restored.');
    if (params.eventName)
        lines.push(`Event: ${params.eventName}.`);
    const text = lines.join(' ');
    await sendMailWithAdminCopy({ to: params.to, subject, text, html }, true);
}
async function sendPendingPaymentEmail(params) {
    const { to, name, eventName, eventDate, eventStartDate, pendingAmount, reason, registration } = params;
    const from = process.env.EMAIL_FROM || 'no-reply@efbc.local';
    const subject = sanitizeSubjectLine('Action Required: Additional Payment Due - EFBC Conference');
    const convenienceFee = pendingAmount * 0.035;
    const totalWithFee = pendingAmount + convenienceFee;
    const formattedEventDate = formatEventDateRange(eventStartDate || null, eventDate || null);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const registrationUrl = `${frontendUrl}/registration${registration?.id ? `?id=${registration.id}` : ''}`;
    const html = await renderEmailTemplate({
        heading: 'Additional Payment Required',
        preheader: `An additional payment of $${pendingAmount.toFixed(2)} is required for your registration.`,
        contentHtml: `
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>An additional payment is required for your EFBC Conference registration.</p>
      ${eventName ? `<p><strong>Event:</strong> ${escapeHtml(eventName)}${formattedEventDate ? ` (${escapeHtml(formattedEventDate)})` : ''}</p>` : ''}
      <div style="background-color:#fef3c7;border-left:4px solid #f59e0b;padding:12px;margin:16px 0;border-radius:4px;">
        <p style="margin:0;font-weight:600;color:#92400e;">Amount Due: $${pendingAmount.toFixed(2)}</p>
        ${convenienceFee > 0 ? `<p style="margin:4px 0 0 0;color:#92400e;">Convenience Fee (3.5%): $${convenienceFee.toFixed(2)}</p>` : ''}
        ${convenienceFee > 0 ? `<p style="margin:4px 0 0 0;font-weight:600;color:#92400e;">Total to Pay: $${totalWithFee.toFixed(2)}</p>` : ''}
      </div>
      ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
      <p>Please complete your payment by visiting your registration page:</p>
    `,
        cta: { label: 'Complete Payment', url: registrationUrl },
    });
    const text = [
        `Hi ${name || 'there'},`,
        'An additional payment is required for your EFBC Conference registration.',
        eventName ? `Event: ${eventName}${formattedEventDate ? ` (${formattedEventDate})` : ''}` : '',
        `Amount Due: $${pendingAmount.toFixed(2)}`,
        convenienceFee > 0 ? `Convenience Fee (3.5%): $${convenienceFee.toFixed(2)}` : '',
        convenienceFee > 0 ? `Total to Pay: $${totalWithFee.toFixed(2)}` : '',
        reason ? `Reason: ${reason}` : '',
        `Please complete your payment by visiting: ${registrationUrl}`
    ].filter(Boolean).join('\n');
    (0, exports.queueEmail)({ to, subject, text, html });
}
//# sourceMappingURL=emailService.js.map