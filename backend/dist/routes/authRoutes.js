"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const emailService_1 = require("../services/emailService");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const getDb = () => globalThis.databaseService;
const sign = (u) => jsonwebtoken_1.default.sign({ sub: u.id, email: u.email, role: u.role, name: u.name }, JWT_SECRET, { expiresIn: '12h' });
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password)
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        const db = getDb();
        const rows = await db.query('SELECT id, name, email, role, password, email_verified_at FROM users WHERE email=? AND isActive=true LIMIT 1', [email]);
        const u = rows[0];
        if (!u)
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        const ok = await bcryptjs_1.default.compare(password, u.password);
        if (!ok)
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        const user = { id: u.id, name: u.name, email: u.email, role: u.role };
        return res.json({ success: true, data: { user, token: sign(user) } });
    }
    catch (e) {
        return res.status(500).json({ success: false, error: 'Login failed' });
    }
});
router.get('/me', (req, res) => {
    try {
        const hdr = (req.headers.authorization || '');
        const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
        if (!token)
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        const p = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return res.json({ success: true, data: { id: p.sub, email: p.email, name: p.name, role: p.role } });
    }
    catch {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
});
router.put('/profile', async (req, res) => {
    try {
        const hdr = (req.headers.authorization || '');
        const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
        const p = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { name, email } = req.body || {};
        if (!name || !email)
            return res.status(400).json({ success: false, error: 'Missing fields' });
        const db = getDb();
        const dup = await db.query('SELECT id FROM users WHERE email=? AND id<>?', [email, p.sub]);
        if (dup.length)
            return res.status(409).json({ success: false, error: 'Email already in use' });
        await db.query('UPDATE users SET name=?, email=? WHERE id=?', [name, email, p.sub]);
        const user = { id: p.sub, name, email, role: p.role };
        return res.json({ success: true, data: { user, token: sign(user) } });
    }
    catch {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
});
router.put('/password', async (req, res) => {
    try {
        const hdr = (req.headers.authorization || '');
        const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
        const p = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { currentPassword, newPassword } = req.body || {};
        if (!currentPassword || !newPassword)
            return res.status(400).json({ success: false, error: 'Missing fields' });
        const db = getDb();
        const rows = await db.query('SELECT password FROM users WHERE id=?', [p.sub]);
        const ok = await bcryptjs_1.default.compare(currentPassword, rows[0]?.password || '');
        if (!ok)
            return res.status(401).json({ success: false, error: 'Invalid current password' });
        const hash = await bcryptjs_1.default.hash(newPassword, 10);
        await db.query('UPDATE users SET password=? WHERE id=?', [hash, p.sub]);
        return res.json({ success: true, message: 'Password updated' });
    }
    catch {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
});
exports.default = router;
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body || {};
        if (!email)
            return res.status(400).json({ success: false, error: 'Email is required' });
        const db = getDb();
        const users = await db.query('SELECT id FROM users WHERE email=? LIMIT 1', [email]);
        if (users.length) {
            const token = crypto_1.default.randomBytes(32).toString('hex');
            await db.query('UPDATE users SET password_reset_token=?, password_reset_expires_at=DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id=?', [token, users[0].id]);
            setImmediate(async () => {
                try {
                    await (0, emailService_1.sendPasswordResetEmail)(email, token);
                }
                catch (e) {
                    console.error('SMTP sendPasswordResetEmail failed:', e?.message || e);
                }
            });
        }
        return res.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
    }
    catch {
        return res.status(500).json({ success: false, error: 'Request failed' });
    }
});
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body || {};
        if (!token || !newPassword)
            return res.status(400).json({ success: false, error: 'Token and newPassword are required' });
        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
            return res.status(400).json({ success: false, error: 'Password must contain uppercase, lowercase, and number' });
        }
        const db = getDb();
        const rows = await db.query('SELECT id FROM users WHERE password_reset_token=? AND password_reset_expires_at > NOW() LIMIT 1', [token]);
        const u = rows[0];
        if (!u)
            return res.status(400).json({ success: false, error: 'Invalid or expired token' });
        const hash = await bcryptjs_1.default.hash(newPassword, 10);
        await db.query('UPDATE users SET password=?, password_reset_token=NULL, password_reset_expires_at=NULL WHERE id=?', [hash, u.id]);
        return res.json({ success: true, message: 'Password updated' });
    }
    catch {
        return res.status(500).json({ success: false, error: 'Reset failed' });
    }
});
router.get('/verify-email', async (req, res) => {
    try {
        let token = req.query.token || '';
        try {
            token = decodeURIComponent(token).trim();
        }
        catch (e) {
            token = token.trim();
        }
        if (!token)
            return res.status(400).json({ success: false, error: 'Token is required' });
        console.log(`[VERIFY] Attempting verification with token length=${token.length}`);
        const db = getDb();
        const rows = await db.query('SELECT id, email, email_verification_expires_at, email_verified_at, email_verification_token FROM users WHERE email_verification_token=? LIMIT 1', [token]);
        if (!rows[0] || rows.length === 0) {
            console.log(`[VERIFY] Token not found - may have been used already. Token length: ${token.length}`);
            const allTokens = await db.query('SELECT id, email, email_verification_token, LENGTH(email_verification_token) as token_len FROM users WHERE email_verification_token IS NOT NULL LIMIT 5');
            console.warn('Email verification failed: Invalid token', {
                tokenLength: token.length,
                tokensInDb: allTokens.length
            });
            const allUsersWithTokens = await db.query('SELECT id, email, email_verification_token, email_verification_expires_at FROM users WHERE email_verification_token IS NOT NULL');
            for (const user of allUsersWithTokens) {
                const dbToken = user.email_verification_token;
                if (dbToken && (dbToken.includes(token.substring(0, 20)) || token.includes(dbToken.substring(0, 20)))) {
                    console.warn(`[VERIFY] Possible token mismatch for user ${user.id}`);
                }
            }
            const frontendUrl = process.env.FRONTEND_URL || process.env.EMAIL_VERIFY_REDIRECT || 'http://localhost:3000';
            return res.redirect(302, `${frontendUrl}/login?token_used=true`);
        }
        const u = rows[0];
        if (u.email_verified_at) {
            console.log(`[VERIFY] User ${u.id} (${u.email}) is already verified. Token may be stale.`);
            const redirect = process.env.EMAIL_VERIFY_REDIRECT || process.env.FRONTEND_URL || 'http://localhost:3000';
            if (redirect)
                return res.redirect(302, `${redirect}/login?verified=true`);
            return res.json({ success: true, message: 'Email already verified' });
        }
        const expiresAt = u.email_verification_expires_at ? new Date(u.email_verification_expires_at).getTime() : null;
        const now = Date.now();
        if (expiresAt && expiresAt < now) {
            console.log(`[VERIFY] Token expired for user ${u.id} (${u.email}). Expires: ${u.email_verification_expires_at}, Now: ${new Date(now).toISOString()}`);
            const frontendUrl = process.env.FRONTEND_URL || process.env.EMAIL_VERIFY_REDIRECT || 'http://localhost:3000';
            return res.redirect(302, `${frontendUrl}/resend-verification?email=${encodeURIComponent(u.email)}&expired=true`);
        }
        console.log(`[VERIFY] Token is valid for user ${u.id} (${u.email}). Proceeding with verification...`);
        const updateResult = await db.query('UPDATE users SET email_verified_at=NOW(), email_verification_token=NULL, email_verification_expires_at=NULL WHERE id=? AND email_verified_at IS NULL', [u.id]);
        if (updateResult.affectedRows === 0) {
            console.log(`[VERIFY] User ${u.id} (${u.email}) was already verified by another request. This is normal for concurrent requests.`);
            const redirect = process.env.EMAIL_VERIFY_REDIRECT || process.env.FRONTEND_URL || 'http://localhost:3000';
            if (redirect)
                return res.redirect(302, `${redirect}/login?verified=true`);
            return res.json({ success: true, message: 'Email already verified' });
        }
        const verifyUpdate = await db.query('SELECT id, email, email_verified_at FROM users WHERE id=? LIMIT 1', [u.id]);
        if (!verifyUpdate[0] || !verifyUpdate[0].email_verified_at) {
            console.error(`[VERIFY] Failed to verify email for user ${u.id}. Update query may have failed.`, {
                updateResult,
                verifyUpdate: verifyUpdate[0]
            });
            return res.status(500).json({ success: false, error: 'Failed to verify email. Please try again.' });
        }
        console.log(`[VERIFY] Successfully verified email for user ${u.id} (${u.email}). Verified at: ${verifyUpdate[0].email_verified_at}`);
        const redirect = process.env.EMAIL_VERIFY_REDIRECT || process.env.FRONTEND_URL || 'http://localhost:3000';
        if (redirect) {
            return res.redirect(302, `${redirect}/login?verified=true&email=${encodeURIComponent(u.email)}`);
        }
        return res.json({ success: true, message: 'Email verified successfully' });
    }
    catch (e) {
        console.error('Email verification error:', e);
        return res.status(500).json({ success: false, error: 'Verification failed. Please try again or contact support.' });
    }
});
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body || {};
        if (!email)
            return res.status(400).json({ success: false, error: 'Email is required' });
        const db = getDb();
        const rows = await db.query('SELECT id, email, email_verified_at, email_verification_token FROM users WHERE email=? LIMIT 1', [email]);
        const u = rows[0];
        if (!u)
            return res.status(404).json({ success: false, error: 'User not found' });
        if (u.email_verified_at) {
            console.log(`[RESEND] User ${u.id} (${email}) is already verified. Skipping token generation.`);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            return res.json({
                success: true,
                message: 'Email already verified',
                redirect: `${frontendUrl}/login?verified=true`
            });
        }
        const token = crypto_1.default.randomBytes(32).toString('hex');
        console.log(`[RESEND] Generated new verification token for user ${u.id} (${email})`);
        const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        await db.query('UPDATE users SET email_verification_token=?, email_verification_expires_at=? WHERE id=?', [token, expires, u.id]);
        const verifyToken = await db.query('SELECT email_verification_token, LENGTH(email_verification_token) as token_len FROM users WHERE id=? LIMIT 1', [u.id]);
        if (!verifyToken[0] || !verifyToken[0].email_verification_token) {
            console.error(`[RESEND] Failed to save verification token for user ${u.id}. Token in DB:`, verifyToken[0]);
            return res.status(500).json({ success: false, error: 'Failed to generate verification token. Please try again.' });
        }
        if (verifyToken[0].email_verification_token !== token) {
            console.error(`[RESEND] Token mismatch for user ${u.id} after save`);
            return res.status(500).json({ success: false, error: 'Token verification failed. Please try again.' });
        }
        console.log(`[RESEND] Token saved successfully for user ${u.id}. Token length in DB: ${verifyToken[0].token_len}`);
        try {
            await (0, emailService_1.sendVerificationEmail)(email, token);
            console.log(`[RESEND] Verification email sent to ${email}`);
        }
        catch (e) {
            console.error('SMTP sendVerificationEmail failed:', e?.message || e);
        }
        return res.json({ success: true, message: 'Verification email sent. Please check your inbox.' });
    }
    catch (e) {
        console.error('Resend verification error:', e);
        return res.status(500).json({ success: false, error: 'Failed to resend verification email. Please try again later.' });
    }
});
router.get('/resend-verification', async (req, res) => {
    try {
        const email = req.query.email || '';
        if (!email) {
            return res.json({ success: true, email: null });
        }
        const db = getDb();
        const rows = await db.query('SELECT id, email, email_verified_at FROM users WHERE email=? LIMIT 1', [email]);
        const u = rows[0];
        if (!u) {
            return res.json({ success: false, error: 'User not found', email: null });
        }
        if (u.email_verified_at) {
            return res.json({
                success: true,
                email: u.email,
                verified: true,
                message: 'Email already verified'
            });
        }
        return res.json({
            success: true,
            email: u.email,
            verified: false,
            canResend: true
        });
    }
    catch (e) {
        console.error('Get resend verification error:', e);
        return res.status(500).json({ success: false, error: 'Failed to check verification status' });
    }
});
//# sourceMappingURL=authRoutes.js.map