// Screen text grabber: freeze the screen, drag a box, read the text with Windows' built-in OCR (offline).
const { BrowserWindow, screen, desktopCapturer, ipcMain, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const OCR_PS = (file) => `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync('${file.replace(/'/g, "''")}')) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { throw 'No OCR language installed (Windows Settings > Time & language > Language).' }
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$stream.Dispose()
($result.Lines | ForEach-Object { $_.Text }) -join [Environment]::NewLine`;

async function ocrImage(ps, nativeImg) {
  const f = path.join(process.env.TEMP || os.tmpdir(), `nova_ocr_${Date.now()}.png`);
  // OCR works best on larger text: upscale small crops
  const sz = nativeImg.getSize();
  const img = sz.width < 900 ? nativeImg.resize({ width: Math.round(sz.width * 2), quality: 'best' }) : nativeImg;
  fs.writeFileSync(f, img.toPNG());
  try { return (await ps.run(OCR_PS(f), 30000)).trim(); }
  finally { fs.unlink(f, () => {}); }
}

let overlay = null;
async function grab(ps, hideFn) {
  if (overlay) return null;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const phys = { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) };
  await hideFn(true);
  let sources;
  try { sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: phys }); }
  finally { await hideFn(false); }
  const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (!src) throw new Error('Screen capture failed');
  const shot = src.thumbnail;
  return new Promise((resolve) => {
    const b = display.bounds;
    overlay = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height, frame: false, transparent: false, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, show: false, backgroundColor: '#000000', enableLargerThanScreen: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, additionalArguments: ['--nova-role=ocr'] }
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.loadFile(path.join(__dirname, 'renderer', 'ocr', 'index.html'));
    overlay.webContents.once('did-finish-load', () => {
      overlay.webContents.send('nova:event', { type: 'ocr-image', src: 'data:image/jpeg;base64,' + shot.toJPEG(88).toString('base64') });
      overlay.show(); overlay.focus();
    });
    const done = async (rect) => {
      ipcMain.removeAllListeners('ocr:rect');
      const w = overlay; overlay = null;
      if (w && !w.isDestroyed()) w.close();
      if (!rect || rect.w < 6 || rect.h < 6) return resolve(null);
      const f = shot.getSize().width / b.width;
      const crop = shot.crop({ x: Math.round(rect.x * f), y: Math.round(rect.y * f), width: Math.round(rect.w * f), height: Math.round(rect.h * f) });
      try {
        const text = await ocrImage(ps, crop);
        if (text) clipboard.writeText(text);
        resolve({ text });
      } catch (e) { resolve({ error: e.message }); }
    };
    ipcMain.on('ocr:rect', (_e, rect) => done(rect));
    overlay.on('closed', () => { if (overlay) { overlay = null; ipcMain.removeAllListeners('ocr:rect'); resolve(null); } });
  });
}

module.exports = { grab, ocrImage };
