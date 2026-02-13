import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

/**
 * Manages the Three.js scene, camera, renderer, controls, and lighting.
 * Framework-agnostic — no Vue dependency.
 */
export class SceneManager {
  constructor(container) {
    this._container = container
    this._animationId = null

    this._initScene()
    this._initCamera()
    this._initRenderer()
    this._initLights()
    this._initControls()
    this._initHelpers()

    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)

    this._animate()
  }

  // ── Public accessors ──────────────────────────────────────────────

  get scene() { return this._scene }
  get camera() { return this._camera }
  get renderer() { return this._renderer }
  get controls() { return this._controls }
  get domElement() { return this._renderer.domElement }

  // ── Initialisation (private) ──────────────────────────────────────

  _initScene() {
    this._scene = new THREE.Scene()
    this._scene.background = new THREE.Color(0x1a1a2e)

    const grid = new THREE.GridHelper(100, 100, 0x333355, 0x222244)
    grid.name = '__grid__'
    this._scene.add(grid)
  }

  _initCamera() {
    const { clientWidth, clientHeight } = this._container
    this._camera = new THREE.PerspectiveCamera(
      45,
      clientWidth / clientHeight,
      0.1,
      10000,
    )
    this._camera.position.set(20, 20, 20)
    this._camera.lookAt(0, 0, 0)
  }

  _initRenderer() {
    this._renderer = new THREE.WebGLRenderer({ antialias: true })
    const { clientWidth, clientHeight } = this._container
    this._renderer.setSize(clientWidth, clientHeight)
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this._renderer.localClippingEnabled = true
    this._container.appendChild(this._renderer.domElement)
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this._scene.add(ambient)

    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8)
    dir1.position.set(50, 50, 50)
    this._scene.add(dir1)

    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3)
    dir2.position.set(-50, 50, -50)
    this._scene.add(dir2)
  }

  _initControls() {
    this._controls = new OrbitControls(this._camera, this._renderer.domElement)
    this._controls.enableDamping = true
    this._controls.dampingFactor = 0.1
    this._controls.screenSpacePanning = true
  }

  _initHelpers() {
    const axes = new THREE.AxesHelper(5)
    axes.name = '__axes__'
    this._scene.add(axes)
  }

  // ── Animation loop ────────────────────────────────────────────────

  _animate() {
    this._animationId = requestAnimationFrame(() => this._animate())
    this._controls.update()
    this._renderer.render(this._scene, this._camera)
  }

  // ── Resize handling ───────────────────────────────────────────────

  _onResize() {
    const { clientWidth, clientHeight } = this._container
    if (clientWidth === 0 || clientHeight === 0) return
    this._camera.aspect = clientWidth / clientHeight
    this._camera.updateProjectionMatrix()
    this._renderer.setSize(clientWidth, clientHeight)
  }

  // ── Public API ────────────────────────────────────────────────────

  addObject(object) {
    this._scene.add(object)
  }

  removeObject(object) {
    this._scene.remove(object)
  }

  /**
   * Adjust camera so that the given object fills the viewport.
   */
  frameObject(object) {
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return

    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = this._camera.fov * (Math.PI / 180)
    const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.5

    this._controls.target.copy(center)
    this._camera.position.set(
      center.x + distance * 0.5,
      center.y + distance * 0.5,
      center.z + distance * 0.5,
    )
    this._camera.lookAt(center)
    this._controls.update()
  }

  resetView() {
    this._camera.position.set(20, 20, 20)
    this._controls.target.set(0, 0, 0)
    this._controls.update()
  }

  /**
   * Toggle wireframe rendering on all model meshes.
   */
  setWireframe(enabled) {
    this._scene.traverse((child) => {
      if (!child.isMesh || child.name.startsWith('__')) return
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material]
      materials.forEach((m) => { m.wireframe = enabled })
    })
  }

  /**
   * Toggle X-Ray (semi-transparent) rendering on all model meshes.
   */
  setXRay(enabled) {
    this._scene.traverse((child) => {
      if (!child.isMesh || child.name.startsWith('__')) return
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material]
      materials.forEach((m) => {
        m.transparent = enabled
        m.opacity = enabled ? 0.3 : 1.0
        m.depthWrite = !enabled
      })
    })
  }

  /**
   * Raycast from a pointer event against the given targets.
   * Returns the first intersection or null.
   */
  raycast(event, targets) {
    const rect = this._renderer.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this._camera)
    const intersects = raycaster.intersectObjects(targets, true)
    return intersects.length > 0 ? intersects[0] : null
  }

  dispose() {
    window.removeEventListener('resize', this._onResize)
    if (this._animationId) {
      cancelAnimationFrame(this._animationId)
    }
    this._controls.dispose()
    this._renderer.dispose()
    if (this._renderer.domElement.parentElement) {
      this._renderer.domElement.parentElement.removeChild(this._renderer.domElement)
    }
  }
}
