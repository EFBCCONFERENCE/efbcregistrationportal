"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Group = void 0;
class Group {
    static normalizeMembersInput(raw) {
        let source = raw;
        for (let i = 0; i < 5; i++) {
            if (typeof source === 'string') {
                const text = source.trim();
                if (!text)
                    return [];
                try {
                    source = JSON.parse(text);
                }
                catch {
                    return [];
                }
            }
            else {
                break;
            }
        }
        if (!Array.isArray(source))
            return [];
        return source
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id));
    }
    formatDateForDB(dateValue) {
        if (!dateValue) {
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
        const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
        if (isNaN(date.getTime())) {
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }
    constructor(data) {
        this.id = data.id;
        this.eventId = data.eventId || 1;
        this.category = data.category || 'Networking';
        this.name = data.name || '';
        this.members = Group.normalizeMembersInput(data.members ?? []);
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }
    toJSON() {
        return {
            id: this.id,
            eventId: this.eventId,
            category: this.category,
            name: this.name,
            members: this.members,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
    toDatabase() {
        return {
            eventId: this.eventId,
            category: this.category,
            name: this.name,
            members: JSON.stringify(this.members),
            created_at: this.formatDateForDB(this.createdAt || new Date().toISOString()),
            updated_at: this.formatDateForDB(this.updatedAt || new Date().toISOString())
        };
    }
    static fromDatabase(row) {
        return new Group({
            id: row.id,
            eventId: row.eventId,
            category: row.category,
            name: row.name,
            members: Group.normalizeMembersInput(row.members),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        });
    }
    addMember(memberId) {
        if (!this.members.includes(memberId)) {
            this.members.push(memberId);
            this.updatedAt = new Date().toISOString();
        }
    }
    removeMember(memberId) {
        this.members = this.members.filter(id => id !== memberId);
        this.updatedAt = new Date().toISOString();
    }
    hasMember(memberId) {
        return this.members.includes(memberId);
    }
}
exports.Group = Group;
//# sourceMappingURL=Group.js.map