// Offline wake word ("Hey Nova") using Windows' built-in System.Speech recognizer.
// Runs in its own PowerShell process so it never blocks command execution.
const { spawn } = require('child_process');
const EventEmitter = require('events');

function script(name, threshold) {
  const n = String(name || 'Nova').toLowerCase().replace(/[^a-z ]/g, '').trim() || 'nova';
  const phrases = [`hey ${n}`, `hi ${n}`, `okay ${n}`, `ok ${n}`, n].map((p) => `'${p}'`).join(',');
  return `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Speech
  $info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -like 'en*' } | Select-Object -First 1
  if (-not $info) { [Console]::Out.WriteLine('NOENGINE'); exit }
  $r = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
  $c = New-Object System.Speech.Recognition.Choices
  $c.Add([string[]]@(${phrases}))
  $gb = New-Object System.Speech.Recognition.GrammarBuilder
  $gb.Culture = $info.Culture
  $gb.Append($c)
  $r.LoadGrammar((New-Object System.Speech.Recognition.Grammar($gb)))
  # A dictation grammar soaks up ordinary speech so random words don't match the wake phrase.
  try { $d = New-Object System.Speech.Recognition.DictationGrammar; $d.Weight = 0.3; $r.LoadGrammar($d) } catch {}
  $r.SetInputToDefaultAudioDevice()
  [Console]::Out.WriteLine('READY ' + $info.Culture.Name)
  while ($true) {
    $res = $r.Recognize([TimeSpan]::FromSeconds(8))
    if ($res -and $res.Grammar -and $res.Grammar.GetType().Name -ne 'DictationGrammar' -and $res.Confidence -ge ${threshold}) {
      [Console]::Out.WriteLine('WAKE ' + $res.Text + ' ' + [math]::Round($res.Confidence, 2))
    }
  }
} catch { [Console]::Out.WriteLine('ERR ' + $_.Exception.Message) }
`;
}

class Wake extends EventEmitter {
  constructor() { super(); this.proc = null; this.enabled = false; this.fails = 0; this.status = 'off'; }

  start(name, threshold = 0.72) {
    if (process.platform !== 'win32') return;
    this.stop();
    this.enabled = true;
    this.name = name; this.threshold = threshold;
    const enc = Buffer.from(script(name, threshold), 'utf16le').toString('base64');
    const p = this.proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true });
    let buf = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line.startsWith('WAKE')) this.emit('wake', line);
        else if (line.startsWith('READY')) { this.fails = 0; this.status = 'listening'; this.emit('status', this.status); }
        else if (line === 'NOENGINE') { this.enabled = false; this.status = 'unavailable'; this.emit('status', this.status); }
        else if (line.startsWith('ERR')) { this.status = 'error: ' + line.slice(4); this.emit('status', this.status); }
      }
    });
    p.on('exit', () => {
      if (this.proc !== p) return;
      this.proc = null;
      if (this.enabled && ++this.fails < 5) setTimeout(() => this.enabled && this.start(this.name, this.threshold), 2000 * this.fails);
    });
  }

  stop() {
    this.enabled = false;
    if (this.proc) { const p = this.proc; this.proc = null; try { p.kill(); } catch (e) {} }
    this.status = 'off';
  }
}

module.exports = new Wake();
