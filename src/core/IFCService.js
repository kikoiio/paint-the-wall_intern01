import { IFCLoader } from 'web-ifc-three/IFCLoader'

/**
 * Handles IFC file loading, parsing, and property queries.
 * Framework-agnostic — no Vue dependency.
 */
export class IFCService {
  constructor() {
    this._loader = new IFCLoader()
    this._currentModel = null
    this._currentModelID = null
    this._initialized = false
  }

  // ── Public accessors ──────────────────────────────────────────────

  get loader() { return this._loader }
  get ifcManager() { return this._loader.ifcManager }
  get currentModel() { return this._currentModel }
  get currentModelID() { return this._currentModelID }

  // ── Initialisation ────────────────────────────────────────────────

  /**
   * Set the WASM path. Must be called before loading any file.
   * @param {string} wasmPath - URL path to the directory containing web-ifc WASM files.
   */
  async init(wasmPath = '/') {
    if (this._initialized) return
    this._loader.ifcManager.ifcAPI.SetWasmPath(wasmPath, true)
    this._initialized = true
  }

  // ── File loading ──────────────────────────────────────────────────

  /**
   * Load an IFC file and return the parsed Three.js model.
   * @param {File} file - File object from an <input type="file">
   * @param {Function} [onProgress] - Callback (loaded, total) for progress tracking
   * @returns {Promise<{model: Object3D, modelID: number}>}
   */
  loadFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)

      this._loader.load(
        url,
        (model) => {
          URL.revokeObjectURL(url)
          this._currentModel = model
          this._currentModelID = model.modelID
          resolve({ model, modelID: model.modelID })
        },
        (progress) => {
          if (onProgress && progress.total > 0) {
            onProgress(progress.loaded, progress.total)
          }
        },
        (error) => {
          URL.revokeObjectURL(url)
          reject(error)
        },
      )
    })
  }

  // ── Model queries ─────────────────────────────────────────────────

  /**
   * Retrieve spatial-structure tree and compute summary statistics.
   * @param {number} modelID
   * @returns {Promise<{totalNodes: number, storeyCount: number, tree: object}>}
   */
  async getModelStats(modelID) {
    const tree = await this._loader.ifcManager.getSpatialStructure(modelID)
    let totalNodes = 0
    let storeyCount = 0

    function walk(node) {
      totalNodes++
      if (node.type === 'IFCBUILDINGSTOREY') {
        storeyCount++
      }
      if (node.children) {
        node.children.forEach(walk)
      }
    }

    walk(tree)
    return { totalNodes, storeyCount, tree }
  }

  /**
   * Get all properties of a specific IFC element.
   * @param {number} modelID
   * @param {number} expressID
   */
  async getItemProperties(modelID, expressID) {
    return await this._loader.ifcManager.getItemProperties(modelID, expressID, true)
  }

  /**
   * Resolve a face index from a raycast hit to an IFC Express ID.
   * @param {BufferGeometry} geometry
   * @param {number} faceIndex
   */
  getExpressId(geometry, faceIndex) {
    return this._loader.ifcManager.getExpressId(geometry, faceIndex)
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  unloadModel() {
    this._currentModel = null
    this._currentModelID = null
  }

  dispose() {
    this.unloadModel()
  }
}
