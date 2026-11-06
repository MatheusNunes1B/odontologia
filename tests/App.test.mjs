import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformWithEsbuild } from 'vite';

const source = (await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'))
  .trimStart().replace(/^import .*;\r?$/gm, '').replace('export default function App', 'function App');
const { code } = await transformWithEsbuild(source, 'App.jsx', { jsx: 'transform' });

async function mount({ granted = true, storage = new Map(), failSchedule = false } = {}) {
  const states = [], refs = [], calls = [];
  let index = 0, refIndex = 0, mounted = false, effect, callback;
  const plugin = {
    addListener: async (name, cb) => { callback = cb; return { remove: async () => {} }; },
    registerActionTypes: async value => calls.push(['actions', value]),
    createChannel: async () => {},
    checkPermissions: async () => ({ display: 'prompt' }),
    requestPermissions: async () => { calls.push(['permission']); return { display: granted ? 'granted' : 'denied' }; },
    cancel: async value => calls.push(['cancel', value]),
    removeDeliveredNotifications: async () => {},
    schedule: async value => { if (failSchedule) throw new Error('Falha simulada'); calls.push(['schedule', value]); },
  };
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    useState: initial => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
    useRef: initial => { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useEffect: fn => { if (!mounted) effect = fn; },
    Capacitor: { getPlatform: () => 'android' }, LocalNotifications: plugin,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  });
  vm.runInContext(code + '\nglobalThis.renderApp = App;', context);
  function render() { index = 0; refIndex = 0; return context.renderApp(); }
  render(); mounted = true; effect();
  await new Promise(resolve => setImmediate(resolve));
  function buttons(node, result = []) {
    if (node?.type === 'button') result.push(node);
    for (const child of node?.children || []) buttons(child, result);
    return result;
  }
  return { calls, states, storage, click: i => buttons(render())[i].props.onClick(), action: (actionId, id = 250) => callback({ actionId, notification: { id } }) };
}

test('permissão negada impede envio e informa o usuário', async () => {
  const app = await mount({ granted: false });
  await app.click(1);
  assert.equal(app.calls.some(([name]) => name === 'schedule'), false);
  assert.match(app.states[4].text, /Permissão negada/);
});
test('botão de permissão solicita autorização sem agendar', async () => {
  const app = await mount(); await app.click(0);
  assert.equal(app.states[3], 'Permitidas');
  assert.equal(app.calls.some(([name]) => name === 'schedule'), false);
});
test('notificação imediata usa texto correto sem agendamento nem acesso especial', async () => {
  const app = await mount(); await app.click(1);
  const notification = app.calls.find(([name]) => name === 'schedule')[1].notifications[0];
  assert.equal(notification.body, 'Não esqueça de cuidar do seu sorriso! 🦷');
  assert.equal(notification.schedule, undefined);
  assert.equal(notification.isExactNotification, false);
});
test('agenda ID 250 para dez segundos e evita cliques concorrentes', async () => {
  const app = await mount(); const start = Date.now();
  await Promise.all([app.click(2), app.click(2)]);
  const scheduled = app.calls.filter(([name]) => name === 'schedule');
  assert.equal(scheduled.length, 1);
  const notification = scheduled[0][1].notifications[0];
  assert.equal(notification.id, 250);
  assert.equal(notification.actionTypeId, 'consulta-limpeza');
  assert.ok(notification.schedule.at.getTime() >= start + 10000);
  assert.ok(notification.schedule.at.getTime() <= Date.now() + 10000);
  assert.ok(app.calls.findIndex(([name]) => name === 'cancel') < app.calls.findIndex(([name]) => name === 'schedule'));
  const action = app.calls.find(([name]) => name === 'actions')[1].types[0].actions[0];
  assert.equal(action.title, '✅ Confirmar presença');
  assert.equal(action.foreground, true);
});
test('somente a ação correta confirma e persiste após remontar', async () => {
  const app = await mount();
  app.action('tap'); app.action('confirmar-presenca', 251);
  assert.equal(app.states[0], false);
  app.action('confirmar-presenca');
  assert.equal(app.states[0], true);
  const reopened = await mount({ storage: app.storage });
  assert.equal(reopened.states[0], true);
});
test('erro de envio aparece e libera os botões', async () => {
  const app = await mount({ failSchedule: true }); await app.click(2);
  assert.equal(app.states[4].error, true);
  assert.match(app.states[4].text, /Falha simulada/);
  assert.equal(app.states[2], false);
});
