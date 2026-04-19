"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const groupController_1 = require("../controllers/groupController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
let groupController;
const initController = async () => {
    if (!groupController) {
        const db = globalThis.databaseService;
        if (db) {
            groupController = new groupController_1.GroupController(db);
        }
    }
};
const ensureController = async (req, res, next) => {
    await initController();
    if (!groupController) {
        return res.status(500).json({
            success: false,
            error: 'Database not initialized'
        });
    }
    req.groupController = groupController;
    next();
};
router.use(ensureController);
router.get('/', async (req, res) => {
    await req.groupController.getGroups(req, res);
});
router.get('/:id', async (req, res) => {
    await req.groupController.getGroupById(req, res);
});
router.post('/', auth_1.requireAdmin, async (req, res) => {
    await req.groupController.createGroup(req, res);
});
router.put('/:id', auth_1.requireAdmin, async (req, res) => {
    await req.groupController.updateGroup(req, res);
});
router.delete('/:id', auth_1.requireAdmin, async (req, res) => {
    await req.groupController.deleteGroup(req, res);
});
router.post('/:id/members', auth_1.requireAdmin, async (req, res) => {
    await req.groupController.addMemberToGroup(req, res);
});
router.delete('/:id/members', auth_1.requireAdmin, async (req, res) => {
    await req.groupController.removeMemberFromGroup(req, res);
});
exports.default = router;
//# sourceMappingURL=groupRoutes.js.map