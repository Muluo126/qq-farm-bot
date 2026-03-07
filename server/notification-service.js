const https = require('https');
const emailService = require('./email-service');
const db = require('./database');

async function sendServerChan(type, sendKey, title, desp) {
    return new Promise((resolve, reject) => {
        let options;
        const postData = new URLSearchParams({ title, desp }).toString();

        if (type === 'turbo') {
            options = {
                hostname: 'sctapi.ftqq.com',
                path: `/${sendKey}.send`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
        } else {
            const uidMatch = sendKey.match(/^sctp(\d+)t/i);
            const host = uidMatch ? `${uidMatch[1]}.push.ft07.com` : 'push.ft07.com';
            options = {
                hostname: host,
                path: `/send/${sendKey}.send`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.code !== 0) {
                        return reject(new Error(result.message || 'ServerChan API Error'));
                    }
                    resolve(result);
                } catch (e) {
                    reject(new Error(`Failed to parse ServerChan response: ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

/**
 * 通用推送方法
 * @param {string} title - 标题
 * @param {string} md - Markdown 格式文本内容 (方糖会直接使用，邮件会将 Markdown 转 HTML)
 * @param {string} html - 可选，邮件可以直接使用 HTML。如果未提供，会自动从 md 转换
 * @param {object} options - 开关选项 { useEmail: true/false, useSc: true/false }
 */
async function pushNotification(title, md, html, options = {}) {
    const { useEmail, useSc } = options;
    const mailSettings = db.getMailSettings(); // 读取全局通知配置

    let tasks = [];

    if (useEmail && mailSettings.mailTo) {
        let finalHtml = html;
        if (!finalHtml) {
            // 简单的 markdown 换行到 br 转换 (如果有复杂的 markdown 建议引入 markeed 等库，这里由于之前都是直接传 html，兼容处理)
            finalHtml = md.replace(/\n/g, '<br/>');
        }

        tasks.push(
            emailService.sendWithRetry(mailSettings.mailTo, title, finalHtml)
                .then(() => console.log(`[推送] ${title} - 邮件发送成功`))
                .catch(err => console.error(`[推送] ${title} - 邮件发送失败: ${err.message}`))
        );
    }

    if (useSc && mailSettings.serverChanKey) {
        tasks.push(
            sendServerChan(mailSettings.serverChanType, mailSettings.serverChanKey, title, md)
                .then(() => console.log(`[推送] ${title} - ServerChan 发送成功`))
                .catch(err => console.error(`[推送] ${title} - ServerChan 发送失败: ${err.message}`))
        );
    }

    if (tasks.length > 0) {
        await Promise.all(tasks);
    }
}

module.exports = { pushNotification, sendServerChan };
