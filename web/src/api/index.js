import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// 自动附加 Token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截 + 401 自动跳转登录
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (!window.location.hash.includes('/login')) {
        window.location.hash = '#/login'
      }
    }
    const msg = err.response?.data?.error || err.message
    return Promise.reject(new Error(msg))
  }
)

// ============ 认证 API ============

export function login(username, password) {
  return api.post('/auth/login', { username, password })
}

export function register(username, password) {
  return api.post('/auth/register', { username, password })
}

export function getMe() {
  return api.get('/auth/me')
}

export function changePassword(oldPassword, newPassword) {
  return api.post('/auth/change-password', { oldPassword, newPassword })
}

// ============ 账号 API ============

export function getAccounts() {
  return api.get('/accounts')
}

export function getAccount(uin) {
  return api.get(`/accounts/${uin}`)
}

export function getAccountSnapshot(uin) {
  return api.get(`/accounts/${uin}/snapshot`)
}

export function getAccountLands(uin) {
  return api.get(`/accounts/${uin}/lands`)
}

export function getAccountLogs(uin, limit = 500) {
  return api.get(`/accounts/${uin}/logs`, { params: { limit } })
}

export function getAccountStatistics(uin, hours = 24) {
  return api.get(`/accounts/${uin}/statistics`, { params: { hours } })
}

export function getAccountDailyStatistics(uin, days = 7) {
  return api.get(`/accounts/${uin}/daily-statistics`, { params: { days } })
}

// QR 登录
export function startQrLogin(uin, opts = {}) {
  return api.post(`/accounts/${uin}/qr-login`, opts)
}

export function cancelQrLogin(uin) {
  return api.post(`/accounts/${uin}/qr-cancel`)
}

// 手动添加账号（通过 authCode）
export function addAccountByCode(data) {
  return api.post('/accounts/add-by-code', data)
}

// Bot 控制
export function startBot(uin) {
  return api.post(`/accounts/${uin}/start`)
}

export function stopBot(uin) {
  return api.post(`/accounts/${uin}/stop`)
}

export function deleteAccount(uin) {
  return api.delete(`/accounts/${uin}`)
}

// 配置
export function updateAccountConfig(uin, config) {
  return api.put(`/accounts/${uin}/config`, config)
}

export function updateToggles(uin, toggles) {
  return api.put(`/accounts/${uin}/toggles`, toggles)
}

// 种植效率
export function getPlantRanking(level = 1) {
  return api.get('/plant-ranking', { params: { level } })
}

// 全部作物列表（按解锁等级排序，用于作物选择下拉框）
export function getCropList() {
  return api.get('/crop-list')
}

// 管理员
export function getAdminUsers() {
  return api.get('/admin/users')
}

export function createAdminUser(data) {
  return api.post('/admin/users', data)
}

export function updateAdminUser(id, data) {
  return api.put(`/admin/users/${id}`, data)
}

export function deleteAdminUser(id) {
  return api.delete(`/admin/users/${id}`)
}

// ============ 公告 API ============

export function getAnnouncement() {
  return api.get('/announcement')
}

export function updateAnnouncement(data) {
  return api.put('/announcement', data)
}

// ============ 邮件通知设置 API ============

export function getMailSettings() {
  return api.get('/admin/settings/mail')
}

export function saveMailSettings(data) {
  return api.put('/admin/settings/mail', data)
}

// ============ 汇报设置 API ============

export function getReportSettings() {
  return api.get('/admin/settings/report')
}

export function saveReportSettings(data) {
  return api.put('/admin/settings/report', data)
}

export function testReport(type = 'hourly') {
  return api.post('/admin/report/test', { type })
}

export function getFriends(uin) {
  return api.get(`/accounts/${uin}/friends`)
}

export default api
