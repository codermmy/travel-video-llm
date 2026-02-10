# 测试策略

## 测试分层

1. 单元测试（UT）：服务逻辑、工具函数
2. 集成测试（IT）：API、数据库、任务编排
3. E2E：RN/Web 关键用户流

## 项目类型适配

本项目是 `react-native-fullstack`，测试执行以
`my-spec/system/execution/01-test-profile.yaml` 为唯一事实来源。

- profile 定义安装命令
- profile 定义执行命令
- profile 定义 required/optional

## 必测主链路

- 登录注册
- 照片上传与去重
- 聚类与事件生成
- 故事展示
- 多设备同步

## 必跑 profile（当前仓库）

- required: `backend`, `mobile_static`
- conditional: `mobile_e2e_manual_assisted`（命中 UI 主链路变更时）
- optional: `mobile_unit`

## 证据产物

每次 `spec:apply` 完成后，至少包含：

- `my-spec/artifacts/<change>/reports/` 测试报告
- `my-spec/artifacts/<change>/logs/` 核心日志
- `my-spec/artifacts/<change>/screenshots/` 失败截图（若有）

## 人机协作测试

涉及真机手工操作时，使用握手机制：

- AI 输出 `ACTION_REQUIRED`
- 用户完成操作后写入 `my-spec/artifacts/<change>/handshake/<step>.done`
- AI 检测到 done 文件后继续执行

## 详细执行手册

- `my-spec/system/execution/02-testing-playbook.md`
