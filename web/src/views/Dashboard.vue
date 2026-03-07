<template>
  <div class="dashboard">
    <!-- 欢迎与项目 Logo -->
    <div class="dashboard-welcome">
      <div class="welcome-logo-box">
        <img :src="'/assets/docs/Main.png'" class="welcome-logo" alt="Main Logo" />
      </div>
      <div class="welcome-text">
        <h2 class="welcome-title">农场管家 Dashboard</h2>
        <p class="welcome-desc">欢迎回来，您的自动化农场正在平稳运行中</p>
      </div>
    </div>

    <!-- 顶部统计卡片 -->
    <el-row :gutter="12" class="stats-row">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <el-icon :size="28" color="#409EFF"><User /></el-icon>
            <div>
              <div class="stat-value">{{ accounts.length }}</div>
              <div class="stat-label">总账号数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <el-icon :size="28" color="#67C23A"><CircleCheck /></el-icon>
            <div>
              <div class="stat-value">{{ runningCount }}</div>
              <div class="stat-label">运行中</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <el-icon :size="28" color="#E6A23C"><Warning /></el-icon>
            <div>
              <div class="stat-value">{{ errorCount }}</div>
              <div class="stat-label">异常</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <el-icon :size="28" color="#909399"><Remove /></el-icon>
            <div>
              <div class="stat-value">{{ stoppedCount }}</div>
              <div class="stat-label">已停止</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 账号列表 -->
    <AccountList
      :accounts="accounts"
      :loading="loading"
      @add="showAddDialog"
      @start="handleStart"
      @stop="handleStop"
      @delete="handleDelete"
      @view-logs="handleViewLogs"
      @config="handleConfig"
    />

    <!-- 添加账号对话框 (QR 扫码) -->
    <QrCodeDialog
      v-model:visible="qrDialogVisible"
      :qr-base64="qrBase64"
      :qr-status="qrStatus"
      :qr-uin="qrUin"
      @confirm="handleQrConfirm"
      @cancel="handleQrCancel"
    />

    <!-- 日志面板 -->
    <BotLogPanel
      v-model:visible="logPanelVisible"
      :uin="logPanelUin"
      :nickname="logPanelNickname"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAccounts, startQrLogin, cancelQrLogin, startBot, stopBot, deleteAccount } from '../api/index.js'
import { onEvent, offEvent } from '../socket/index.js'
import AccountList from '../components/AccountList.vue'
import QrCodeDialog from '../components/QrCodeDialog.vue'
import BotLogPanel from '../components/BotLogPanel.vue'

// ============ 账号数据 ============
const accounts = ref([])
const loading = ref(false)

const runningCount = computed(() => accounts.value.filter(a => a.status === 'running').length)
const errorCount = computed(() => accounts.value.filter(a => a.status === 'error').length)
const stoppedCount = computed(() => accounts.value.filter(a => a.status === 'stopped' || a.status === 'idle').length)

async function fetchAccounts() {
  loading.value = true
  try {
    const res = await getAccounts()
    accounts.value = res.data || []
  } catch (err) {
    ElMessage.error('获取账号列表失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

// ============ QR 扫码 ============
const qrDialogVisible = ref(false)
const qrBase64 = ref('')
const qrStatus = ref('idle') // idle | loading | pending | scanned | error
const qrUin = ref('')

function showAddDialog() {
  qrDialogVisible.value = true
  qrBase64.value = ''
  qrStatus.value = 'idle'
  qrUin.value = ''
}

async function handleQrConfirm(form) {
  const { uin, platform, farmInterval, friendInterval } = form
  qrUin.value = uin
  qrStatus.value = 'loading'
  try {
    const res = await startQrLogin(uin, { platform, farmInterval, friendInterval })
    qrBase64.value = res.data.qrBase64
    qrStatus.value = 'pending'
  } catch (err) {
    qrStatus.value = 'error'
    ElMessage.error('获取二维码失败: ' + err.message)
  }
}

function handleQrCancel() {
  if (qrUin.value && qrStatus.value === 'pending') {
    cancelQrLogin(qrUin.value).catch(() => {})
  }
  qrDialogVisible.value = false
  qrStatus.value = 'idle'
}

// ============ Bot 操作 ============
async function handleStart(uin) {
  try {
    await startBot(uin)
    ElMessage.success(`${uin} 正在启动...`)
    fetchAccounts()
  } catch (err) {
    ElMessage.error('启动失败: ' + err.message)
  }
}

async function handleStop(uin) {
  try {
    await stopBot(uin)
    ElMessage.success(`${uin} 已停止`)
    fetchAccounts()
  } catch (err) {
    ElMessage.error('停止失败: ' + err.message)
  }
}

async function handleDelete(uin) {
  try {
    await ElMessageBox.confirm(`确定要删除账号 ${uin} 吗？将同时删除所有历史数据。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteAccount(uin)
    ElMessage.success('已删除')
    fetchAccounts()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('删除失败: ' + err.message)
  }
}

function handleConfig(uin) {
  // TODO: 配置弹窗
  ElMessage.info('配置功能开发中')
}

// ============ 日志面板 ============
const logPanelVisible = ref(false)
const logPanelUin = ref('')
const logPanelNickname = ref('')

function handleViewLogs(account) {
  logPanelUin.value = account.uin
  logPanelNickname.value = account.nickname || account.uin
  logPanelVisible.value = true
}

// ============ Socket.io 实时更新 ============
function onAccountsList(data) {
  accounts.value = data || []
}

function onStatusChange(data) {
  const idx = accounts.value.findIndex(a => a.uin === data.userId)
  if (idx >= 0) {
    accounts.value[idx].status = data.newStatus
    if (data.userState) {
      Object.assign(accounts.value[idx], {
        nickname: data.userState.name || accounts.value[idx].nickname,
        level: data.userState.level,
        gold: data.userState.gold,
        exp: data.userState.exp,
        gid: data.userState.gid,
      })
    }
  } else {
    fetchAccounts()
  }
}

function onStateUpdate(data) {
  const idx = accounts.value.findIndex(a => a.uin === data.userId)
  if (idx >= 0 && data.userState) {
    const a = accounts.value[idx]
    a.status = data.status
    a.nickname = data.userState.name || a.nickname
    a.level = data.userState.level
    a.gold = data.userState.gold
    a.exp = data.userState.exp
    a.gid = data.userState.gid
  }
}

function onQrScanned(data) {
  if (data.uin === qrUin.value) {
    qrStatus.value = 'scanned'
    ElMessage.success('扫码成功，正在登录...')
    setTimeout(() => {
      qrDialogVisible.value = false
      fetchAccounts()
    }, 1500)
  }
}

function onQrExpired(data) {
  if (data.uin === qrUin.value) {
    qrStatus.value = 'error'
    ElMessage.warning(data.reason || '二维码已过期')
  }
}

function onQrError(data) {
  if (data.uin === qrUin.value) {
    qrStatus.value = 'error'
    ElMessage.error(data.reason || '扫码出错')
  }
}

onMounted(() => {
  fetchAccounts()
  onEvent('accounts:list', onAccountsList)
  onEvent('bot:statusChange', onStatusChange)
  onEvent('bot:stateUpdate', onStateUpdate)
  onEvent('qr:scanned', onQrScanned)
  onEvent('qr:expired', onQrExpired)
  onEvent('qr:error', onQrError)
})

onUnmounted(() => {
  offEvent('accounts:list', onAccountsList)
  offEvent('bot:statusChange', onStatusChange)
  offEvent('bot:stateUpdate', onStateUpdate)
  offEvent('qr:scanned', onQrScanned)
  offEvent('qr:expired', onQrExpired)
  offEvent('qr:error', onQrError)
})
</script>

<style scoped>
.dashboard {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.dashboard-welcome {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
  background: var(--bg-surface);
  padding: 20px 24px;
  border-radius: 16px;
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.welcome-logo-box {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
  border-radius: 12px;
  flex-shrink: 0;
}

.welcome-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px; /* 增加圆角 */
}

.welcome-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
}

.welcome-desc {
  font-size: 14px;
  color: var(--text-muted);
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  cursor: default;
}

.stat-card :deep(.el-card__body) {
  padding: 16px;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #909399;
}

@media (max-width: 768px) {
  .stats-row .el-col {
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 20px;
  }

  .stat-content {
    gap: 8px;
  }
}
</style>
