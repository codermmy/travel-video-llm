# Workstream 01：单设备壳层与用户中心

> 角色：前端主需求包
>
> 优先级：P0
>
> 是否允许并行开发：是

---

## 1. 需求背景

产品已明确放弃多设备同步和账号体系，但当前 App 壳层仍保留以下旧心智：

- 根路由仍按“是否登录”分流
- 首次进入仍存在 auth route 概念
- Profile 页仍展示邮箱、同步、退出登录
- 存在登录、注册、忘记密码等页面与入口

这些内容会让用户继续理解为“云账号产品”，与当前定位冲突。

---

## 2. 目标

把 App 壳层改成“单设备、本机使用、默认不上图”的产品形态，并保留一个轻量“我的/设置”页面承载本地设置与数据管理。

---

## 3. 范围

### 包含

- 根布局路由分流重构
- 首次启动初始化流程重构
- 删除或隐藏登录注册相关入口
- Profile 页改为“我的/设置”
- 增强素材清理入口文案位

### 不包含

- 端侧识别实现
- 故事生成实现
- 幻灯片导出实现

---

## 4. 产品要求

### 4.1 启动流程

- 首次打开 App 自动完成设备身份初始化
- 不进入登录注册流程
- 不展示邮箱升级、多设备同步提示

### 4.2 我的/设置页面

建议承载以下内容：

- 本机身份说明
- 隐私策略说明
- 默认不上图说明
- 增强上传说明
- 本地缓存管理
- 增强素材清理
- 导出与播放设置

### 4.3 明确不保留的旧心智

- 登录
- 注册
- 找回密码
- 立即同步
- 云端事件数量
- 退出登录

---

## 5. 技术方向

### 前端

- `mobile/app/_layout.tsx` 去掉 auth 分流与同步弹窗逻辑
- `mobile/app/(auth)/`、`mobile/app/login.tsx`、`mobile/app/register.tsx`、`mobile/app/forgot-password.tsx` 取消主入口
- `mobile/app/(tabs)/profile.tsx` 改为“我的/设置”页
- `useAuthStore` 保留设备初始化与本机身份恢复，但不再承担完整账号状态机

### 后端

- `/auth/register` 继续保留设备注册
- `/users/me` 可保留，用于本机资料展示
- 用户搜索、用户名检索等社交化能力可后移，不作为当前 P0 产品入口

---

## 6. 涉及模块

- `mobile/app/_layout.tsx`
- `mobile/app/(auth)/`
- `mobile/app/login.tsx`
- `mobile/app/register.tsx`
- `mobile/app/forgot-password.tsx`
- `mobile/app/(tabs)/profile.tsx`
- `mobile/src/stores/authStore.ts`
- `mobile/src/services/api/authApi.ts`
- `backend/app/api/v1/auth.py`
- `backend/app/api/v1/users.py`

---

## 7. 验收口径

- 用户首次启动无需登录即可进入主流程
- 产品内无“登录/注册/同步账号”主入口
- 我的/设置页文案不再传达“云账号产品”心智
- 用户可在设置中理解默认不上图和增强上传策略

---

## 8. 与其他需求包的关系

- 依赖 `00-核心契约`
- 与 `05-事件详情与幻灯片` 可并行
- 与 `06-云端增强入口` 在设置页入口文案上会发生联动
