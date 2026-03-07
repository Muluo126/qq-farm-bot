<template>
  <div class="admin-users-view">
    <div class="section-card">
      <div class="section-header">
        <h3 class="section-title">用户管理</h3>
        <el-button type="primary" size="small" @click="openAdd">
          <el-icon style="margin-right:4px"><Plus /></el-icon>
          添加用户
        </el-button>
      </div>

      <el-table
        :data="users"
        stripe
        style="width: 100%"
        :header-cell-style="{ background: 'var(--bg-base)', color: 'var(--text-muted)', borderColor: 'var(--border)' }"
        :cell-style="{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }"
        v-loading="loading"
      >
        <el-table-column label="ID" prop="id" width="60" align="center" />
        <el-table-column label="用户名" prop="username" width="150" />
        <el-table-column label="角色" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small" effect="dark">
              {{ row.role === 'admin' ? '管理员' : '普通用户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="可访问QQ" min-width="200">
          <template #default="{ row }">
            <span v-if="row.role === 'admin'" class="hint-text">全部</span>
            <span v-else-if="row.allowedUins && row.allowedUins.length">
              {{ row.allowedUins.join(', ') }}
            </span>
            <span v-else class="hint-text">未分配</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="center">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)" :disabled="row.id === 1">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

  <!-- 全局通知渠道设置 -->
  <div class="section-card" style="margin-top: 20px;">
    <div class="section-header">
      <h3 class="section-title">🌐 全局通知渠道配置</h3>
    </div>
    <el-form :model="mailForm" label-width="120px" style="max-width: 500px;" v-loading="mailLoading">
      <el-form-item label="接收邮箱">
        <el-input
          v-model="mailForm.mailTo"
          placeholder="请输入接收邮件的邮箱地址"
          style="max-width: 320px;"
        />
      </el-form-item>
      <el-form-item label="方糖通道">
        <el-radio-group v-model="mailForm.serverChanType">
          <el-radio label="sc3">Server酱³</el-radio>
          <el-radio label="turbo">Server酱Turbo</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="方糖 SendKey">
        <el-input v-model="mailForm.serverChanKey" placeholder="请输入 SendKey" clearable style="max-width: 320px;"></el-input>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="saveMailConfig" :loading="mailSaving">保存全局配置</el-button>
      </el-form-item>
    </el-form>
    <el-alert type="info" :closable="false" style="margin-top: 8px;">
      <span>SMTP 发件配置通过环境变量 <code>MAIL_HOST</code> / <code>MAIL_USER</code> / <code>MAIL_PASS</code> 配置。此处的配置将被以下各个通知事件共享使用。</span>
    </el-alert>
  </div>

  <!-- 掉线通知设置 -->
  <div class="section-card" style="margin-top: 20px;">
    <div class="section-header">
      <h3 class="section-title">⚠️ 掉线提醒通知</h3>
    </div>
    <el-form :model="mailForm" label-width="120px" style="max-width: 500px;" v-loading="mailLoading">
      <el-form-item label="邮件推送">
        <el-switch v-model="mailForm.mailEnabled" />
        <span class="field-hint" style="margin-left: 10px;">通过全局邮箱接收账号异常断线提醒</span>
      </el-form-item>
      <el-form-item label="方糖推送">
        <el-switch v-model="mailForm.serverChanEnabled" />
        <span class="field-hint" style="margin-left: 10px;">通过全局方糖频道接收账号异常断线提醒</span>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="saveMailConfig" :loading="mailSaving">保存事件配置</el-button>
      </el-form-item>
    </el-form>
  </div>

  <!-- 汇报设置 -->
  <div class="section-card" style="margin-top: 20px;">
    <div class="section-header">
      <h3 class="section-title">📊 定时汇报通知</h3>
    </div>
    <el-form :model="reportForm" label-width="120px" style="max-width: 500px;" v-loading="reportLoading">
      <el-form-item label="每小时汇报">
        <el-switch v-model="reportForm.hourlyEnabled" />
        <span class="field-hint" style="margin-left: 10px;">每小时整点发送收获/偷菜统计</span>
      </el-form-item>
      <el-form-item label="每日汇报">
        <el-switch v-model="reportForm.dailyEnabled" />
        <span class="field-hint" style="margin-left: 10px;">每天早上 8:00 发送昨日统计汇总</span>
      </el-form-item>
      <el-divider border-style="dashed"></el-divider>
      <el-form-item label="邮件推送">
        <el-switch v-model="reportForm.pushEmailEnabled" />
        <span class="field-hint" style="margin-left: 10px;">通过全局邮箱接收</span>
      </el-form-item>
      <el-form-item label="方糖推送">
        <el-switch v-model="reportForm.serverChanEnabled" />
        <span class="field-hint" style="margin-left: 10px;">通过全局方糖频道接收</span>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="saveReportConfig" :loading="reportSaving">保存事件配置</el-button>
        <el-button @click="sendTestReport('hourly')" :loading="reportTesting" style="margin-left: 10px;">发送测试汇报</el-button>
      </el-form-item>
    </el-form>
  </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑用户' : '添加用户'"
      width="420px"
      :close-on-click-modal="false"
      class="dark-dialog"
    >
      <el-form :model="form" label-width="90px">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" :disabled="isEdit" placeholder="输入用户名" />
        </el-form-item>
        <el-form-item :label="isEdit ? '新密码' : '密码'" :required="!isEdit">
          <el-input v-model="form.password" type="password" show-password :placeholder="isEdit ? '留空则不修改' : '输入密码'" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="普通用户" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item label="可访问QQ" v-if="form.role === 'user'">
          <el-select
            v-model="form.allowedUins"
            multiple
            filterable
            allow-create
            placeholder="输入或选择QQ号"
            style="width: 100%"
          >
            <el-option v-for="uin in allUins" :key="uin" :label="uin" :value="uin" />
          </el-select>
          <div class="field-hint">管理员可访问所有账号，普通用户仅限已分配的</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">{{ isEdit ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser, getAccounts, getMailSettings, saveMailSettings, getReportSettings, saveReportSettings, testReport } from '../api/index.js'

const users = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const allUins = ref([])

const form = ref({
  id: null,
  username: '',
  password: '',
  role: 'user',
  allowedUins: [],
})

async function fetchUsers() {
  loading.value = true
  try {
    const res = await getAdminUsers()
    users.value = (res.data || []).map(u => ({
      ...u,
      // allowed_uins 是逗号分隔的字符串，不是 JSON
      allowedUins: u.allowed_uins ? u.allowed_uins.split(',').map(s => s.trim()).filter(Boolean) : [],
    }))
  } catch (e) { 
    console.error('fetchUsers error:', e)
  } finally {
    loading.value = false
  }
}

async function fetchAccounts() {
  try {
    const res = await getAccounts()
    allUins.value = (res.data || []).map(a => String(a.uin))
  } catch { /* */ }
}

function openAdd() {
  isEdit.value = false
  form.value = { id: null, username: '', password: '', role: 'user', allowedUins: [] }
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  form.value = {
    id: row.id,
    username: row.username,
    password: '',
    role: row.role,
    allowedUins: [...(row.allowedUins || [])],
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.value.username) {
    ElMessage.warning('请输入用户名')
    return
  }
  if (!isEdit.value && !form.value.password) {
    ElMessage.warning('请输入密码')
    return
  }

  saving.value = true
  try {
    const payload = {
      username: form.value.username,
      role: form.value.role,
      // 使用逗号分隔格式，不是 JSON
      allowedUins: form.value.role === 'admin' ? '' : form.value.allowedUins.join(','),
    }
    if (form.value.password) {
      payload.password = form.value.password
    }

    if (isEdit.value) {
      await updateAdminUser(form.value.id, payload)
      ElMessage.success('用户已更新')
    } else {
      payload.password = form.value.password
      await createAdminUser(payload)
      ElMessage.success('用户已创建')
    }
    dialogVisible.value = false
    fetchUsers()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || e.message)
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确定要删除用户 "${row.username}" 吗?`, '警告', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteAdminUser(row.id)
    ElMessage.success('已删除')
    fetchUsers()
  } catch { /* cancel */ }
}

// 全局和掉线设置
const mailForm = ref({ mailTo: '', mailEnabled: false, serverChanEnabled: false, serverChanType: 'sc3', serverChanKey: '' })
const mailLoading = ref(false)
const mailSaving = ref(false)

async function fetchMailSettings() {
  mailLoading.value = true
  try {
    const res = await getMailSettings()
    if (res.ok && res.data) {
      mailForm.value.mailTo = res.data.mailTo || ''
      mailForm.value.mailEnabled = !!res.data.mailEnabled
      mailForm.value.serverChanEnabled = !!res.data.serverChanEnabled
      mailForm.value.serverChanType = res.data.serverChanType || 'sc3'
      mailForm.value.serverChanKey = res.data.serverChanKey || ''
    }
  } catch { /* ignore */ } finally {
    mailLoading.value = false
  }
}

async function saveMailConfig() {
  mailSaving.value = true
  try {
    await saveMailSettings({
      mailTo: mailForm.value.mailTo,
      mailEnabled: mailForm.value.mailEnabled,
      serverChanEnabled: mailForm.value.serverChanEnabled,
      serverChanType: mailForm.value.serverChanType,
      serverChanKey: mailForm.value.serverChanKey
    })
    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    mailSaving.value = false
  }
}

// 汇报设置
const reportForm = ref({ hourlyEnabled: false, dailyEnabled: false, pushEmailEnabled: true, serverChanEnabled: false })
const reportLoading = ref(false)
const reportSaving = ref(false)
const reportTesting = ref(false)

async function fetchReportSettings() {
  reportLoading.value = true
  try {
    const res = await getReportSettings()
    if (res.ok && res.data) {
      reportForm.value.hourlyEnabled = !!res.data.hourlyEnabled
      reportForm.value.dailyEnabled = !!res.data.dailyEnabled
      reportForm.value.pushEmailEnabled = res.data.pushEmailEnabled !== false
      reportForm.value.serverChanEnabled = !!res.data.serverChanEnabled
    }
  } catch { /* ignore */ } finally {
    reportLoading.value = false
  }
}

async function saveReportConfig() {
  reportSaving.value = true
  try {
    await saveReportSettings({
      hourlyEnabled: reportForm.value.hourlyEnabled,
      dailyEnabled: reportForm.value.dailyEnabled,
      pushEmailEnabled: reportForm.value.pushEmailEnabled,
      serverChanEnabled: reportForm.value.serverChanEnabled
    })
    ElMessage.success('汇报设置已保存')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    reportSaving.value = false
  }
}

async function sendTestReport(type) {
  reportTesting.value = true
  try {
    await testReport(type)
    ElMessage.success('测试汇报已发送，请检查邮箱')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || e.message)
  } finally {
    reportTesting.value = false
  }
}

onMounted(() => {
  fetchUsers()
  fetchAccounts()
  fetchMailSettings()
  fetchReportSettings()
})
</script>

<style scoped>
.section-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.hint-text {
  color: var(--text-faint);
  font-style: italic;
}

.field-hint {
  color: var(--text-muted);
  font-size: 12px;
  margin-top: 4px;
}

/* 暗色表格 */
:deep(.el-table) {
  --el-table-bg-color: var(--bg-surface);
  --el-table-tr-bg-color: var(--bg-surface);
  --el-table-header-bg-color: var(--bg-base);
  --el-table-border-color: var(--border);
  --el-table-text-color: var(--text-secondary);
  --el-table-row-hover-bg-color: var(--bg-hover);
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: var(--bg-base);
}

/* 对话框 */
:deep(.el-dialog) {
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
}

:deep(.el-dialog__title) {
  color: var(--text);
}

:deep(.el-dialog__headerbtn .el-dialog__close) {
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .section-card {
    padding: 12px;
  }

  :deep(.el-dialog) {
    width: 92% !important;
  }
}
</style>
