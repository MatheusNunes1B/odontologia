import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const STORAGE_KEY = 'sorriso-presenca';
const ACTION_TYPE = 'consulta-limpeza';
const CONFIRM = 'confirmar-presenca';
const CHANNEL = 'lembretes';
const isAndroid = Capacitor.getPlatform() === 'android';

export default function App() {
  const [confirmed, setConfirmed] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState('Não verificada');
  const [message, setMessage] = useState({ text: isAndroid ? 'Ative as notificações para começar.' : 'Prévia da interface. Instale o APK no Android para testar os alertas.', error: false });
  const locked = useRef(false);
  const report = (text, error = false) => setMessage({ text, error });

  useEffect(() => {
    let disposed = false;
    let listener;
    try { setConfirmed(localStorage.getItem(STORAGE_KEY) === 'confirmada'); }
    catch { report('Não foi possível ler a confirmação salva.', true); }
    if (!isAndroid) return;
    async function initialize() {
      // O plugin retém a ação de abertura até este listener estar registrado.
      listener = await LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
        if (actionId !== CONFIRM || notification.id !== 250) return;
        setConfirmed(true);
        try {
          localStorage.setItem(STORAGE_KEY, 'confirmada');
          report('Sua presença foi confirmada. Até a consulta!');
        } catch { report('Presença confirmada, mas não foi possível salvá-la neste dispositivo.', true); }
      });
      if (disposed) { await listener.remove(); return; }
      await LocalNotifications.registerActionTypes({ types: [{ id: ACTION_TYPE, actions: [{ id: CONFIRM, title: '✅ Confirmar presença', foreground: true }] }] });
      await LocalNotifications.createChannel({ id: CHANNEL, name: 'Lembretes de limpeza', description: 'Avisos da Sorriso Odontologia', importance: 4, visibility: 1, vibration: true });
      if (!disposed) setReady(true);
    }
    initialize().catch(error => { if (!disposed) report(`Não foi possível preparar as notificações: ${error.message || error}`, true); });
    return () => { disposed = true; listener?.remove(); };
  }, []);

  async function ensurePermission() {
    let result = await LocalNotifications.checkPermissions();
    if (result.display !== 'granted') result = await LocalNotifications.requestPermissions();
    setPermission(result.display === 'granted' ? 'Permitidas' : 'Não permitidas');
    if (result.display !== 'granted') throw new Error('Permissão negada. Ative as notificações nas configurações do Android para continuar.');
  }

  async function handleAction(action) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      if (!isAndroid) throw new Error('As notificações nativas estão disponíveis no aplicativo Android.');
      if (!ready) throw new Error('As notificações ainda não estão prontas. Reabra o aplicativo se o erro persistir.');
      await ensurePermission();
      if (action === 'permission') { report('Permissão concedida. As notificações estão habilitadas.'); return; }
      const scheduled = action === 'scheduled';
      const id = scheduled ? 250 : 251;
      // Um ID fixo e cancelamento prévio impedem lembretes duplicados.
      await LocalNotifications.cancel({ notifications: [{ id }] });
      await LocalNotifications.removeDeliveredNotifications({ notifications: [{ id }] });
      await LocalNotifications.schedule({ notifications: [{
        id, title: 'Sorriso Odonto', channelId: CHANNEL,
        body: scheduled ? 'Sua consulta de limpeza é amanhã às 14:00.' : 'Não esqueça de cuidar do seu sorriso! 🦷',
        // Evita abrir as configurações de alarmes especiais no plugin 8.3+.
        isExactNotification: false,
        ...(scheduled ? { schedule: { at: new Date(Date.now() + 1000 * 10), allowWhileIdle: true }, actionTypeId: ACTION_TYPE } : {}),
      }] });
      report(scheduled ? 'Lembrete agendado para daqui a 10 segundos. O Android pode atrasar a entrega para economizar bateria.' : 'Envio da notificação imediata solicitado. Confira os alertas do Android.');
    } catch (error) { report(error.message || 'Não foi possível concluir a operação.', true); }
    finally { locked.current = false; setBusy(false); }
  }

  return (
    <main className="safe-area mx-auto flex min-h-dvh max-w-lg flex-col justify-center">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-5xl shadow-sm" aria-hidden="true">🦷</div>
        <p className="mb-2 text-xs font-bold tracking-[0.2em] text-blue-600">CUIDADO QUE FAZ SORRIR</p>
        <h1 className="text-3xl font-bold tracking-tight">Sorriso Odontologia</h1>
        <p className="mt-2 text-sm text-slate-500">Lembrete de limpeza dentária</p>
      </header>
      <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm" aria-labelledby="notifications-title">
        <div className="mb-5">
          <h2 id="notifications-title" className="text-lg font-semibold">Seus lembretes</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">Um pequeno lembrete para manter seu sorriso em dia.</p>
        </div>
        <div className="flex flex-col gap-3">
          <button disabled={busy || (isAndroid && !ready)} onClick={() => handleAction('permission')} className="min-h-14 rounded-2xl border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">Verificar / Solicitar permissão</button>
          <button disabled={busy || (isAndroid && !ready)} onClick={() => handleAction('immediate')} className="min-h-14 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100">Notificação imediata</button>
          <button disabled={busy || (isAndroid && !ready)} onClick={() => handleAction('scheduled')} className="min-h-14 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">Agendar notificação (10s)</button>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Notificações: {permission}</p>
      </section>
      <section className="mt-4 rounded-3xl border border-blue-100 bg-white/75 p-6" aria-labelledby="presence-title">
        <h2 id="presence-title" className="text-xs font-semibold uppercase tracking-widest text-slate-500">Sua presença</h2>
        <p className={`mt-2 text-lg font-semibold ${confirmed ? 'text-emerald-700' : 'text-slate-700'}`} aria-live="polite">{confirmed ? '✅ Presença confirmada' : 'Presença pendente'}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">Confirme diretamente no alerta da consulta. Se necessário, expanda a notificação para ver a ação.</p>
      </section>
      <p role="status" aria-live="polite" className={`mt-4 rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.error ? 'bg-red-50 text-red-700' : 'bg-blue-100/60 text-blue-800'}`}>{message.text}</p>
      <footer className="mt-7 text-center text-xs text-slate-400">Aluno 25 · Limpeza dentária preventiva</footer>
    </main>
  );
}
