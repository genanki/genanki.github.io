# 微积木像素画工作台（Microbrick Studio）

在线网页：https://genanki.github.io/microbrick-studio/

源代码：https://github.com/genanki/genanki.github.io/tree/main/microbrick-studio

在线编辑：https://github.dev/genanki/genanki.github.io （在目录树里打开 microbrick-studio/index.html）

## 已实现
- 任意 n×k 空白格（2～200 格），每格正方形
- 上传 JPG/PNG/WEBP 图片（本地浏览器处理，最大 15MB）
- 选择横向格数后按原图比例自动计算纵向格数，避免拉伸
- 手动指定不同的 n×k 时，可完整留白或居中裁剪
- 色彩感知平滑、K-means 色板提取、降低颜色数量、固定微积木色板映射
- 点击或拖动填色、擦除、显示或隐藏网格线
- 统计颗粒数量，默认每颗 8 mm，显示成品物理尺寸
- 导出 PNG 方格图、CSV 颗粒清单、JSON 工程数据

## 重要说明
当前“卡通平滑”是传统图像算法，**不等于 AI 模型把真人变成动画角色**。真人或宠物照片可先用 AI 转卡通插画，然后上传本网页进行颜色映射与逐格修正。后续也可以接入真正 AI 模型，但需要独立的推理接口和保护 API Key 的后端。

## 部署与编辑
本项目采用纯 HTML + CSS + JS，没有安装依赖。
如果 GitHub Pages 已发布 main 分支根目录，在线地址为上述 URL；若未启用，在仓库 Settings → Pages 开启部署。网页位于独立目录，没有修改网站首页。

GitHub 网页中可按 . 键进入 github.dev，也可以直接在浏览器打开上方在线编辑地址。修改并提交代码后由 GitHub Pages 发布。

## 下一阶段
- 30、50、70 格多尺寸对照
- JSON 工程回读
- 真实颗粒色号与库存映射
- 专门的宠物/真人 AI 卡通化前处理
