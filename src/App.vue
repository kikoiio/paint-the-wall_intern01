<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>BIM IFC Viewer</h1>
        <p class="subtitle">Wall-Painting Robot Path Planner</p>
      </div>

      <FileUploader
        :loading="loading"
        @file-selected="handleFileSelected"
      />

      <ViewToolbar
        v-if="modelLoaded"
        :wireframe="wireframe"
        :xray="xray"
        @toggle-wireframe="toggleWireframe"
        @toggle-xray="toggleXRay"
        @reset-view="resetView"
      />

      <ModelInfoPanel
        v-if="modelLoaded"
        :info="modelInfo"
      />
    </aside>

    <main class="viewer-area">
      <ViewerCanvas ref="viewerCanvas" />

      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p>Loading IFC model... {{ progressText }}</p>
      </div>

      <div v-if="errorMessage" class="error-banner">
        {{ errorMessage }}
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import FileUploader from './components/FileUploader.vue'
import ViewerCanvas from './components/ViewerCanvas.vue'
import ModelInfoPanel from './components/ModelInfoPanel.vue'
import ViewToolbar from './components/ViewToolbar.vue'
import { useViewer } from './composables/useViewer'

const viewerCanvas = ref(null)

const {
  loading,
  modelLoaded,
  modelInfo,
  errorMessage,
  progressText,
  wireframe,
  xray,
  loadFile,
  toggleWireframe,
  toggleXRay,
  resetView,
  initScene,
} = useViewer()

onMounted(() => {
  const container = viewerCanvas.value?.container
  if (container) {
    initScene(container)
  }
})

function handleFileSelected(file) {
  loadFile(file)
}
</script>

<style scoped>
.app-layout {
  display: flex;
  width: 100%;
  height: 100%;
}

.sidebar {
  width: 300px;
  min-width: 300px;
  background: #16213e;
  border-right: 1px solid #0f3460;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid #0f3460;
}

.sidebar-header h1 {
  font-size: 18px;
  font-weight: 600;
  color: #e94560;
}

.sidebar-header .subtitle {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.viewer-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #333;
  border-top: 4px solid #e94560;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-overlay p {
  color: #ccc;
  font-size: 14px;
}

.error-banner {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #e94560;
  color: white;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  z-index: 10;
  white-space: nowrap;
}
</style>
