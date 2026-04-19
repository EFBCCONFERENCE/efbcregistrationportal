"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupController = void 0;
const Group_1 = require("../models/Group");
class GroupController {
    constructor(db) {
        this.db = db;
    }
    async getGroups(req, res) {
        try {
            const { page = 1, limit = 10, eventId, category, search } = req.query;
            const offset = (Number(page) - 1) * Number(limit);
            let conditions = {};
            if (eventId)
                conditions.eventId = eventId;
            if (category)
                conditions.category = category;
            let groups;
            let total;
            if (search) {
                const searchCondition = `(name LIKE ?)`;
                const searchValue = `%${search}%`;
                const searchParams = [searchValue];
                let whereClause = searchCondition;
                if (Object.keys(conditions).length > 0) {
                    const conditionClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
                    whereClause = `${conditionClause} AND ${searchCondition}`;
                }
                groups = await this.db.query(`SELECT * FROM \`activity_groups\` WHERE ${whereClause} LIMIT ? OFFSET ?`, [...Object.values(conditions), ...searchParams, Number(limit), offset]);
                total = await this.db.query(`SELECT COUNT(*) as count FROM \`activity_groups\` WHERE ${whereClause}`, [...Object.values(conditions), ...searchParams]);
            }
            else {
                groups = await this.db.findAll('activity_groups', conditions, Number(limit), offset);
                total = await this.db.count('activity_groups', conditions);
            }
            const response = {
                success: true,
                data: groups.map((row) => Group_1.Group.fromDatabase(row).toJSON()),
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: Array.isArray(total) ? total[0].count : total,
                    totalPages: Math.ceil((Array.isArray(total) ? total[0].count : total) / Number(limit))
                }
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error fetching groups:', error);
            const response = {
                success: false,
                error: 'Failed to fetch groups'
            };
            res.status(500).json(response);
        }
    }
    async getGroupById(req, res) {
        try {
            const { id } = req.params;
            const group = await this.db.findById('activity_groups', Number(id));
            if (!group) {
                const response = {
                    success: false,
                    error: 'Group not found'
                };
                res.status(404).json(response);
                return;
            }
            const response = {
                success: true,
                data: Group_1.Group.fromDatabase(group).toJSON()
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error fetching group:', error);
            const response = {
                success: false,
                error: 'Failed to fetch group'
            };
            res.status(500).json(response);
        }
    }
    async createGroup(req, res) {
        try {
            const groupData = req.body;
            const group = new Group_1.Group(groupData);
            const existing = await this.db.query('SELECT id FROM `activity_groups` WHERE eventId = ? AND category = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))', [group.eventId, group.category, group.name]);
            if (Array.isArray(existing) && existing.length > 0) {
                res.status(409).json({
                    success: false,
                    error: 'A group with this name already exists for this event and activity.',
                });
                return;
            }
            const result = await this.db.insert('activity_groups', group.toDatabase());
            group.id = result.insertId;
            const response = {
                success: true,
                data: group.toJSON(),
                message: 'Group created successfully'
            };
            res.status(201).json(response);
        }
        catch (error) {
            console.error('Error creating group:', error);
            const response = {
                success: false,
                error: 'Failed to create group'
            };
            res.status(500).json(response);
        }
    }
    async updateGroup(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            const existingGroup = await this.db.findById('activity_groups', Number(id));
            if (!existingGroup) {
                const response = {
                    success: false,
                    error: 'Group not found'
                };
                res.status(404).json(response);
                return;
            }
            const oldGroup = Group_1.Group.fromDatabase(existingGroup);
            if (updateData.name !== undefined && updateData.name !== null) {
                const newName = String(updateData.name).trim();
                const eventId = oldGroup.eventId;
                const category = oldGroup.category;
                const duplicate = await this.db.query('SELECT id FROM `activity_groups` WHERE eventId = ? AND category = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?', [eventId, category, newName, Number(id)]);
                if (Array.isArray(duplicate) && duplicate.length > 0) {
                    res.status(409).json({
                        success: false,
                        error: 'A group with this name already exists for this event and activity.',
                    });
                    return;
                }
            }
            const oldMemberIds = oldGroup.members || [];
            const base = oldGroup.toJSON();
            const group = new Group_1.Group({
                ...base,
                ...(updateData.eventId !== undefined ? { eventId: updateData.eventId } : {}),
                ...(updateData.category !== undefined ? { category: updateData.category } : {}),
                ...(updateData.name !== undefined && updateData.name !== null
                    ? { name: String(updateData.name).trim() }
                    : {}),
                ...(updateData.members !== undefined ? { members: updateData.members } : {}),
                updatedAt: new Date().toISOString(),
            });
            const newMemberIds = group.members || [];
            await this.db.update('activity_groups', Number(id), group.toDatabase());
            const removedMembers = oldMemberIds.filter((mid) => !newMemberIds.includes(mid));
            if (removedMembers.length > 0) {
                const placeholders = removedMembers.map(() => '?').join(',');
                await this.db.query(`UPDATE \`registrations\` SET \`group_assigned\` = NULL WHERE \`id\` IN (${placeholders})`, removedMembers);
            }
            const addedMembers = newMemberIds.filter((mid) => !oldMemberIds.includes(mid));
            if (addedMembers.length > 0) {
                const placeholders = addedMembers.map(() => '?').join(',');
                await this.db.query(`UPDATE \`registrations\` SET \`group_assigned\` = ? WHERE \`id\` IN (${placeholders})`, [Number(id), ...addedMembers]);
            }
            const response = {
                success: true,
                data: group.toJSON(),
                message: 'Group updated successfully'
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error updating group:', error);
            const response = {
                success: false,
                error: 'Failed to update group'
            };
            res.status(500).json(response);
        }
    }
    async deleteGroup(req, res) {
        try {
            const { id } = req.params;
            const existingGroup = await this.db.findById('activity_groups', Number(id));
            if (!existingGroup) {
                const response = {
                    success: false,
                    error: 'Group not found'
                };
                res.status(404).json(response);
                return;
            }
            const groupModel = Group_1.Group.fromDatabase(existingGroup);
            const memberIds = groupModel.members || [];
            await this.db.delete('activity_groups', Number(id));
            if (memberIds.length > 0) {
                const placeholders = memberIds.map(() => '?').join(',');
                await this.db.query(`UPDATE \`registrations\` SET \`group_assigned\` = NULL WHERE \`id\` IN (${placeholders})`, memberIds);
            }
            const response = {
                success: true,
                message: 'Group deleted successfully'
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error deleting group:', error);
            const response = {
                success: false,
                error: 'Failed to delete group'
            };
            res.status(500).json(response);
        }
    }
    async addMemberToGroup(req, res) {
        try {
            const { id } = req.params;
            const { memberId } = req.body;
            const group = await this.db.findById('activity_groups', Number(id));
            if (!group) {
                const response = {
                    success: false,
                    error: 'Group not found'
                };
                res.status(404).json(response);
                return;
            }
            const groupModel = Group_1.Group.fromDatabase(group);
            groupModel.addMember(memberId);
            await this.db.update('activity_groups', Number(id), groupModel.toDatabase());
            await this.db.update('registrations', Number(memberId), { group_assigned: Number(id) });
            const response = {
                success: true,
                data: groupModel.toJSON(),
                message: 'Member added to group successfully'
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error adding member to group:', error);
            const response = {
                success: false,
                error: 'Failed to add member to group'
            };
            res.status(500).json(response);
        }
    }
    async removeMemberFromGroup(req, res) {
        try {
            const { id } = req.params;
            const { memberId } = req.body;
            const group = await this.db.findById('activity_groups', Number(id));
            if (!group) {
                const response = {
                    success: false,
                    error: 'Group not found'
                };
                res.status(404).json(response);
                return;
            }
            const groupModel = Group_1.Group.fromDatabase(group);
            groupModel.removeMember(memberId);
            await this.db.update('activity_groups', Number(id), groupModel.toDatabase());
            await this.db.update('registrations', Number(memberId), { group_assigned: null });
            const response = {
                success: true,
                data: groupModel.toJSON(),
                message: 'Member removed from group successfully'
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error removing member from group:', error);
            const response = {
                success: false,
                error: 'Failed to remove member from group'
            };
            res.status(500).json(response);
        }
    }
}
exports.GroupController = GroupController;
//# sourceMappingURL=groupController.js.map