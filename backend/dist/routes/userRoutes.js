"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
let userController;
const initController = async () => {
    if (!userController) {
        const db = globalThis.databaseService;
        if (db) {
            userController = new userController_1.UserController(db);
        }
    }
};
const ensureController = async (req, res, next) => {
    await initController();
    if (!userController) {
        return res.status(500).json({
            success: false,
            error: 'Database not initialized'
        });
    }
    req.userController = userController;
    next();
};
router.use(ensureController);
router.post('/login', async (req, res) => {
    await req.userController.login(req, res);
});
router.post('/register', async (req, res) => {
    await req.userController.register(req, res);
});
router.get('/', auth_1.requireAdmin, async (req, res) => {
    await req.userController.getUsers(req, res);
});
router.get('/:id', auth_1.requireAdmin, async (req, res) => {
    await req.userController.getUserById(req, res);
});
router.post('/', auth_1.requireAdmin, async (req, res) => {
    await req.userController.createUser(req, res);
});
router.post('/admin-create', auth_1.requireAdmin, async (req, res) => {
    await req.userController.createUserByAdmin(req, res);
});
router.put('/:id', auth_1.requireAdmin, async (req, res) => {
    await req.userController.updateUser(req, res);
});
router.delete('/:id', auth_1.requireAdmin, async (req, res) => {
    await req.userController.deleteUser(req, res);
});
router.put('/:id/verify', auth_1.requireAdmin, async (req, res) => {
    await req.userController.verifyUser(req, res);
});
exports.default = router;
//# sourceMappingURL=userRoutes.js.map