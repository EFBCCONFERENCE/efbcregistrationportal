import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
export declare class RegistrationController {
    private db;
    constructor(db: DatabaseService);
    private getAuth;
    getRegistrations(req: Request, res: Response): Promise<void>;
    getMyRegistrations(req: Request, res: Response): Promise<void>;
    getActivitySeatSummaryForEvent(req: Request, res: Response): Promise<void>;
    getRegistrationById(req: Request, res: Response): Promise<void>;
    createRegistration(req: Request, res: Response): Promise<void>;
    updateRegistration(req: Request, res: Response): Promise<void>;
    deleteRegistration(req: Request, res: Response): Promise<void>;
    bulkDeleteRegistrations(req: Request, res: Response): Promise<void>;
    resendConfirmationEmail(req: Request, res: Response): Promise<void>;
    promoteWaitlistedRegistration(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=registrationController.d.ts.map