"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventController = void 0;
const Event_1 = require("../models/Event");
class EventController {
    constructor(db) {
        this.db = db;
    }
    async getEvents(req, res) {
        try {
            const { page = 1, limit = 10, search } = req.query;
            const offset = (Number(page) - 1) * Number(limit);
            let conditions = {};
            if (search) {
                const searchCondition = `(name LIKE ? OR location LIKE ?)`;
                const searchValue = `%${search}%`;
                const searchParams = [searchValue, searchValue];
                const events = await this.db.query(`SELECT * FROM events WHERE ${searchCondition} LIMIT ? OFFSET ?`, [...searchParams, Number(limit), offset]);
                const total = await this.db.query(`SELECT COUNT(*) as count FROM events WHERE ${searchCondition}`, searchParams);
                const response = {
                    success: true,
                    data: events.map((row) => Event_1.Event.fromDatabase(row).toJSON()),
                    pagination: {
                        page: Number(page),
                        limit: Number(limit),
                        total: total[0].count,
                        totalPages: Math.ceil(total[0].count / Number(limit))
                    }
                };
                res.status(200).json(response);
                return;
            }
            const events = await this.db.findAll('events', conditions, Number(limit), offset);
            const total = await this.db.count('events', conditions);
            const response = {
                success: true,
                data: events.map((row) => Event_1.Event.fromDatabase(row).toJSON()),
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / Number(limit))
                }
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error fetching events:', error);
            const response = {
                success: false,
                error: 'Failed to fetch events'
            };
            res.status(500).json(response);
        }
    }
    async getEventById(req, res) {
        try {
            const { id } = req.params;
            const event = await this.db.findById('events', Number(id));
            if (!event) {
                const response = {
                    success: false,
                    error: 'Event not found'
                };
                res.status(404).json(response);
                return;
            }
            const response = {
                success: true,
                data: Event_1.Event.fromDatabase(event).toJSON()
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error fetching event:', error);
            const response = {
                success: false,
                error: 'Failed to fetch event'
            };
            res.status(500).json(response);
        }
    }
    async createEvent(req, res) {
        try {
            const eventData = req.body;
            if (eventData.date) {
                const dt = new Date(eventData.date);
                if (!isNaN(dt.getTime())) {
                    eventData.date = dt.toISOString().slice(0, 10);
                }
            }
            if (eventData.startDate) {
                const sd = new Date(eventData.startDate);
                if (!isNaN(sd.getTime())) {
                    eventData.startDate = sd.toISOString().slice(0, 10);
                }
                else {
                    const raw = String(eventData.startDate);
                    eventData.startDate = raw.slice(0, 10);
                }
            }
            if (eventData.breakfastEndDate) {
                const bed = new Date(eventData.breakfastEndDate);
                if (!isNaN(bed.getTime())) {
                    eventData.breakfastEndDate = bed.toISOString().slice(0, 10);
                }
                else {
                    const raw = String(eventData.breakfastEndDate);
                    eventData.breakfastEndDate = raw.slice(0, 10);
                }
            }
            const event = new Event_1.Event(eventData);
            const result = await this.db.insert('events', event.toDatabase());
            event.id = result.insertId;
            const response = {
                success: true,
                data: event.toJSON(),
                message: 'Event created successfully'
            };
            res.status(201).json(response);
        }
        catch (error) {
            console.error('Error creating event:', error);
            const response = {
                success: false,
                error: 'Failed to create event',
                message: error.message || 'An unexpected error occurred'
            };
            res.status(500).json(response);
        }
    }
    async updateEvent(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            if (updateData.date) {
                const dt = new Date(updateData.date);
                if (!isNaN(dt.getTime())) {
                    updateData.date = dt.toISOString().slice(0, 10);
                }
            }
            if (updateData.startDate) {
                const sd = new Date(updateData.startDate);
                if (!isNaN(sd.getTime())) {
                    updateData.startDate = sd.toISOString().slice(0, 10);
                }
                else {
                    const raw = String(updateData.startDate);
                    updateData.startDate = raw.slice(0, 10);
                }
            }
            if (updateData.breakfastEndDate) {
                const bed = new Date(updateData.breakfastEndDate);
                if (!isNaN(bed.getTime())) {
                    updateData.breakfastEndDate = bed.toISOString().slice(0, 10);
                }
                else {
                    const raw = String(updateData.breakfastEndDate);
                    updateData.breakfastEndDate = raw.slice(0, 10);
                }
            }
            const existingEventData = await this.db.findById('events', Number(id));
            if (!existingEventData) {
                const response = {
                    success: false,
                    error: 'Event not found'
                };
                res.status(404).json(response);
                return;
            }
            const event = Event_1.Event.fromDatabase(existingEventData);
            Object.assign(event, updateData);
            event.updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
            await this.db.update('events', Number(id), event.toDatabase());
            const response = {
                success: true,
                data: event.toJSON(),
                message: 'Event updated successfully'
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error updating event:', error);
            const response = {
                success: false,
                error: 'Failed to update event',
                message: error.message || 'An unexpected error occurred'
            };
            res.status(500).json(response);
        }
    }
    async deleteEvent(req, res) {
        try {
            const { id } = req.params;
            const existingEvent = await this.db.findById('events', Number(id));
            if (!existingEvent) {
                const response = {
                    success: false,
                    error: 'Event not found'
                };
                res.status(404).json(response);
                return;
            }
            await this.db.delete('events', Number(id));
            const response = {
                success: true,
                message: 'Event deleted successfully'
            };
            res.status(200).json(response);
        }
        catch (error) {
            console.error('Error deleting event:', error);
            const response = {
                success: false,
                error: 'Failed to delete event'
            };
            res.status(500).json(response);
        }
    }
}
exports.EventController = EventController;
//# sourceMappingURL=eventController.js.map