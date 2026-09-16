# 发布候选

1. 创建空GitHub仓库`markbridge`；暂不在线生成README或License，以免与本地初始提交冲突。
2. 审阅本仓库、GPL许可、README支持范围与CHANGELOG。
3. 用干净依赖安装运行格式、构建与检查；准备匹配运行环境后执行`npm test`。
4. `npm run package`生成ZIP与SHA-256；不要把私有运行环境放进ZIP。
5. 按目标站点的隔离验收结果决定何时去掉候选标记。更新package.json、包锁、插件头、readme.txt和CHANGELOG的版本后再打标签。
6. 关联你创建的远端，推送源码并创建GitHub Release。此仓库不会自动推送、发布或部署。

首次公开是经过筛选的源码快照；原私有维护Git历史留在原位置。首次提交仍保留上游GPL片段、第三方文件头和许可说明。
