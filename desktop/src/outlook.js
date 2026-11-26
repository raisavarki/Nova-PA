// Outlook integration through the locally installed Outlook (COM automation). No cloud sign-in.
// Reads calendar + unread mail, creates email drafts (never sends on its own).
const psq = (s) => String(s == null ? '' : s).replace(/['‘’‚‛]/g, (q) => q + q);

function agendaScript(days) {
  return `
$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace('MAPI')
$cal = $ns.GetDefaultFolder(9)
$items = $cal.Items
$items.IncludeRecurrences = $true
$items.Sort('[Start]')
$from = (Get-Date).Date.AddDays(-1)
$to = (Get-Date).Date.AddDays(${Math.max(1, Math.min(31, days))})
$filter = "[Start] >= '" + $from.ToString('g') + "' AND [Start] <= '" + $to.ToString('g') + "'"
$res = $items.Restrict($filter)
$out = @()
foreach ($a in $res) {
  $body = ''
  try { $body = [string]$a.Body } catch {}
  $join = ''
  $m = [regex]::Match($body + ' ' + [string]$a.Location, 'https://teams\\.microsoft\\.com/l/meetup-join/[^\\s<>"]+')
  if ($m.Success) { $join = $m.Value }
  $out += [pscustomobject]@{
    id = [string]$a.EntryID + '_' + $a.Start.ToString('yyyyMMddHHmm')
    title = [string]$a.Subject
    start = [long](($a.Start.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds)
    end = [long](($a.End.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds)
    allDay = [bool]$a.AllDayEvent
    location = [string]$a.Location
    organizer = [string]$a.Organizer
    joinUrl = $join
  }
  if ($out.Count -ge 300) { break }
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 3`;
}

const UNREAD = `
$ol = New-Object -ComObject Outlook.Application
$inbox = $ol.GetNamespace('MAPI').GetDefaultFolder(6)
$items = $inbox.Items.Restrict('[UnRead] = True')
$items.Sort('[ReceivedTime]', $true)
$list = @()
foreach ($m in $items) { $list += [pscustomobject]@{ from = [string]$m.SenderName; subject = [string]$m.Subject; at = [long](($m.ReceivedTime.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds) }; if ($list.Count -ge 8) { break } }
ConvertTo-Json -InputObject ([pscustomobject]@{ count = $inbox.UnReadItemCount; items = @($list) }) -Compress -Depth 3`;

function draftScript({ to, cc, subject, body }) {
  return `
$ol = New-Object -ComObject Outlook.Application
$m = $ol.CreateItem(0)
$m.To = '${psq(to)}'
${cc ? `$m.CC = '${psq(cc)}'` : ''}
$m.Subject = '${psq(subject)}'
$m.Body = '${psq(body)}'
try { [void]$m.Recipients.ResolveAll() } catch {}
$m.Display()
'ok'`;
}

async function agenda(ps, days = 7) {
  const out = await ps.run(agendaScript(days), 45000);
  const arr = JSON.parse(out || '[]');
  return (Array.isArray(arr) ? arr : [arr]).filter((e) => e && e.start);
}
async function unread(ps) { return JSON.parse((await ps.run(UNREAD, 30000)) || '{"count":0,"items":[]}'); }
async function draft(ps, opts) { return (await ps.run(draftScript(opts), 30000)).trim(); }

module.exports = { agenda, unread, draft };
