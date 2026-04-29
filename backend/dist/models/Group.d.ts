import { Group as IGroup } from '../types';
export declare class Group {
    id?: number;
    eventId: number;
    category: string;
    name: string;
    members: number[];
    createdAt?: string;
    updatedAt?: string;
    static normalizeMembersInput(raw: unknown): number[];
    private formatDateForDB;
    constructor(data: Partial<IGroup>);
    toJSON(): IGroup;
    toDatabase(): any;
    static fromDatabase(row: any): Group;
    addMember(memberId: number): void;
    removeMember(memberId: number): void;
    hasMember(memberId: number): boolean;
}
//# sourceMappingURL=Group.d.ts.map