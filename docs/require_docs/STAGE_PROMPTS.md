# 各阶段 OpenSpec 执行提示词（即用型）

> 使用方法：复制对应阶段的提示词块，直接发送给AI即可

下面是你要参考的需求文档，他们是按照文件名编号顺序写的，有比较多个，

下面是整个系统的完整的需求文档、技术架构文档、规范，你可以进行参考
---

## Stage-02: 认证与权限 (Task 02-04)

```
 @/docs/require_docs/require_step_by_step/02-后端JWT认证中间件.md
@/docs/require_docs/require_step_by_step/03-后端设备注册接口完善.md
@/docs/require_docs/require_step_by_step/04-前端认证流程与相册权限.md
下面是整个系统的完整的需求文档、技术架构文档、规范，你可以进行参考
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md
@/openspec/AGENTS.md

请按照 OpenSpec 流程实现 Stage-02 认证与权限阶段（Task 02-04）。

**工作流程：**
1. 阅读所有任务文档，理解需求
2. 创建 OpenSpec 提案至 openspec/proposals/auth/
3. 按依赖顺序实现：JWT中间件 → 设备注册接口 → 前端认证流程
4. 自我验证并输出完成总结

**涉及文件：**
- backend/app/core/security.py（新建）
- backend/app/api/deps.py（新建）
- backend/app/api/v1/auth.py（修改）
- mobile/src/utils/deviceUtils.ts（新建）
- mobile/src/stores/authStore.ts（新建）
```

---

## Stage-03: 照片管理 (Task 05-10)

```

下面是你要参考的需求文档，他们是按照文件名编号顺序写的，有比较多个，
@/docs/require_docs/require_step_by_step/05-照片哈希计算.md
@/docs/require_docs/require_step_by_step/06-EXIF信息提取.md
@/docs/require_docs/require_step_by_step/07-缩略图生成.md
@/docs/require_docs/require_step_by_step/08-照片去重检查接口.md
@/docs/require_docs/require_step_by_step/09-照片上传接口.md
@/docs/require_docs/require_step_by_step/10-照片CRUD接口.md

下面是整个系统的完整的需求文档、技术架构文档、规范，你可以进行参考
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md
@/openspec/AGENTS.md

请按照 OpenSpec 流程实现 Stage-03 照片管理阶段（Task 05-10）。

**工作流程：**
1. 阅读所有任务文档，理解需求
2. 创建 OpenSpec 提案至 openspec/proposals/photo/
3. 按依赖顺序实现：
   - 前端工具：哈希计算 → EXIF提取 → 缩略图生成
   - 后端接口：去重检查 → 照片上传 → CRUD接口
4. 自我验证并输出完成总结

**关键决策：**
- 哈希算法：SHA-256（完整图片）
- 缩略图规格：宽1080px，JPEG质量80%，目标~200KB
- 上传方式：本版本简化为元数据与文件分开上传
```

---

## Stage-04: 聚类算法 (Task 11-14)

```

下面是你要参考的需求文档，他们是按照文件名编号顺序写的，有比较多个，
@/docs/require_docs/require_step_by_step/11-时空聚类算法核心.md
@/docs/require_docs/require_step_by_step/12-事件生成逻辑.md
@/docs/require_docs/require_step_by_step/13-逆向地理编码.md
@/docs/require_docs/require_step_by_step/14-聚类Celery任务.md

下面是整个系统的完整的需求文档、技术架构文档、规范，你可以进行参考
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md
@/openspec/AGENTS.md

请按照 OpenSpec 流程实现 Stage-04 聚类算法阶段（Task 11-14）。

**工作流程：**
1. 阅读所有任务文档，理解需求
2. 创建 OpenSpec 提案至 openspec/proposals/clustering/
3. 按依赖顺序实现：
   - 事件模型与Schema → 聚类算法核心 → 逆向地理编码 → Celery任务
4. 自我验证并输出完成总结

**聚类参数：**
- TIME_THRESHOLD_HOURS = 48
- DISTANCE_THRESHOLD_KM = 50
- MIN_PHOTOS_PER_EVENT = 5
- 无GPS照片：排除在聚类之外
```

---

## Stage-05: AI服务 (Task 15-17)

```

下面是你要参考的需求文档，他们是按照文件名编号顺序写的，有比较多个，
@/docs/require_docs/require_step_by_step/15-AI服务集成框架.md
@/docs/require_docs/require_step_by_step/16-图像内容识别.md
@/docs/require_docs/require_step_by_step/17-故事生成服务.md
下面是整个系统的完整的需求文档、技术架构文档、规范，你可以进行参考
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md
@/openspec/AGENTS.md

请按照 OpenSpec 流程实现 Stage-05 AI服务阶段（Task 15-17）。

**工作流程：**
1. 阅读所有任务文档，理解需求
2. 创建 OpenSpec 提案至 openspec/proposals/ai/
3. 按依赖顺序实现：
   - AI集成框架 → 图像内容识别 → 故事生成服务
4. 自我验证并输出完成总结

**AI服务：**
- 图像识别：通义万象 (qwen-vl-max)
- 文本生成：通义千问 (qwen-plus)
- 采样策略：≥10张取1/5/10，<10张取首/中/尾
```

---

## Stage-06: 导航与地图 (Task 18-20)

```

下面是你要参考的需求文档，他们是按照文件名编号顺序写的，有比较多个，
@/docs/require_docs/require_step_by_step/18-expo-router导航配置.md
@/docs/require_docs/require_step_by_step/19-高德地图集成.md
@/docs/require_docs/require_step_by_step/20-事件标记展示.md
下面是整个系统的完整的需求文档、技术架构文档、规范，你可以进行参考
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md
@/openspec/AGENTS.md

请按照 OpenSpec 流程实现 Stage-06 导航与地图阶段（Task 18-20）。

**工作流程：**
1. 阅读所有任务文档，理解需求
2. 创建 OpenSpec 提案至 openspec/proposals/navigation/
3. 按依赖顺序实现：
   - expo-router配置 → 地图集成 → 事件标记
4. 自我验证并输出完成总结

**技术要点：**
- 导航框架：expo-router（文件系统路由）
- 地图服务：高德地图
- 认证检查：根布局层检查token
```

---

## Stage-07: UI页面 (Task 21-24)


```

下面是你要参考的需求文档，他们是按照文件名编号顺序写的，有比较多个，
@/docs/require_docs/require_step_by_step/21-事件详情页.md
@/docs/require_docs/require_step_by_step/22-欢迎页与认证页完善.md
@/docs/require_docs/require_step_by_step/23-照片网格与查看器.md
@/docs/require_docs/require_step_by_step/24-上传进度提示.md
下面是整个系统的完整的需求文档、技术架构文档、规范，你可以进行参考
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md
@/openspec/AGENTS.md

请按照 OpenSpec 流程实现 Stage-07 UI页面阶段（Task 21-24）。

**工作流程：**
1. 阅读所有任务文档，理解需求
2. 创建 OpenSpec 提案至 openspec/proposals/ui/
3. 按依赖顺序实现：
   - 事件详情页 → 欢迎页完善 → 照片网格与查看器 → 上传进度
4. 自我验证并输出完成总结

**UI设计要求：**
- 如需设计新界面或优化视觉效果，请使用 frontend-design skill
- 保持现有设计系统一致性
- 支持iOS和Android平台
```

---

## Stage-08: 高级功能 (Task 25-26)

```

下面是你要参考的需求文档，他们是按照文件名编号顺序写的，有比较多个，
@/docs/require_docs/require_step_by_step/25-幻灯片播放器.md
@/docs/require_docs/require_step_by_step/26-系统测试与优化.md
下面是整个系统的完整的需求文档、技术架构文档、规范，你可以进行参考
@/docs/require_docs/01-项目需求文档.md
@/docs/require_docs/02-系统技术架构.md
@/docs/require_docs/04-开发规范.md
@/openspec/AGENTS.md

请按照 OpenSpec 流程实现 Stage-08 高级功能阶段（Task 25-26）。

**工作流程：**
1. 阅读所有任务文档，理解需求
2. 创建 OpenSpec 提案至 openspec/proposals/advanced/
3. 按顺序实现：
   - 幻灯片播放器 → 系统测试与优化检查
4. 输出测试清单和优化建议

**特殊说明：**
- Task-26 是测试验收任务，不需要编写代码
- 输出完整的测试清单和验收标准
- 整理项目交付物检查清单
```

---

## 📋 通用约束（适用于所有阶段）

```
在实现过程中，请遵守以下规则：

1. **命名规范**
   - Python: snake_case (文件/变量/函数), PascalCase (类)
   - TypeScript: PascalCase (组件), camelCase (变量/函数), UPPER_SNAKE_CASE (常量)

2. **错误处理**
   - 所有API调用必须有try-catch
   - 返回友好的错误信息
   - 记录必要的日志

3. **类型安全**
   - Python使用类型注解
   - TypeScript定义明确的接口
   - 使用Pydantic进行请求验证

4. **不自动执行Git操作**
   - 不要自动 git commit/push
   - 除非用户明确要求

5. **优先使用Edit工具**
   - 修改现有文件优先用Edit
   - 新建文件仅在必要时

6. **中文注释**
   - 代码注释使用中文
   - 保持与现有代码库一致
```
