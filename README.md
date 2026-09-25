# 小小学习乐园

面向学龄前儿童的互动学习项目。以图形、点读、动画和动手练习组织内容，聚焦语文、数学、英语与思维启蒙。

直接打开根目录的 `index.html`，或部署到任意静态网站服务。项目无需构建，页面之间使用明确的 HTML 文件路径，本地打开也能正常返回首页。

## 学习内容

| 分类 | 内容 | 页面 |
| --- | --- | --- |
| 语文 | 拼音启蒙 | `pinyin/index.html` |
| 语文 | 看图识字 | `characters/index.html` |
| 语文 | 笔画书写 | `strokes/index.html` |
| 数学 | 数字与生活 | `numbers/index.html` |
| 数学 | 百数练习 | `numbers100/index.html` |
| 英语 | 英文字母 | `letters/index.html` |
| 英语 | 看图学单词 | `words/index.html` |
| 思维 | 五子棋启蒙 | `gomoku/index.html` |

首页支持按科目筛选、最近学习入口和已有星星汇总。学习记录保存在本机浏览器；统一品牌时保留各页面原有的存储键，没有清空或迁移已有学习数据。

## 项目结构

- `shared/catalog.js`：学习项目的名称、分类、页面地址和星星字段。
- `shared/home.*`：学习首页。
- `shared/lesson-navigation.js`：记录最近访问的学习项目。
- `shared/previews/`：对应学习内容的本地预览插图。
- `manifest.json`、`icon*.svg`：安装后的应用名称、入口和书本图标。
- 各学习目录：独立练习页面及资源。

新增学习页面时，在 `shared/catalog.js` 登记项目，在页面的 `html` 元素添加 `data-lesson`，载入共享目录与导航脚本，并提供返回 `../index.html` 的入口。新增内容应属于儿童学习或思维训练。

核心学习功能保持趣味性，大按钮、图示和语音优先。首页和部分旧页面的语音依赖设备语音；拼音和笔画的核心点读使用本地录音。没有注册 Service Worker，不保证托管页面在首次断网时可用。

原休闲内容保留在 `archive/`，不再出现在学习目录或应用快捷入口中；旧的 `unboxing/` 地址自动返回学习首页。

## 验证

`tests/learning-home.cjs` 检查八个学习入口、分类筛选、返回与继续学习、存档保留、旧链接跳转和不同屏幕尺寸。`pinyin/tests/smoke.cjs` 和 `strokes/tests/smoke.cjs` 检查对应的描写、录音和练习流程。需 Playwright 与 Chromium，可通过 `PLAYWRIGHT_MODULE` 指向已有模块。各页资源许可见对应目录中的说明。
