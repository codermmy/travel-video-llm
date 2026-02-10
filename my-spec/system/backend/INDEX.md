# 后端知识索引

## 目录

- `modules/auth.md`：认证鉴权、用户隔离
- `modules/map.md`：地理编码、位置补全、地图数据供给
- `modules/photo.md`：照片上传、去重、状态管理
- `modules/event.md`：聚类事件、故事生成、地理编码
- `modules/sync.md`：跨设备同步策略
- `modules/testing.md`：后端测试执行与门禁
- `api/INDEX.md`：API 总览与契约入口
- `database/schema-dictionary.md`：核心表结构与索引

## 维护规则

1. API 变更必须同步更新 `api/INDEX.md`。
2. 表结构/字段变更必须同步更新 `database/schema-dictionary.md`。
3. 服务逻辑变化必须更新对应模块文档。
4. 地图与地理编码逻辑变化必须同步更新 `modules/map.md`。
