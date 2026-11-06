# 🦷 Sorriso Odontologia

Atividade do **Aluno 25**: lembrete de limpeza dentária preventiva. Uma tela em React + Vite + Tailwind CSS, com notificações locais Android pelo Capacitor. Sem servidor, cadastro ou banco de dados.

## Executar

Requisitos: Node.js 22.12+ e npm. Para compilar Android: JDK 21 e Android SDK 36.

```bash
npm ci
npm run dev
npm test
npm run android:sync
```

O navegador mostra a interface, mas os alertas exigem o APK Android. O comando `android:sync` compila a interface e sincroniza o projeto nativo. Depois:

```bash
cd android
./gradlew assembleDebug
```

No Windows use `gradlew.bat assembleDebug`. Configure `JAVA_HOME` para o JDK 21 e `ANDROID_HOME` para seu SDK (ou use `android/local.properties`, que não deve ser versionado). APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Baixar pelo GitHub Actions

1. Envie os arquivos deste projeto para a branch `main` de `MatheusNunes1B/odontologia`.
2. Abra **GitHub → Actions → Build Android APK**. O push inicia a compilação; também é possível usar **Run workflow**.
3. Após a execução terminar com sucesso, abra **Artifacts → Sorriso-Odontologia-APK**.
4. Extraia o ZIP e instale `app-debug.apk` no Android, autorizando a instalação dessa origem quando solicitado.

O workflow usa Node 22, Java 21, SDK 36, `npm ci`, testes, build Vite, sincronização Capacitor e Gradle Wrapper. Gera um APK debug, sem necessidade de chave release. A configuração local do workflow não significa que uma execução remota já ocorreu.

## Como funciona

- **Verificar / Solicitar permissão** usa `checkPermissions()` e `requestPermissions()`. Se o acesso for negado, mostra uma orientação para as configurações do Android.
- **Notificação imediata** usa `schedule()` sem data, com ID 251 e o texto “Não esqueça de cuidar do seu sorriso! 🦷”.
- **Agendar notificação (10s)** usa ID 250 e `at: new Date(Date.now() + 1000 * 10)`. A mensagem “Sua consulta de limpeza é amanhã às 14:00.” é fixa e ilustrativa; não representa uma consulta real.
- O agendamento é nativo, não um temporizador JavaScript. IDs fixos, cancelamento prévio e bloqueio durante operações evitam duplicações. Agendar novamente substitui o lembrete anterior e preserva a confirmação já registrada.
- A notificação agendada inclui **✅ Confirmar presença** via `registerActionTypes()`. Expanda o alerta se o botão estiver oculto.
- O listener `localNotificationActionPerformed` verifica o ID da ação e da notificação. Somente essa ação confirma a presença; tocar no corpo do alerta não confirma.
- A confirmação fica em `localStorage` e é recuperada ao abrir a tela. Limpar os dados do aplicativo ou desinstalá-lo apaga esse estado.

## Android e limitações

O manifesto declara `POST_NOTIFICATIONS`, exigida em tempo de execução no Android 13+. O canal “Lembretes de limpeza” é criado com importância alta; o usuário ainda controla som, canal e modo Não Perturbe nas configurações do sistema.

Para evitar acesso especial desnecessário, ambas as notificações usam `isExactNotification: false` (API do plugin 8.3+) e o manifesto remove `SCHEDULE_EXACT_ALARM` herdada do plugin. Não usamos `USE_EXACT_ALARM` nem abrimos a tela de alarmes especiais. A data solicitada é dez segundos após o toque, mas **a entrega não é garantida exatamente em dez segundos**: alarmes aproximados podem atrasar, principalmente em economia de bateria/Doze. `allowWhileIdle: true` permite a entrega durante o repouso, sujeita às cotas do Android.

A ação nativa abre/traz o app para primeiro plano. O plugin Android usa uma `PendingIntent` de Activity e retém o evento até o listener JavaScript ser registrado, inclusive em uma abertura a frio. Por isso o listener é instalado antes de habilitar os botões. Não existe execução JavaScript permanente com o processo encerrado: a gravação no `localStorage` acontece quando o app abre pela ação. Forçar parada nas configurações do Android pode cancelar/bloquear alarmes; reabra o aplicativo e agende novamente. Restrições específicas de fabricantes também podem afetar a entrega.

Referências: [Local Notifications](https://capacitorjs.com/docs/apis/local-notifications) e [requisitos do Capacitor 8](https://capacitorjs.com/docs/updating/8-0). As versões efetivamente usadas estão fixadas no `package-lock.json`.

## Organização

- `src/App.jsx`: tela única, permissões, agendamento e confirmação.
- `src/index.css` e `src/main.jsx`: estilos e entrada React.
- `capacitor.config.json`: nome, ID `com.matheus.sorrisoodonto`, pasta `dist` e ícone de notificação.
- `android/`: projeto nativo, manifesto, recursos e Gradle Wrapper.
- `.github/workflows/build-apk.yml`: geração automática do APK.
- `tests/App.test.mjs`: seis testes de lógica com API nativa e hooks simulados, sem bibliotecas adicionais de testes.

## Validação

Executados com sucesso: `npm run build`, `npx cap sync android` e `npm test` (6 testes). Os testes verificam permissão negada, solicitação de autorização, envio imediato, data do agendamento, ação nativa configurada, bloqueio de cliques concorrentes, confirmação persistida e tratamento de falha. Não são testes instrumentados de Android nem de renderização real do React.

Também executados com sucesso: `npm ci` e `gradlew.bat assembleDebug` (APK debug gerado). No emulador Android 16/API 36: instalação e abertura do APK, diálogo de permissão, recusa com mensagem, autorização, recebimento imediato (ID 251), recebimento do lembrete agendado (ID 250) em segundo plano, botão nativo de confirmação, abertura a frio pela ação após `am kill`, e persistência após encerrar/reabrir. O manifesto mesclado contém `POST_NOTIFICATIONS` e não contém `SCHEDULE_EXACT_ALARM`. Não foram testados aparelhos físicos, Doze prolongado, versões Android 12/13 ou execução remota do GitHub Actions.

Roteiro para repetir a validação no aparelho:

1. Em instalação nova no Android 13+, negar a permissão e verificar a mensagem; depois permitir nas configurações e verificar novamente.
2. Enviar o alerta imediato e conferir título e mensagem na bandeja.
3. Agendar, colocar o app em segundo plano e aguardar o alerta (pode exceder 10s).
4. Expandir o alerta, tocar em **Confirmar presença** e verificar **✅ Presença confirmada**.
5. Fechar/reabrir e verificar a persistência. Repetir a ação com o processo encerrado normalmente, sem usar “Forçar parada”.
6. Agendar repetidamente e verificar que apenas o lembrete mais recente permanece. Conferir que nenhuma tela de permissão de alarmes especiais é aberta.
