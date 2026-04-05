# 后端模块索引

## 目录

- `modules/auth.md`：设备注册与 JWT 鉴权
- `modules/user.md`：用户资料、头像上传、用户查询
- `modules/photo.md`：照片 metadata、端侧视觉回写、批量归类与删除
- `modules/event.md`：事件列表、详情、编辑、故事刷新、增强接口
- `modules/map.md`：高德逆地理编码、地点搜索、位置上下文
- `modules/task.md`：异步任务状态与 Celery 编排
- `modules/admin.md`：管理员重聚类
- `modules/sync.md`：已停用同步链路说明
- `api/INDEX.md`：当前 API 总表
- `database/schema-dictionary.md`：当前模型层表结构说明

## 维护规则

1. 路由增删改后更新 `api/INDEX.md`
2. ORM 字段或索引变更后更新 `schema-dictionary.md`
3. 业务流程变更后更新对应模块文档
4. 已退出主链路的能力不要继续写成“当前功能”
