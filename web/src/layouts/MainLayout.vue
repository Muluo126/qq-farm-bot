<template>
  <div class="main-layout">
    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-logo">
        <div class="logo-img-wrapper" :class="{ small: sidebarCollapsed }">
          <img :src="'/assets/docs/Main.png'" class="logo-img" alt="Logo" />
        </div>
        <span v-if="!sidebarCollapsed" class="logo-text">QQ农场助手</span>
      </div>

      <!-- 账号选择器 -->
      <div class="account-selector" v-if="!sidebarCollapsed">
        <el-select
          v-model="currentUin"
          placeholder="选择账号"
          size="small"
          @change="onAccountChange"
          style="width: 100%;"
          popper-class="dark-select-popper"
        >
      <el-option
  v-for="acc in ownAccounts"
  :key="acc.uin"
  :value="acc.uin"
  :label="acc.nickname || acc.displayUin || acc.uin"
>
  <div style="display:flex;align-items:center;gap:8px;">
    <img 
      :src="acc.avatar || `https://q1.qlogo.cn/g?b=qq&nk=${acc.uin}&s=40`" 
      style="width:22px;height:22px;border-radius:50%;" 
    />
    
    <span>{{ acc.nickname || acc.displayUin || acc.uin }}</span>
    
    <span style="margin-left:auto;">
      {{ acc.status === 'running' ? '🟢' : '⚪' }}
    </span>
  </div>
</el-option>
        </el-select>
      </div>

      <nav class="sidebar-nav">
        <div
          class="nav-item"
          :class="{ active: route.name === 'Dashboard' }"
          @click="router.push('/dashboard')"
          title="总览"
        >
          <el-icon :size="22"><HomeFilled /></el-icon>
          <span v-if="!sidebarCollapsed">总览</span>
        </div>

        <div class="nav-divider" v-if="!sidebarCollapsed">当前账号</div>
        <div
          class="nav-item"
          :class="{ active: route.name === 'AccountHome', disabled: !currentUin }"
          @click="currentUin && router.push(`/account/${currentUin}`)"
          title="首页"
        >
          <el-icon :size="22"><House /></el-icon>
          <span v-if="!sidebarCollapsed">首页</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: route.name === 'AccountLands', disabled: !currentUin }"
          @click="currentUin && router.push(`/account/${currentUin}/lands`)"
          title="土地"
        >
          <el-icon :size="22"><Grid /></el-icon>
          <span v-if="!sidebarCollapsed">土地</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: route.name === 'AccountSettings', disabled: !currentUin }"
          @click="currentUin && router.push(`/account/${currentUin}/settings`)"
          title="配置"
        >
          <el-icon :size="22"><Setting /></el-icon>
          <span v-if="!sidebarCollapsed">配置</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: route.name === 'AccountLogs', disabled: !currentUin }"
          @click="currentUin && router.push(`/account/${currentUin}/logs`)"
          title="日志"
        >
          <el-icon :size="22"><Document /></el-icon>
          <span v-if="!sidebarCollapsed">日志</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: route.name === 'AccountStats', disabled: !currentUin }"
          @click="currentUin && router.push(`/account/${currentUin}/stats`)"
          title="统计"
        >
          <el-icon :size="22"><DataLine /></el-icon>
          <span v-if="!sidebarCollapsed">统计</span>
        </div>

        <template v-if="auth.isAdmin">
          <div class="nav-divider" v-if="!sidebarCollapsed">管理</div>
          <div
            class="nav-item"
            :class="{ active: route.name === 'AdminUsers' }"
            @click="router.push('/admin/users')"
            title="用户管理"
          >
            <el-icon :size="22"><UserFilled /></el-icon>
            <span v-if="!sidebarCollapsed">用户管理</span>
          </div>
        </template>
      </nav>

      <!-- 底部 -->
      <div class="sidebar-footer">
        <div class="nav-item" @click="sidebarCollapsed = !sidebarCollapsed" title="折叠">
          <el-icon :size="20"><Fold v-if="!sidebarCollapsed" /><Expand v-else /></el-icon>
          <span v-if="!sidebarCollapsed">折叠</span>
        </div>
        <div class="connection-dot" :class="{ online: connected }" :title="connected ? '已连接' : '已断开'" />
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <header class="top-bar">
        <div class="top-bar-left">
          <el-button class="mobile-menu-btn" text @click="mobileMenuOpen = !mobileMenuOpen">
            <el-icon :size="22"><Fold /></el-icon>
          </el-button>
          <h2 class="page-title">{{ pageTitle }}</h2>
        </div>
        <div class="top-bar-right">
          <el-button
            class="announcement-btn"
            circle
            size="small"
            @click="$refs.announcementRef.open()"
            title="公告"
          >
            <el-icon :size="16"><Bell /></el-icon>
          </el-button>
          <el-button
            class="theme-toggle-btn"
            circle
            size="small"
            @click="themeStore.toggle()"
            :title="themeStore.isDark ? '切换到日间模式' : '切换到夜间模式'"
          >
            <el-icon :size="16"><Moon v-if="themeStore.isDark" /><Sunny v-else /></el-icon>
          </el-button>
          <el-tag :type="connected ? 'success' : 'danger'" effect="dark" size="small" round>
            {{ connected ? '已连接' : '已断开' }}
          </el-tag>
          <el-dropdown trigger="click">
            <span class="user-info">
              <el-icon><User /></el-icon>
              <span class="username-text">{{ auth.username }}</span>
              <el-tag v-if="auth.isAdmin" type="warning" size="small" effect="plain">管理员</el-tag>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleLogout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <div class="content-area">
        <router-view :key="route.fullPath" />
      </div>
    </main>

    <!-- 公告弹窗 -->
    <AnnouncementDialog ref="announcementRef" :is-admin="auth.isAdmin" />

    <!-- 移动端遮罩 -->
    <div class="mobile-overlay" v-if="mobileMenuOpen" @click="mobileMenuOpen = false" />
    <aside class="mobile-sidebar" :class="{ open: mobileMenuOpen }">
      <div class="sidebar-logo">
        <div class="logo-img-wrapper">
          <img :src="'/assets/docs/Main.png'" class="logo-img" alt="Logo" />
        </div>
        <span class="logo-text">QQ农场助手</span>
      </div>
      <div class="account-selector" v-if="ownAccounts.length > 0">
        <el-select v-model="currentUin" placeholder="选择账号" size="small" @change="onAccountChange" style="width:100%">
          <el-option v-for="acc in ownAccounts" :key="acc.uin" :label="`${acc.nickname || acc.displayUin || acc.uin}`" :value="acc.uin" />
        </el-select>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-item" :class="{ active: route.name === 'Dashboard' }" @click="goMobile('/dashboard')">
          <el-icon :size="22"><HomeFilled /></el-icon><span>总览</span>
        </div>
        <div class="nav-divider">当前账号</div>
        <div class="nav-item" :class="{ active: route.name === 'AccountHome', disabled: !currentUin }" @click="currentUin && goMobile(`/account/${currentUin}`)">
          <el-icon :size="22"><House /></el-icon><span>首页</span>
        </div>
        <div class="nav-item" :class="{ active: route.name === 'AccountLands', disabled: !currentUin }" @click="currentUin && goMobile(`/account/${currentUin}/lands`)">
          <el-icon :size="22"><Grid /></el-icon><span>土地</span>
        </div>
        <div class="nav-item" :class="{ active: route.name === 'AccountSettings', disabled: !currentUin }" @click="currentUin && goMobile(`/account/${currentUin}/settings`)">
          <el-icon :size="22"><Setting /></el-icon><span>配置</span>
        </div>
        <div class="nav-item" :class="{ active: route.name === 'AccountLogs', disabled: !currentUin }" @click="currentUin && goMobile(`/account/${currentUin}/logs`)">
          <el-icon :size="22"><Document /></el-icon><span>日志</span>
        </div>
        <div class="nav-item" :class="{ active: route.name === 'AccountStats', disabled: !currentUin }" @click="currentUin && goMobile(`/account/${currentUin}/stats`)">
          <el-icon :size="22"><DataLine /></el-icon><span>统计</span>
        </div>
        <template v-if="auth.isAdmin">
          <div class="nav-divider">管理</div>
          <div class="nav-item" :class="{ active: route.name === 'AdminUsers' }" @click="goMobile('/admin/users')">
            <el-icon :size="22"><UserFilled /></el-icon><span>用户管理</span>
          </div>
        </template>
      </nav>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useThemeStore } from '../stores/theme.js'
import { connected, onEvent, offEvent } from '../socket/index.js'
import { getAccounts } from '../api/index.js'
import AnnouncementDialog from '../components/AnnouncementDialog.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const themeStore = useThemeStore()

const sidebarCollapsed = ref(false)
const mobileMenuOpen = ref(false)
const accounts = ref([])
const currentUin = ref('')

// 只包含自己的账号（用于侧边栏选择器）
const ownAccounts = computed(() => accounts.value.filter(a => a.isOwn))

const pageTitle = computed(() => {
  const titles = {
    Dashboard: '总览',
    AccountHome: '首页',
    AccountLands: '土地状态',
    AccountSettings: '参数配置',
    AccountLogs: '运行日志',
    AccountStats: '统计明细',
    AdminUsers: '用户管理',
  }
  return titles[route.name] || 'QQ农场助手'
})

function goMobile(path) {
  mobileMenuOpen.value = false
  router.push(path)
}

function onAccountChange(uin) {
  if (uin && route.name !== 'Dashboard' && route.name !== 'AdminUsers') {
    router.push(`/account/${uin}`)
  }
}

async function fetchAccounts() {
  try {
    const res = await getAccounts()
    accounts.value = res.data || []
    // 如果当前选中的账号已被删除或不再属于自己
    if (currentUin.value && !ownAccounts.value.find(a => a.uin === currentUin.value)) {
      currentUin.value = ''
      if (route.name !== 'Dashboard' && route.name !== 'AdminUsers') {
        router.push('/dashboard')
      }
    }
    autoSelectFirst()
  } catch { /* ignore */ }
}

// 从路由参数同步当前 UIN
watch(() => route.params.uin, (uin) => {
  if (uin) currentUin.value = uin
}, { immediate: true })

// Socket.io 实时更新
function onAccountsList(data) {
  // Socket.io 推送的列表没有 isOwn 标记，重新通过 API 拉取
  fetchAccounts()
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
      })
    }
  } else {
    // 新账号上线，刷新列表
    fetchAccounts()
  }
}

function autoSelectFirst() {
  if (!currentUin.value && ownAccounts.value.length > 0) {
    currentUin.value = ownAccounts.value[0].uin
    // 如果在总览页，自动跳转到该账号首页
    if (route.name === 'Dashboard') {
      router.push(`/account/${ownAccounts.value[0].uin}`)
    }
  }
}

function handleLogout() {
  auth.logout()
  router.replace('/login')
}

onMounted(() => {
  fetchAccounts()
  onEvent('accounts:list', onAccountsList)
  onEvent('bot:statusChange', onStatusChange)
})

onUnmounted(() => {
  offEvent('accounts:list', onAccountsList)
  offEvent('bot:statusChange', onStatusChange)
})
</script>

<style scoped>
.main-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-base);
  transition: background 0.3s;
}

/* ============ 侧边栏 ============ */
.sidebar {
  width: 220px;
  background: var(--sidebar-bg, var(--bg-surface));
  background-color: var(--bg-surface);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.2s;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.sidebar.collapsed {
  width: 64px;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--sidebar-border);
  height: 64px;
}

.logo-img-wrapper {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  transition: all 0.2s;
}

.logo-img-wrapper.small {
  width: 28px;
  height: 28px;
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px; /* 增加圆角 */
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--sidebar-text);
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.account-selector {
  padding: 12px;
}

.account-selector :deep(.el-input__wrapper) {
  background-color: rgba(255,255,255,0.06) !important;
  box-shadow: none !important;
  border: 1px solid var(--sidebar-border) !important;
}

.account-selector :deep(.el-input__inner) {
  color: var(--sidebar-text-muted) !important;
  -webkit-text-fill-color: var(--sidebar-text-muted) !important;
}

.account-selector :deep(.el-select__suffix) {
  color: var(--sidebar-text-faint) !important;
}

.account-selector :deep(.el-select__wrapper) {
  background-color: rgba(255,255,255,0.06) !important;
  box-shadow: none !important;
  border: 1px solid var(--sidebar-border) !important;
}

.account-selector :deep(.el-select__selected-item) {
  color: var(--sidebar-text-muted) !important;
}

.account-selector :deep(.el-select__placeholder) {
  color: var(--sidebar-text-faint) !important;
}

.sidebar-nav {
  flex: 1;
  padding: 4px 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--sidebar-text-muted);
  font-size: 14px;
  transition: all 0.15s;
  margin-bottom: 2px;
  white-space: nowrap;
}

.nav-item:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-text);
}

.nav-item.active {
  background: var(--sidebar-active-bg);
  color: var(--accent);
}

.nav-item.disabled {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: none;
}

.nav-divider {
  font-size: 11px;
  color: var(--sidebar-text-faint);
  text-transform: uppercase;
  padding: 12px 12px 4px;
  letter-spacing: 0.5px;
}

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--sidebar-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.connection-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-danger);
  margin-right: 8px;
}

.connection-dot.online {
  background: var(--color-success);
}

/* ============ 主内容 ============ */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  box-shadow: var(--shadow);
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mobile-menu-btn {
  display: none;
  font-size: 20px;
  color: var(--text) !important;
  padding: 4px 8px;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.theme-toggle-btn {
  background: var(--bg-hover) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-muted) !important;
  transition: all 0.2s;
}
.theme-toggle-btn:hover {
  color: var(--accent) !important;
  border-color: var(--accent) !important;
}

.announcement-btn {
  background: var(--bg-hover) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-muted) !important;
  transition: all 0.2s;
}
.announcement-btn:hover {
  color: var(--color-warning) !important;
  border-color: var(--color-warning) !important;
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 14px;
}

.username-text {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.content-area {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

/* ============ mobile sidebar ============ */
.mobile-overlay {
  display: none;
}
.mobile-sidebar {
  display: none;
}

/* ============ 响应式 ============ */
@media (max-width: 768px) {
  .sidebar {
    display: none;
  }

  .mobile-menu-btn {
    display: inline-flex !important;
    color: var(--text-secondary);
  }

  .mobile-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 998;
  }

  .mobile-sidebar {
    display: flex;
    flex-direction: column;
    position: fixed;
    left: -260px;
    top: 0;
    bottom: 0;
    width: 260px;
    background: var(--sidebar-bg, var(--bg-surface));
    background-color: var(--bg-surface);
    border-right: 1px solid var(--sidebar-border);
    z-index: 999;
    transition: left 0.25s ease;
    overflow-y: auto;
  }

  .mobile-sidebar.open {
    left: 0;
  }

  .content-area {
    padding: 12px;
  }

  .top-bar {
    padding: 0 12px;
  }

  .page-title {
    font-size: 15px;
  }
}
</style>

<style>
/* 全局样式：下拉弹出层 (挂载到body上，scoped无法覆盖) */
.dark-select-popper {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-strong) !important;
}
.dark-select-popper .el-select-dropdown {
  background: var(--bg-surface) !important;
  border: none !important;
}
.dark-select-popper .el-select-dropdown__item {
  color: var(--text-secondary) !important;
  background: var(--bg-surface) !important;
}
.dark-select-popper .el-select-dropdown__item.is-hovering,
.dark-select-popper .el-select-dropdown__item:hover {
  background: var(--bg-hover) !important;
  color: var(--text) !important;
}
.dark-select-popper .el-select-dropdown__item.is-selected {
  color: var(--accent) !important;
  background: var(--bg-base) !important;
}
.dark-select-popper .el-popper__arrow::before {
  background: var(--bg-surface) !important;
  border-color: var(--border-strong) !important;
}
.dark-select-popper .el-scrollbar__bar {
  background: transparent;
}
.dark-select-popper .el-scrollbar__thumb {
  background: var(--border-strong) !important;
}
</style>
