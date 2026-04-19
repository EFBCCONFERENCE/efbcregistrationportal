"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const registrationController_1 = require("../controllers/registrationController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
let registrationController;
const initController = async () => {
    if (!registrationController) {
        const db = globalThis.databaseService;
        if (db) {
            registrationController = new registrationController_1.RegistrationController(db);
        }
    }
};
const ensureController = async (req, res, next) => {
    await initController();
    if (!registrationController) {
        return res.status(500).json({
            success: false,
            error: 'Database not initialized'
        });
    }
    req.registrationController = registrationController;
    next();
};
router.use(ensureController);
router.get('/', auth_1.requireAdmin, async (req, res) => {
    await req.registrationController.getRegistrations(req, res);
});
router.get('/mine', auth_1.requireAuth, async (req, res) => {
    await req.registrationController.getMyRegistrations(req, res);
});
router.get('/event/:eventId/activity-seat-summary', auth_1.requireAuth, async (req, res) => {
    await req.registrationController.getActivitySeatSummaryForEvent(req, res);
});
router.get('/event/:eventId', async (req, res) => {
    req.query = { ...req.query, eventId: req.params.eventId };
    await req.registrationController.getRegistrations(req, res);
});
router.post('/:id/resend-confirmation', auth_1.requireAdmin, async (req, res) => {
    await req.registrationController.resendConfirmationEmail(req, res);
});
router.post('/:id/promote-waitlist', auth_1.requireAdmin, async (req, res) => {
    await req.registrationController.promoteWaitlistedRegistration(req, res);
});
router.get('/:id', auth_1.requireAuth, async (req, res) => {
    await req.registrationController.getRegistrationById(req, res);
});
router.post('/', async (req, res) => {
    await req.registrationController.createRegistration(req, res);
});
router.put('/:id', auth_1.requireAuth, async (req, res) => {
    await req.registrationController.updateRegistration(req, res);
});
router.post('/bulk-delete', auth_1.requireAdmin, async (req, res) => {
    await req.registrationController.bulkDeleteRegistrations(req, res);
});
router.delete('/:id', auth_1.requireAdmin, async (req, res) => {
    await req.registrationController.deleteRegistration(req, res);
});
exports.default = router;
//# sourceMappingURL=registrationRoutes.js.map