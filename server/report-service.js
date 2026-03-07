/**
 * report-service.js - 定时汇报服务
 *
 * 功能：
 *   - 每小时整点生成并发送汇报邮件
 *   - 每日早上 8:00 生成并发送每日汇报邮件
 *   - 支持手动触发测试汇报
 *
 * 汇报内容（按账号分开显示）：
 *   - 每个账号：收获作物统计、偷取统计、偷菜好友排行
 *   - 当前用户等级、经验、金币
 */

const db = require('./database');
const { pushNotification } = require('./notification-service');

// ============ 定时器 ============

let hourlyTimer = null;
let dailyTimer = null;
let botManagerRef = null;

function startScheduler(botManager) {
    botManagerRef = botManager;
    scheduleHourlyReport();
    scheduleDailyReport();
    console.log('[汇报] 定时汇报调度器已启动');
}

function stopScheduler() {
    if (hourlyTimer) { clearTimeout(hourlyTimer); hourlyTimer = null; }
    if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
    console.log('[汇报] 定时汇报调度器已停止');
}

function msUntilNextHour() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return next.getTime() - now.getTime();
}

function msUntilNext8AM() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(8, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
}

function scheduleHourlyReport() {
    const delay = msUntilNextHour();
    hourlyTimer = setTimeout(async () => {
        await safeRun('hourly');
        scheduleHourlyReport();
    }, delay);
    const nextTime = new Date(Date.now() + delay).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.log(`[汇报] 下次每小时汇报: ${nextTime}`);
}

function scheduleDailyReport() {
    const delay = msUntilNext8AM();
    dailyTimer = setTimeout(async () => {
        await safeRun('daily');
        scheduleDailyReport();
    }, delay);
    const nextTime = new Date(Date.now() + delay).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.log(`[汇报] 下次每日汇报: ${nextTime}`);
}

async function safeRun(type) {
    try { await generateAndSendReport(type); }
    catch (err) { console.error(`[汇报] ${type} 汇报执行失败:`, err.message); }
}

// ============ 核心逻辑 ============

async function generateAndSendReport(type, force = false) {
    const settings = db.getReportSettings();
    if (!force) {
        if (type === 'hourly' && !settings.hourlyEnabled) return;
        if (type === 'daily' && !settings.dailyEnabled) return;
    }

    if (!settings.pushEmailEnabled && !settings.serverChanEnabled) {
        console.log(`[汇报] 邮件和方糖推送均未启用，跳过 ${type} 汇报`);
        return;
    }

    const hours = type === 'daily' ? 24 : 1;
    const now = new Date();
    const from = new Date(now.getTime() - hours * 3600 * 1000);
    const reportData = collectReportData(hours);
    const html = buildReportHTML(type, reportData, from, now);
    const md = buildReportMarkdown(type, reportData, from, now);
    const typeLabel = type === 'daily' ? '每日' : '每小时';
    const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const subject = `📊 QQ农场 ${typeLabel}汇报 - ${timeStr}`;

    await pushNotification(subject, md, html, {
        useEmail: settings.pushEmailEnabled,
        useSc: settings.serverChanEnabled
    });
}

/**
 * 按账号采集汇报数据
 */
function collectReportData(hours) {
    const accountsData = [];

    if (botManagerRef) {
        const list = botManagerRef.listAccounts();
        for (const acc of list) {
            const uin = acc.uin || acc.userId;
            const stats = db.getReportStatisticsByUin(uin, hours);
            const stealRanking = db.getStealRankingByUin(uin, hours);
            accountsData.push({
                uin,
                nickname: acc.nickname || uin,
                level: acc.level || 0,
                exp: acc.exp || 0,
                gold: acc.gold || 0,
                status: acc.status,
                stats,
                stealRanking,
            });
        }
    }

    // 全局汇总
    const globalStats = db.getReportStatistics(hours);
    const globalStealRanking = db.getStealRanking(hours);

    return { accountsData, globalStats, globalStealRanking };
}

// ============ HTML 模板 ============

function buildReportHTML(type, data, from, to) {
    const typeLabel = type === 'daily' ? '📅 每日汇报' : '⏰ 每小时汇报';
    const fmt = (d) => d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const { accountsData, globalStats, globalStealRanking } = data;

    // 全局汇总数字
    const gHarvest = (globalStats.harvest || []).reduce((s, r) => ({ amount: s.amount + r.amount, gold: s.gold + r.gold }), { amount: 0, gold: 0 });
    const gSteal = (globalStats.steal || []).reduce((s, r) => ({ amount: s.amount + r.amount, gold: s.gold + r.gold }), { amount: 0, gold: 0 });

    // 每个账号的 HTML 段
    const accountSections = accountsData.map(acc => buildAccountSection(acc)).join('');

    // 全局偷菜排行
    const rankHtml = buildRankingTable(globalStealRanking);

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;">
<div style="max-width:640px;margin:20px auto;">

    <!-- 主卡片 -->
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);margin-bottom:20px;">
        <!-- 头部 -->
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:28px 32px;color:#fff;">
            <h1 style="margin:0;font-size:22px;font-weight:700;">${typeLabel}</h1>
            <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">📅 ${fmt(from)} ～ ${fmt(to)}</p>
        </div>

        <div style="padding:24px 32px;">
            <!-- 全局概览 -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                    <td width="33%" style="padding:6px;">
                        <div style="background:linear-gradient(135deg,#f6d365,#fda085);border-radius:10px;padding:16px;color:#fff;text-align:center;">
                            <div style="font-size:24px;font-weight:700;">${gHarvest.amount.toLocaleString()}</div>
                            <div style="font-size:12px;opacity:0.9;margin-top:4px;">🌾 收获总数</div>
                        </div>
                    </td>
                    <td width="33%" style="padding:6px;">
                        <div style="background:linear-gradient(135deg,#a1c4fd,#c2e9fb);border-radius:10px;padding:16px;color:#333;text-align:center;">
                            <div style="font-size:24px;font-weight:700;">${gSteal.amount.toLocaleString()}</div>
                            <div style="font-size:12px;opacity:0.8;margin-top:4px;">🥷 偷菜总数</div>
                        </div>
                    </td>
                    <td width="33%" style="padding:6px;">
                        <div style="background:linear-gradient(135deg,#ffecd2,#fcb69f);border-radius:10px;padding:16px;color:#333;text-align:center;">
                            <div style="font-size:24px;font-weight:700;">${(gHarvest.gold + gSteal.gold).toLocaleString()}</div>
                            <div style="font-size:12px;opacity:0.8;margin-top:4px;">💰 总收入</div>
                        </div>
                    </td>
                </tr>
            </table>
        </div>
    </div>

    <!-- 各账号详情 -->
    ${accountSections}

    ${rankHtml ? `
    <!-- 全局偷菜排行 -->
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);margin-bottom:20px;">
        <div style="padding:20px 32px;">
            <h2 style="font-size:16px;color:#333;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #e6a23c;">🏆 偷菜好友排行 (全局)</h2>
            ${rankHtml}
        </div>
    </div>
    ` : ''}

    <!-- 页脚 -->
    <div style="text-align:center;color:#909399;font-size:12px;padding:16px;">
        此邮件由 QQ Farm Bot 自动发送，请勿直接回复
    </div>

</div>
</body>
</html>
    `.trim();
}

/**
 * 构造 Markdown 格式的汇报内容 (供 ServerChan 使用)
 */
function buildReportMarkdown(type, data, from, to) {
    const typeLabel = type === 'daily' ? '每日汇报' : '每小时汇报';
    const fmt = (d) => d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const { accountsData, globalStats, globalStealRanking } = data;

    const gHarvest = (globalStats.harvest || []).reduce((s, r) => ({ amount: s.amount + r.amount, gold: s.gold + r.gold }), { amount: 0, gold: 0 });
    const gSteal = (globalStats.steal || []).reduce((s, r) => ({ amount: s.amount + r.amount, gold: s.gold + r.gold }), { amount: 0, gold: 0 });

    let md = `## QQ农场 ${typeLabel}\n\n`;
    md += `📅 ${fmt(from)} ～ ${fmt(to)}\n\n`;
    md += `**全局概览**\n\n`;
    md += `- 🌾 收获总数: **${gHarvest.amount.toLocaleString()}** (💰 ${gHarvest.gold.toLocaleString()})\n`;
    md += `- 🥷 偷菜总数: **${gSteal.amount.toLocaleString()}** (💰 ${gSteal.gold.toLocaleString()})\n`;
    md += `- 💰 总收入: **${(gHarvest.gold + gSteal.gold).toLocaleString()}**\n\n`;

    md += `---\n\n`;

    for (const acc of accountsData) {
        const { stats, stealRanking } = acc;
        const statusDot = acc.status === 'running' ? '🟢' : '⚪';
        const harvestTotal = (stats.harvest || []).reduce((s, r) => ({ amount: s.amount + r.amount, gold: s.gold + r.gold }), { amount: 0, gold: 0 });
        const stealTotal = (stats.steal || []).reduce((s, r) => ({ amount: s.amount + r.amount, gold: s.gold + r.gold }), { amount: 0, gold: 0 });

        md += `### ${statusDot} ${acc.nickname} (Lv.${acc.level})\n\n`;
        md += `- EXP ${acc.exp.toLocaleString()} | 💰 ${acc.gold.toLocaleString()}\n`;
        md += `- 🌾 收获: ${harvestTotal.amount.toLocaleString()} | 💰 ${harvestTotal.gold.toLocaleString()}\n`;
        md += `- 🥷 偷菜: ${stealTotal.amount.toLocaleString()} | 💰 ${stealTotal.gold.toLocaleString()}\n\n`;

        const harvestRows = (stats.harvest || []).filter(r => r.amount > 0);
        if (harvestRows.length > 0) {
            md += `*收获明细*\n\n`;
            for (const r of harvestRows) {
                md += `- ${r.target}: ${r.amount.toLocaleString()} (💰 ${r.gold.toLocaleString()})\n`;
            }
            md += `\n`;
        }

        const stealRows = (stats.steal || []).filter(r => r.amount > 0);
        if (stealRows.length > 0) {
            md += `*偷菜明细*\n\n`;
            for (const r of stealRows) {
                md += `- ${r.target}: ${r.amount.toLocaleString()} (💰 ${r.gold.toLocaleString()})\n`;
            }
            md += `\n`;
        }

        if (stealRanking && stealRanking.length > 0) {
            md += `*偷菜排行*\n\n`;
            for (let i = 0; i < Math.min(5, stealRanking.length); i++) {
                const r = stealRanking[i];
                md += `${i + 1}. ${r.friendName}: ${r.amount.toLocaleString()} (💰 ${r.gold.toLocaleString()})\n`;
            }
            md += `\n`;
        }
        md += `---\n\n`;
    }

    if (globalStealRanking && globalStealRanking.length > 0) {
        md += `### 🏆 偷菜好友排行 (全局)\n\n`;
        for (let i = 0; i < Math.min(10, globalStealRanking.length); i++) {
            const r = globalStealRanking[i];
            md += `${i + 1}. ${r.friendName}: ${r.amount.toLocaleString()} (💰 ${r.gold.toLocaleString()})\n`;
        }
    }

    return md;
}

/**
 * 生成单个账号的 HTML 区块
 */
function buildAccountSection(acc) {
    const statusColor = acc.status === 'running' ? '#67c23a' : '#909399';
    const statusDot = acc.status === 'running' ? '🟢' : '⚪';
    const { stats, stealRanking } = acc;

    const harvestTotal = (stats.harvest || []).reduce((s, r) => ({ amount: s.amount + r.amount, gold: s.gold + r.gold }), { amount: 0, gold: 0 });
    const stealTotal = (stats.steal || []).reduce((s, r) => ({ amount: s.amount + r.amount, gold: s.gold + r.gold }), { amount: 0, gold: 0 });

    // 收获明细
    const harvestRows = (stats.harvest || []).filter(r => r.amount > 0).map(r => `
        <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;">${esc(r.target)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${r.amount.toLocaleString()}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;color:#e6a23c;">💰 ${r.gold.toLocaleString()}</td>
        </tr>
    `).join('');

    // 偷菜明细
    const stealRows = (stats.steal || []).filter(r => r.amount > 0).map(r => `
        <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;">${esc(r.target)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${r.amount.toLocaleString()}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;color:#e6a23c;">💰 ${r.gold.toLocaleString()}</td>
        </tr>
    `).join('');

    // 偷菜排行 (该账号)
    const rankHtml = buildRankingTable(stealRanking, 5);

    const noData = !harvestRows && !stealRows;

    return `
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);margin-bottom:16px;">
        <!-- 账号头部 -->
        <div style="background:linear-gradient(135deg,#36d1dc,#5b86e5);padding:16px 24px;color:#fff;display:flex;align-items:center;">
            <div style="flex:1;">
                <span style="font-size:16px;font-weight:700;">${esc(acc.nickname)}</span>
                <span style="font-size:12px;opacity:0.8;margin-left:8px;">${statusDot}</span>
            </div>
            <div style="text-align:right;font-size:12px;opacity:0.9;">
                <span>Lv.${acc.level}</span>
                <span style="margin-left:12px;">EXP ${acc.exp.toLocaleString()}</span>
                <span style="margin-left:12px;">💰 ${acc.gold.toLocaleString()}</span>
            </div>
        </div>

        <div style="padding:16px 24px;">
            <!-- 该账号概览 -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                    <td width="50%" style="padding:4px;">
                        <div style="background:#f0f9eb;border-radius:8px;padding:12px;text-align:center;">
                            <div style="font-size:20px;font-weight:700;color:#67c23a;">${harvestTotal.amount.toLocaleString()}</div>
                            <div style="font-size:11px;color:#909399;margin-top:2px;">🌾 收获 | 💰 ${harvestTotal.gold.toLocaleString()}</div>
                        </div>
                    </td>
                    <td width="50%" style="padding:4px;">
                        <div style="background:#fef0f0;border-radius:8px;padding:12px;text-align:center;">
                            <div style="font-size:20px;font-weight:700;color:#f56c6c;">${stealTotal.amount.toLocaleString()}</div>
                            <div style="font-size:11px;color:#909399;margin-top:2px;">🥷 偷菜 | 💰 ${stealTotal.gold.toLocaleString()}</div>
                        </div>
                    </td>
                </tr>
            </table>

            ${noData ? '<p style="color:#909399;font-size:13px;text-align:center;margin:8px 0;">本时段暂无操作记录</p>' : ''}

            ${harvestRows ? `
            <h3 style="font-size:13px;color:#606266;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #ebeef5;">🌾 收获明细</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
                <thead>
                    <tr style="background:#f5f7fa;">
                        <th style="padding:6px 12px;text-align:left;color:#909399;font-size:12px;">作物</th>
                        <th style="padding:6px 12px;text-align:right;color:#909399;font-size:12px;">数量</th>
                        <th style="padding:6px 12px;text-align:right;color:#909399;font-size:12px;">金币</th>
                    </tr>
                </thead>
                <tbody>${harvestRows}</tbody>
                <tfoot>
                    <tr style="background:#f0f7ff;font-weight:600;">
                        <td style="padding:6px 12px;">合计</td>
                        <td style="padding:6px 12px;text-align:right;">${harvestTotal.amount.toLocaleString()}</td>
                        <td style="padding:6px 12px;text-align:right;color:#e6a23c;">💰 ${harvestTotal.gold.toLocaleString()}</td>
                    </tr>
                </tfoot>
            </table>
            ` : ''}

            ${stealRows ? `
            <h3 style="font-size:13px;color:#606266;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #ebeef5;">🥷 偷菜明细</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
                <thead>
                    <tr style="background:#f5f7fa;">
                        <th style="padding:6px 12px;text-align:left;color:#909399;font-size:12px;">来源</th>
                        <th style="padding:6px 12px;text-align:right;color:#909399;font-size:12px;">数量</th>
                        <th style="padding:6px 12px;text-align:right;color:#909399;font-size:12px;">金币</th>
                    </tr>
                </thead>
                <tbody>${stealRows}</tbody>
                <tfoot>
                    <tr style="background:#fff0f0;font-weight:600;">
                        <td style="padding:6px 12px;">合计</td>
                        <td style="padding:6px 12px;text-align:right;">${stealTotal.amount.toLocaleString()}</td>
                        <td style="padding:6px 12px;text-align:right;color:#e6a23c;">💰 ${stealTotal.gold.toLocaleString()}</td>
                    </tr>
                </tfoot>
            </table>
            ` : ''}

            ${rankHtml ? `
            <h3 style="font-size:13px;color:#606266;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #ebeef5;">🏆 偷菜排行</h3>
            ${rankHtml}
            ` : ''}
        </div>
    </div>
    `;
}

/**
 * 排行榜表格
 */
function buildRankingTable(ranking, limit = 10) {
    if (!ranking || ranking.length === 0) return '';
    const rows = ranking.slice(0, limit).map((r, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        return `
            <tr style="${i < 3 ? 'background:#fffbe6;' : ''}">
                <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center;width:36px;">${medal}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;">${esc(r.friendName)}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${r.amount.toLocaleString()}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;color:#e6a23c;">💰 ${r.gold.toLocaleString()}</td>
            </tr>
        `;
    }).join('');
    return `
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;">
            <thead>
                <tr style="background:#f5f7fa;">
                    <th style="padding:6px 12px;text-align:center;color:#909399;font-size:12px;">名次</th>
                    <th style="padding:6px 12px;text-align:left;color:#909399;font-size:12px;">好友</th>
                    <th style="padding:6px 12px;text-align:right;color:#909399;font-size:12px;">数量</th>
                    <th style="padding:6px 12px;text-align:right;color:#909399;font-size:12px;">金币</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============ 通知 ============
// 发送逻辑已提取到 notification-service.js 中兼容

module.exports = { startScheduler, stopScheduler, generateAndSendReport };
