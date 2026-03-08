/**
 * BotManager - 多用户 Bot 实例管理器
 *
 * 职责:
 *   - 维护 Map<userId, BotInstance> 内存映射
 *   - 与 SQLite 持久层交互
 *   - 通过 Socket.io 广播实时事件
 *   - QR 扫码登录流程管理
 */

const EventEmitter = require('events');
const { BotInstance } = require('./bot-instance');
const db = require('./database');
const { requestQrLogin, getQrCodeBase64 } = require('./qr-service');
const { CONFIG } = require('../src/config');
const { pushNotification } = require('./notification-service');

class BotManager extends EventEmitter {
    constructor() {
        super();
        /** @type {Map<string, BotInstance>} userId (uin) → bot 实例 */
        this.bots = new Map();
        /** @type {Map<string, object>} userId → 进行中的 QR 登录会话 */
        this.qrSessions = new Map();
    }

    // ============================================================
    //  实例管理
    // ============================================================

    /**
     * 获取所有账号状态列表 (合并 DB + 内存)
     */
    listAccounts() {
        const users = db.getAllUsers();
        return users.map(u => {
            const bot = this.bots.get(u.uin);
            if (bot) {
                const snap = bot.getSnapshot();
                return {
                    uin: u.uin,
                    nickname: snap.userState.name || u.nickname,
                    gid: snap.userState.gid || u.gid,
                    level: snap.userState.level || u.level,
                    gold: snap.userState.gold || u.gold,
                    exp: snap.userState.exp || u.exp,
                    status: snap.status,
                    errorMessage: snap.errorMessage,
                    platform: u.platform,
                    farmInterval: u.farm_interval,
                    farmIntervalMax: u.farm_interval_max || u.farm_interval,
                    friendInterval: u.friend_interval,
                    friendIntervalMax: u.friend_interval_max || u.friend_interval,
                    autoStart: !!u.auto_start,
                    startedAt: snap.startedAt,
                    uptime: snap.uptime,
                    createdAt: u.created_at,
                };
            }
            return {
                uin: u.uin,
                nickname: u.nickname,
                gid: u.gid,
                level: u.level,
                gold: u.gold,
                exp: u.exp,
                status: u.status === 'running' ? 'stopped' : u.status, // DB 说 running 但没有内存实例，纠正
                errorMessage: '',
                platform: u.platform,
                farmInterval: u.farm_interval,
                farmIntervalMax: u.farm_interval_max || u.farm_interval,
                friendInterval: u.friend_interval,
                friendIntervalMax: u.friend_interval_max || u.friend_interval,
                autoStart: !!u.auto_start,
                startedAt: null,
                uptime: 0,
                createdAt: u.created_at,
            };
        });
    }

    /**
     * 获取单个账号状态
     */
    getAccount(uin) {
        const accounts = this.listAccounts();
        return accounts.find(a => a.uin === uin) || null;
    }

    // ============================================================
    //  QR 扫码登录流程
    // ============================================================

    /**
     * 发起 QR 登录流程
     * @param {string} uin - 用户标识 (QQ号)
     * @param {object} opts - { platform: 'qq'|'wx', farmInterval, friendInterval }
     * @returns {{ qrBase64: string, qrUrl: string }} 二维码数据
     */
    async startQrLogin(uin, opts = {}) {
        if (this.qrSessions.has(uin)) {
            throw new Error('该账号已有扫码会话进行中');
        }
        if (this.bots.has(uin) && this.bots.get(uin).status === 'running') {
            throw new Error('该账号已在运行中');
        }

        const platform = opts.platform || 'qq';

        // 确保 DB 中有记录
        let user = db.getUserByUin(uin);
        if (!user) {
            user = db.createUser({
                uin,
                platform,
                farmInterval: opts.farmInterval || CONFIG.farmCheckInterval,
                farmIntervalMax: opts.farmIntervalMax || opts.farmInterval || CONFIG.farmCheckInterval,
                friendInterval: opts.friendInterval || CONFIG.friendCheckInterval,
                friendIntervalMax: opts.friendIntervalMax || opts.friendInterval || CONFIG.friendCheckInterval,
            });
        }

        // 请求二维码
        const { loginCode, url } = await requestQrLogin();
        const qrBase64 = await getQrCodeBase64(url);

        // 保存会话
        const session = {
            uin, loginCode, url, platform,
            farmInterval: opts.farmInterval || user.farm_interval || CONFIG.farmCheckInterval,
            farmIntervalMax: opts.farmIntervalMax || user.farm_interval_max || opts.farmInterval || user.farm_interval || CONFIG.farmCheckInterval,
            friendInterval: opts.friendInterval || user.friend_interval || CONFIG.friendCheckInterval,
            friendIntervalMax: opts.friendIntervalMax || user.friend_interval_max || opts.friendInterval || user.friend_interval || CONFIG.friendCheckInterval,
            createdAt: Date.now(),
        };
        this.qrSessions.set(uin, session);

        // 开始轮询扫码状态
        this._pollQrLogin(uin);

        return { qrBase64, qrUrl: url };
    }

    /**
     * 轮询扫码状态
     */
    async _pollQrLogin(uin) {
        const { queryScanStatus, getAuthCode } = require('./qr-service');
        const session = this.qrSessions.get(uin);
        if (!session) return;

        const POLL_INTERVAL = 2000;
        const TIMEOUT = 180000;
        const start = Date.now();

        const poll = async () => {
            if (!this.qrSessions.has(uin)) return; // 已取消

            if (Date.now() - start > TIMEOUT) {
                this.qrSessions.delete(uin);
                this.emit('qrExpired', { uin });
                db.updateUserStatus(uin, 'stopped');
                return;
            }

            try {
                const result = await queryScanStatus(session.loginCode);
                if (result.status === 'OK') {
                    const code = await getAuthCode(result.ticket);
                    this.qrSessions.delete(uin);
                    this.emit('qrScanned', { uin });
                    // 保存 session 并启动 bot
                    db.saveSession(uin, code);
                    db.updateUser(uin, { last_login_at: new Date().toISOString() });

                    // 重新登录时尝试读取已有配置与统计
                    const user = db.getUserByUin(uin);
                    const startOpts = { ...session };
                    if (user) {
                        if (user.feature_toggles) startOpts.featureToggles = JSON.parse(user.feature_toggles);
                        if (user.daily_stats) startOpts.dailyStats = JSON.parse(user.daily_stats);
                        if (user.daily_reward_state) startOpts.dailyRewardState = JSON.parse(user.daily_reward_state);
                        startOpts.preferredSeedId = user.preferred_seed_id || 0;
                        if (user.farm_interval) startOpts.farmInterval = user.farm_interval;
                        if (user.farm_interval_max) startOpts.farmIntervalMax = user.farm_interval_max;
                        if (user.friend_interval) startOpts.friendInterval = user.friend_interval;
                        if (user.friend_interval_max) startOpts.friendIntervalMax = user.friend_interval_max;
                    }
                    await this._startBot(uin, code, startOpts);
                    return;
                }
                if (result.status === 'Used') {
                    this.qrSessions.delete(uin);
                    this.emit('qrExpired', { uin, reason: '二维码已失效' });
                    return;
                }
                if (result.status === 'Error') {
                    this.qrSessions.delete(uin);
                    this.emit('qrError', { uin, reason: '扫码查询错误' });
                    return;
                }
                // Wait: 继续轮询
                setTimeout(poll, POLL_INTERVAL);
            } catch (err) {
                this.qrSessions.delete(uin);
                this.emit('qrError', { uin, reason: err.message });
            }
        };

        // 延迟第一次轮询
        setTimeout(poll, POLL_INTERVAL);
    }

    /**
     * 取消 QR 登录
     */
    cancelQrLogin(uin) {
        this.qrSessions.delete(uin);
        this.emit('qrCancelled', { uin });
    }

    // ============================================================
    //  Bot 启停
    // ============================================================

    /**
     * 用已有 code 启动 Bot 实例
     */
    async _startBot(uin, code, opts = {}) {
        // 清理旧实例
        if (this.bots.has(uin)) {
            const old = this.bots.get(uin);
            old.destroy();
            this.bots.delete(uin);
        }

        const bot = new BotInstance(uin, {
            platform: opts.platform || 'qq',
            farmInterval: opts.farmInterval || CONFIG.farmCheckInterval,
            farmIntervalMax: opts.farmIntervalMax || opts.farmInterval || CONFIG.farmCheckInterval,
            friendInterval: opts.friendInterval || CONFIG.friendCheckInterval,
            friendIntervalMax: opts.friendIntervalMax || opts.friendInterval || CONFIG.friendCheckInterval,
            preferredSeedId: opts.preferredSeedId || 0,
            featureToggles: opts.featureToggles || null,
            dailyStats: opts.dailyStats || null,
            dailyRewardState: opts.dailyRewardState || null,
        });

        // 监听事件并转发给 BotManager 的事件总线
        bot.on('log', (entry) => {
            this.emit('botLog', entry);
            // 可选: 持久化到 DB
            // db.addLog(uin, entry.tag, entry.msg, entry.level);
        });

        bot.on('statusChange', (data) => {
            db.updateUserStatus(uin, data.newStatus);
            // 账号从运行中异常断线时发送通知
            if (data.oldStatus === 'running' && data.newStatus === 'error') {
                const mailSettings = db.getMailSettings();
                if (mailSettings.mailEnabled || mailSettings.serverChanEnabled) {
                    const nickname = data.userState && data.userState.name ? data.userState.name : uin;
                    const bot = this.bots.get(uin);
                    const reason = bot ? bot.errorMessage : '未知原因';
                    const timeStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                    const subject = `⚠️ QQ农场账号掉线提醒 - ${nickname || uin}`;

                    const md = `**⚠️ 您的 QQ 农场机器人账号已断线**\n\n- **账号**: ${nickname || '未知'} (${uin})\n- **时间**: ${timeStr}\n- **原因**: ${reason || '未知'}`;

                    const html = `
                        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                            <div style="background: #f56c6c; color: white; padding: 16px 24px;">
                                <h2 style="margin: 0;">⚠️ 账号掉线提醒</h2>
                            </div>
                            <div style="padding: 24px;">
                                <p style="margin: 0 0 12px;">您的 QQ 农场机器人账号已断线，请尽快检查。</p>
                                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                    <tr style="background: #f5f7fa;">
                                        <td style="padding: 8px 12px; font-weight: bold; width: 80px;">账号</td>
                                        <td style="padding: 8px 12px;">${nickname || '未知'} (${uin})</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 12px; font-weight: bold;">时间</td>
                                        <td style="padding: 8px 12px;">${timeStr}</td>
                                    </tr>
                                    <tr style="background: #f5f7fa;">
                                        <td style="padding: 8px 12px; font-weight: bold;">原因</td>
                                        <td style="padding: 8px 12px; color: #f56c6c;">${reason || '未知'}</td>
                                    </tr>
                                </table>
                                <p style="margin-top: 16px; color: #909399; font-size: 13px;">此通知由 QQ Farm Bot 自动发送。</p>
                            </div>
                        </div>
                    `;

                    pushNotification(subject, md, html, {
                        useEmail: mailSettings.mailEnabled,
                        useSc: mailSettings.serverChanEnabled
                    }).catch(e => console.error('[推送] 断线通知发起失败', e));
                }
            }
        });

        bot.on('stateUpdate', (data) => {
            // 更新 DB 中的游戏状态
            db.updateUserGameState(uin, {
                nickname: data.userState.name,
                gid: data.userState.gid,
                level: data.userState.level,
                gold: data.userState.gold,
                exp: data.userState.exp,
            });
            this.emit('botStateUpdate', data);
        });

        bot.on('settingsUpdate', (data) => {
            db.updateUser(uin, { feature_toggles: JSON.stringify(data.featureToggles) });
        });

        bot.on('statsUpdate', (data) => {
            db.updateUser(uin, { daily_stats: JSON.stringify(data.dailyStats) });
        });

        bot.on('rewardStateUpdate', (data) => {
            db.updateUser(uin, { daily_reward_state: JSON.stringify(data.dailyRewardState) });
        });

        this.bots.set(uin, bot);
        db.updateUserStatus(uin, 'connecting');

        try {
            await bot.start(code);
        } catch (err) {
            db.updateUserStatus(uin, 'error');
            this.emit('botError', { uin, error: err.message });
        }
    }

    /**
     * 停止指定 Bot
     */
    async stopBot(uin) {
        const bot = this.bots.get(uin);
        if (!bot) throw new Error('未找到运行中的 Bot 实例');
        bot.stop();
        db.updateUserStatus(uin, 'stopped');
    }

    /**
     * 使用已保存的 session 重新启动 Bot
     */
    async restartBot(uin) {
        const code = db.getSession(uin);
        if (!code) throw new Error('没有保存的登录凭证，请重新扫码');
        const user = db.getUserByUin(uin);
        await this._startBot(uin, code, {
            platform: user?.platform || 'qq',
            farmInterval: user?.farm_interval || 10000,
            farmIntervalMax: user?.farm_interval_max || user?.farm_interval || 10000,
            friendInterval: user?.friend_interval || 10000,
            friendIntervalMax: user?.friend_interval_max || user?.friend_interval || 10000,
            preferredSeedId: user?.preferred_seed_id || 0,
            featureToggles: user?.feature_toggles ? JSON.parse(user.feature_toggles) : null,
            dailyStats: user?.daily_stats ? JSON.parse(user.daily_stats) : null,
            dailyRewardState: user?.daily_reward_state ? JSON.parse(user.daily_reward_state) : null,
        });
    }

    /**
     * 删除账号 (停止运行 + 删除 DB 记录)
     */
    async removeAccount(uin) {
        if (this.bots.has(uin)) {
            this.bots.get(uin).destroy();
            this.bots.delete(uin);
        }
        this.qrSessions.delete(uin);
        db.deleteUser(uin);
    }

    /**
     * 获取某 Bot 的最近日志
     */
    getBotLogs(uin, limit = 100) {
        const bot = this.bots.get(uin);
        if (bot) return bot.getRecentLogs(limit);
        return db.getRecentLogs(uin, limit);
    }

    /**
     * 修改账号配置
     */
    updateAccountConfig(uin, { farmInterval, farmIntervalMax, friendInterval, friendIntervalMax, autoStart, platform, preferredSeedId }) {
        const updates = {};
        if (farmInterval !== undefined) updates.farm_interval = farmInterval;
        if (farmIntervalMax !== undefined) updates.farm_interval_max = farmIntervalMax;
        if (friendInterval !== undefined) updates.friend_interval = friendInterval;
        if (friendIntervalMax !== undefined) updates.friend_interval_max = friendIntervalMax;
        if (autoStart !== undefined) updates.auto_start = autoStart ? 1 : 0;
        if (platform !== undefined) updates.platform = platform;
        if (preferredSeedId !== undefined) updates.preferred_seed_id = preferredSeedId;
        db.updateUser(uin, updates);

        // 如果 Bot 正在运行，更新运行时配置
        const bot = this.bots.get(uin);
        if (bot) {
            if (farmInterval !== undefined) bot.farmInterval = farmInterval;
            if (farmIntervalMax !== undefined) bot.farmIntervalMax = farmIntervalMax;
            if (friendInterval !== undefined) bot.friendInterval = friendInterval;
            if (friendIntervalMax !== undefined) bot.friendIntervalMax = friendIntervalMax;
            if (preferredSeedId !== undefined) bot.setPreferredSeedId(preferredSeedId);
        }
    }

    // ============================================================
    //  服务器启动时自动恢复
    // ============================================================

    async autoStartBots() {
        const users = db.getAutoStartUsers();
        if (users.length === 0) return;
        console.log(`[BotManager] 自动启动 ${users.length} 个账号...`);
        for (const user of users) {
            try {
                const code = db.getSession(user.uin);
                if (code) {
                    // 不使用 await 阻塞，防单个账号登录超时导致整个 Web 服务器挂起
                    this._startBot(user.uin, code, {
                        platform: user.platform,
                        farmInterval: user.farm_interval,
                        farmIntervalMax: user.farm_interval_max || user.farm_interval,
                        friendInterval: user.friend_interval,
                        friendIntervalMax: user.friend_interval_max || user.friend_interval,
                        preferredSeedId: user.preferred_seed_id || 0,
                        featureToggles: user.feature_toggles ? JSON.parse(user.feature_toggles) : null,
                        dailyStats: user.daily_stats ? JSON.parse(user.daily_stats) : null,
                        dailyRewardState: user.daily_reward_state ? JSON.parse(user.daily_reward_state) : null,
                    }).then(() => {
                        console.log(`[BotManager] 已启动: ${user.uin} (${user.nickname || '未知'})`);
                    }).catch(startErr => {
                        console.error(`[BotManager] Bot 启动实例失败 ${user.uin}: ${startErr.message}`);
                    });
                }
            } catch (err) {
                console.error(`[BotManager] 自动启动循环异常 ${user.uin}: ${err.message}`);
            }
        }
    }

    // ============================================================
    //  清理
    // ============================================================

    shutdown() {
        console.log('[BotManager] 关闭所有 Bot...');
        for (const [uin, bot] of this.bots) {
            bot.destroy();
        }
        this.bots.clear();
        this.qrSessions.clear();
    }
}

// 单例
const botManager = new BotManager();

module.exports = { botManager, BotManager };
