/**
 * email-service.js - 邮件通知服务
 * 使用 nodemailer + QQ邮箱 SMTP 发送掉线提醒
 *
 * SMTP 配置通过环境变量读取：
 *   MAIL_HOST - SMTP 服务器 (默认 smtp.qq.com)
 *   MAIL_PORT - SMTP 端口 (默认 587)
 *   MAIL_USER - 发件邮箱
 *   MAIL_PASS - 邮箱授权码
 */

const nodemailer = require('nodemailer');

const MAIL_HOST = process.env.MAIL_HOST || 'smtp.qq.com';
const MAIL_PORT = parseInt(process.env.MAIL_PORT || '587');
const MAIL_USER = process.env.MAIL_USER || '';
const MAIL_PASS = process.env.MAIL_PASS || '';

/** 懒加载 transporter，只在真正需要发邮件时创建 */
let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    if (!MAIL_USER || !MAIL_PASS) {
        return null;
    }
    transporter = nodemailer.createTransport({
        host: MAIL_HOST,
        port: MAIL_PORT,
        secure: MAIL_PORT === 465, // 465 端口使用 SSL 直连
        auth: { user: MAIL_USER, pass: MAIL_PASS },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
    });
    return transporter;
}

/**
 * 发送账号掉线通知邮件
 * @param {string} uin - 账号 QQ 号
 * @param {string} nickname - 账号昵称
 * @param {string} reason - 掉线原因（errorMessage）
 * @param {string} to - 接收邮件的地址（从数据库设置中读取）
 */
async function sendDisconnectAlert(uin, nickname, reason, to) {
    if (!to) {
        console.warn('[邮件] 未配置接收邮箱，跳过通知');
        return;
    }
    const transport = getTransporter();
    if (!transport) {
        console.warn('[邮件] SMTP 未配置 (MAIL_USER / MAIL_PASS)，跳过通知');
        return;
    }

    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const subject = `⚠️ QQ农场机器人掉线提醒 - ${nickname || uin}`;
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
                        <td style="padding: 8px 12px;">${now}</td>
                    </tr>
                    <tr style="background: #f5f7fa;">
                        <td style="padding: 8px 12px; font-weight: bold;">原因</td>
                        <td style="padding: 8px 12px; color: #f56c6c;">${reason || '未知'}</td>
                    </tr>
                </table>
                <p style="margin-top: 16px; color: #909399; font-size: 13px;">此邮件由 QQ Farm Bot 自动发送，请勿直接回复。</p>
            </div>
        </div>
    `;

    try {
        await transport.sendMail({
            from: `"QQ农场机器人" <${MAIL_USER}>`,
            to,
            subject,
            html,
        });
        console.log(`[邮件] 掉线通知已发送至 ${to}`);
    } catch (err) {
        console.error(`[邮件] 发送失败: ${err.message}`);
    }
}

/**
 * 通用邮件发送方法 (供汇报等模块复用)
 * @param {{ to: string, subject: string, html: string }} options
 */
async function sendMail({ to, subject, html }) {
    if (!to) throw new Error('收件人不能为空');
    const transport = getTransporter();
    if (!transport) throw new Error('SMTP 未配置 (MAIL_USER / MAIL_PASS)');
    await transport.sendMail({
        from: `"QQ农场机器人" <${MAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * 带有重试机制的发送
 */
async function sendWithRetry(to, subject, html, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await sendMail({ to, subject, html });
            return;
        } catch (err) {
            console.error(`[邮件] 发送失败 (第${attempt}/${maxRetries}次): ${err.message}`);
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 3000 * attempt));
            } else {
                throw err;
            }
        }
    }
}

module.exports = { sendDisconnectAlert, sendMail, sendWithRetry };
