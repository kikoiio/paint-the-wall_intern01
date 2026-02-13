# BIM IFC Viewer - 实现指南

本文档描述了 BIM IFC 查看器的完整实现，涵盖了架构决策、每个模块的设计、从文件选择到 3D 渲染的数据流，以及构建工具链的配置。

---

## 目录

1. [技术选型](#1-技术选型)
2. [构建工具链](#2-构建工具链)
3. [WASM 二进制文件管理](#3-wasm-二进制文件管理)
4. [应用程序入口点](#4-应用程序入口点)
5. [架构：三层设计](#5-架构三层设计)
6. [核心层：SceneManager](#6-核心层scenemanager)
7. [核心层：IFCService](#7-核心层ifcservice)
8. [组合层：useViewer](#8-组合层useviewer)
9. [组件层](#9-组件层)
10. [完整数据流](#10-完整数据流)
11. [IFC 解析流程 (web-ifc 内部机制)](#11-ifc-解析流程)
12. [渲染流程 (Three.js 内部机制)](#12-渲染流程)
13. [关键实现细节](#13-关键实现细节)
14. [已知限制和未来方向](#14-已知限制和未来方向)

---

## 1. 技术选型

### 为什么选择 Vue 3 + Composition API

Vue 3 提供了一个轻量级的响应式系统。Composition API（相对于 Options API）允许将所有与查看器相关的逻辑分组到一个单一的 `useViewer` composable 中，从而保持核心 3D 引擎与 UI 框架解耦。

### 为什么选择 Three.js 0.149.0

Three.js 是最广泛使用的 WebGL 库。版本 0.149.0 被固定以匹配 `web-ifc-three@0.0.124` 的 peer dependency，后者专门依赖 `three@^0.149.0`。此版本包含 `BufferGeometryUtils.mergeBufferGeometries`，`web-ifc-three` 内部使用它来合并 IFC 几何体。

### 为什么选择 web-ifc + web-ifc-three

- **web-ifc** 是一个编译为 WebAssembly 的 C++ IFC 解析器。它直接在浏览器中以接近原生的速度解析原始 IFC STEP 文件（`.ifc`），无需任何服务器端处理。
- **web-ifc-three** 是官方桥接库，它将 web-ifc 输出（扁平网格数据、材质索引）转换为 Three.js 的 `BufferGeometry` 和 `Mesh` 对象。

### 版本兼容性矩阵

```
web-ifc-three@0.0.124
  ├── peerDependencies: three@^0.149.0
  └── dependencies: web-ifc@^0.0.39

three@0.149.0     (匹配 peer dep)
web-ifc@0.0.39    (匹配 dependency)
```

所有三个库必须保持同步。升级其中一个而不升级其他的可能会导致运行时错误。

---

## 2. 构建工具链

### Vite 配置 (`vite.config.js`)

```javascript
export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['three', 'web-ifc'],
  },
  optimizeDeps: {
    exclude: ['web-ifc'],
  },
  server: {
    port: 3000,
    open: true,
  },
})
```

三个关键设置：

1. **`resolve.dedupe`**: 防止 Vite 打包多个副本的 `three` 或 `web-ifc`。如果没有这个，`web-ifc-three` 可能会解析它自己的 Three.js 副本，导致 `instanceof` 检查失败和微妙的渲染错误。

2. **`optimizeDeps.exclude: ['web-ifc']`**: 这是关键。Vite 的依赖预打包使用 esbuild 将 node_modules 合并为 `node_modules/.vite/deps/` 下的单个文件。这个过程会破坏 `web-ifc`，因为 WASM 加载代码内部使用 `document.currentScript.src` 来计算 `scriptDirectory`，这决定了从哪里 `fetch()` `.wasm` 二进制文件。预打包后，`scriptDirectory` 指向 `.vite/deps/` 目录而不是项目根目录，导致获取 `web-ifc.wasm` 时出现 404。从优化中排除 `web-ifc` 可以保留原始模块解析行为。

3. **`server.port: 3000`**: 固定端口以获得一致的开发 URL。

### 为什么不使用 Webpack

Vite 通过原生 ES 模块服务提供更快的冷启动和 HMR。与 Webpack 的 `file-loader`/`CopyWebpackPlugin` 方法相比，Vite 的 `public/` 目录约定使 WASM 处理更简单。

---

## 3. WASM 二进制文件管理

### 问题

`web-ifc`在其 npm 包中发布了两个 WASM 二进制文件：
- `web-ifc.wasm` - 单线程版本（在大多数浏览器中使用）
- `web-ifc-mt.wasm` - 多线程版本（当 `crossOriginIsolated === true` 时使用）

这些二进制文件必须在运行时通过已知的 URL 路径提供服务。它们不能被 Vite `import`，因为 WASM 文件需要由 Emscripten 运行时通过 HTTP 获取。

### 解决方案：`scripts/copy-wasm.cjs`

一个安装后脚本将 WASM 二进制文件从 `node_modules/web-ifc/` 复制到 `public/`：

```javascript
// 优先选择嵌套在 web-ifc-three 内部的副本，回退到根目录
const nestedDir = path.join(__dirname, '..', 'node_modules',
                   'web-ifc-three', 'node_modules', 'web-ifc');
const rootDir = path.join(__dirname, '..', 'node_modules', 'web-ifc');
const wasmDir = fs.existsSync(nestedDir) ? nestedDir : rootDir;
```

脚本检查两个可能的位置，因为 npm 可能会将 `web-ifc` 提升到根 `node_modules/`，或者根据依赖解析策略将其保留在 `web-ifc-three/node_modules/` 下。

### 运行时路径解析

在 `IFCService.init()` 中，WASM 路径被设置为绝对路径：

```javascript
this._loader.ifcManager.ifcAPI.SetWasmPath('/', true)
```

第二个参数 `true` 将路径标记为绝对路径。这绕过了 Emscripten `locateFile` 函数的默认行为（预置 `scriptDirectory`），该行为在 Vite 开发环境中会产生错误的路径。

在运行时，当 `web-ifc` 的 `IfcAPI.Init()` 被调用时，Emscripten 模块使用 `locateFile('web-ifc.wasm')`，使用绝对标志会返回 `'/' + 'web-ifc.wasm'` = `/web-ifc.wasm`。Vite 从根路径提供 `public/` 中的文件，因此 `/web-ifc.wasm` 正确解析为 `public/web-ifc.wasm`。

---

## 4. 应用程序入口点

### `index.html`

HTML 入口点非常精简：
```html
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
```

Vite 在开发中原样提供此文件。在构建期间，Vite 会注入打包后的 JS/CSS 引用。

### `src/main.js`

```javascript
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
```

全局 `style.css` 将 `html, body` 设置为全视口大小并带有 `overflow: hidden`，建立全屏应用程序布局。`#app` div 填充整个视口。

---

## 5. 架构：三层设计

代码库分为三层，以强制分离关注点：

```
组件层 (Vue 组件)
        │
        ▼
组合层 (useViewer.js)
        │
        ▼
核心层 (IFCService.js, SceneManager.js)
```

### 设计原则：框架无关的核心

`IFCService` 和 `SceneManager` 对 Vue 零依赖。它们使用纯 JavaScript 类、Promise 和回调。这意味着：
- 它们可以独立测试，无需挂载 Vue 组件
- 它们可以在 React、Svelte 或原生 JS 应用程序中重用
- 3D 引擎行为与 UI 渲染隔离

### 数据流方向

- **向下**：用户交互从组件流经 composable 到核心服务
- **向上**：核心服务的状态更改通过 composable 中的 Vue `ref()` 和 `reactive()` 反映，组件通过模板绑定观察这些更改

---

## 6. 核心层：SceneManager

**文件**: `src/core/SceneManager.js`

SceneManager 封装了整个 Three.js 生命周期：场景图、相机、渲染器、控制器、光照和动画循环。

### 构造函数初始化序列

```
constructor(container)
  ├── _initScene()       → Scene, 背景颜色, 网格辅助
  ├── _initCamera()      → PerspectiveCamera (45° FOV, near=0.1, far=10000)
  ├── _initRenderer()    → WebGLRenderer (开启抗锯齿)
  ├── _initLights()      → 环境光 (0.6) + 2 个定向光 (0.8, 0.3)
  ├── _initControls()    → OrbitControls (带阻尼)
  ├── _initHelpers()     → 坐标轴辅助
  └── _animate()         → 启动 requestAnimationFrame 循环
```

`container` 参数是一个 DOM 元素。渲染器的 `<canvas>` 会自动附加到它上面。

### 场景设置细节

**背景**: 深海军蓝 (#1a1a2e)，以匹配应用程序的暗色主题。

**网格**: 一个 100x100 的 `GridHelper`，使用微妙的颜色 (#333355 / #222244)，提供空间参考而不会造成视觉干扰。命名为 `__grid__`，以便可以从线框/X 射线操作中排除。

**相机**: 一个 `PerspectiveCamera`，具有：
- 45 度视场角（广角失真和狭窄隧道视觉之间的平衡选择）
- 近平面 0.1 和远平面 10000，以适应小组件和大型建筑物
- 初始位置在 (20, 20, 20) 看着原点

**光照**: 三灯光设置：
- 强度为 0.6 的环境光确保没有表面是完全黑暗的
- 位于 (50, 50, 50) 强度为 0.8 的主定向光提供主要照明
- 位于 (-50, 50, -50) 强度为 0.3 的辅助定向光填充阴影

**控制器**: `OrbitControls`，具有：
- `enableDamping = true` 和 `dampingFactor = 0.1` 以实现平滑减速
- `screenSpacePanning = true`，使平移平行于屏幕平面移动（对于建筑模型更直观）

### 动画循环

```javascript
_animate() {
  this._animationId = requestAnimationFrame(() => this._animate())
  this._controls.update()  // 阻尼需要
  this._renderer.render(this._scene, this._camera)
}
```

循环以显示器的刷新率连续运行。启用阻尼时，必须每帧调用 `controls.update()`，否则惯性效果将不起作用。

### frameObject 算法

加载模型后，相机自动取景以适应它：

```javascript
frameObject(object) {
  const box = new THREE.Box3().setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = this._camera.fov * (Math.PI / 180)
  const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.5
  // 将相机放置在距中心 45° 角的位置
  this._camera.position.set(
    center.x + distance * 0.5,
    center.y + distance * 0.5,
    center.z + distance * 0.5,
  )
}
```

算法：
1. 计算加载模型的轴对齐边界框
2. 找到最大尺寸（宽、高或深）
3. 使用三角函数计算适应视口中该尺寸所需的最小相机距离：`distance = maxDim / (2 * tan(fov/2))`
4. 乘以 1.5 作为填充
5. 将相机放置在 45 度角（x, y, z 距中心的偏移量相等），以获得令人愉悦的等轴测视图

### 线框和 X 射线模式

两种模式都遍历场景图并修改所有网格上的材质，跳过辅助对象（名称以 `__` 开头）：

**线框**: 在每个网格上设置 `material.wireframe = true/false`。

**X 射线**:
```javascript
m.transparent = enabled
m.opacity = enabled ? 0.3 : 1.0
m.depthWrite = !enabled
```
透明时禁用 `depthWrite` 可防止 z-fighting 伪影，即透明表面错误地相互遮挡。

### 资源清理

`dispose()` 移除调整大小监听器，取消动画帧，销毁控制器和渲染器，并从 DOM 中移除 canvas。这可以防止组件卸载时 WebGL 上下文泄漏。

---

## 7. 核心层：IFCService

**文件**: `src/core/IFCService.js`

IFCService 包装 `web-ifc-three` 的 `IFCLoader` 并管理加载的模型状态。

### 初始化

```javascript
constructor() {
  this._loader = new IFCLoader()   // web-ifc-three 加载器
  this._currentModel = null        // 当前加载的 Three.js 网格
  this._currentModelID = null      // web-ifc 内部模型 ID
  this._initialized = false        // 防止双重初始化
}
```

`IFCLoader` 构造函数内部创建一个 `IFCManager`，后者又创建一个 `web-ifc` `IfcAPI` 实例（WASM 引擎）。

### WASM 路径配置

```javascript
async init(wasmPath = '/') {
  if (this._initialized) return
  this._loader.ifcManager.ifcAPI.SetWasmPath(wasmPath, true)
  this._initialized = true
}
```

这将直接访问底层 `IfcAPI`（通过 `ifcManager.ifcAPI` getter）以调用 `SetWasmPath(path, absolute)`。`absolute = true` 参数告诉 Emscripten `locateFile` 回调按原样使用路径，而不预置 `scriptDirectory`。

注意：更高级别的 `ifcManager.setWasmPath(path)` 不会传递 `absolute` 标志，这就是我们绕过它的原因。

### 文件加载流程

```javascript
loadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)  // 步骤 1: Blob URL

    this._loader.load(
      url,                                 // 步骤 2: Three.js FileLoader
      (model) => {                         // 步骤 3: 成功回调
        URL.revokeObjectURL(url)
        this._currentModel = model
        this._currentModelID = model.modelID
        resolve({ model, modelID: model.modelID })
      },
      (progress) => { ... },              // 步骤 4: 进度回调
      (error) => {                         // 步骤 5: 错误回调
        URL.revokeObjectURL(url)
        reject(error)
      },
    )
  })
}
```

该方法将基于回调的 `IFCLoader.load()` 包装到 Promise 中，以便在 composable 层中使用更清晰的 async/await。

**对象 URL 生命周期**: `URL.createObjectURL(file)` 分配一个临时 URL 给 File 对象。它在成功和错误回调中都被撤销，以防止内存泄漏。

### 模型查询

**`getModelStats(modelID)`**: 检索 IFC 空间结构树并递归遍历它，计算总节点数和 `IFCBUILDINGSTOREY` 元素。空间结构遵循 IFC 层级：`IFCPROJECT` -> `IFCSITE` -> `IFCBUILDING` -> `IFCBUILDINGSTOREY` -> 元素。

**`getItemProperties(modelID, expressID)`**: 返回由其 Express ID 标识的特定元素的所有 IFC 属性（名称、类型、尺寸、材质）。

**`getExpressId(geometry, faceIndex)`**: 通过将面索引映射到存储在几何体 `expressID` 缓冲属性中的 Express ID，解析射线选取的面属于哪个 IFC 元素。

---

## 8. 组合层：useViewer

**文件**: `src/composables/useViewer.js`

此 composable 是中央协调器。它创建核心服务实例并将响应式状态和操作暴露给模板。

### 响应式状态

```javascript
const loading = ref(false)           // 是否正在加载文件
const modelLoaded = ref(false)       // 模型是否准备好显示
const progressText = ref('')         // 加载百分比文本 ("42%")
const errorMessage = ref('')         // 错误横幅的消息
const wireframe = ref(false)         // 线框模式切换
const xray = ref(false)              // X 射线模式切换

const modelInfo = reactive({
  fileName: '',
  fileSize: '',
  totalNodes: null,
  storeyCount: null,
})
```

对原始值使用 `ref()`，对模型信息对象使用 `reactive()`。组件响应式地绑定到这些变量。

### initScene

```javascript
async function initScene(container) {
  sceneManager = new SceneManager(container)
  await ifcService.init('/')
}
```

从 `App.vue` 的 `onMounted` 调用一次。它：
1. 创建 SceneManager（设置整个 Three.js 场景并开始渲染）
2. 初始化 IFC 服务（设置 WASM 路径）

### loadFile

最复杂的操作。完整序列：

```
1. 卫语句：如果 sceneManager 为空则中止
2. 从场景中移除以前的模型（如果有）
3. 设置 loading=true，重置所有状态
4. 调用 ifcService.loadFile(file, progressCallback)
   4a. 进度回调更新 progressText ref
5. 成功时：
   5a. 将模型网格添加到 Three.js 场景
   5b. 自动取景相机以适应模型
   5c. 设置 modelLoaded=true
   5d. 填充 modelInfo (fileName, fileSize)
   5e. 尝试获取模型统计信息（节点数，楼层数）
       - 这被包裹在一个单独的 try/catch 中，因为它不是关键的
       - 一些 IFC 文件可能没有完整的空间结构
6. 错误时：
   6a. 记录到控制台
   6b. 显示错误横幅 5 秒
7. 最后：设置 loading=false，清除 progressText
```

### 生命周期清理

```javascript
onBeforeUnmount(() => {
  sceneManager?.dispose()
  ifcService.dispose()
})
```

确保在组件卸载时释放 WebGL 资源。

---

## 9. 组件层

### App.vue - 根布局

使用带有固定宽度侧边栏 (300px) 和灵活查看器区域的 flex 布局：

```
┌────────────────────────────────────────────────────┐
│ 侧边栏 (300px)   │           查看器区域              │
│                  │                                  │
│ ┌──────────────┐ │  ┌──────────────────────────────┐│
│ │ 标题          │ │  │                              ││
│ ├──────────────┤ │  │     ViewerCanvas.vue         ││
│ │ 文件上传器    │ │  │     (Three.js <canvas>)      ││
│ ├──────────────┤ │  │                              ││
│ │ 视图工具栏    │ │  │                              ││
│ ├──────────────┤ │  │  加载覆盖层 (如果激活)         ││
│ │ 模型信息面板  │ │  │  错误横幅 (如果激活)           ││
│ └──────────────┘ │  └──────────────────────────────┘│
└────────────────────────────────────────────────────┘
```

`ViewToolbar` 和 `ModelInfoPanel` 使用 `v-if="modelLoaded"` 有条件地渲染，仅在成功加载模型后出现。

### FileUploader.vue

一个样式化的文件输入：

```html
<label class="upload-btn">
  <input type="file" accept=".ifc" @change="onFileChange" />
  Select IFC File
</label>
```

原生的 `<input type="file">` 被隐藏 (`display: none`)，`<label>` 充当可点击的触发器。这是自定义文件输入样式的标准模式。

选择文件后，`event.target.value = ''` 重置输入，以便可以重新选择同一个文件（当再次选择同一个文件时，浏览器会忽略 `change` 事件）。

### ViewerCanvas.vue

最简单的组件：只是一个 `<div>`，通过 `defineExpose` 暴露其 DOM 元素：

```javascript
const container = ref(null)
defineExpose({ container })
```

`App.vue` 通过 `viewerCanvas.value?.container` 访问它，将 DOM 元素传递给 `SceneManager`，后者将其 `<canvas>` 作为子元素附加。

### ViewToolbar.vue

三个带有事件发射的按钮：
- **线框**: 带有 `.active` 类样式的切换
- **X 射线**: 带有 `.active` 类样式的切换
- **重置视图**: 单次操作，无活动状态

所有逻辑都存在于 composable 中；按钮只发射事件。

### ModelInfoPanel.vue

带有四个键值对的只读显示。对 `totalNodes` 和 `storeyCount` 使用 `??`（空值合并），因为它们可以合法地为 `0`，这是假值但有效。

---

## 10. 完整数据流

### 文件加载（端到端）

```
用户点击 "Select IFC File"
  → <input type="file" accept=".ifc"> 打开原生文件对话框
  → 用户选择 building.ifc
  → FileUploader.onFileChange(event)
    → emit('file-selected', file)
    → App.handleFileSelected(file)
      → useViewer.loadFile(file)
        → ifcService.loadFile(file, progressCallback)
          → URL.createObjectURL(file) → blob:http://...
          → IFCLoader.load(blobURL, onLoad, onProgress, onError)
            → FileLoader 获取 blob URL → ArrayBuffer
            → IFCManager.parse(buffer)
              → IfcAPI.Init() → 加载 web-ifc.wasm
              → IfcAPI.OpenModel(data) → 解析 IFC STEP 数据
              → IfcAPI.StreamAllMeshes() → 迭代 IFC 几何体
              → 对于每个网格：创建 BufferGeometry + MeshLambertMaterial
              → mergeBufferGeometries() → 合并为单个网格
              → 返回 IFCModel (扩展 THREE.Mesh)
          → onLoad(model)
            → resolve({ model, modelID })
        → sceneManager.addObject(model) → scene.add(model)
        → sceneManager.frameObject(model) → 自动定位相机
        → modelLoaded.value = true → 工具栏/信息面板出现
        → ifcService.getModelStats(modelID)
          → getSpatialStructure() → 遍历树 → 计数节点/楼层
          → modelInfo 更新 → ModelInfoPanel 重新渲染
```

### 渲染循环（连续）

```
requestAnimationFrame 回调 (60fps)
  → controls.update() → 应用阻尼惯性
  → renderer.render(scene, camera) → 绘制帧到 <canvas>
```

---

## 11. IFC 解析流程

当调用 `IFCLoader.load()` 时，以下管道在 `web-ifc` 内部执行：

### 步骤 1: WASM 初始化

如果尚未初始化，则调用 `IfcAPI.Init()`：
```javascript
WebIFCWasm({ noInitialRun: true, locateFile: locateFileHandler })
```

这加载 Emscripten 编译的 C++ 引擎。`locateFile` 回调将 `web-ifc.wasm` 解析为正确的 URL。浏览器 `fetch()` WASM 二进制文件并实例化它。

### 步骤 2: 模型打开

```javascript
IfcAPI.OpenModel(data, settings)
```

原始 IFC 文件字节传递给 WASM 模块，该模块解析 STEP 格式（ISO 10303-21 定义的基于文本的格式）。解析器提取：
- 实体定义（墙、板、门、窗）
- 几何表示（拉伸区域实体、B-Rep、细分）
- 属性集（名称、材料、尺寸）
- 空间关系（哪个楼层，哪个建筑物）

### 步骤 3: 几何流

```javascript
IfcAPI.StreamAllMeshes(modelID, callback)
```

对于每个具有几何体的 IFC 产品，WASM 引擎：
1. 将几何表示评估为三角网格
2. 使用扁平网格数据（顶点、索引、法线、颜色）调用回调

### 步骤 4: Three.js 网格构造

`web-ifc-three` 的 `IFCParser` 转换扁平网格数据：
1. 按材质颜色对面对进行分组
2. 创建具有位置、法线和 expressID 属性的 `BufferGeometry`
3. 使用 `mergeBufferGeometries` 合并几何体以提高性能
4. 使用 `MeshLambertMaterial` 创建 `IFCModel`（`Mesh` 子类）

`expressID` 缓冲属性存储每个面的 IFC Express ID，启用通过射线投射进行元素选择。

---

## 12. 渲染流程

### 材质选择：MeshLambertMaterial

`web-ifc-three` 使用带有 `side: DoubleSide` 的 `MeshLambertMaterial`：
- Lambert 着色计算成本低（逐顶点，而非逐像素）
- `DoubleSide` 确保表面从两侧都可见，这对于内部和外部面都可见的建筑模型很重要
- 颜色源自 IFC 表面样式信息

### 合并几何体

所有 IFC 元素都合并为整个模型的单个 `BufferGeometry`。这对于性能至关重要：渲染 10,000 个单独的网格将比渲染一个大网格慢得多。权衡是单个元素高亮显示需要子集系统（为选定元素创建额外的几何体）。

### 像素比限制

```javascript
this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
```

上限为 2 倍，以防止高 DPI 显示器上的 GPU 负载过大（某些显示器报告 3 倍或 4 倍）。高于 2 倍的视觉差异对于 3D 内容可以忽略不计。

---

## 13. 关键实现细节

### 对象 URL 内存管理

每个 `URL.createObjectURL()` 调用都会分配浏览器内存来支持 blob URL。代码在成功和错误路径中都仔细调用 `URL.revokeObjectURL()` 以防止内存泄漏：

```javascript
this._loader.load(url,
  (model) => { URL.revokeObjectURL(url); ... },  // 成功
  (progress) => { ... },
  (error) => { URL.revokeObjectURL(url); ... },   // 错误
)
```

### 模型替换

加载新文件时，首先清理以前的模型：

```javascript
if (ifcService.currentModel) {
  sceneManager.removeObject(ifcService.currentModel)  // 从场景中移除
  ifcService.unloadModel()                             // 清除引用
}
```

这可以防止加载多个文件时的内存累积。

### 非关键统计信息检索

模型统计信息检索包裹在一个单独的 try/catch 中：

```javascript
try {
  const stats = await ifcService.getModelStats(modelID)
  modelInfo.totalNodes = stats.totalNodes
  modelInfo.storeyCount = stats.storeyCount
} catch (e) {
  console.warn('Could not retrieve model stats:', e)
  modelInfo.totalNodes = null
  modelInfo.storeyCount = null
}
```

这意味着即使空间结构无法解析，格式错误或不完整的 IFC 文件仍然可以可视化。模型成功渲染；只有信息面板显示 `-`。

### 带有自动关闭的错误显示

```javascript
errorMessage.value = 'Failed to load IFC file. Please check the file format.'
setTimeout(() => { errorMessage.value = '' }, 5000)
```

错误横幅在 5 秒后自动消失，以免阻碍 UI。实际的错误详细信息始终记录到 `console.error` 以进行调试。

### 文件大小格式化

```javascript
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
```

使用二进制单位（1 KB = 1024 字节），保留一位小数。

### 调整大小处理

```javascript
_onResize() {
  const { clientWidth, clientHeight } = this._container
  if (clientWidth === 0 || clientHeight === 0) return  // 卫语句
  this._camera.aspect = clientWidth / clientHeight
  this._camera.updateProjectionMatrix()
  this._renderer.setSize(clientWidth, clientHeight)
}
```

零尺寸卫语句防止纵横比计算中的除以零，这可能在布局转换期间发生。

---

## 14. 已知限制和未来方向

### 当前限制

1. **无元素选择/拾取**：`raycast` 和 `getExpressId` 方法存在于核心层中，但未连接到任何 UI 交互。可以通过将 canvas 上的点击事件连接到这些方法来添加点击选择。

2. **无属性显示**：`getItemProperties` 已实现，但没有相应的 UI 面板。详细信息面板可以在选择元素时显示 IFC 属性。

3. **仅限单模型**：加载新文件会替换当前模型。多模型支持需要跟踪多个模型 ID 和网格。

4. **无文件大小限制**：大型 IFC 文件 (>100MB) 可能会导致浏览器内存问题。预加载文件大小检查可以警告用户。

5. **模型卸载时的内存清理**：`unloadModel()` 仅清除 JavaScript 引用，但不调用 `IfcAPI.CloseModel()` 释放 WASM 内存。对于加载许多文件的长会话，WASM 内存可能会累积。

6. **单线程 WASM**：多线程 WASM (`web-ifc-mt.wasm`) 需要 `crossOriginIsolated` (COOP/COEP headers)，开发服务器未配置此项。解析在主线程上运行，对于大型模型可能会导致 UI 冻结。

### 潜在增强

- **元素拾取和属性面板**：将 `SceneManager.raycast()` 连接到 canvas 点击事件，使用 `IFCService.getExpressId()` 识别点击的元素，通过 `getItemProperties()` 显示属性
- **子集高亮**：使用 `web-ifc-three` 的子集系统用不同的材质高亮显示选定的元素
- **剖面平面**：使用 Three.js `Plane` 对象添加剪切平面以切割模型
- **楼层过滤**：使用空间结构树按楼层显示/隐藏元素
- **多模型加载**：支持同时加载多个具有独立变换的 IFC 文件
- **导出功能**：截图导出，测量工具
