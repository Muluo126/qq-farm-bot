<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="login-logo-wrapper">
          <img :src="'/assets/docs/Main.png'" class="login-logo" alt="Logo" />
        </div>
        <h1>QQ 农场助手</h1>
        <p class="login-subtitle">多账号自动化管理平台(admin)</p>
      </div>

      <!-- 登录/注册切换 -->
      <div class="tab-switch">
        <div class="tab-item" :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</div>
        <div class="tab-item" :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</div>
      </div>

      <!-- 登录表单 -->
      <el-form v-if="mode === 'login'" :model="form" @submit.prevent="handleLogin" class="login-form">
        <el-form-item>
          <el-input
            v-model="form.username"
            placeholder="用户名"
            size="large"
            :prefix-icon="User"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          :loading="loading"
          @click="handleLogin"
          style="width: 100%;"
        >
          登录
        </el-button>
      </el-form>

      <!-- 注册表单 -->
      <el-form v-else :model="regForm" @submit.prevent="handleRegister" class="login-form">
        <el-form-item>
          <el-input
            v-model="regForm.username"
            placeholder="用户名（2-20位）"
            size="large"
            :prefix-icon="User"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="regForm.password"
            type="password"
            placeholder="密码（至少4位）"
            size="large"
            show-password
            :prefix-icon="Lock"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="regForm.confirmPassword"
            type="password"
            placeholder="确认密码"
            size="large"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="handleRegister"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          :loading="loading"
          @click="handleRegister"
          style="width: 100%;"
        >
          注册
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const mode = ref('login')
const form = ref({ 
  username: 'admin', 
  password: 'admin123' 
})
const regForm = ref({ username: '', password: '', confirmPassword: '' })

// 已登录直接跳转
if (auth.isLoggedIn) router.replace('/dashboard')

async function handleLogin() {
  if (!form.value.username || !form.value.password) {
    return ElMessage.warning('请输入用户名和密码')
  }
  loading.value = true
  try {
    await auth.login(form.value.username, form.value.password)
    ElMessage.success('登录成功')
    router.replace('/dashboard')
  } catch (err) {
    ElMessage.error(err.message || '登录失败')
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  if (!regForm.value.username || !regForm.value.password) {
    return ElMessage.warning('请输入用户名和密码')
  }
  if (regForm.value.password !== regForm.value.confirmPassword) {
    return ElMessage.warning('两次密码不一致')
  }
  if (regForm.value.password.length < 4) {
    return ElMessage.warning('密码至少4位')
  }
  loading.value = true
  try {
    await auth.register(regForm.value.username, regForm.value.password)
    ElMessage.success('注册成功')
    router.replace('/dashboard')
  } catch (err) {
    ElMessage.error(err.message || '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--login-gradient);
  padding: 20px;
  transition: background 0.3s;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  padding: 40px 32px;
  box-shadow: var(--shadow-md);
}

.login-header {
  text-align: center;
  margin-bottom: 24px;
}

.login-header h1 {
  color: var(--text);
  font-size: 26px;
  margin-top: 16px;
  letter-spacing: 1px;
}

.login-logo-wrapper {
  width: 90px;
  height: 90px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.05);
  padding: 12px;
  border-radius: 20px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
}

.login-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 12px; /* 增加圆角 */
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
}

.login-subtitle {
  color: var(--text-muted);
  font-size: 14px;
  margin-top: 4px;
}

.tab-switch {
  display: flex;
  border-radius: 8px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  margin-bottom: 24px;
  overflow: hidden;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.tab-item.active {
  background: var(--accent);
  color: #fff;
}

.tab-item:not(.active):hover {
  color: var(--text);
  background: var(--bg-hover);
}

.login-form {
  margin-bottom: 8px;
}

.login-form :deep(.el-input__wrapper) {
  background: var(--bg-base);
  border: 1px solid var(--border-strong);
  box-shadow: none;
}

.login-form :deep(.el-input__inner) {
  color: var(--text);
}
</style>
