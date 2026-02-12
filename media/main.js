/* global acquireVsCodeApi, Vue */

const vscode = acquireVsCodeApi();
const { createApp, reactive, computed, ref, onMounted, onBeforeUnmount } = Vue;

const formatNumber = (value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return value;
  }
  return new Intl.NumberFormat().format(Number(value));
};

const rootComponent = {
  template: `
    <div class="container">
      <header class="toolbar">
        <h1>LDF Explorer</h1>
        <span class="file-name" v-if="state.ldf?.channel_name">通道：{{ state.ldf.channel_name }}</span>
        <div class="spacer"></div>
        <button class="btn" @click="refresh" :disabled="state.status === 'loading'">刷新</button>
        <button class="btn btn-primary" @click="saveChanges" :disabled="!hasChanges || state.status === 'saving'">
          {{ state.status === 'saving' ? '保存中...' : '保存' }}
        </button>
        <span class="timestamp" v-if="state.lastUpdated">更新：{{ state.lastUpdated }}</span>
      </header>

      <section v-if="state.status === 'loading'" class="status">
        正在解析 LDF 文件...
      </section>

      <section v-else-if="state.status === 'error'" class="status error">
        <p>{{ state.error }}</p>
        <details v-if="state.traceback">
          <summary>查看详细错误</summary>
          <pre>{{ state.traceback }}</pre>
        </details>
      </section>

      <main v-else class="layout">
        <section class="panel">
          <h2>基本信息</h2>
          <dl>
            <dt>协议版本</dt><dd>{{ state.ldf.protocol_version }}</dd>
            <dt>语言版本</dt><dd>{{ state.ldf.language_version }}</dd>
            <dt>波特率</dt><dd>{{ formatNumber(state.ldf.speed) }}</dd>
            <dt>校验</dt><dd>{{ state.ldf.checksum_model || '未定义' }}</dd>
          </dl>
        </section>

        <section class="panel">
          <h2>节点</h2>
          <div v-if="nodes.master" class="node">
            <h3>主节点</h3>
            <p>{{ nodes.master.name }} (响应超时：{{ nodes.master.response_tolerance ?? '未定义' }})</p>
          </div>
          <div>
            <h3>从节点 ({{ nodes.slaves.length }})</h3>
            <ul class="list">
              <li v-for="slave in nodes.slaves" :key="slave.name">
                <strong>{{ slave.name }}</strong>
                <span v-if="slave.product_id"> - ID: {{ slave.product_id.supplier_id }}/{{ slave.product_id.function_id }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h2>信号 ({{ signals.length }})</h2>
            <button class="btn btn-sm" @click="addSignal">+ 添加</button>
          </div>
          <ul class="list">
            <li v-for="(signal, index) in signals" :key="signal._id || signal.name" :class="{ 'item-deleted': signal._action === 'delete', 'item-new': signal._action === 'create' }">
              <div v-if="signal._editing" class="edit-form">
                <div class="form-row">
                  <label>名称:</label>
                  <input v-model="signal.name" placeholder="信号名" />
                </div>
                <div class="form-row">
                  <label>宽度(bit):</label>
                  <input type="number" v-model.number="signal.width" min="1" max="64" />
                </div>
                <div class="form-row">
                  <label>初始值:</label>
                  <input type="number" v-model.number="signal.init_value" />
                </div>
                <div class="form-row">
                  <button class="btn btn-sm" @click="saveSignalEdit(index)">确定</button>
                  <button class="btn btn-sm" @click="cancelSignalEdit(index)">取消</button>
                </div>
              </div>
              <div v-else class="list-row">
                <strong>{{ signal.name }}</strong>
                <span>{{ signal.width }} bit</span>
                <span>初值: {{ signal.init_value ?? 0 }}</span>
                <div class="actions">
                  <button class="btn btn-sm" @click="editSignal(index)">编辑</button>
                  <button class="btn btn-sm btn-danger" @click="deleteSignal(index)">删除</button>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h2>报文 ({{ frames.length }})</h2>
            <button class="btn btn-sm" @click="addFrame">+ 添加</button>
          </div>
          <ul class="list">
            <li v-for="(frame, index) in frames" :key="frame._id || frame.name" :class="{ 'item-deleted': frame._action === 'delete', 'item-new': frame._action === 'create' }">
              <div v-if="frame._editing" class="edit-form">
                <div class="form-row">
                  <label>名称:</label>
                  <input v-model="frame.name" placeholder="报文名" />
                </div>
                <div class="form-row">
                  <label>帧ID:</label>
                  <input type="number" v-model.number="frame.frame_id" min="0" max="63" />
                </div>
                <div class="form-row">
                  <label>长度(byte):</label>
                  <input type="number" v-model.number="frame.length" min="1" max="8" />
                </div>
                <div class="form-row">
                  <label>发布者:</label>
                  <select v-model="frame.publisher">
                    <option v-for="node in allNodes" :value="node">{{ node }}</option>
                  </select>
                </div>
                <div class="form-section">
                  <h4>信号映射</h4>
                  <ul class="nested-list">
                    <li v-for="(sig, sigIdx) in frame.signals" :key="sigIdx">
                      <select v-model="sig.signal">
                        <option v-for="s in availableSignals" :value="s.name">{{ s.name }}</option>
                      </select>
                      <span>偏移:</span>
                      <input type="number" v-model.number="sig.offset" min="0" max="63" style="width: 60px;" />
                      <button class="btn btn-sm" @click="removeSignalFromFrame(index, sigIdx)">×</button>
                    </li>
                  </ul>
                  <button class="btn btn-sm" @click="addSignalToFrame(index)">+ 添加信号</button>
                </div>
                <div class="form-row">
                  <button class="btn btn-sm" @click="saveFrameEdit(index)">确定</button>
                  <button class="btn btn-sm" @click="cancelFrameEdit(index)">取消</button>
                </div>
              </div>
              <div v-else class="list-row column">
                <div class="frame-header">
                  <strong>{{ frame.name }}</strong>
                  <span>ID: {{ frame.frame_id }}</span>
                  <span>长度: {{ frame.length ?? '未定义' }}</span>
                  <span>发布: {{ frame.publisher }}</span>
                  <div class="actions">
                    <button class="btn btn-sm" @click="editFrame(index)">编辑</button>
                    <button class="btn btn-sm btn-danger" @click="deleteFrame(index)">删除</button>
                  </div>
                </div>
                <ul class="nested" v-if="frame.signals?.length">
                  <li v-for="sig in frame.signals" :key="sig.signal">
                    <span>{{ sig.signal }}</span>
                    <span>偏移: {{ sig.offset }}bit</span>
                  </li>
                </ul>
              </div>
            </li>
          </ul>
        </section>
      </main>
    </div>
  `,
  setup() {
    const state = reactive({
      status: 'loading',
      error: '',
      traceback: '',
      ldf: null,
      lastUpdated: ''
    });

    const signalChanges = reactive([]);
    const frameChanges = reactive([]);
    let idCounter = 0;

    const originalSignals = ref([]);
    const originalFrames = ref([]);

    const signals = computed(() => {
      const baseSignals = (state.ldf?.signals ?? []).map(s => ({
        ...s,
        _original: { ...s }
      }));

      const changes = signalChanges.filter(c => c._action !== 'delete');
      const deletedNames = new Set(signalChanges.filter(c => c._action === 'delete').map(c => c.name));

      return [...baseSignals.filter(s => !deletedNames.has(s.name)), ...changes];
    });

    const frames = computed(() => {
      const baseFrames = (state.ldf?.frames ?? []).map(f => ({
        ...f,
        _original: { ...f }
      }));

      const changes = frameChanges.filter(c => c._action !== 'delete');
      const deletedNames = new Set(frameChanges.filter(c => c._action === 'delete').map(c => c.name));

      return [...baseFrames.filter(f => !deletedNames.has(f.name)), ...changes];
    });

    const nodes = computed(() => {
      const master = state.ldf?.nodes?.master ?? null;
      const slaveNames = state.ldf?.nodes?.slaves ?? [];
      const attributes = state.ldf?.node_attributes ?? [];
      const attributesByName = Object.fromEntries(attributes.map((item) => [item.name, item]));

      const slaves = slaveNames.map((name) => {
        const details = attributesByName[name] ?? {};
        return { name, ...details };
      });

      return { master, slaves };
    });

    const allNodes = computed(() => {
      const list = [];
      if (nodes.value.master) list.push(nodes.value.master.name);
      list.push(...nodes.value.slaves.map(s => s.name));
      return list;
    });

    const availableSignals = computed(() => signals.value.filter(s => s._action !== 'delete'));

    const hasChanges = computed(() => signalChanges.length > 0 || frameChanges.length > 0);

    const refresh = () => {
      state.status = 'loading';
      signalChanges.length = 0;
      frameChanges.length = 0;
      vscode.postMessage({ type: 'requestRefresh' });
    };

    const saveChanges = () => {
      state.status = 'saving';
      const payload = {
        signals: signalChanges,
        frames: frameChanges
      };
      vscode.postMessage({ type: 'saveChanges', payload });
    };

    // Signal CRUD
    const addSignal = () => {
      signalChanges.push({
        _id: `new_${++idCounter}`,
        _action: 'create',
        _editing: true,
        name: `NewSignal_${idCounter}`,
        width: 8,
        init_value: 0,
        publisher: allNodes.value[0] || '',
        subscribers: []
      });
    };

    const editSignal = (index) => {
      const signal = signals.value[index];
      signal._editing = true;
    };

    const saveSignalEdit = (index) => {
      const signal = signals.value[index];
      if (!signal.name || signal.width < 1) {
        return;
      }

      const existingChange = signalChanges.find(c => c._id === signal._id);
      if (existingChange) {
        Object.assign(existingChange, signal, { _editing: false });
      } else {
        signalChanges.push({
          ...signal,
          _action: 'update',
          _editing: false
        });
      }
      signal._editing = false;
    };

    const cancelSignalEdit = (index) => {
      const signal = signals.value[index];
      if (signal._id?.startsWith('new_')) {
        const changeIdx = signalChanges.findIndex(c => c._id === signal._id);
        if (changeIdx >= 0) signalChanges.splice(changeIdx, 1);
      } else {
        signal._editing = false;
      }
    };

    const deleteSignal = (index) => {
      const signal = signals.value[index];
      const changeIdx = signalChanges.findIndex(c => c._id === signal._id || c.name === signal.name);

      if (signal._id?.startsWith('new_')) {
        if (changeIdx >= 0) signalChanges.splice(changeIdx, 1);
      } else {
        if (changeIdx >= 0) signalChanges.splice(changeIdx, 1);
        signalChanges.push({
          _action: 'delete',
          name: signal.name
        });
      }
    };

    // Frame CRUD
    const addFrame = () => {
      frameChanges.push({
        _id: `new_${++idCounter}`,
        _action: 'create',
        _editing: true,
        name: `NewFrame_${idCounter}`,
        frame_id: 0,
        length: 8,
        publisher: allNodes.value[0] || '',
        signals: []
      });
    };

    const editFrame = (index) => {
      const frame = frames.value[index];
      frame._editing = true;
    };

    const saveFrameEdit = (index) => {
      const frame = frames.value[index];
      if (!frame.name || frame.frame_id < 0 || frame.frame_id > 63) {
        return;
      }

      const existingChange = frameChanges.find(c => c._id === frame._id);
      if (existingChange) {
        Object.assign(existingChange, frame, { _editing: false });
      } else {
        frameChanges.push({
          ...frame,
          _action: 'update',
          _editing: false
        });
      }
      frame._editing = false;
    };

    const cancelFrameEdit = (index) => {
      const frame = frames.value[index];
      if (frame._id?.startsWith('new_')) {
        const changeIdx = frameChanges.findIndex(c => c._id === frame._id);
        if (changeIdx >= 0) frameChanges.splice(changeIdx, 1);
      } else {
        frame._editing = false;
      }
    };

    const deleteFrame = (index) => {
      const frame = frames.value[index];
      const changeIdx = frameChanges.findIndex(c => c._id === frame._id || c.name === frame.name);

      if (frame._id?.startsWith('new_')) {
        if (changeIdx >= 0) frameChanges.splice(changeIdx, 1);
      } else {
        if (changeIdx >= 0) frameChanges.splice(changeIdx, 1);
        frameChanges.push({
          _action: 'delete',
          name: frame.name
        });
      }
    };

    const addSignalToFrame = (frameIndex) => {
      const frame = frames.value[frameIndex];
      if (!frame.signals) frame.signals = [];
      frame.signals.push({ signal: availableSignals.value[0]?.name || '', offset: 0 });
    };

    const removeSignalFromFrame = (frameIndex, sigIndex) => {
      const frame = frames.value[frameIndex];
      frame.signals.splice(sigIndex, 1);
    };

    const handleMessage = (event) => {
      const message = event.data;
      if (!message || !message.type) return;

      switch (message.type) {
        case 'loading':
          state.status = 'loading';
          state.error = '';
          state.traceback = '';
          break;
        case 'ok':
          state.status = 'ok';
          state.ldf = message.payload;
          state.lastUpdated = new Date().toLocaleString();
          signalChanges.length = 0;
          frameChanges.length = 0;
          break;
        case 'error':
          state.status = 'error';
          state.error = message.payload;
          state.traceback = message.traceback ?? '';
          break;
        case 'saveError':
          state.status = 'ok';
          break;
        default:
          break;
      }
    };

    onMounted(() => {
      window.addEventListener('message', handleMessage);
      vscode.postMessage({ type: 'ready' });
    });

    onBeforeUnmount(() => {
      window.removeEventListener('message', handleMessage);
    });

    return {
      state,
      signals,
      frames,
      nodes,
      allNodes,
      availableSignals,
      hasChanges,
      refresh,
      saveChanges,
      addSignal,
      editSignal,
      saveSignalEdit,
      cancelSignalEdit,
      deleteSignal,
      addFrame,
      editFrame,
      saveFrameEdit,
      cancelFrameEdit,
      deleteFrame,
      addSignalToFrame,
      removeSignalFromFrame,
      formatNumber
    };
  }
};

createApp(rootComponent).mount('#app');
