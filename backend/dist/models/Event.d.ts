import { Event as IEvent } from '../types';
export declare class Event {
    id?: number;
    year: number;
    name: string;
    date: string;
    startDate?: string;
    activities?: Array<{
        name: string;
        seatLimit?: number;
    }> | string[];
    ribbons?: string[];
    allowAttendeeEdits?: boolean;
    location?: string;
    description?: string[];
    createdAt?: string;
    updatedAt?: string;
    spousePricing?: Array<{
        label: string;
        price: number;
        startDate?: string;
        endDate?: string;
    }>;
    registrationPricing?: Array<{
        label: string;
        price: number;
        startDate?: string;
        endDate?: string;
    }>;
    breakfastPrice?: number;
    breakfastEndDate?: string;
    childLunchPrice?: number;
    kidsPricing?: Array<{
        label: string;
        price: number;
        startDate?: string;
        endDate?: string;
    }>;
    constructor(data: Partial<IEvent> & {
        spousePricing?: any;
    });
    toJSON(): any;
    toDatabase(): any;
    static fromDatabase(row: any): Event;
}
//# sourceMappingURL=Event.d.ts.map