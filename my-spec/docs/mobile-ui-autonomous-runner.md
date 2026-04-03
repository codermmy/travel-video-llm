# 移动端 UI 自治循环 Runner

这个 runner 的目标不是替代你手动发 prompt，而是把你现在的协作协议变成一个能持续跑 12 小时的本地系统：

- 审查
- 自我挑战
- 执行修改
- 跑校验
- 严苛复审
- 记录状态
- 进入下一轮

## 文件位置

- 启动脚本：[scripts/ui_loop_runner.py](/Users/maoyuan/code/travel-video-llm/scripts/ui_loop_runner.py)
- Dashboard：[scripts/ui_loop_dashboard.py](/Users/maoyuan/code/travel-video-llm/scripts/ui_loop_dashboard.py)
- 默认配置：[default.mobile.json](/Users/maoyuan/code/travel-video-llm/scripts/ui_loop/default.mobile.json)
- 评审优先配置：[heuristic.mobile.json](/Users/maoyuan/code/travel-video-llm/scripts/ui_loop/heuristic.mobile.json)
- 自治上下文：[mobile-ui-autonomous-loop-context.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-autonomous-loop-context.md)

## 当前设计

- 执行引擎：本机 `codex exec`
- 会话模式：每个 run 创建一个持久 `thread_id`，后续各阶段和各轮次都通过 `codex exec resume <thread_id>` 续跑
- 默认工作目录：`mobile/`
- 默认可编辑范围：
  - `app/`
  - `src/`
  - `package.json`
  - `package-lock.json`
  - `app.json`
  - `app.config.ts`
- 默认校验命令：
  - `npm run lint`
  - `npm run typecheck`
- 状态存储：
  - `/tmp/travel-video-llm-ui-loop/state.db`
  - `/tmp/travel-video-llm-ui-loop/runs/<run-id>/`

## 为什么这样做

- 你现在的工作流依赖你自己 review。
- 这个 runner 把“你 review 的位置”拆成两步自动化：
  - `challenge`：执行前先攻击审查结论，重新排优先级
  - `review`：执行后再严格判断这一轮是否值得保留
- 如果校验回归或复审不通过，runner 会把本轮改动回滚到本轮开始前的快照。

说明：

- 当前仓库工作区是脏的，所以 runner 不使用 `git reset --hard` 这类危险回退。
- 它只对配置里的可编辑路径做目录级快照回退。
- 如果你要让它跑 12 小时，最好不要同时手动改同一批 `mobile/` 文件。

## 启动前检查

先检查配置和本地依赖：

```bash
python3 scripts/ui_loop_runner.py doctor
```

## 启动 12 小时自治循环

```bash
python3 scripts/ui_loop_runner.py start
```

如果要临时改时长：

```bash
python3 scripts/ui_loop_runner.py start --duration-hours 6
```

启动后会先打印一个 `run_id`，然后开始自动循环。

## 后台跑法

推荐用 `tmux`。如果只是简单挂后台，也可以：

```bash
nohup python3 scripts/ui_loop_runner.py start > /tmp/travel-ui-loop.log 2>&1 &
```

## 查看进度

```bash
python3 scripts/ui_loop_runner.py report --run-id <run-id>
```

如果你想要可视化看板：

```bash
python3 scripts/ui_loop_dashboard.py --config scripts/ui_loop/heuristic.mobile.json --host 127.0.0.1 --port 8780
```

打开：

```text
http://127.0.0.1:8780
```

看板会显示：

- 所有 runs 列表
- 当前 run 的状态、轮次、阶段
- 最近完成的 rounds
- 当前阶段的 stderr/stdout tail
- 最近错误

每轮的详细记录都在：

- `/tmp/travel-video-llm-ui-loop/runs/<run-id>/round-001/summary.md`
- `/tmp/travel-video-llm-ui-loop/runs/<run-id>/round-001/audit.message.json`
- `/tmp/travel-video-llm-ui-loop/runs/<run-id>/round-001/challenge.message.json`
- `/tmp/travel-video-llm-ui-loop/runs/<run-id>/round-001/execute.message.json`
- `/tmp/travel-video-llm-ui-loop/runs/<run-id>/round-001/review.message.json`
- `/tmp/travel-video-llm-ui-loop/runs/<run-id>/round-001/validation/`

## 停止与恢复

停止：

```bash
python3 scripts/ui_loop_runner.py stop --run-id <run-id>
```

恢复：

```bash
python3 scripts/ui_loop_runner.py resume --run-id <run-id>
```

如果要顺便延长时长：

```bash
python3 scripts/ui_loop_runner.py resume --run-id <run-id> --extend-hours 4
```

## 收敛与停机逻辑

runner 会在这些情况下停下：

- 到达时长上限
- 到达最大轮次
- 连续多轮没有明显提升
- `review` 认为已经可以暂时收敛
- 手动发出 `stop` 信号

## 你最该先改的地方

如果你想立刻开始跑，先不要碰配置，直接用默认配置。

如果后面要换范围，优先改这里：

- [default.mobile.json](/Users/maoyuan/code/travel-video-llm/scripts/ui_loop/default.mobile.json)

重点字段：

- `goal`
- `context_files`
- `editable_paths`
- `focus_paths`
- `validation_commands`
- `duration_hours`
- `max_rounds`

## 风险边界

- 这是“自治迭代 runner”，不是严格证明最优解的系统。
- 它的质量取决于：
  - 你给的上下文
  - `codex` 模型本身
  - 当前 lint/typecheck 的信噪比
- 如果 baseline 本来就有错误，runner 会把当前 baseline 作为比较基线，只拦截“比 baseline 更差”的回归。
- 如果你希望更强的 UI 真值校验，下一步应接入截图对比、Maestro、可访问性审计或页面级 smoke test。

## 没有稳定移动端测试时怎么跑

这正是这个 runner 适合的场景。

对于移动端 UI，自自治优化不一定要以自动测试为主。更现实的分层是：

1. 第一层：顶级产品/交互/视觉启发式评审
2. 第二层：代码结构审查
3. 第三层：最小健康检查
4. 第四层：人工抽查

如果你现在最想要的是“让 agent 自己像顶尖产品官、体验官、UI 总监一样持续发现问题并迭代”，可以直接使用评审优先配置。

这个模式下：

- 不强依赖自动测试
- 主要靠 `audit -> challenge -> execute -> review`
- 让模型先找问题、自己攻击自己的方案、再修改、再苛刻复审
- 更适合产品体验和 UI 的长期打磨

启动方式：

```bash
python3 scripts/ui_loop_runner.py --config scripts/ui_loop/heuristic.mobile.json start
```

这个模式的意义不是“代码一定正确”，而是“先让产品体验和 UI 持续快速收敛”。

更稳的建议是：

- 早期探索阶段：用 `heuristic.mobile.json`
- 临近收敛阶段：再切回 `default.mobile.json`

也就是先让它像产品体验总监一样跑，再让它加上 lint/typecheck 做收口。

## 是否需要重新安装 / build

这次新增的是本地脚本和文档，不需要重新 build 后端。

建议在第一次正式跑之前确认前端依赖已安装：

```bash
cd mobile && npm install
```

然后直接运行：

```bash
python3 scripts/ui_loop_runner.py start
```
