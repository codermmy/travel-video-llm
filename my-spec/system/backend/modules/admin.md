# 后端模块：管理接口

## 1. 当前职责

- 提供管理员级别的重聚类入口
- 支持按单用户或批量用户执行

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 路由 | `backend/app/api/v1/admin.py` |
| 服务 | `backend/app/services/admin_recluster_service.py` |
| schema | `backend/app/schemas/admin.py` |

## 3. 当前接口

### `POST /api/v1/admin/recluster`

认证方式：

- Header: `X-Admin-Key`

依赖：

- `settings.admin_api_key`

可控制项：

- 指定 `userId`
- `allUsers`
- `limitUsers`
- `runGeocoding`

## 4. 返回内容

- 执行起止时间
- 耗时
- 用户数
- 总创建事件数
- 总重置照片数
- 各用户的详细结果

## 5. 适用场景

- 调整聚类策略后对存量用户重跑
- 数据修复
- 验证新聚类参数的效果
