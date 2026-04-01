# 各阶段开发提示词

> 使用方法：复制对应阶段的提示词块，直接发送给 AI 即可。

## 通用执行原则

1. 先阅读对应任务文档和项目背景文档
2. 直接给出实现方案并落代码，不需要额外走 spec 流程
3. 按依赖顺序推进，实现后自行验证
4. 如果形成新的稳定经验，补充到 `my-spec/system/knowledge/`

## Stage-02: 认证与权限 (Task 02-04)

```text
@/docs/require_docs/require_step_by_step/02-后端JWT认证中间件.md
@/docs/require_docs/require_step_by_step/03-后端设备注册接口完善.md
@/docs/require_docs/require_step_by_step/04-前端认证流程与相册权限.md
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md

请直接实现 Stage-02 认证与权限阶段（Task 02-04）。

要求：
1. 先阅读全部文档并确认依赖顺序
2. 按顺序实现：JWT 中间件 -> 设备注册接口 -> 前端认证流程
3. 输出改动文件、验证结果和剩余风险
```

## Stage-03: 照片管理 (Task 05-10)

```text
@/docs/require_docs/require_step_by_step/05-照片哈希计算.md
@/docs/require_docs/require_step_by_step/06-EXIF信息提取.md
@/docs/require_docs/require_step_by_step/07-缩略图生成.md
@/docs/require_docs/require_step_by_step/08-照片去重检查接口.md
@/docs/require_docs/require_step_by_step/09-照片上传接口.md
@/docs/require_docs/require_step_by_step/10-照片CRUD接口.md
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md

请直接实现 Stage-03 照片管理阶段（Task 05-10）。

要求：
1. 先确认当前版本仍然有效的业务约束，避免照搬过期设计
2. 按依赖顺序实现前端工具和后端接口
3. 输出改动文件、验证结果和剩余风险
```

## Stage-04: 聚类算法 (Task 11-14)

```text
@/docs/require_docs/require_step_by_step/11-时空聚类算法核心.md
@/docs/require_docs/require_step_by_step/12-事件生成逻辑.md
@/docs/require_docs/require_step_by_step/13-逆向地理编码.md
@/docs/require_docs/require_step_by_step/14-聚类Celery任务.md
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md

请直接实现 Stage-04 聚类算法阶段（Task 11-14）。

要求：
1. 先确认数据模型和边界条件
2. 按依赖顺序实现事件模型、聚类逻辑、地理编码和异步任务
3. 输出改动文件、验证结果和剩余风险
```

## Stage-05: AI 服务 (Task 15-17)

```text
@/docs/require_docs/require_step_by_step/15-AI服务集成框架.md
@/docs/require_docs/require_step_by_step/16-图像内容识别.md
@/docs/require_docs/require_step_by_step/17-故事生成服务.md
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md

请直接实现 Stage-05 AI 服务阶段（Task 15-17）。

要求：
1. 先确认 provider、模型和失败回退策略
2. 完成实现后给出可观测性和排错说明
3. 输出改动文件、验证结果和剩余风险
```

## Stage-06: 导航与地图 (Task 18-20)

```text
@/docs/require_docs/require_step_by_step/18-expo-router导航配置.md
@/docs/require_docs/require_step_by_step/19-高德地图集成.md
@/docs/require_docs/require_step_by_step/20-事件标记展示.md
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md

请直接实现 Stage-06 导航与地图阶段（Task 18-20）。

要求：
1. 先确认导航结构与地图依赖
2. 实现后说明需要的运行配置和验证方式
3. 输出改动文件、验证结果和剩余风险
```

## Stage-07: UI 页面 (Task 21-24)

```text
@/docs/require_docs/require_step_by_step/21-事件详情页.md
@/docs/require_docs/require_step_by_step/22-欢迎页与认证页完善.md
@/docs/require_docs/require_step_by_step/23-照片网格与查看器.md
@/docs/require_docs/require_step_by_step/24-上传进度提示.md
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md

请直接实现 Stage-07 UI 页面阶段（Task 21-24）。

要求：
1. 保持现有产品方向一致
2. 如需较大 UI 改动，说明设计取舍
3. 输出改动文件、验证结果和剩余风险
```

## Stage-08: 高级功能 (Task 25-26)

```text
@/docs/require_docs/require_step_by_step/25-幻灯片播放器.md
@/docs/require_docs/require_step_by_step/26-系统测试与优化.md
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md

请直接实现 Stage-08 高级功能阶段（Task 25-26）。

要求：
1. 先确认播放器能力边界和测试范围
2. 完成实现后说明性能、兼容性和回归风险
3. 输出改动文件、验证结果和剩余风险
```
 
## 通用要求

- 保持类型、错误处理和命名清晰
- 不自动执行 git commit / push，除非用户明确要求
- 修改现有文件优先，只有必要时再新增文件
- 如果本轮开发形成了新的稳定经验，补充到 `my-spec/system/knowledge/`

6. **中文注释**
   - 代码注释使用中文
   - 保持与现有代码库一致
```
