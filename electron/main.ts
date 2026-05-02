import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import * as fsPromises from 'fs/promises';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// GPU process can fail on some Windows setups (VM, RDP, driver quirks) with
// error_code=18 → FATAL. `disableHardwareAcceleration()` alone is not always enough;
// Chromium still spawns a GPU child unless command-line switches are set first.
// Must run before `ready` (and before squirrel). Opt in: ELECTRON_ENABLE_GPU=1
const shouldMitigateGpu =
  process.env.ELECTRON_ENABLE_GPU !== '1' &&
  (process.platform === 'win32' || process.env.ELECTRON_DISABLE_GPU === '1');

if (shouldMitigateGpu) {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.disableHardwareAcceleration();
  console.log(
    '[trackIT] GPU mitigation on (disable-gpu switches + disableHardwareAcceleration). Set ELECTRON_ENABLE_GPU=1 to use the GPU.'
  );
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Preload uses `electron-store`, which expects Node APIs. A sandboxed preload cannot load it
      // (fails with `module not found: node:process`). Keep the renderer isolated; only preload gets Node.
      sandbox: false,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  // and load the index.html of the app.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || 'http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Log when the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript('console.log("electronAPI available:", !!window.electronAPI)');
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  console.log('MAIN __dirname:', __dirname);
  console.log('Preload path:', path.join(__dirname, '../preload/preload.js'));
  const fs = require('fs');
  console.log('Preload exists:', fs.existsSync(path.join(__dirname, '../preload/preload.js')));
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  console.log('Setting up IPC handlers...');
  
  // Add IPC handler for saving logs
  ipcMain.handle('save-logs', async (_event, { filename, content }) => {
    console.log('Received save-logs request:', { filename });
    
    try {
      // Create logs directory in project root if it doesn't exist
      const logsDir = path.join(app.getAppPath(), 'logs');
      console.log('Creating logs directory:', logsDir);
      await fsPromises.mkdir(logsDir, { recursive: true });

      // Save file directly to logs directory
      const filePath = path.join(logsDir, filename);
      console.log('Saving logs to:', filePath);
      await fsPromises.writeFile(filePath, content, 'utf-8');
      
      console.log('Logs saved successfully');
      return { success: true, path: filePath };
    } catch (error) {
      console.error('Error saving logs:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  createWindow();
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 