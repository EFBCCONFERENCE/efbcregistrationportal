"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const eventController_1 = require("../controllers/eventController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
let eventController;
const initController = async () => {
    if (!eventController) {
        const db = globalThis.databaseService;
        if (db) {
            eventController = new eventController_1.EventController(db);
        }
    }
};
const ensureController = async (req, res, next) => {
    await initController();
    if (!eventController) {
        return res.status(500).json({
            success: false,
            error: 'Database not initialized'
        });
    }
    req.eventController = eventController;
    next();
};
router.use(ensureController);
router.get('/', async (req, res) => {
    await req.eventController.getEvents(req, res);
});
router.get('/:id', async (req, res) => {
    await req.eventController.getEventById(req, res);
});
router.post('/', auth_1.requireAdmin, async (req, res) => {
    await req.eventController.createEvent(req, res);
});
router.put('/:id', auth_1.requireAdmin, async (req, res) => {
    await req.eventController.updateEvent(req, res);
});
router.delete('/:id', auth_1.requireAdmin, async (req, res) => {
    await req.eventController.deleteEvent(req, res);
});
exports.default = router;
//# sourceMappingURL=eventRoutes.js.map