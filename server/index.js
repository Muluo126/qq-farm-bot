/**
 * Web 服务器入口 - Express + Socket.io
 *
 *  启动方式: node server/index.js
 *  默认端口: 3000  (可通过 PORT 环境变量覆盖)
 */

// 加载 .env 配置（本地开发，不影响已有环境变量）
require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server: SocketServer } = require('socket.io');

// ---------- 初始化 Proto & 游戏配置 (共享只读资源) ----------
const { loadProto } = require('../src/proto');
const gameConfig = require('../src/gameConfig');

// ---------- 数据库 ----------
const db = require('./database');

// ---------- BotManager ----------
const { botManager } = require('./bot-manager');

// ---------- 路由 ----------
const apiRoutes = require('./routes');

// ---------- 汇报服务 ----------
const { startScheduler: startReportScheduler, stopScheduler: stopReportScheduler } = require('./report-service');

const PORT = process.env.PORT || 3000;

async function main() {
    // 1. 加载 Proto 定义 (所有 Bot 实例共享)
    await loadProto();
    console.log('[Server] Proto 定义已加载');

    // 2. 加载游戏配置
    gameConfig.loadConfigs();

    // 3. 初始化数据库
    await db.initDatabase();
    db.ensureDefaultAdmin();

    // 4. 创建 Express 应用
    const app = express();
    app.use(express.json());

    // CORS (开发模式下允许 Vite 开发服务器跨域)
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });

    // API 路由
    app.use('/api', apiRoutes);

    // 静态资源 - 游戏图片 (图标)
    const iconPath = path.join(__dirname, '..', 'gameConfig', 'seed_images_named');
    if (fs.existsSync(iconPath)) {
        app.use('/assets/crops', express.static(iconPath));
        console.log(`[Server] 作物图标目录已映射: /assets/crops -> ${iconPath}`);
    }

    // 静态资源 - 项目图片
    const docsImgPath = path.join(__dirname, '..', 'docs', 'images');
    if (fs.existsSync(docsImgPath)) {
        app.use('/assets/docs', express.static(docsImgPath));
    }

    // 静态文件 - 前端打包产物
    const distPath = path.join(__dirname, '..', 'web', 'dist');
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        // SPA fallback
        app.get('*', (req, res) => {
            if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
                res.sendFile(path.join(distPath, 'index.html'));
            }
        });
    } else {
        console.log('[Server] 前端未构建, 请运行 npm run build:web');
    }

    // 5. 创建 HTTP 服务器 & Socket.io
    const server = http.createServer(app);
    const io = new SocketServer(server, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    // 让路由可以广播 socket 事件
    app.locals.io = io;

    // ============================================================
    //  Socket.io 事件桥接
    // ============================================================

    const { maskAccountsPublic } = require('./account-utils');

    io.on('connection', (socket) => {
        console.log(`[Socket.io] 客户端连接: ${socket.id}`);

        // 客户端连接后立即推送当前所有账号状态
        socket.emit('accounts:list', maskAccountsPublic(botManager.listAccounts()));

        // 客户端可以请求特定账号的日志
        socket.on('logs:subscribe', (uin) => {
            socket.join(`logs:${uin}`);
            // 推送历史日志
            const logs = botManager.getBotLogs(uin, 200);
            socket.emit('logs:history', { uin, logs });
        });

        socket.on('logs:unsubscribe', (uin) => {
            socket.leave(`logs:${uin}`);
        });

        socket.on('disconnect', () => {
            // console.log(`[Socket.io] 客户端断开: ${socket.id}`);
        });
    });

    // BotManager 事件 → Socket.io 广播
    botManager.on('botLog', (entry) => {
        // 发送到订阅了该用户日志的 room
        io.to(`logs:${entry.userId}`).emit('bot:log', entry);
        // 也广播给所有连接（用于仪表盘概览日志）
        io.emit('bot:log:all', entry);
    });

    botManager.on('botStatusChange', (data) => {
        io.emit('bot:statusChange', data);
    });

    botManager.on('botStateUpdate', (data) => {
        io.emit('bot:stateUpdate', data);
    });

    botManager.on('qrExpired', (data) => {
        io.emit('qr:expired', data);
    });

    botManager.on('qrScanned', (data) => {
        io.emit('qr:scanned', data);
    });

    botManager.on('qrError', (data) => {
        io.emit('qr:error', data);
    });

    botManager.on('qrCancelled', (data) => {
        io.emit('qr:cancelled', data);
    });

    botManager.on('botError', (data) => {
        io.emit('bot:error', data);
    });

    // 6. 自动启动之前配置了 auto_start 的 Bot
    await botManager.autoStartBots();

    // 7. 启动汇报调度器
    startReportScheduler(botManager);

    // 7. 启动 HTTP 服务器
    server.listen(PORT, () => {
        console.log('');
        console.log('=========================================');
        console.log(`  QQ Farm Bot Web 管理平台`);
        console.log(`  http://localhost:${PORT}`);
        console.log('=========================================');
        console.log('');
    });

    // 8. 优雅退出
    const gracefulShutdown = () => {
        console.log('\n[Server] 正在关闭...');
        stopReportScheduler();
        botManager.shutdown();
        db.closeDatabase();
        // 先关闭所有 Socket.io 连接
        io.close(() => {
            server.close(() => {
                console.log('[Server] 已关闭');
                process.exit(0);
            });
        });
        // Windows 下 SIGINT 不可靠，强制 2 秒后退出
        setTimeout(() => process.exit(0), 2000);
    };
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
}

main().catch(err => {
    console.error('[Server] 启动失败:', err);
    process.exit(1);
});
