<template>
  <div class="info-panel">
    <h2>Model Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">File Name</span>
        <span class="info-value">{{ info.fileName || '-' }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">File Size</span>
        <span class="info-value">{{ info.fileSize || '-' }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Total Nodes</span>
        <span class="info-value">{{ info.totalNodes ?? '-' }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Storeys</span>
        <span class="info-value">{{ info.storeyCount ?? '-' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  info: {
    type: Object,
    default: () => ({}),
  },
})
</script>

<style scoped>
.info-panel {
  padding: 20px;
  border-bottom: 1px solid #0f3460;
}

.info-panel h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #888;
  margin-bottom: 12px;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
}

.info-label {
  color: #999;
}

.info-value {
  color: #e0e0e0;
  font-weight: 500;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
</style>
