# 前端组件

> [English](frontend-components.md)

网页界面是 React 19 + Material UI 9 的单页应用，由 Vite 构建、`bun run start` 提供。只有两个页面：书库，以及带阅读器的
书页面。所有文字都是中文（`src/frontend/i18n/zh.json`）。

## 组件结构

```
ComponentName/
  index.tsx                  ← 简单的重新导出
  ComponentNameContainer.tsx ← 状态、数据加载、事件处理；自身不含界面 JSX
  ComponentNameView.tsx      ← 只根据 props 渲染
```

没有状态的组件只有 `index.tsx` 和 View。

## 页面

### LibraryPage（`/`）

- `LibraryPageContainer.tsx`：加载书列表和资源状态，监听服务端事件（收到作业事件后刷新列表，显示模型加载和等待提示），
  在读入确认后开始翻译并打开这本书。
- `LibraryPageView.tsx`：顶栏、并排的拖入区和状态卡、提示信息，以及书卡网格。

### VolumePage（`/volumes/:id`）

- `VolumePageContainer.tsx`：加载这本书，跟踪这本书的任务和作业事件（当前步骤文字；译好的页面带版本号刷新，重新嵌字后
  图片会重新加载），开始和停止，以及键盘：方向键、空格、PageUp 和 PageDown 按这本书的翻页方向翻页。
- `VolumePageView.tsx`：带状态、开始/停止和 CBZ/PDF 下载的顶栏；进度和提示；译图/原图切换；按翻页方向摆放上一页和下一页
  按钮的页面；以及按阅读顺序排列、标出翻译状态和待看标记的缩略图条。

## 组件

| 组件 | 作用 |
|---|---|
| `DropZone` | 拖入文件或文件夹，以及选择文件和文件夹的按钮；上传并返回读入结果 |
| `ImportConfirmDialog` | 读入后的一句话确认：页数、空白页、跳过的文件；开始或稍后 |
| `StatusCard` | 资源守护的状态灯和原因、已加载的模型、每块可用显卡剩余的空间，以及还没下载的文件 |
| `VolumeCard` | 封面、书名、页数、作业状态和进度；打开，以及确认后删除 |

## 接口与辅助模块

| 文件 | 作用 |
|---|---|
| `api/client.ts` | 调用本地服务的类型化接口；写操作带 `x-comic-translator` 请求头；错误转成带服务端中文说明的 `ApiError` |
| `api/use-server-events.ts` | `useServerEvents(handler)`：在 `/api/events` 上建一个 `EventSource`，接收状态、任务、作业和模型事件 |
| `reader/page-step.ts` | 某个按键在从右往左和从左往右的书里往哪边翻页 |
| `reader/collect-dropped-files.ts` | 拖入的文件，包括拖入文件夹里的文件及其相对路径 |

响应和事件类型来自服务端（`src/server/interfaces`、`src/jobs/interfaces/runner-event.ts`）；这些文件只引用纯类型文件，
所以界面不依赖 Bun 类型也能通过类型检查。
