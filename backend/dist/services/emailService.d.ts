type MailPayload = {
    to: string;
    subject: string;
    text: string;
    html: string;
};
export declare const queueEmail: (payload: MailPayload, maxRetries?: number) => void;
export declare const getEmailQueueStatus: () => {
    queueLength: number;
    processing: boolean;
};
export declare function sendVerificationEmail(to: string, token: string): Promise<void>;
export declare function sendVerificationCompleteEmail(to: string, userName?: string): Promise<void>;
export declare function sendRegistrationConfirmationEmail(params: {
    to: string;
    name: string;
    eventName?: string;
    eventDate?: string;
    eventStartDate?: string;
    totalPrice?: number;
    registration?: any;
}): Promise<void>;
export declare function sendRegistrationUpdateEmail(params: {
    to: string;
    name: string;
    eventName?: string;
    eventDate?: string;
    eventStartDate?: string;
    totalPrice?: number;
    registration?: any;
}): Promise<void>;
export declare function sendAdminCreatedUserEmail(params: {
    to: string;
    name: string;
    tempPassword: string;
    role?: string;
}): Promise<void>;
export declare function sendPasswordResetEmail(to: string, token: string): Promise<void>;
export declare function sendCancellationRequestAdminEmail(params: {
    registrationId: number;
    userName?: string;
    userEmail?: string;
    eventName?: string;
    reason?: string | null;
}): Promise<void>;
export declare function sendPairingRequestAdminEmail(params: {
    requestId: number;
    registrationId: number;
    activityLabel: string;
    registrantName?: string;
    registrantEmail?: string;
    eventName?: string;
    partnerNames: string[];
    boatPreference?: string | null;
    additionalNotes?: string | null;
    wednesdayActivity?: string;
}): Promise<void>;
export declare function sendCancellationRequestConfirmationEmail(params: {
    to: string;
    userName?: string;
    eventName?: string;
    registrationId: number;
    reason?: string | null;
}): Promise<void>;
export declare function sendCancellationDecisionEmail(params: {
    to: string;
    userName?: string;
    eventName?: string;
    status: 'approved' | 'rejected';
    reason?: string | null;
    adminNote?: string | null;
}): Promise<void>;
export declare function sendRegistrationRestoredEmail(params: {
    to: string;
    userName?: string;
    eventName?: string;
}): Promise<void>;
export declare function sendPendingPaymentEmail(params: {
    to: string;
    name: string;
    eventName?: string;
    eventDate?: string;
    eventStartDate?: string;
    pendingAmount: number;
    reason: string;
    registration?: any;
}): Promise<void>;
export {};
//# sourceMappingURL=emailService.d.ts.map