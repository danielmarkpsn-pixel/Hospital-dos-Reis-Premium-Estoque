const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let win;
let serverProcess;

function waitForServer(url, tries = 40) {
  return new Promise((resolve, reject) => {
    let count = 0;
    const check = () => {
      const req = http.get(url, res => {
        res.resume();
        if (res.statusCode < 500) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(700, () => req.destroy());
    };
    const retry = () => {
      if (++count >= tries) reject(new Error('Servidor local não iniciou.'));
      else setTimeout(check, 500);
    };
    check();
  });
}


function createPortugueseMenu() {
  const template = [
    { label: 'Arquivo', submenu: [
      { label: 'Recarregar aplicativo', accelerator: 'Ctrl+R', click: () => win && win.reload() },
      { type: 'separator' },
      { label: 'Sair', accelerator: 'Alt+F4', click: () => app.quit() }
    ]},
    { label: 'Editar', submenu: [
      { role: 'undo', label: 'Desfazer' },
      { role: 'redo', label: 'Refazer' },
      { type: 'separator' },
      { role: 'cut', label: 'Recortar' },
      { role: 'copy', label: 'Copiar' },
      { role: 'paste', label: 'Colar' },
      { role: 'selectAll', label: 'Selecionar tudo' }
    ]},
    { label: 'Exibir', submenu: [
      { role: 'reload', label: 'Atualizar' },
      { role: 'togglefullscreen', label: 'Tela cheia' },
      { role: 'resetZoom', label: 'Tamanho padrão' },
      { role: 'zoomIn', label: 'Aumentar zoom' },
      { role: 'zoomOut', label: 'Diminuir zoom' }
    ]},
    { label: 'Ajuda', submenu: [
      { label: 'Sobre o Hospital dos Reis Premium', click: () => dialog.showMessageBox(win, { type: 'info', title: 'Sobre', message: 'Hospital dos Reis Premium', detail: 'Sistema de controle de estoque cirúrgico.' }) }
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const serverEntry = path.join(app.getAppPath(), 'server', 'index.js');
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: process.env.PORT || '4317', HOST: '0.0.0.0', APP_DATA_DIR: app.getPath('userData') },
    stdio: 'ignore',
    windowsHide: true
  });
  try {
    await waitForServer('http://127.0.0.1:4317/api/health');
  } catch (e) {
    dialog.showErrorBox('Falha ao iniciar', 'Não foi possível iniciar o serviço de estoque. Reinicie o aplicativo.');
  }
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1050, minHeight: 700,
    backgroundColor: '#111214',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadURL('http://127.0.0.1:4317');
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => { createPortugueseMenu(); createWindow(); });
app.on('window-all-closed', () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => { if (serverProcess && !serverProcess.killed) serverProcess.kill(); });
