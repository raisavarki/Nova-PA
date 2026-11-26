// Persistent PowerShell session. Spawning powershell.exe costs 300-800 ms per call;
// keeping one warm session makes volume/media/brightness calls ~10-30 ms.
const { spawn } = require('child_process');

const INIT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -IgnoreWarnings -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid ctx);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid ctx);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int p, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ep); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public static class NovaAudio {
  static IAudioEndpointVolume Vol() {
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out epv));
    return epv;
  }
  public static float Get() { float v; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void Set(float v) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), Guid.Empty)); }
  public static bool GetMute() { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
  public static void SetMute(bool m) { Marshal.ThrowExceptionForHR(Vol().SetMute(m, Guid.Empty)); }
}
public static class NovaKeys {
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Tap(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
  public static void Combo(byte a, byte b) {
    keybd_event(a, 0, 0, UIntPtr.Zero); keybd_event(b, 0, 0, UIntPtr.Zero);
    keybd_event(b, 0, 2, UIntPtr.Zero); keybd_event(a, 0, 2, UIntPtr.Zero);
  }
}
public static class NovaInput {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public HARDWAREINPUT hi; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] i, int cb);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  public static void InitDpi() { try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); } catch { try { SetProcessDPIAware(); } catch {} } }
  static INPUT K(ushort vk, ushort scan, uint flags) { var i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; return i; }
  static INPUT M(uint data, uint flags) { var i = new INPUT(); i.type = 0; i.u.mi.mouseData = data; i.u.mi.dwFlags = flags; return i; }
  static void Send(List<INPUT> l) { if (l.Count > 0) SendInput((uint)l.Count, l.ToArray(), Marshal.SizeOf(typeof(INPUT))); }
  static uint Ext(ushort v) { return ((v >= 0x21 && v <= 0x2E) || v == 0x5B || v == 0x5C) ? 1u : 0u; }

  public static void MoveTo(int x, int y) { SetCursorPos(x, y); }
  public static string Pos() { POINT p; GetCursorPos(out p); return p.X + "," + p.Y; }
  static uint[] Btn(string b) { if (b == "right") return new uint[]{0x0008, 0x0010}; if (b == "middle") return new uint[]{0x0020, 0x0040}; return new uint[]{0x0002, 0x0004}; }
  public static void Click(string b, int count) {
    var f = Btn(b);
    for (int n = 0; n < count; n++) { var l = new List<INPUT>(); l.Add(M(0, f[0])); l.Add(M(0, f[1])); Send(l); System.Threading.Thread.Sleep(55); }
  }
  public static void Drag(int x1, int y1, int x2, int y2) {
    SetCursorPos(x1, y1); System.Threading.Thread.Sleep(40);
    var l = new List<INPUT>(); l.Add(M(0, 0x0002)); Send(l);
    for (int s = 1; s <= 12; s++) { SetCursorPos(x1 + (x2 - x1) * s / 12, y1 + (y2 - y1) * s / 12); System.Threading.Thread.Sleep(15); }
    l = new List<INPUT>(); l.Add(M(0, 0x0004)); Send(l);
  }
  public static void Scroll(int clicks, bool horizontal) { var l = new List<INPUT>(); l.Add(M(unchecked((uint)(clicks * 120)), horizontal ? 0x01000u : 0x0800u)); Send(l); }
  public static void Type(string s) {
    var l = new List<INPUT>();
    foreach (char c in s) {
      if (c == '\r') continue;
      if (c == '\n') { l.Add(K(0x0D, 0, 0)); l.Add(K(0x0D, 0, 2)); continue; }
      if (c == '\t') { l.Add(K(0x09, 0, 0)); l.Add(K(0x09, 0, 2)); continue; }
      l.Add(K(0, c, 0x0004)); l.Add(K(0, c, 0x0006));
    }
    for (int i = 0; i < l.Count; i += 60) { Send(l.GetRange(i, Math.Min(60, l.Count - i))); System.Threading.Thread.Sleep(6); }
  }
  public static void Combo(int[] vks) {
    var l = new List<INPUT>();
    foreach (var v in vks) l.Add(K((ushort)v, 0, Ext((ushort)v)));
    for (int i = vks.Length - 1; i >= 0; i--) l.Add(K((ushort)vks[i], 0, Ext((ushort)vks[i]) | 2u));
    Send(l);
  }
  static string Info(IntPtr h) {
    var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
    uint pid; GetWindowThreadProcessId(h, out pid); string pn = "";
    try { pn = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
    return h.ToInt64() + "|" + pid + "|" + pn + "|" + sb.ToString().Replace("\n", " ");
  }
  public static string Fg() { return Info(GetForegroundWindow()); }
  public static bool Focus(long hv) {
    var h = new IntPtr(hv); if (!IsWindow(h)) return false;
    if (IsIconic(h)) ShowWindow(h, 9);
    var fg = GetForegroundWindow(); uint pid; uint ft = GetWindowThreadProcessId(fg, out pid); uint me = GetCurrentThreadId();
    bool att = ft != me && AttachThreadInput(me, ft, true);
    SetForegroundWindow(h); BringWindowToTop(h);
    if (att) AttachThreadInput(me, ft, false);
    if (GetForegroundWindow() != h) { keybd_event(0x12, 0, 0, UIntPtr.Zero); SetForegroundWindow(h); keybd_event(0x12, 0, 2, UIntPtr.Zero); }
    return GetForegroundWindow() == h;
  }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  public static string Rect(long hv) { RECT r; var h = new IntPtr(hv); if (!GetWindowRect(h, out r)) return ""; return r.L + "," + r.T + "," + r.R + "," + r.B + "," + (IsZoomed(h) ? 1 : 0) + "," + (IsIconic(h) ? 1 : 0); }
  public static void Minimize(long hv) { ShowWindow(new IntPtr(hv), 6); }
  public static string FocusMatch(string part, int selfPid) {
    foreach (var p in System.Diagnostics.Process.GetProcesses()) {
      try {
        if (p.Id == selfPid || p.MainWindowHandle == IntPtr.Zero) continue;
        if (p.MainWindowTitle.IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0 || p.ProcessName.IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0) {
          Focus(p.MainWindowHandle.ToInt64()); return Info(p.MainWindowHandle);
        }
      } catch {}
    }
    return "";
  }
}
'@
[NovaInput]::InitDpi()
'ready'
`;

class PowerShellBridge {
  constructor() {
    this.proc = null;
    this.queue = [];
    this.current = null;
    this.buf = '';
    this.seq = 0;
    this.ready = null;
  }

  start() {
    if (process.platform !== 'win32') { this.ready = Promise.resolve(false); return this.ready; }
    this.proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => this._onData(d));
    this.proc.stderr.on('data', () => {}); // errors are captured per command via try/catch
    this.proc.on('exit', () => {
      this.proc = null;
      if (this.current) { this.current.reject(new Error('PowerShell exited')); this.current = null; }
      // auto-restart on next call
    });
    this.ready = this.run(INIT, 30000, true).then(() => true).catch((e) => { console.error('PS init failed', e.message); return false; });
    return this.ready;
  }

  _onData(d) {
    this.buf += d;
    if (!this.current) return;
    const marker = `<<NOVA_END_${this.current.id}>>`;
    const idx = this.buf.indexOf(marker);
    if (idx === -1) return;
    const out = this.buf.slice(0, idx).trim();
    this.buf = this.buf.slice(idx + marker.length);
    const job = this.current;
    this.current = null;
    clearTimeout(job.timer);
    if (out.includes('<<NOVA_ERR>>')) job.reject(new Error(out.split('<<NOVA_ERR>>').pop().trim()));
    else job.resolve(out);
    this._next();
  }

  _next() {
    if (this.current || !this.queue.length) return;
    if (!this.proc) { this.start(); return; } // start() queues INIT first, then drains
    const job = this.queue.shift();
    this.current = job;
    const b64 = Buffer.from(job.script, 'utf8').toString('base64');
    // Single line: decode + run inside try/catch, then print marker.
    const line = `try { iex ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))) | Out-String -Width 4096 } catch { '<<NOVA_ERR>>' + $_.Exception.Message }; '<<NOVA_END_${job.id}>>'\n`;
    job.timer = setTimeout(() => {
      if (this.current === job) {
        this.current = null;
        job.reject(new Error('PowerShell timeout'));
        try { this.proc && this.proc.kill(); } catch (e) {}
        this.proc = null;
        this._next();
      }
    }, job.timeout);
    this.proc.stdin.write(line);
  }

  run(script, timeout = 8000, front = false) {
    if (process.platform !== 'win32') return Promise.reject(new Error('Windows only'));
    return new Promise((resolve, reject) => {
      const job = { id: ++this.seq, script, resolve, reject, timeout };
      if (front) this.queue.unshift(job); else this.queue.push(job);
      this._next();
    });
  }

  stop() { try { this.proc && this.proc.kill(); } catch (e) {} }
}

module.exports = new PowerShellBridge();
