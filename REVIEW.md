# TDD 项目 Review 流程（可落地版）

适用于 vscode-ldf-explorer 及同类 TDD 驱动项目。

---

## Phase 0: 自动化预检（开发者提交前必须完成）

```bash
npm run compile && npx vitest run --coverage
```

**强制通过标准（不通过直接打回）：**

| # | 检查项 | 通过标准 |
|---|--------|---------|
| 1 | 编译 | `tsc -p ./` 0 errors |
| 2 | 测试 | `vitest run` 0 failures |
| 3 | 新增行覆盖 | ≥ 90% |
| 4 | 新增分支覆盖 | ≥ 80% |
| 5 | 无调试残留 | `grep -r "\.only\|\.skip" tests/` 为空 |
| 6 | 无 console.log | `grep -r "console.log" src/ tests/` 为空 |

---

## Phase 1: Review 测试文件（先看测试，再看实现）

**只读 `tests/` 目录，不读 `src/`。**

### 1.1 需求追溯检查

打开每个变更的测试文件，确认顶部有需求注释：

```typescript
// Covers FR-03: Signal CRUD (PRD §3, §6).
```

**Checklist:**
- [ ] 每个测试文件头部有需求追溯注释（FR-XX / PRD §X）
- [ ] 每个 `describe()` 对应一个业务场景，不是方法名
- [ ] 没有看到 `describe('createSignalMethod')` 这类实现导向的分组

### 1.2 测试命名审查

逐行读 `it()` 描述，它们应该像需求句子：

```typescript
// ✅ 通过 — 看完能复述业务规则
it('should reject width greater than 64')
it('should cancel staged deletion and restore signal to cache')
it('should reflect committed changes without re-parsing')

// ❌ 不通过 — 不知道在验证什么业务规则
it('tests create with invalid input')
it('validate method works')
```

**Checklist:**
- [ ] 所有 `it()` 用 `should` 开头
- [ ] 测试名描述行为，不描述方法名
- [ ] 看完所有 `it()` 能反推出业务规则（不看 PRD 也能懂）

### 1.3 红-绿验证（Mutation Test 简化版）

**这是 TDD Review 最关键的步骤。**

```bash
# 1. 故意破坏一个边界校验
sed -i 's/signal.width > 64/signal.width > 100/' src/service/signalService.ts

# 2. 跑测试，确认 `should reject width greater than 64` 失败
npx vitest run tests/unit/signalService.test.ts
# 预期：1 failed

# 3. 恢复
sed -i 's/signal.width > 100/signal.width > 64/' src/service/signalService.ts
```

**Checklist:**
- [ ] 注释掉任意一个校验逻辑，有测试失败
- [ ] 改错一个返回值，有测试失败
- [ ] 如果改了代码但所有测试仍通过 → **测试有漏洞，打回**

### 1.4 边界覆盖检查

对照实现文件的每个 `if` / `throw` / `else`，确认测试文件有对应覆盖：

```typescript
// 实现代码
if (signal.width < 1 || signal.width > 64) { throw ... }

// 测试必须有这两个：
it('should reject width less than 1')
it('should reject width greater than 64')
```

**Checklist:**
- [ ] 每个 `throw` 至少被一个 `it('should reject/throw...')` 覆盖
- [ ] 每个 `if` 的真/假分支都有测试（或解释为什么不需要）
- [ ] 每个 public 方法至少有一个正常路径（happy path）测试

---

## Phase 2: Review 实现文件（在测试保护下看实现）

### 2.1 最简实现检查

TDD 的核心：**刚好足够的代码，不过度设计。**

```typescript
// ❌ 不通过 — 过度抽象
interface ISignalValidator {
  validate(signal: LdfSignal): ValidationResult;
}
class SignalWidthValidator implements ISignalValidator { ... }
class SignalNameValidator implements ISignalValidator { ... }
class CompositeValidator implements ISignalValidator { ... }

// ✅ 通过 — just enough
private _validateSignal(signal: LdfSignal): void {
  if (signal.width < 1 || signal.width > 64) throw ...;
}
```

**Checklist:**
- [ ] 没有为"未来可能的变化"引入抽象（工厂/策略/桥接）
- [ ] 每个方法 ≤ 20 行（除非有充分理由）
- [ ] 没有未使用的参数、变量、import

### 2.2 命名质量

```typescript
// ❌ 不通过
function processData(x: any): any { ... }
const temp = s.width;

// ✅ 通过
function validateSignalWidth(signal: LdfSignal): void { ... }
const signalWidth = signal.width;
```

**Checklist:**
- [ ] 变量名反映业务概念（cache, pendingChanges, signal, frame）
- [ ] 方法名是动词（create, update, delete, validate, commit）
- [ ] 布尔值用 is/has/should（`isNew`, `hasPendingChanges`）

### 2.3 防御性编程

```typescript
// ❌ 不通过 — 返回内部引用，外部可破坏状态
get(name: string): LdfSignal | undefined {
  return this.cache.get(name); // 外部可以直接修改!
}

// ✅ 通过 — 防御性拷贝
get(name: string): LdfSignal | undefined {
  const signal = this.cache.get(name);
  return signal ? { ...signal } : undefined;
}
```

**Checklist:**
- [ ] 对外暴露的方法返回防御性拷贝（不是内部引用）
- [ ] 参数校验在入口做，不在深层方法传播
- [ ] 错误消息包含具体上下文（`got ${signal.width}`，不是"Invalid input"）

### 2.4 注释质量（CLAUDE.md §Code Style）

```typescript
// ❌ 不通过 — 废话
// This function creates a signal
function create(data: LdfSignal) { ... }

// ✅ 通过 — 解释 WHY
// Uses Math.pow instead of bit-shift to avoid overflow at width === 64
const maxValue = Math.pow(2, signal.width) - 1;
```

**Checklist:**
- [ ] 没有 WHAT 注释（代码命名已说明）
- [ ] 每个非显而易见的决策有 WHY 注释
- [ ] 没有多行 docstring / 段落块注释

---

## Phase 3: Review 架构与耦合

### 3.1 模块边界检查

对照架构图验证：

```
WebView → Extension(postMessage代理) → Service Layer → PythonBridge → Python
```

**Checklist:**
- [ ] Extension 只做 postMessage 转发，没有业务逻辑
- [ ] PythonBridge 是唯一接触 `child_process` 的地方
- [ ] FrameService 通过 `SignalService` 查询信号，不直接访问 PythonBridge
- [ ] Service Layer 不 import VS Code API

### 3.2 状态管理审查

针对 Strategy C（内存缓存 + 落盘持久化）：

**Checklist:**
- [ ] `cache` / `pendingChanges` / `originalCache` 职责清晰，不混用
- [ ] `commit()` 后 `pendingChanges` 被清空
- [ ] `commit()` 后不需要重新解析文件（cache 已是正确状态）
- [ ] `refresh()` 确实丢弃了未提交的变更

---

## Phase 4: Review 测试质量（深度检查）

### 4.1 Mock 合理性

```typescript
// ✅ 通过 — Mock 外部依赖
const mockBridge = { saveFile: vi.fn() };

// ❌ 不通过 — Mock 被测对象的内部方法
vi.spyOn(service, '_validateSignal').mockReturnValue();
```

**Checklist:**
- [ ] 单元测试只 Mock 外部依赖（PythonBridge、VS Code API）
- [ ] 不 Mock 被测模块的内部方法
- [ ] Mock 在 `beforeEach` 中重置（`vi.clearAllMocks()`）

### 4.2 测试独立性

```typescript
// ❌ 不通过 — 测试 A 改了全局状态，测试 B 依赖它
let globalCounter = 0;
it('test A', () => { globalCounter = 1; });
it('test B', () => { expect(globalCounter).toBe(0); }); // 时序依赖！

// ✅ 通过 — 每个测试独立
beforeEach(() => { service = new SignalService(...); });
```

**Checklist:**
- [ ] 测试之间没有共享可变状态
- [ ] 每个测试套件有 `beforeEach` 重置
- [ ] 没有测试依赖执行顺序

### 4.3 断言质量

```typescript
// ❌ 不通过 — 模糊断言
expect(result).toBeTruthy();

// ✅ 通过 — 精确断言
expect(service.get('EngineSpeed')?.width).toBe(8);
```

**Checklist:**
- [ ] 每个 `it()` 只有一个核心断言（或一组紧密相关的断言）
- [ ] 不用 `toBeTruthy()` / `toBeDefined()` 替代具体值检查
- [ ] 错误测试用 `.rejects.toThrow('exact message')`

---

## Review 结果判定

| 结果 | 标准 |
|------|------|
| **通过** | Phase 0-4 全部通过，无阻塞问题 |
| **有条件通过** | Phase 0-2 通过，Phase 3-4 有非阻塞建议 |
| **打回** | Phase 0 未通过，或 Phase 1-2 有阻塞问题 |

**阻塞问题定义：**
- 测试未通过 / 编译错误
- 测试名描述不清，无法理解业务意图
- 故意破坏代码后测试不失败（假测试）
- 新增代码无测试覆盖
- 过度设计（不必要的抽象层）

---

## Review 模板（直接复制到 PR 评论）

```markdown
## Review 结果

### Phase 0: 自动化预检
- [ ] `npm run compile` 通过
- [ ] `npx vitest run` 0 failures
- [ ] 覆盖率 ≥ 90% / 80%

### Phase 1: 测试审查
- [ ] 需求追溯注释完整
- [ ] 测试名行为驱动
- [ ] 红-绿验证通过（故意破坏代码，测试失败）
- [ ] 边界覆盖完整

### Phase 2: 实现审查
- [ ] 最简实现，无过度设计
- [ ] 命名清晰
- [ ] 防御性拷贝
- [ ] 注释只写 WHY

### Phase 3: 架构审查
- [ ] 模块边界正确
- [ ] 状态管理清晰

### Phase 4: 测试质量
- [ ] Mock 合理
- [ ] 测试独立
- [ ] 断言精确

**判定：** 通过 / 有条件通过 / 打回

**备注：**
```
