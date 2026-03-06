/**
 * SQLite 数据库层 - 用户会话与状态持久化
 * 使用 sql.js (纯 JS SQLite, 无需 native 编译)
 */

const initSqlJs = require('sql.js');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// 加密密钥 (生产环境应从环境变量读取)
const ENCRYPTION_KEY = process.env.BOT_ENCRYPT_KEY || 'qq-farm-bot-default-key-32bytes!';
const IV_LENGTH = 16;

// ============ 加密/解密工具 ============

function encrypt(text) {
    if (!text) return '';
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    if (!text) return '';
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const encryptedText = parts.join(':');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return '';
    }
}

// ============ 数据库核心 ============

const DB_PATH = path.join(__dirname, '..', 'data', 'farm-bot.db');
let db = null;

/** 将 sql.js 查询结果转为对象数组 */
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

/** 查询单行 */
function queryOne(sql, params = []) {
    const rows = queryAll(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

/** 执行写操作 */
function run(sql, params = []) {
    db.run(sql, params);
}

/** 持久化到磁盘 */
function saveToFile() {
    if (!db) return;
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// 定期自动保存 (每 30 秒)
let saveTimer = null;

async function initDatabase() {
    const SQL = await initSqlJs();

    // 如果数据库文件已存在则加载
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        db = new SQL.Database();
    }

    // 创建用户表
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uin TEXT UNIQUE NOT NULL,
            nickname TEXT DEFAULT '',
            gid INTEGER DEFAULT 0,
            level INTEGER DEFAULT 0,
            gold INTEGER DEFAULT 0,
            exp INTEGER DEFAULT 0,
            status TEXT DEFAULT 'stopped',
            session_data TEXT DEFAULT '',
            platform TEXT DEFAULT 'qq',
            farm_interval INTEGER DEFAULT 10000,
            friend_interval INTEGER DEFAULT 10000,
            auto_start INTEGER DEFAULT 0,
            feature_toggles TEXT DEFAULT '',
            daily_stats TEXT DEFAULT '',
            daily_reward_state TEXT DEFAULT '',
            last_login_at TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // 创建日志表
    db.run(`
        CREATE TABLE IF NOT EXISTS bot_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_uin TEXT NOT NULL,
            tag TEXT DEFAULT '',
            message TEXT DEFAULT '',
            level TEXT DEFAULT 'info',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // 创建管理用户表 (Web 登录用)
    db.run(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            allowed_uins TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // 创建统计表
    db.run(`
        CREATE TABLE IF NOT EXISTS bot_statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_uin TEXT NOT NULL,
            action TEXT NOT NULL,
            amount INTEGER DEFAULT 0,
            target TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // 尝试添加 gold 字段，兼容旧数据表
    try {
        db.run(`ALTER TABLE bot_statistics ADD COLUMN gold INTEGER DEFAULT 0`);
    } catch (e) { }

    // 索引
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_uin ON users(uin)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_uin ON bot_logs(user_uin)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_created ON bot_logs(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_stats_uin_created ON bot_statistics(user_uin, created_at)`);

    // 创建公告表
    db.run(`
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT DEFAULT '',
            content TEXT DEFAULT '',
            enabled INTEGER DEFAULT 1,
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // 创建系统设置表
    db.run(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        )
    `);

    // 迁移: 添加 preferred_seed_id 列
    try { db.run(`ALTER TABLE users ADD COLUMN preferred_seed_id INTEGER DEFAULT 0`); } catch (e) { /* 列已存在 */ }

    // 迁移: 添加持久化配置与统计列
    try { db.run(`ALTER TABLE users ADD COLUMN feature_toggles TEXT DEFAULT ''`); } catch (e) { }
    try { db.run(`ALTER TABLE users ADD COLUMN daily_stats TEXT DEFAULT ''`); } catch (e) { }
    try { db.run(`ALTER TABLE users ADD COLUMN daily_reward_state TEXT DEFAULT ''`); } catch (e) { }

    saveToFile();

    // 自动保存定时器
    saveTimer = setInterval(saveToFile, 30000);

    console.log('[DB] SQLite 数据库已初始化');
    return db;
}

// ============ 用户 CRUD ============

function getAllUsers() {
    return queryAll('SELECT * FROM users ORDER BY created_at DESC');
}

function getUserByUin(uin) {
    return queryOne('SELECT * FROM users WHERE uin = ?', [uin]);
}

function getUserById(id) {
    return queryOne('SELECT * FROM users WHERE id = ?', [id]);
}

function createUser({ uin, nickname = '', platform = 'qq', farmInterval = 10000, friendInterval = 10000 }) {
    run(`INSERT INTO users (uin, nickname, platform, farm_interval, friend_interval) VALUES (?, ?, ?, ?, ?)`,
        [uin, nickname, platform, farmInterval, friendInterval]);
    saveToFile();
    return getUserByUin(uin);
}

function updateUser(uin, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        if (key === 'session_data') {
            fields.push(`${key} = ?`);
            values.push(encrypt(value));
        } else {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    }
    fields.push("updated_at = datetime('now','localtime')");
    values.push(uin);
    run(`UPDATE users SET ${fields.join(', ')} WHERE uin = ?`, values);
    saveToFile();
    return getUserByUin(uin);
}

function updateUserStatus(uin, status) {
    return updateUser(uin, { status });
}

function updateUserGameState(uin, { nickname, gid, level, gold, exp }) {
    const updates = {};
    if (nickname !== undefined) updates.nickname = nickname;
    if (gid !== undefined) updates.gid = gid;
    if (level !== undefined) updates.level = level;
    if (gold !== undefined) updates.gold = gold;
    if (exp !== undefined) updates.exp = exp;
    if (Object.keys(updates).length > 0) {
        return updateUser(uin, updates);
    }
}

function saveSession(uin, sessionData) {
    return updateUser(uin, { session_data: sessionData });
}

function getSession(uin) {
    const user = getUserByUin(uin);
    if (!user || !user.session_data) return null;
    return decrypt(user.session_data);
}

function deleteUser(uin) {
    run('DELETE FROM users WHERE uin = ?', [uin]);
    run('DELETE FROM bot_logs WHERE user_uin = ?', [uin]);
    saveToFile();
}

// ============ 日志持久化 ============

function addLog(uin, tag, message, level = 'info') {
    run(`INSERT INTO bot_logs (user_uin, tag, message, level) VALUES (?, ?, ?, ?)`,
        [uin, tag, message, level]);
}

function getRecentLogs(uin, limit = 100) {
    return queryAll(
        `SELECT * FROM bot_logs WHERE user_uin = ? ORDER BY created_at DESC LIMIT ?`,
        [uin, limit]
    ).reverse();
}

function cleanOldLogs(daysToKeep = 7) {
    run(`DELETE FROM bot_logs WHERE created_at < datetime('now', '-${daysToKeep} days', 'localtime')`);
    run(`DELETE FROM bot_statistics WHERE created_at < datetime('now', '-${daysToKeep} days', 'localtime')`);
    saveToFile();
}

// ============ 统计持久化 ============

function addStatistic(uin, action, amount, target = '', gold = 0) {
    run(`INSERT INTO bot_statistics (user_uin, action, amount, target, gold) VALUES (?, ?, ?, ?, ?)`,
        [uin, action, amount, target, gold]);
}

function getHourlyStatistics(uin, hoursLimit = 24) {
    const rawStats = queryAll(
        `SELECT 
            strftime('%Y-%m-%d %H:00:00', created_at) as hour,
            action,
            target,
            SUM(amount) as total_amount,
            SUM(gold) as total_gold,
            COUNT(id) as total_count
         FROM bot_statistics
         WHERE user_uin = ? AND created_at >= datetime('now', '-${hoursLimit} hours', 'localtime')
         GROUP BY hour, action, target
         ORDER BY hour ASC`,
        [uin]
    );

    // 构建一个按小时划分的数据结构，以防某些小时没有数据
    const result = [];
    const now = new Date();
    // 确保时间倒退计算是按整点
    now.setMinutes(0, 0, 0);

    const statsMap = new Map();
    for (const row of rawStats) {
        if (!statsMap.has(row.hour)) {
            statsMap.set(row.hour, {
                hour: row.hour,
                harvest: { amount: 0, count: 0, gold: 0, details: [] },
                steal: { amount: 0, count: 0, gold: 0, details: [] }
            });
        }
        const hourData = statsMap.get(row.hour);
        if (row.action === 'harvest' || row.action === 'steal') {
            hourData[row.action].amount += row.total_amount || 0;
            hourData[row.action].count += row.total_count || 0;
            hourData[row.action].gold += row.total_gold || 0;
            hourData[row.action].details.push({
                name: row.target,
                amount: row.total_amount || 0,
                gold: row.total_gold || 0
            });
        }
    }


    // 生成最近 hoursLimit 小时的列表（包含0数据的空小时）
    for (let i = hoursLimit - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 60 * 60 * 1000);
        // 本地格式化日期时间以匹配 SQLite 的 datetime('now', 'localtime') 格式（近似处理）
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hourStr = String(d.getHours()).padStart(2, '0');
        const timeKey = `${year}-${month}-${day} ${hourStr}:00:00`;

        if (statsMap.has(timeKey)) {
            result.push(statsMap.get(timeKey));
        } else {
            result.push({
                hour: timeKey,
                harvest: { amount: 0, count: 0, gold: 0, details: [] },
                steal: { amount: 0, count: 0, gold: 0, details: [] }
            });
        }
    }
    return result;
}

/** 获取按天汇总统计 */
function getDailyStatistics(uin, daysLimit = 7) {
    // 用 Node.js 计算起始日期（直接用本地日期，避免 SQLite datetime 的时区偏差）
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysLimit + 1);
    startDate.setHours(0, 0, 0, 0);
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const startDateStr = `${year}-${month}-${day}`;

    const rawStats = queryAll(
        `SELECT 
            date(created_at) as day,
            action,
            SUM(amount) as total_amount,
            SUM(gold) as total_gold
         FROM bot_statistics
         WHERE user_uin = ? AND date(created_at) >= ?
         GROUP BY day, action
         ORDER BY day DESC`,
        [uin, startDateStr]
    );

    const result = [];
    const dayMap = new Map();

    for (const row of rawStats) {
        if (!dayMap.has(row.day)) {
            dayMap.set(row.day, {
                day: row.day,
                harvest: { amount: 0, gold: 0 },
                steal: { amount: 0, gold: 0 },
                totalGold: 0
            });
        }
        const dayData = dayMap.get(row.day);
        if (row.action === 'harvest' || row.action === 'steal') {
            dayData[row.action].amount += row.total_amount || 0;
            dayData[row.action].gold += row.total_gold || 0;
            dayData.totalGold += row.total_gold || 0;
        }
    }
    return Array.from(dayMap.values());
}

// ============ 自动启动用户列表 ============

function getAutoStartUsers() {
    return queryAll('SELECT * FROM users WHERE auto_start = 1 AND session_data != ""');
}

// ============ 管理用户 (Web 登录) ============

function getAdminUser(username) {
    return queryOne('SELECT * FROM admin_users WHERE username = ?', [username]);
}

function getAdminUserById(id) {
    return queryOne('SELECT * FROM admin_users WHERE id = ?', [id]);
}

function getAllAdminUsers() {
    return queryAll('SELECT id, username, role, allowed_uins, created_at FROM admin_users ORDER BY created_at');
}

function createAdminUser({ username, passwordHash, role = 'user', allowedUins = '' }) {
    run(`INSERT INTO admin_users (username, password_hash, role, allowed_uins) VALUES (?, ?, ?, ?)`,
        [username, passwordHash, role, allowedUins]);
    saveToFile();
    return getAdminUser(username);
}

function updateAdminUser(id, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = ?`);
        values.push(value);
    }
    if (fields.length === 0) return;
    values.push(id);
    run(`UPDATE admin_users SET ${fields.join(', ')} WHERE id = ?`, values);
    saveToFile();
}

function deleteAdminUser(id) {
    run('DELETE FROM admin_users WHERE id = ?', [id]);
    saveToFile();
}

// ============ 公告 ============

function getAnnouncement() {
    return queryOne('SELECT * FROM announcements WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 1');
}

function saveAnnouncement({ title, content }) {
    const existing = queryOne('SELECT * FROM announcements LIMIT 1');
    if (existing) {
        run(`UPDATE announcements SET title = ?, content = ?, enabled = 1, updated_at = datetime('now','localtime') WHERE id = ?`,
            [title, content, existing.id]);
    } else {
        run(`INSERT INTO announcements (title, content) VALUES (?, ?)`, [title, content]);
    }
    saveToFile();
    return getAnnouncement();
}

// ============ 邮件设置 ============

function getMailSettings() {
    const toRow = queryOne(`SELECT value FROM system_settings WHERE key='mail_to'`);
    const enabledRow = queryOne(`SELECT value FROM system_settings WHERE key='mail_enabled'`);
    return {
        mailTo: toRow ? toRow.value : '',
        mailEnabled: enabledRow ? enabledRow.value === '1' : false,
    };
}

function saveMailSettings(mailTo, mailEnabled) {
    const upsert = (key, val) => {
        const exists = queryOne(`SELECT key FROM system_settings WHERE key=?`, [key]);
        if (exists) {
            run(`UPDATE system_settings SET value=? WHERE key=?`, [val, key]);
        } else {
            run(`INSERT INTO system_settings (key, value) VALUES (?,?)`, [key, val]);
        }
    };
    upsert('mail_to', mailTo || '');
    upsert('mail_enabled', mailEnabled ? '1' : '0');
    saveToFile();
}

/** 确保存在默认管理员 (首次运行时) */
function ensureDefaultAdmin() {
    const admin = getAdminUser('admin');
    if (!admin) {
        // 默认密码: admin123 (sha256)
        const hash = crypto.createHash('sha256').update('admin123').digest('hex');
        createAdminUser({ username: 'admin', passwordHash: hash, role: 'admin' });
        console.log('[DB] 已创建默认管理员 admin / admin123');
    }
}

function closeDatabase() {
    if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
    if (db) {
        saveToFile();
        db.close();
        db = null;
    }
}

module.exports = {
    initDatabase,
    closeDatabase,
    getAllUsers,
    getUserByUin,
    getUserById,
    createUser,
    updateUser,
    updateUserStatus,
    updateUserGameState,
    saveSession,
    getSession,
    deleteUser,
    addLog,
    getRecentLogs,
    cleanOldLogs,
    getAutoStartUsers,
    encrypt,
    decrypt,
    // 管理用户
    getAdminUser,
    getAdminUserById,
    getAllAdminUsers,
    createAdminUser,
    updateAdminUser,
    deleteAdminUser,
    ensureDefaultAdmin,
    // 公告
    getAnnouncement,
    saveAnnouncement,
    // 统计
    addStatistic,
    getHourlyStatistics,
    getDailyStatistics,
    // 邮件设置
    getMailSettings,
    saveMailSettings,
};
