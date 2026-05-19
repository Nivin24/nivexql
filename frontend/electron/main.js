import { app, BrowserWindow, dialog } from 'electron';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let backendProcess = null;

function startBackend() {
  const binaryPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'nivexql-api')
    : path.join(__dirname, 'bin', 'nivexql-api');

  console.log(`Starting backend from: ${binaryPath}`);
  
  backendProcess = spawn(binaryPath, [], {
    env: { ...process.env, NIVEXQL_PORT: '8081' }
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend]: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend Error]: ${data}`);
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '../public/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Check if we are in development mode
  const startUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  // Setup auto-update checks for packaged production builds
  if (app.isPackaged) {
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'A new version of NivexQL has been downloaded. Restart the application to apply updates.',
        buttons: ['Restart', 'Later']
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    });

    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (backendProcess) {
    console.log('Killing backend process...');
    backendProcess.kill('SIGTERM');
  }
});
