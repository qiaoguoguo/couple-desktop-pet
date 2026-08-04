# Q-girl Animation Quality Pass Dev Round 1 Report

## Status

DONE_WITH_CONCERNS

本轮仅执行计划中的 Task 1、Task 4、Task 5、Task 6。Task 2/Task 3 的 Image Gen 生图与帧替换未执行，Task 7 的完整 debug exe 构建未执行，等待主任务补齐新资源帧后继续。

## Commits

- `7457193` `tool: add q girl keyframe frame pipeline`
- `a193ef3` `feat: add ambient idle behavior selector`
- `10c59e4` `feat: support ambient pet interactions`
- `3b6370c` `fix: interleave q girl keyframe sheets`
- `a90ec9d` `feat: play ambient interactions during idle`

## Changed Files

- `scripts/asset_tools/q_girl_keyframe_pipeline.py`
- `src/pet-core/idleBehaviorSelector.ts`
- `src/pet-core/idleBehaviorSelector.test.ts`
- `src/pet-core/petTypes.ts`
- `src/pet-core/petStateMachine.ts`
- `src/pet-core/petStateMachine.test.ts`
- `src/pet-core/petScheduler.ts`
- `src/pet-core/petScheduler.test.ts`
- `src/app/App.tsx`
- `src/app/App.test.tsx`

## Summary

- 新增 Q-girl keyframe pipeline 的 `build`、`validate`、`contact-sheet`、`self-test` 命令。
- `load_action_keyframes` 已按新版计划改为多张 sheet 按 cell 阶段交错读取，避免动画中途重启。
- 新增 `selectNextIdleBehavior`，在普通 idle 动作和自动环境互动之间做选择，环境互动有权重且避免直接重复上一动作。
- 新增 `AMBIENT_INTERACTION_SELECTED` 事件；环境互动不更新 `lastInteractionAt`。
- 自动移动调度改为使用当前 idle residence time，避免被旧交互时间触发。
- App 在 idle 动画完成时接入待机导演层；自动环境互动只播放动作，不弹气泡、不创建 motion scene、不发送 relay 消息。

## Verification

- `python scripts/asset_tools/q_girl_keyframe_pipeline.py self-test`：通过。
- `pnpm test -- src/pet-core/idleBehaviorSelector.test.ts src/pet-core/petStateMachine.test.ts src/pet-core/petScheduler.test.ts src/app/App.test.tsx`：通过；当前脚本会以 `vitest run "--" ...` 形式执行，实际跑完整前端测试，29 files / 167 tests passed。
- `pnpm typecheck`：通过。

## Not Done

- 未执行 Task 2/Task 3：未生成或替换新的 Q-girl sheet / 768x960 帧。
- 未执行 Task 7：未跑完整 `pnpm tauri build --debug` 或桌面端手工烟测。

## Risks

- 目前 Q-girl 动画质量仍依赖后续主任务生成的新 sheet；本轮只完成 pipeline、状态机调度和 App 播放链路。
- 自动环境互动当前启用固定 30% 触发率，后续如体验过频可在设置或 manifest 中参数化。
