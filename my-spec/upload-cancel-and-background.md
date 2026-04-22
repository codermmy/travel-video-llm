# 上传任务取消功能 + 导入过程后台运行支持

## 目标
1. **取消上传功能**：整理中心和导入过程中都支持取消任务
2. **后台运行优化**：导入开始即可点击"后台继续"，不再阻塞到 prepare/analysis/sync 完成

---

## 实现方案

### Part 1: 取消上传功能

#### 1.1 后端 - 添加取消任务 API

**文件**: `backend/app/api/v1/tasks.py`

新增 endpoint:
```python
@router.post("/cancel/{task_id}")
def cancel_task(task_id: str, current_user_id: CurrentUserIdDep, db: Session = Depends(get_db)):
    # 1. 查询 AsyncTask 记录
    # 2. 使用 Celery AsyncResult(task.task_id).revoke(terminate=True)
    # 3. 更新 AsyncTask 状态为 "revoked"
```

#### 1.2 前端 API - 添加取消方法

**文件**: `mobile/src/services/api/taskApi.ts`

```typescript
export async function cancelTask(taskId: string): Promise<void> {
  await apiClient.post(`/api/v1/tasks/cancel/${taskId}`);
}
```

#### 1.3 端侧分析队列 - 添加取消机制

**文件**: `mobile/src/services/vision/onDeviceVisionQueueService.ts`

新增函数:
```typescript
export async function cancelOnDeviceVisionQueue(importTaskId: string): Promise<number> {
  // 1. 遍历 itemsByPhotoId，删除所有 importTaskId 匹配的项目
  // 2. 持久化并 emit
  // 3. 返回删除的数量
}
```

#### 1.4 导入任务服务 - 添加取消方法

**文件**: `mobile/src/services/import/importTaskService.ts`

新增函数:
```typescript
export async function cancelImportTask(taskId: string): Promise<void> {
  // 1. 获取任务记录
  // 2. 如果有 backendTaskId，调用 taskApi.cancelTask()
  // 3. 调用 cancelOnDeviceVisionQueue(taskId) 清除端侧队列
  // 4. 更新任务状态为 'cancelled'
  // 5. 持久化并 emit
}
```

#### 1.5 ImportTask 类型扩展

**文件**: `mobile/src/types/importTask.ts`

```typescript
export type ImportTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';
```

#### 1.6 整理中心 - 任务详情添加取消按钮

**文件**: `mobile/src/screens/import-task-detail-screen.tsx`

在 `heroCard` 区域添加取消按钮（仅 status === 'running' 时显示）

#### 1.7 导入过程 - ImportProgressModal 添加取消按钮

**文件**: `mobile/src/components/import/ImportProgressModal.tsx`

- 添加 `onCancel` prop
- 显示"取消导入"按钮（调用 onCancel）

---

### Part 2: 导入过程后台运行优化

#### 2.1 ImportProgressModal 添加"后台继续"按钮

**文件**: `mobile/src/components/import/ImportProgressModal.tsx`

- 添加 `onContinueInBackground` prop
- 显示"后台继续"按钮（allowClose 或有 onContinueInBackground 时）

#### 2.2 导入流程调整

**文件**: `mobile/app/profile/import.tsx`

关键变化：
- `ImportProgressModal` 设置 `allowClose={false}` 但添加 `onContinueInBackground`
- 用户点击"后台继续"后：
  1. 设置 pending message
  2. 关闭 modal
  3. router.back()
- 导入任务继续在后台运行（端侧队列和后端 Celery）

#### 2.3 事件照片导入页面同样需要调整

**文件**: `mobile/app/events/[eventId]/photos/import.tsx`

同样添加"后台继续"按钮支持

---

## 关键文件清单

### 后端
- `backend/app/api/v1/tasks.py` - 新增 cancel endpoint

### 前端
- `mobile/src/types/importTask.ts` - 添加 cancelled 状态
- `mobile/src/services/api/taskApi.ts` - 新增 cancelTask
- `mobile/src/services/import/importTaskService.ts` - 新增 cancelImportTask
- `mobile/src/services/vision/onDeviceVisionQueueService.ts` - 新增 cancelOnDeviceVisionQueue
- `mobile/src/components/import/ImportProgressModal.tsx` - 添加取消和后台继续按钮
- `mobile/src/screens/import-task-detail-screen.tsx` - 添加取消按钮
- `mobile/app/profile/import.tsx` - 添加后台继续处理逻辑
- `mobile/app/events/[eventId]/photos/import.tsx` - 添加后台继续处理逻辑

---

## 验证方案

### 手动测试

1. **取消功能测试**：
   - 导入照片 → 在 ImportProgressModal 点击取消 → 任务状态变为 cancelled
   - 导入照片 → 点击后台继续 → 进入整理中心 → 点击任务详情 → 点击取消

2. **后台运行测试**：
   - 导入照片 → 立即点击"后台继续" → 返回主页 → 进入整理中心查看任务进度
   - 验证端侧分析队列继续运行

3. **边界情况**：
   - 取消时任务已完成 → 显示提示
   - 取消后端 Celery 任务 → 状态正确更新

### 测试命令

```bash
# 启动后端
cd backend && python -m uvicorn app.main:app --reload

# 启动前端
cd mobile && npx expo start

# 启动 Celery worker
cd backend && celery -A app.tasks.celery_app worker --loglevel=info
```