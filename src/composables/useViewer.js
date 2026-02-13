import { ref, reactive, onBeforeUnmount } from 'vue'
import { SceneManager } from '../core/SceneManager'
import { IFCService } from '../core/IFCService'

/**
 * Composable that bridges the core services (SceneManager + IFCService)
 * with Vue's reactivity system.
 */
export function useViewer() {
  let sceneManager = null
  const ifcService = new IFCService()

  // ── Reactive state ────────────────────────────────────────────────

  const loading = ref(false)
  const modelLoaded = ref(false)
  const progressText = ref('')
  const errorMessage = ref('')
  const wireframe = ref(false)
  const xray = ref(false)

  const modelInfo = reactive({
    fileName: '',
    fileSize: '',
    totalNodes: null,
    storeyCount: null,
  })

  // ── Actions ───────────────────────────────────────────────────────

  async function initScene(container) {
    sceneManager = new SceneManager(container)
    await ifcService.init('/')
  }

  async function loadFile(file) {
    if (!sceneManager) return

    // Remove previous model
    if (ifcService.currentModel) {
      sceneManager.removeObject(ifcService.currentModel)
      ifcService.unloadModel()
    }

    loading.value = true
    modelLoaded.value = false
    errorMessage.value = ''
    progressText.value = ''
    wireframe.value = false
    xray.value = false

    try {
      const { model, modelID } = await ifcService.loadFile(file, (loaded, total) => {
        const pct = Math.round((loaded / total) * 100)
        progressText.value = `${pct}%`
      })

      sceneManager.addObject(model)
      sceneManager.frameObject(model)
      modelLoaded.value = true

      // Populate model info
      modelInfo.fileName = file.name
      modelInfo.fileSize = formatFileSize(file.size)

      try {
        const stats = await ifcService.getModelStats(modelID)
        modelInfo.totalNodes = stats.totalNodes
        modelInfo.storeyCount = stats.storeyCount
      } catch (e) {
        console.warn('Could not retrieve model stats:', e)
        modelInfo.totalNodes = null
        modelInfo.storeyCount = null
      }
    } catch (err) {
      console.error('Failed to load IFC file:', err)
      errorMessage.value = 'Failed to load IFC file. Please check the file format.'
      setTimeout(() => { errorMessage.value = '' }, 5000)
    } finally {
      loading.value = false
      progressText.value = ''
    }
  }

  function toggleWireframe() {
    wireframe.value = !wireframe.value
    sceneManager?.setWireframe(wireframe.value)
  }

  function toggleXRay() {
    xray.value = !xray.value
    sceneManager?.setXRay(xray.value)
  }

  function resetView() {
    if (ifcService.currentModel) {
      sceneManager?.frameObject(ifcService.currentModel)
    } else {
      sceneManager?.resetView()
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  onBeforeUnmount(() => {
    sceneManager?.dispose()
    ifcService.dispose()
  })

  return {
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
  }
}
