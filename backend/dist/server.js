"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = __importDefault(require("./config/database"));
const databaseService_1 = require("./services/databaseService");
const eventRoutes_1 = __importDefault(require("./routes/eventRoutes"));
const registrationRoutes_1 = __importDefault(require("./routes/registrationRoutes"));
const groupRoutes_1 = __importDefault(require("./routes/groupRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const cancellationRoutes_1 = __importDefault(require("./routes/cancellationRoutes"));
const paymentsRoutes_1 = __importDefault(require("./routes/paymentsRoutes"));
const customizationRoutes_1 = __importDefault(require("./routes/customizationRoutes"));
const discountCodeRoutes_1 = __importDefault(require("./routes/discountCodeRoutes"));
if ((process.env.NODE_ENV || '').toLowerCase() !== 'production') {
    dotenv_1.default.config();
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api/users', userRoutes_1.default);
app.use('/api/auth', authRoutes_1.default);
app.use('/api/events', eventRoutes_1.default);
app.use('/api/registrations', registrationRoutes_1.default);
app.use('/api/groups', groupRoutes_1.default);
app.use('/api', cancellationRoutes_1.default);
app.use('/api/payments', paymentsRoutes_1.default);
app.use('/api/customization', customizationRoutes_1.default);
app.use('/api/discount-codes', discountCodeRoutes_1.default);
let databaseService;
const initializeDatabase = async () => {
    try {
        const connection = await (0, database_1.default)();
        databaseService = new databaseService_1.DatabaseService(connection);
        globalThis.databaseService = databaseService;
        console.log('Database service initialized');
        await createTables();
    }
    catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
};
const createTables = async () => {
    try {
        await databaseService.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user', 'guest') DEFAULT 'user',
        isActive BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
        await migrateUsersEmailVerification();
        await databaseService.query(`
      CREATE TABLE IF NOT EXISTS events (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        start_date DATE NULL,
        activities JSON,
        location VARCHAR(500),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
        await databaseService.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        event_id INT,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        badge_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        secondary_email VARCHAR(255),
        organization VARCHAR(255),
        job_title VARCHAR(255),
        address TEXT,
        mobile VARCHAR(50),
        office_phone VARCHAR(50),
        is_first_time_attending BOOLEAN,
        company_type VARCHAR(255),
        company_type_other VARCHAR(255),
        emergency_contact_name VARCHAR(255),
        emergency_contact_phone VARCHAR(50),
        wednesday_activity VARCHAR(255),
        wednesday_activity_waitlisted BOOLEAN DEFAULT FALSE,
        wednesday_activity_waitlisted_at TIMESTAMP NULL,
        registration_tier_label VARCHAR(255) NULL,
        spouse_tier_label VARCHAR(255) NULL,
        kids_tier_label VARCHAR(255) NULL,
        spouse_added_at TIMESTAMP NULL,
        kids_added_at TIMESTAMP NULL,
        wednesday_reception VARCHAR(50),
        thursday_breakfast VARCHAR(50),
        thursday_luncheon VARCHAR(50),
        thursday_dinner VARCHAR(50),
        friday_breakfast VARCHAR(50),
        dietary_restrictions TEXT,
        spouse_dinner_ticket BOOLEAN,
        spouse_first_name VARCHAR(255),
        spouse_last_name VARCHAR(255),
        total_price DECIMAL(10, 2),
        payment_method VARCHAR(50),
        registration_tier_label VARCHAR(255) NULL,
        spouse_tier_label VARCHAR(255) NULL,
        spouse_added_at TIMESTAMP NULL,
        kids_tier_label VARCHAR(255) NULL,
        kids_added_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);
        await migrateRegistrationsTable();
        await migrateEventsAndRegistrationsEnhancements();
        await migrateCancellationFeature();
        await migrateEventDescriptionToArray();
        await migrateEventStartDate();
        await migrateEmailCustomizations();
        await migrateContactCustomizations();
        await migrateFaqs();
        await migrateAddressFields();
        await migrateGroupAssignedColumn();
        await migrateChildLunchFeature();
        await migrateKidsRegistration();
        await migrateAdditionalRegistrationQuestions();
        await migratePickleballEquipment();
        await migrateDiscountCodes();
        await migrateBackfillPaidAt();
        await migratePendingPaymentFields();
        await migrateActivityWaitlist();
        await migrateTierTracking();
        await migrateTierTracking();
        await databaseService.query(`
      CREATE TABLE IF NOT EXISTS \`activity_groups\` (
        id INT PRIMARY KEY AUTO_INCREMENT,
        eventId INT NOT NULL,
        category VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        members TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE
      )
    `);
        await migrateGroupsMembersColumn();
        console.log('Database tables created/verified');
    }
    catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    }
};
const migrateUsersEmailVerification = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const cols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [dbName, 'users']);
        const has = (name) => cols.some((c) => c.COLUMN_NAME === name);
        const alter = [];
        if (!has('email_verified_at'))
            alter.push('ADD COLUMN `email_verified_at` TIMESTAMP NULL AFTER `isActive`');
        if (!has('email_verification_token'))
            alter.push('ADD COLUMN `email_verification_token` VARCHAR(255) NULL AFTER `email_verified_at`');
        if (!has('email_verification_expires_at'))
            alter.push('ADD COLUMN `email_verification_expires_at` TIMESTAMP NULL AFTER `email_verification_token`');
        if (!has('password_reset_token'))
            alter.push('ADD COLUMN `password_reset_token` VARCHAR(255) NULL AFTER `email_verification_expires_at`');
        if (!has('password_reset_expires_at'))
            alter.push('ADD COLUMN `password_reset_expires_at` TIMESTAMP NULL AFTER `password_reset_token`');
        if (alter.length > 0) {
            await databaseService.query(`ALTER TABLE \`users\` ${alter.join(', ')}`);
            console.log('🛠️ Added users.email verification columns');
        }
    }
    catch (e) {
        console.warn('Skipping users email verification migration:', e);
    }
};
const migrateGroupsMembersColumn = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const cols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'activity_groups']);
        const hasMembers = cols.some((c) => c.COLUMN_NAME === 'members');
        if (!hasMembers) {
            await databaseService.query('ALTER TABLE `activity_groups` ADD COLUMN `members` TEXT NULL AFTER `name`');
            console.log('Added members column to activity_groups table');
        }
    }
    catch (error) {
        console.error('Error migrating activity_groups.members column:', error);
    }
};
const migrateRegistrationsTable = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const columns = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [dbName, 'registrations']);
        if (!Array.isArray(columns))
            return;
        const has = (name) => columns.some((c) => c.COLUMN_NAME === name);
        const alter = [];
        const rename = (oldCol, newCol, type) => {
            if (!has(newCol) && has(oldCol))
                alter.push(`CHANGE COLUMN \`${oldCol}\` \`${newCol}\` ${type}`);
        };
        const add = (col, type) => {
            if (!has(col))
                alter.push(`ADD COLUMN \`${col}\` ${type}`);
        };
        const drop = (col) => {
            if (has(col))
                alter.push(`DROP COLUMN \`${col}\``);
        };
        rename('userId', 'user_id', 'INT');
        rename('eventId', 'event_id', 'INT');
        rename('firstName', 'first_name', 'VARCHAR(255)');
        rename('lastName', 'last_name', 'VARCHAR(255)');
        rename('badgeName', 'badge_name', 'VARCHAR(255)');
        rename('secondaryEmail', 'secondary_email', 'VARCHAR(255)');
        rename('jobTitle', 'job_title', 'VARCHAR(255)');
        rename('officePhone', 'office_phone', 'VARCHAR(50)');
        rename('isFirstTimeAttending', 'is_first_time_attending', 'BOOLEAN');
        rename('companyType', 'company_type', 'VARCHAR(255)');
        rename('companyTypeOther', 'company_type_other', 'VARCHAR(255)');
        rename('emergencyContactName', 'emergency_contact_name', 'VARCHAR(255)');
        rename('emergencyContactPhone', 'emergency_contact_phone', 'VARCHAR(50)');
        rename('wednesdayActivity', 'wednesday_activity', 'VARCHAR(255)');
        rename('wednesdayReception', 'wednesday_reception', 'VARCHAR(50)');
        rename('thursdayBreakfast', 'thursday_breakfast', 'VARCHAR(50)');
        rename('thursdayLunch', 'thursday_luncheon', 'VARCHAR(50)');
        rename('thursdayReception', 'thursday_reception', 'VARCHAR(50)');
        rename('fridayBreakfast', 'friday_breakfast', 'VARCHAR(50)');
        rename('dietaryRestrictions', 'dietary_restrictions', 'TEXT');
        rename('spouseDinnerTicket', 'spouse_dinner_ticket', 'BOOLEAN');
        rename('spouseFirstName', 'spouse_first_name', 'VARCHAR(255)');
        rename('spouseLastName', 'spouse_last_name', 'VARCHAR(255)');
        rename('totalPrice', 'total_price', 'DECIMAL(10,2)');
        rename('paymentMethod', 'payment_method', 'VARCHAR(50)');
        rename('createdAt', 'created_at', 'TIMESTAMP');
        rename('updatedAt', 'updated_at', 'TIMESTAMP');
        ['user_id', 'event_id', 'first_name', 'last_name', 'badge_name', 'email', 'organization', 'address', 'mobile', 'wednesday_activity', 'wednesday_reception', 'thursday_breakfast', 'thursday_luncheon', 'thursday_dinner', 'friday_breakfast', 'spouse_dinner_ticket', 'total_price', 'payment_method', 'created_at', 'updated_at']
            .forEach((col) => {
            if (!has(col)) {
                switch (col) {
                    case 'user_id':
                    case 'event_id':
                        add(col, 'INT');
                        break;
                    case 'total_price':
                        add(col, 'DECIMAL(10,2)');
                        break;
                    case 'spouse_dinner_ticket':
                        add(col, 'BOOLEAN');
                        break;
                    case 'created_at':
                    case 'updated_at':
                        add(col, 'TIMESTAMP NULL');
                        break;
                    default:
                        add(col, 'VARCHAR(255)');
                }
            }
        });
        if (alter.length > 0) {
            const sql = `ALTER TABLE \`registrations\` ${alter.join(', ')}`;
            await databaseService.query(sql);
            console.log('🛠️ Migrated registrations table schema');
        }
    }
    catch (e) {
        console.warn('Skipping registrations schema migration:', e);
    }
};
const migrateEventsAndRegistrationsEnhancements = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const getCols = async (table) => await databaseService.query('SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, table]);
        const eventCols = await getCols('events');
        if (!eventCols.some((c) => c.COLUMN_NAME === 'spouse_pricing')) {
            await databaseService.query('ALTER TABLE `events` ADD COLUMN `spouse_pricing` JSON NULL AFTER `activities`');
            console.log('🛠️ Added events.spouse_pricing');
        }
        if (!eventCols.some((c) => c.COLUMN_NAME === 'registration_pricing')) {
            await databaseService.query('ALTER TABLE `events` ADD COLUMN `registration_pricing` JSON NULL AFTER `spouse_pricing`');
            console.log('🛠️ Added events.registration_pricing');
        }
        if (!eventCols.some((c) => c.COLUMN_NAME === 'breakfast_price')) {
            await databaseService.query('ALTER TABLE `events` ADD COLUMN `breakfast_price` DECIMAL(10,2) NULL AFTER `registration_pricing`');
            console.log('🛠️ Added events.breakfast_price');
        }
        if (!eventCols.some((c) => c.COLUMN_NAME === 'breakfast_end_date')) {
            await databaseService.query('ALTER TABLE `events` ADD COLUMN `breakfast_end_date` DATE NULL AFTER `breakfast_price`');
            console.log('🛠️ Added events.breakfast_end_date');
        }
        const regCols = await getCols('registrations');
        const alter = [];
        if (!regCols.some((c) => c.COLUMN_NAME === 'club_rentals')) {
            alter.push('ADD COLUMN `club_rentals` VARCHAR(50) NULL');
        }
        else {
            const clubRentalsCol = regCols.find((c) => c.COLUMN_NAME === 'club_rentals');
            const dataType = (clubRentalsCol?.DATA_TYPE || '').toLowerCase();
            const columnType = (clubRentalsCol?.COLUMN_TYPE || '').toLowerCase();
            if (clubRentalsCol && (dataType === 'tinyint' || dataType === 'int' || dataType === 'smallint' || columnType.includes('int') || columnType.includes('bool'))) {
                alter.push('MODIFY COLUMN `club_rentals` VARCHAR(50) NULL');
                console.log(`🛠️ Migrating club_rentals from ${dataType} to VARCHAR`);
            }
        }
        if (!regCols.some((c) => c.COLUMN_NAME === 'golf_handicap'))
            alter.push('ADD COLUMN `golf_handicap` VARCHAR(10)');
        if (!regCols.some((c) => c.COLUMN_NAME === 'massage_time_slot'))
            alter.push('ADD COLUMN `massage_time_slot` VARCHAR(50) NULL');
        if (!regCols.some((c) => c.COLUMN_NAME === 'spouse_breakfast'))
            alter.push('ADD COLUMN `spouse_breakfast` BOOLEAN');
        if (!regCols.some((c) => c.COLUMN_NAME === 'tuesday_early_reception'))
            alter.push("ADD COLUMN `tuesday_early_reception` VARCHAR(50)");
        if (!regCols.some((c) => c.COLUMN_NAME === 'paid'))
            alter.push('ADD COLUMN `paid` BOOLEAN DEFAULT FALSE');
        if (!regCols.some((c) => c.COLUMN_NAME === 'paid_at'))
            alter.push('ADD COLUMN `paid_at` TIMESTAMP NULL');
        if (!regCols.some((c) => c.COLUMN_NAME === 'square_payment_id'))
            alter.push('ADD COLUMN `square_payment_id` VARCHAR(64)');
        if (!regCols.some((c) => c.COLUMN_NAME === 'spouse_payment_id'))
            alter.push('ADD COLUMN `spouse_payment_id` VARCHAR(64) NULL');
        if (!regCols.some((c) => c.COLUMN_NAME === 'spouse_paid_at'))
            alter.push('ADD COLUMN `spouse_paid_at` TIMESTAMP NULL');
        if (!regCols.some((c) => c.COLUMN_NAME === 'kids_payment_id')) {
            alter.push('ADD COLUMN `kids_payment_id` JSON NULL');
        }
        else {
            const kidsPaymentIdCol = regCols.find((c) => c.COLUMN_NAME === 'kids_payment_id');
            const dataType = (kidsPaymentIdCol?.DATA_TYPE || '').toLowerCase();
            if (kidsPaymentIdCol && dataType !== 'json') {
                alter.push('MODIFY COLUMN `kids_payment_id` JSON NULL');
                console.log(`🛠️ Migrating kids_payment_id from ${dataType} to JSON`);
            }
        }
        if (!regCols.some((c) => c.COLUMN_NAME === 'kids_paid_at'))
            alter.push('ADD COLUMN `kids_paid_at` TIMESTAMP NULL');
        if (!regCols.some((c) => c.COLUMN_NAME === 'special_requests'))
            alter.push('ADD COLUMN `special_requests` TEXT NULL');
        if (alter.length > 0) {
            await databaseService.query(`ALTER TABLE \`registrations\` ${alter.join(', ')}`);
            console.log('🛠️ Added registrations.club_rentals/golf_handicap');
        }
    }
    catch (e) {
        console.warn('Enhancement migration skipped:', e);
    }
};
const migrateEventDescriptionToArray = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const cols = await databaseService.query('SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', [dbName, 'events', 'description']);
        if (Array.isArray(cols) && cols.length > 0) {
            const col = cols[0];
            const dataType = col.DATA_TYPE?.toUpperCase();
            const columnType = col.COLUMN_TYPE?.toUpperCase() || '';
            if (dataType === 'TEXT' || dataType === 'VARCHAR' || columnType.includes('TEXT')) {
                const events = await databaseService.query('SELECT id, description FROM events WHERE description IS NOT NULL');
                for (const event of events) {
                    if (event.description && typeof event.description === 'string') {
                        try {
                            JSON.parse(event.description);
                        }
                        catch {
                            await databaseService.query('UPDATE events SET description = ? WHERE id = ?', [JSON.stringify([event.description]), event.id]);
                        }
                    }
                }
                await databaseService.query('ALTER TABLE `events` MODIFY COLUMN `description` JSON NULL');
                console.log('🛠️ Migrated events.description to JSON array');
            }
        }
    }
    catch (error) {
        console.error('Error migrating event description:', error?.message || error);
    }
};
const migrateEventStartDate = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const cols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', [dbName, 'events', 'start_date']);
        if (!Array.isArray(cols) || cols.length === 0) {
            await databaseService.query('ALTER TABLE `events` ADD COLUMN `start_date` DATE NULL AFTER `date`');
            console.log('🛠️ Added events.start_date column');
        }
    }
    catch (error) {
        console.error('Error migrating event start_date:', error?.message || error);
    }
};
const migratePickleballEquipment = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const regCols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'registrations']);
        if (!regCols.some((c) => c.COLUMN_NAME === 'pickleball_equipment')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `pickleball_equipment` BOOLEAN NULL AFTER `massage_time_slot`');
            console.log('🛠️ Added registrations.pickleball_equipment column');
        }
    }
    catch (error) {
        console.error('Error migrating pickleball equipment feature:', error?.message || error);
    }
};
const migrateActivityWaitlist = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const regCols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'registrations']);
        const hasWaitlisted = regCols.some((c) => c.COLUMN_NAME === 'wednesday_activity_waitlisted');
        const hasWaitlistedAt = regCols.some((c) => c.COLUMN_NAME === 'wednesday_activity_waitlisted_at');
        if (!hasWaitlisted) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `wednesday_activity_waitlisted` BOOLEAN DEFAULT FALSE AFTER `wednesday_activity`');
            console.log('🛠️ Added registrations.wednesday_activity_waitlisted column');
        }
        if (!hasWaitlistedAt) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `wednesday_activity_waitlisted_at` TIMESTAMP NULL AFTER `wednesday_activity_waitlisted`');
            console.log('🛠️ Added registrations.wednesday_activity_waitlisted_at column');
        }
    }
    catch (error) {
        console.error('Error migrating activity waitlist feature:', error?.message || error);
    }
};
const migrateTierTracking = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const regCols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'registrations']);
        const has = (name) => regCols.some((c) => c.COLUMN_NAME === name);
        const alter = [];
        const add = (col, type) => {
            if (!has(col))
                alter.push(`ADD COLUMN \`${col}\` ${type}`);
        };
        add('registration_tier_label', 'VARCHAR(255) NULL');
        add('spouse_tier_label', 'VARCHAR(255) NULL');
        add('kids_tier_label', 'VARCHAR(255) NULL');
        add('spouse_added_at', 'TIMESTAMP NULL');
        add('kids_added_at', 'TIMESTAMP NULL');
        if (alter.length > 0) {
            await databaseService.query(`ALTER TABLE \`registrations\` ${alter.join(', ')}`);
            console.log('🛠️ Added registrations tier tracking columns');
        }
    }
    catch (error) {
        console.error('Error migrating tier tracking columns:', error?.message || error);
    }
};
const migrateChildLunchFeature = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const eventCols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'events']);
        if (!eventCols.some((c) => c.COLUMN_NAME === 'child_lunch_price')) {
            await databaseService.query('ALTER TABLE `events` ADD COLUMN `child_lunch_price` DECIMAL(10,2) NULL AFTER `breakfast_price`');
            console.log('🛠️ Added events.child_lunch_price column');
        }
        const regCols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'registrations']);
        if (!regCols.some((c) => c.COLUMN_NAME === 'child_first_name')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `child_first_name` VARCHAR(255) NULL AFTER `spouse_last_name`');
            console.log('🛠️ Added registrations.child_first_name column');
        }
        if (!regCols.some((c) => c.COLUMN_NAME === 'child_last_name')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `child_last_name` VARCHAR(255) NULL AFTER `child_first_name`');
            console.log('🛠️ Added registrations.child_last_name column');
        }
        if (!regCols.some((c) => c.COLUMN_NAME === 'child_lunch_ticket')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `child_lunch_ticket` BOOLEAN DEFAULT FALSE AFTER `child_last_name`');
            console.log('🛠️ Added registrations.child_lunch_ticket column');
        }
    }
    catch (error) {
        console.error('Error migrating child lunch feature:', error?.message || error);
    }
};
const migrateKidsRegistration = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const eventCols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'events']);
        if (!eventCols.some((c) => c.COLUMN_NAME === 'kids_pricing')) {
            await databaseService.query('ALTER TABLE `events` ADD COLUMN `kids_pricing` JSON NULL AFTER `spouse_pricing`');
            console.log('🛠️ Added events.kids_pricing column');
        }
        const regCols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'registrations']);
        if (!regCols.some((c) => c.COLUMN_NAME === 'kids_data')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `kids_data` JSON NULL AFTER `child_lunch_ticket`');
            console.log('🛠️ Added registrations.kids_data column');
        }
        if (!regCols.some((c) => c.COLUMN_NAME === 'kids_total_price')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `kids_total_price` DECIMAL(10,2) NULL AFTER `total_price`');
            console.log('🛠️ Added registrations.kids_total_price column');
        }
    }
    catch (error) {
        console.error('Error migrating kids registration:', error?.message || error);
    }
};
const migrateAdditionalRegistrationQuestions = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const regCols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'registrations']);
        const columnNames = regCols.map((c) => c.COLUMN_NAME);
        if (!columnNames.includes('transportation_method')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `transportation_method` VARCHAR(50) NULL AFTER `special_requests`');
            console.log('🛠️ Added registrations.transportation_method column');
        }
        if (!columnNames.includes('transportation_details')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `transportation_details` TEXT NULL AFTER `transportation_method`');
            console.log('🛠️ Added registrations.transportation_details column');
        }
        if (!columnNames.includes('staying_at_beach_club')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `staying_at_beach_club` BOOLEAN NULL AFTER `transportation_details`');
            console.log('🛠️ Added registrations.staying_at_beach_club column');
        }
        if (!columnNames.includes('accommodation_details')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `accommodation_details` TEXT NULL AFTER `staying_at_beach_club`');
            console.log('🛠️ Added registrations.accommodation_details column');
        }
        if (!columnNames.includes('dietary_requirements')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `dietary_requirements` JSON NULL AFTER `accommodation_details`');
            console.log('🛠️ Added registrations.dietary_requirements column');
        }
        if (!columnNames.includes('dietary_requirements_other')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `dietary_requirements_other` TEXT NULL AFTER `dietary_requirements`');
            console.log('🛠️ Added registrations.dietary_requirements_other column');
        }
        if (!columnNames.includes('special_physical_needs')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `special_physical_needs` BOOLEAN NULL AFTER `dietary_requirements_other`');
            console.log('🛠️ Added registrations.special_physical_needs column');
        }
        if (!columnNames.includes('special_physical_needs_details')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `special_physical_needs_details` TEXT NULL AFTER `special_physical_needs`');
            console.log('🛠️ Added registrations.special_physical_needs_details column');
        }
    }
    catch (error) {
        console.error('Error migrating additional registration questions:', error?.message || error);
    }
};
const migrateAddressFields = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const cols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'registrations']);
        const columnNames = cols.map((c) => c.COLUMN_NAME);
        if (!columnNames.includes('address_street')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `address_street` VARCHAR(500) NULL AFTER `address`');
            console.log('🛠️ Added registrations.address_street column');
        }
        if (!columnNames.includes('city')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `city` VARCHAR(255) NULL AFTER `address_street`');
            console.log('🛠️ Added registrations.city column');
        }
        if (!columnNames.includes('state')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `state` VARCHAR(100) NULL AFTER `city`');
            console.log('🛠️ Added registrations.state column');
        }
        if (!columnNames.includes('zip_code')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `zip_code` VARCHAR(20) NULL AFTER `state`');
            console.log('🛠️ Added registrations.zip_code column');
        }
        if (!columnNames.includes('country')) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `country` VARCHAR(100) NULL AFTER `zip_code`');
            console.log('🛠️ Added registrations.country column');
        }
    }
    catch (error) {
        console.error('Error migrating address fields:', error?.message || error);
    }
};
const migrateGroupAssignedColumn = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const regCols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'registrations']);
        const hasColumn = regCols.some((c) => c.COLUMN_NAME === 'group_assigned');
        if (!hasColumn) {
            await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `group_assigned` INT NULL AFTER `country`');
            console.log('🛠️ Added group_assigned column to registrations table');
        }
        try {
            const groups = await databaseService.query('SELECT id, members FROM `activity_groups`');
            for (const group of groups) {
                if (group.members) {
                    let memberIds = [];
                    try {
                        memberIds = typeof group.members === 'string' ? JSON.parse(group.members) : group.members;
                        if (!Array.isArray(memberIds))
                            memberIds = [];
                    }
                    catch {
                        const matches = String(group.members).match(/\d+/g);
                        memberIds = matches ? matches.map(Number) : [];
                    }
                    if (memberIds.length > 0) {
                        const placeholders = memberIds.map(() => '?').join(',');
                        await databaseService.query(`UPDATE \`registrations\` SET \`group_assigned\` = ? WHERE \`id\` IN (${placeholders})`, [group.id, ...memberIds]);
                    }
                }
            }
            console.log('🛠️ Synced existing group assignments to registrations.group_assigned');
        }
        catch (syncError) {
            console.warn('⚠️ Could not sync existing group assignments:', syncError?.message || syncError);
        }
        if (!hasColumn) {
            try {
                await databaseService.query(`
          ALTER TABLE \`registrations\` 
          ADD CONSTRAINT \`fk_registrations_group_assigned\` 
          FOREIGN KEY (\`group_assigned\`) 
          REFERENCES \`activity_groups\`(\`id\`) 
          ON DELETE SET NULL 
          ON UPDATE CASCADE
        `);
                console.log('🛠️ Added foreign key constraint for group_assigned');
            }
            catch (fkError) {
                console.log('ℹ️ Foreign key constraint skipped (may already exist or table not ready)');
            }
        }
    }
    catch (error) {
        console.error('Error migrating group_assigned column:', error?.message || error);
    }
};
const migrateEmailCustomizations = async () => {
    try {
        await databaseService.query(`
      CREATE TABLE IF NOT EXISTS email_customizations (
        id INT PRIMARY KEY,
        header_text TEXT NULL,
        footer_text TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
        console.log('🛠️ Email customizations table created/verified');
    }
    catch (error) {
        console.error('Error migrating email customizations:', error?.message || error);
    }
};
const migrateContactCustomizations = async () => {
    try {
        await databaseService.query(`
      CREATE TABLE IF NOT EXISTS contact_customizations (
        id INT PRIMARY KEY,
        contact_email VARCHAR(255) NULL,
        contact_phone VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
        console.log('🛠️ Contact customizations table created/verified');
    }
    catch (error) {
        console.error('Error migrating contact customizations:', error?.message || error);
    }
};
const migrateFaqs = async () => {
    try {
        await databaseService.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        display_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_display_order (display_order)
      )
    `);
        console.log('🛠️ FAQs table created/verified');
    }
    catch (error) {
        console.error('Error migrating FAQs:', error?.message || error);
    }
};
const migrateDiscountCodes = async () => {
    try {
        await databaseService.query(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(50) UNIQUE NOT NULL,
        event_id INT NOT NULL,
        discount_type ENUM('percentage', 'fixed') NOT NULL,
        discount_value DECIMAL(10,2) NOT NULL,
        expiry_date DATETIME,
        usage_limit INT,
        used_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        INDEX idx_code (code),
        INDEX idx_event_id (event_id)
      )
    `);
        console.log('🛠️ Discount codes table created/verified');
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (dbName) {
            const cols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'registrations']);
            const columnNames = cols.map((c) => c.COLUMN_NAME);
            if (!columnNames.includes('discount_code')) {
                await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `discount_code` VARCHAR(50) NULL');
                console.log('🛠️ Added registrations.discount_code column');
            }
            if (!columnNames.includes('discount_amount')) {
                await databaseService.query('ALTER TABLE `registrations` ADD COLUMN `discount_amount` DECIMAL(10,2) DEFAULT 0');
                console.log('🛠️ Added registrations.discount_amount column');
            }
        }
    }
    catch (error) {
        console.error('Error migrating discount codes:', error?.message || error);
    }
};
const migrateBackfillPaidAt = async () => {
    try {
        const result = await databaseService.query(`UPDATE registrations 
       SET paid_at = created_at 
       WHERE paid = true 
       AND (paid_at IS NULL OR paid_at = '0000-00-00 00:00:00')
       AND created_at IS NOT NULL`);
        const affectedRows = result?.affectedRows || result || 0;
        if (affectedRows > 0) {
            console.log(`🛠️ Backfilled paid_at for ${affectedRows} existing paid registrations`);
        }
    }
    catch (error) {
        console.error('Error backfilling paid_at:', error?.message || error);
    }
};
const migratePendingPaymentFields = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const regCols = await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'registrations']);
        const columnNames = regCols.map((c) => c.COLUMN_NAME);
        const alter = [];
        if (!columnNames.includes('original_total_price')) {
            alter.push('ADD COLUMN `original_total_price` DECIMAL(10, 2) NULL');
        }
        if (!columnNames.includes('paid_amount')) {
            alter.push('ADD COLUMN `paid_amount` DECIMAL(10, 2) DEFAULT 0');
        }
        if (!columnNames.includes('pending_payment_amount')) {
            alter.push('ADD COLUMN `pending_payment_amount` DECIMAL(10, 2) DEFAULT 0');
        }
        if (!columnNames.includes('pending_payment_reason')) {
            alter.push('ADD COLUMN `pending_payment_reason` TEXT NULL');
        }
        if (!columnNames.includes('pending_payment_created_at')) {
            alter.push('ADD COLUMN `pending_payment_created_at` TIMESTAMP NULL');
        }
        if (alter.length > 0) {
            await databaseService.query(`ALTER TABLE \`registrations\` ${alter.join(', ')}`);
            console.log('🛠️ Added pending payment fields to registrations table');
        }
        const initResult = await databaseService.query(`UPDATE registrations 
       SET paid_amount = CASE 
         WHEN paid = 1 THEN total_price 
         ELSE 0 
       END
       WHERE paid_amount IS NULL OR paid_amount = 0`);
        const affectedRows = initResult?.affectedRows || 0;
        if (affectedRows > 0) {
            console.log(`🛠️ Initialized paid_amount for ${affectedRows} existing registrations`);
        }
    }
    catch (error) {
        console.error('Error migrating pending payment fields:', error?.message || error);
    }
};
const migrateCancellationFeature = async () => {
    try {
        const dbNameRows = await databaseService.query('SELECT DATABASE() as db');
        const dbName = dbNameRows[0]?.db;
        if (!dbName)
            return;
        const getCols = async (table) => await databaseService.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, table]);
        const regCols = await getCols('registrations');
        const regAlter = [];
        if (!regCols.some((c) => c.COLUMN_NAME === 'status'))
            regAlter.push("ADD COLUMN `status` ENUM('active','cancelled') DEFAULT 'active'");
        if (!regCols.some((c) => c.COLUMN_NAME === 'cancellation_reason'))
            regAlter.push('ADD COLUMN `cancellation_reason` TEXT NULL');
        if (!regCols.some((c) => c.COLUMN_NAME === 'cancellation_at'))
            regAlter.push('ADD COLUMN `cancellation_at` TIMESTAMP NULL');
        if (regAlter.length > 0) {
            await databaseService.query(`ALTER TABLE \`registrations\` ${regAlter.join(', ')}`);
            console.log('🛠️ Added registrations cancellation fields');
        }
        await databaseService.query(`
      CREATE TABLE IF NOT EXISTS cancellation_requests (
        id INT PRIMARY KEY AUTO_INCREMENT,
        registration_id INT NOT NULL,
        user_id INT NOT NULL,
        event_id INT NOT NULL,
        reason TEXT,
        status ENUM('pending','approved','rejected') DEFAULT 'pending',
        admin_id INT NULL,
        admin_note TEXT NULL,
        processed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
      )`);
    }
    catch (e) {
        console.warn('⚠️ Cancellation feature migration skipped:', e);
    }
};
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'EFBC Conference API is running',
        timestamp: new Date().toISOString(),
        database: databaseService ? 'Connected' : 'Disconnected'
    });
});
app.get('/api/demo/setup', async (req, res) => {
    try {
        if (!databaseService) {
            res.status(500).json({
                success: false,
                error: 'Database not initialized'
            });
            return;
        }
        const adminPasswordHash = await bcryptjs_1.default.hash('admin123', 10);
        const adminSql = `
      INSERT INTO users (name, email, password, role, isActive) 
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE password = VALUES(password), name = VALUES(name), role = VALUES(role), isActive = VALUES(isActive)
    `;
        await databaseService.query(adminSql, ['Admin User', 'hasan5481@gmail.com', adminPasswordHash, 'admin', true]);
        const userPasswordHash = await bcryptjs_1.default.hash('user123', 10);
        const userSql = `
      INSERT INTO users (name, email, password, role, isActive) 
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE password = VALUES(password), name = VALUES(name), role = VALUES(role), isActive = VALUES(isActive)
    `;
        await databaseService.query(userSql, ['Regular User', 'user@efbc.com', userPasswordHash, 'user', true]);
        const demoEvent = {
            name: 'EFBC 2024 Conference',
            date: '2024-04-22',
            activities: JSON.stringify(['Golf', 'Fishing', 'Networking', 'Tennis', 'Swimming']),
            location: 'Disney\'s Yacht & Beach Club Resorts, Orlando, Florida',
            description: JSON.stringify([
                'Annual East Florida Business Conference featuring networking, education, and recreational activities.',
            ]),
        };
        await databaseService.query('INSERT IGNORE INTO events (name, date, activities, location, description) VALUES (?, ?, ?, ?, ?)', [demoEvent.name, demoEvent.date, demoEvent.activities, demoEvent.location, demoEvent.description]);
        const demoEventRows = await databaseService.query('SELECT id FROM events WHERE name = ? ORDER BY id ASC LIMIT 1', [demoEvent.name]);
        const demoEventId = demoEventRows[0]?.id;
        if (!demoEventId) {
            throw new Error('Demo event could not be found after insert.');
        }
        const demoGroups = [
            { eventId: demoEventId, category: 'Networking', name: 'Networking Group 1' },
            { eventId: demoEventId, category: 'Golf', name: 'Golf Group 1' },
            { eventId: demoEventId, category: 'Fishing', name: 'Fishing Group 1' }
        ];
        for (const group of demoGroups) {
            await databaseService.query('INSERT IGNORE INTO `activity_groups` (eventId, category, name) VALUES (?, ?, ?)', [group.eventId, group.category, group.name]);
        }
        res.status(200).json({
            success: true,
            message: 'Demo data created successfully',
            data: {
                event: 'EFBC 2024 Conference',
                groups: demoGroups.length
            }
        });
    }
    catch (error) {
        console.error('Error setting up demo data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create demo data'
        });
    }
});
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl || req.url
    });
});
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});
const startServer = async () => {
    try {
        await initializeDatabase();
        const PORT = parseInt(process.env.PORT || '5000');
        app.listen(PORT, () => {
            console.log(`   Server is running on port ${PORT}`);
            console.log(`   Health check: http://localhost:${PORT}/api/health`);
            console.log(`   Demo setup: http://localhost:${PORT}/api/demo/setup`);
            console.log(`   API Documentation:`);
            console.log(`   Events: http://localhost:${PORT}/api/events`);
            console.log(`   Registrations: http://localhost:${PORT}/api/registrations`);
            console.log(`   Groups: http://localhost:${PORT}/api/groups`);
            console.log(`   Auth: http://localhost:${PORT}/api/auth/login`);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};
startServer();
exports.default = app;
//# sourceMappingURL=server.js.map