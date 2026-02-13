# BIM IFC Viewer

一个基于浏览器的 BIM (建筑信息模型) IFC 文件查看器，使用 Vue 3、Three.js 和 web-ifc 构建。设计作为墙壁绘画机器人路径规划器的可视化前端。

## 功能

- 直接在浏览器中加载和渲染标准 IFC (Industry Foundation Classes) 文件
- 带有轨道控制（旋转、平移、缩放）的实时 3D 导航
- 线框渲染模式
- X 射线（半透明）渲染模式
- 模型信息面板：文件名、文件大小、节点数、楼层数
- 加载进度指示器
- 自动取景：相机自动调整以适应加载的模型
- 完全客户端处理，无需上传服务器

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| UI 框架 | Vue 3 (Composition API) | 3.4.x |
| 3D 渲染 | Three.js | 0.149.0 |
| IFC 解析 | web-ifc (WebAssembly) | 0.0.39 |
| IFC + Three.js 桥接 | web-ifc-three | 0.0.124 |
| 构建工具 | Vite | 5.x |

##先决条件

- Node.js >= 16
- npm >= 8

## 快速开始

```bash
# 1. 安装依赖（也会将 WASM 文件复制到 public/）
npm install

# 2. 启动开发服务器
npm run dev

# 3. 在浏览器中打开 http://localhost:3000
#    点击 "Select IFC File" 并加载 .ifc 文件
```

## 脚本

| 命令 | 描述 |
|---|---|
| `npm run dev` | 在端口 3000 上启动 Vite 开发服务器 |
| `npm run build` | 为生产环境构建到 `dist/` |
| `npm run preview` | 本地预览生产构建 |
| `npm run copy-wasm` | 手动将 WASM 二进制文件复制到 `public/` |

## 项目结构

```
BIM_editor/
├── index.html                    # HTML 入口点
├── package.json
├── vite.config.js                # Vite 配置
├── scripts/
├──   └── copy-wasm.cjs             # 安装后脚本：复制 WASM 到 public/
├── src/
├──   ├── main.js                   # Vue 应用引导
├──   ├── App.vue                   # 根组件（布局）
├──   ├── style.css                 # 全局样式
├──   ├── core/
├──   │   ├── IFCService.js         # IFC 加载、解析、属性查询
├──   │   └── SceneManager.js       # Three.js 场景、相机、渲染器、控制器
├──   ├── composables/
├──   │   └── useViewer.js          # Vue composable 桥接核心与响应式
├──   └── components/
├──       ├── FileUploader.vue      # 文件输入按钮
├──       ├── ViewerCanvas.vue      # 3D canvas 容器
├──       ├── ViewToolbar.vue       # 线框 / X 射线 / 重置 按钮
├──       └── ModelInfoPanel.vue    # 文件名、大小、节点、楼层
├── public/
├──   ├── web-ifc.wasm              # 单线程 WASM 二进制文件
├──   └── web-ifc-mt.wasm           # 多线程 WASM 二进制文件
├── test-load.html                # 独立 IFC 加载诊断页面
└── Relevant/                     # 参考 IFC 测试文件
```

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                        App.vue                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │FileUpload│  │ViewToolbar│  │ModelInfo │  │Viewer  │  │
│  │er.vue    │  │.vue      │  │Panel.vue │  │Canvas  │  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  │.vue   │  │
│       │              │                      └───┬────┘  │
│       └──────┬───────┘                          │       │
│              ▼                                  │       │
│       useViewer.js (composable)                 │       │
│       ┌──────┴──────┐                           │       │
│       ▼             ▼                           │       │
│  IFCService.js  SceneManager.js ◄───────────────┘       │
│       │             │                                   │
│       ▼             ▼                                   │
│  web-ifc-three   Three.js                               │
│       │                                                 │
│       ▼                                                 │
│   web-ifc (WASM)                                        │
│       │                                                 │
└─────────────────────────────────────────────────────────┘
```

该架构将关注点分为三层：

1. **核心层** (`src/core/`)：对 Vue 零依赖的框架无关类。`IFCService` 处理所有 IFC 操作；`SceneManager` 处理所有 Three.js 操作。
2. **组合层** (`src/composables/`)：`useViewer` 将核心层与 Vue 的响应式桥接，向组件暴露 refs 和 actions。
3. **组件层** (`src/components/`)：纯展示组件，接收 props 并发射事件。

## 故障排除

### 找不到 WASM 文件 (控制台 404 错误)

```bash
npm run copy-wasm
```

这将把 `web-ifc.wasm` 和 `web-ifc-mt.wasm` 从 `node_modules/web-ifc/` 复制到 `public/`。

### "Failed to load IFC file" 错误

- 确保文件具有 `.ifc` 扩展名并且是有效的 IFC 2x3 或 IFC 4 文件
- 检查浏览器控制台 (F12) 以获取详细的错误消息
- 尝试诊断页面：通过开发服务器打开 `test-load.html`

### 空白 3D 视口

- 验证浏览器中是否启用了 WebGL
- 检查容器元素是否具有非零尺寸（检查元素）

## 许可证

私有项目。
