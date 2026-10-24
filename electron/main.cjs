// Envuelve el juego web (carpeta dist/) en una ventana de escritorio.
// Así el mismo código sirve para itch.io, Mac (.app) y Windows (.exe).
const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#0b0d1a',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  })
  Menu.setApplicationMenu(null)
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  // F11 = pantalla completa
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
    }
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
