// Envuelve el juego web (carpeta dist/) en una ventana de escritorio.
// Así el mismo código sirve para la web, Mac (.app) y Windows (.exe).
//
// Los archivos se sirven con un protocolo propio (app://) en lugar de file://,
// porque los navegadores no dejan cargar modelos 3D con fetch() desde file://.
const { app, BrowserWindow, Menu, protocol, net } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

const DIST = path.join(__dirname, '..', 'dist')

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#0b0d1a',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  })
  Menu.setApplicationMenu(null)
  win.loadURL('app://game/index.html')

  // F11 = pantalla completa
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
    }
  })
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  createWindow()
})
app.on('window-all-closed', () => app.quit())
