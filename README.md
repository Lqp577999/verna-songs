# 歌单页面回归检查

本项目是静态 HTML/CSS/JavaScript，没有构建步骤或运行时包依赖。

先在仓库根目录启动静态文件服务器，再使用独立的 Playwright CLI 浏览器：

```sh
python -m http.server 4173 --bind 127.0.0.1
playwright-cli -s=verna-catalog open http://127.0.0.1:4173 --browser=chrome
playwright-cli -s=verna-catalog --raw run-code --filename tests/catalog.browser.js
playwright-cli -s=verna-catalog --raw run-code --filename tests/pagination.browser.js
```

- `catalog.browser.js`：首页/末页/空结果/单结果、三个菜单在桌面及手机横竖屏的滚动与末项选择、晚间直播时间、头像旋转及减少动态效果、两个备案链接和图标。
- `pagination.browser.js`：在 2287、1440、390 像素宽度逐页核对全部歌曲，验证面板高度、翻页位置、歌曲数量，以及停留末页时调整窗口宽度。
- `visual.browser.js`：手动创建 `output/playwright/` 后运行；保存六张截图，检查复制点歌、随机选歌及窄屏备案布局。此项会将测试歌曲文字复制到测试浏览器可访问的剪贴板。

CLI 某些版本即使检查失败也会返回进程退出码 0；必须同时确认输出中没有 `Error`，且 JSON 明确为 `passed`。这些脚本测试真实页面，不修改歌曲数据，也不执行发布操作。

`row-divider.browser.mjs` 用于 Browser 插件的真实页面检查：导入 `checkRowDivider` 后传入本地歌单标签页。它核对首页末行、最后一页和单条搜索结果保留原有横向分隔线，不增加四边框，同时保持分页空间和手机卡片边界。需分别在桌面和手机视口运行。
