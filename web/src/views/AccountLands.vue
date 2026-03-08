<template>
  <div class="lands-view" v-loading="loading">
    <!-- 顶部概览 -->
    <div class="lands-header" v-if="landData">
      <h3 class="section-title">土地状态</h3>
      <span class="lands-meta">共 {{ landData.unlockedCount }} 块土地 &nbsp; 更新于 {{ formatTime(landData.updatedAt) }}</span>
    </div>

    <!-- 状态统计 -->
    <div class="land-summary" v-if="landData">
      <div class="summary-item harvestable">
        <div class="summary-value">{{ landData.harvestable }}</div>
        <div class="summary-label">可收获</div>
      </div>
      <div class="summary-item growing">
        <div class="summary-value">{{ landData.growing }}</div>
        <div class="summary-label">生长中</div>
      </div>
      <div class="summary-item empty">
        <div class="summary-value">{{ landData.empty }}</div>
        <div class="summary-label">空地</div>
      </div>
      <div class="summary-item attention">
        <div class="summary-value">{{ landData.needAttention }}</div>
        <div class="summary-label">需处理</div>
      </div>
      <div class="summary-item locked">
        <div class="summary-value">{{ landData.lockedCount }}</div>
        <div class="summary-label">未解锁</div>
      </div>
    </div>

    <!-- 刷新按钮 -->
    <div class="toolbar" v-if="landData">
      <el-button size="small" :icon="Refresh" @click="fetchLands" :loading="loading">刷新</el-button>
    </div>

    <!-- 土地卡片网格 -->
    <div class="land-grid" v-if="landData">
      <div
        v-for="land in landData.lands"
        :key="land.id"
        class="land-card"
        :class="[land.status || 'locked', `soil-${land.soilType}`, { 'has-issue': land.needWater || land.needWeed || land.needBug }]"
      >
        <div class="land-card-header">
          <span class="land-id">#{{ land.id }}</span>
          <el-tag
            v-if="getSoilName(land.soilType)"
            :type="getSoilColor(land.soilType)"
            size="small"
            round
            effect="dark"
            class="soil-tag"
          >{{ getSoilName(land.soilType) }}</el-tag>
          <span class="land-status-text">{{ getStatusText(land) }}</span>
        </div>

        <div class="land-content">
          <template v-if="land.unlocked && land.status !== 'empty'">
            <div class="land-plant-info">
              <div class="plant-icon-wrapper">
                <img v-if="land.iconFile" :src="`/assets/crops/${land.iconFile}`" class="plant-icon" />
                <div v-else class="plant-icon-placeholder">🌱</div>
              </div>
              <div class="plant-text-info">
                <div class="land-plant-name">{{ land.plantName || '-' }}</div>
                <div class="land-phase">
                  {{ land.phaseName || '' }}
                  <span v-if="land.totalSeasons > 1" class="season-info">
                    第 {{ land.currentSeason }}/{{ land.totalSeasons }} 季
                  </span>
                </div>
              </div>
            </div>

            <div class="land-progress-box">
              <div class="progress-label">
                <span>成长进度</span>
                <span class="progress-percent" v-if="land.progress">{{ land.progress }}%</span>
              </div>
              <el-progress 
                :percentage="parseFloat(land.progress || 0)" 
                :status="land.status === 'harvestable' ? 'success' : ''"
                :stroke-width="8"
                :show-text="false"
                striped
                striped-flow
              />
              <div class="land-time" v-if="land.timeLeftSec">
                ⏰ 剩余: {{ formatTimeLeft(land.timeLeftSec) }}
              </div>
            </div>

            <div class="land-issues" v-if="land.needWater || land.needWeed || land.needBug">
              <el-tooltip content="干旱" v-if="land.needWater"><span class="issue-icon">💦</span></el-tooltip>
              <el-tooltip content="杂草" v-if="land.needWeed"><span class="issue-icon">🌿</span></el-tooltip>
              <el-tooltip content="害虫" v-if="land.needBug"><span class="issue-icon">🐛</span></el-tooltip>
            </div>
          </template>

          <template v-else-if="!land.unlocked">
            <div class="land-center-state">
              <div class="state-icon">🔒</div>
              <div class="state-text">未解锁</div>
            </div>
          </template>

          <template v-else>
            <div class="land-center-state">
              <div class="state-icon">🕳️</div>
              <div class="state-text">空地</div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="!landData && !loading" class="empty-state">
      <el-empty description="Bot 未运行或暂无土地数据">
        <el-button type="primary" @click="fetchLands">重试</el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { getAccountLands } from '../api/index.js'

const props = defineProps({ uin: String })

const loading = ref(false)
const landData = ref(null)

async function fetchLands() {
  loading.value = true
  try {
    const res = await getAccountLands(props.uin)
    landData.value = res.data
  } catch { landData.value = null }
  finally { loading.value = false }
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString()
}

function formatTimeLeft(sec) {
  if (!sec || sec <= 0) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}小时${m}分钟${s}秒`
  if (m > 0) return `${m}分钟${s}秒`
  return `${s}秒`
}

function getStatusText(land) {
  if (!land.unlocked) return ''
  const map = { harvestable: '可收获', growing: '生长中', empty: '空地', dead: '已枯死' }
  return map[land.status] || ''
}

function getSoilName(type) {
  const map = { 1: '普通', 2: '红土地', 3: '黑土地', 4: '金土地', 5: '翡翠', 6: '蓝宝石' }
  return map[type] || ''
}

function getSoilColor(type) {
  const map = { 1: 'info', 2: 'danger', 3: 'warning', 4: 'warning', 5: 'success', 6: 'primary' }
  return map[type] || 'info'
}

onMounted(fetchLands)
</script>

<style scoped>
.lands-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}

.lands-meta {
  color: var(--text-muted);
  font-size: 13px;
}

.land-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.summary-item {
  flex: 1;
  min-width: 100px;
  text-align: center;
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.summary-value {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 4px;
}

.summary-label {
  font-size: 13px;
  color: var(--text-muted);
}

.summary-item.harvestable .summary-value { color: var(--color-success); }
.summary-item.growing .summary-value { color: var(--accent); }
.summary-item.empty .summary-value { color: var(--text-muted); }
.summary-item.attention .summary-value { color: var(--color-warning); }
.summary-item.locked .summary-value { color: var(--color-danger); }

.toolbar {
  margin-bottom: 12px;
}

.land-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.land-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 16px;
  min-height: 180px;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.land-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

/* 土地颜色增强 */
.land-card.soil-2 { border-left: 6px solid #f56c6c; } /* 红 */
.land-card.soil-3 { border-left: 6px solid #333333; } /* 黑 */
.land-card.soil-4 { border-left: 6px solid #e6a23c; } /* 金 */
.land-card.soil-5 { border-left: 6px solid #67c23a; } /* 翡 */
.land-card.soil-6 { border-left: 6px solid #409eff; } /* 蓝 */

.land-card.harvestable {
  background: linear-gradient(135deg, var(--bg-surface) 0%, rgba(103, 194, 58, 0.1) 100%);
  border-color: rgba(103, 194, 58, 0.4);
}

.land-card.has-issue {
  background: linear-gradient(135deg, var(--bg-surface) 0%, rgba(230, 162, 60, 0.05) 100%);
}

.land-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.land-id {
  font-family: monospace;
  font-weight: 700;
  color: var(--text-muted);
  font-size: 14px;
}

.soil-tag {
  font-size: 11px;
  height: 20px;
  line-height: 18px;
}

.land-status-text {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
  font-weight: 500;
}

.land-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.land-plant-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 15px;
}

.plant-icon-wrapper {
  width: 58px;
  height: 58px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: visible; /* 允许阴影溢出 */
}

.plant-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  /* 增加微妙的投影，使图标更有立体感且不突兀 */
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
  transition: transform 0.3s ease;
}

.land-card:hover .plant-icon {
  transform: scale(1.1) rotate(5deg);
}

.plant-icon-placeholder {
  font-size: 24px;
}

.plant-text-info {
  display: flex;
  flex-direction: column;
}

.land-plant-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}

.land-phase {
  font-size: 13px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}

.season-info {
  font-size: 11px;
  background: var(--bg-hover);
  color: var(--color-warning);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid rgba(230, 162, 60, 0.2);
}

.land-progress-box {
  background: var(--bg-hover);
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 8px;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
  font-weight: 600;
}

.progress-percent {
  color: var(--accent);
}

.land-time {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
  font-weight: 500;
}

.land-issues {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 4px;
}

.issue-icon {
  font-size: 16px;
  background: var(--bg-surface);
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  cursor: help;
}

.land-center-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
}

.state-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.state-text {
  font-size: 14px;
  color: var(--text-muted);
  font-weight: 500;
}

.land-card.locked { opacity: 0.5; filter: grayscale(1); }

@media (max-width: 768px) {
  .land-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
