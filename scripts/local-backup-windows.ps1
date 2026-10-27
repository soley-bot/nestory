$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
# Fixed local custody only. Secret bytes travel through anonymous stdin/stdout
# pipes; they are never arguments, logs, temporary files, or plaintext key files.
Add-Type -AssemblyName System.Security
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class LocalBackupNative {
  [StructLayout(LayoutKind.Sequential)] public struct Info {
    public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;
    public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
  static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder p,uint n,uint flags);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info info);
  public static SafeFileHandle PinDirectory(string name) {
    var h=CreateFileW(name,0x80000000,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero); Info i;
    if(h.IsInvalid || !GetFileInformationByHandle(h,out i) || (i.Attributes & 0x400)!=0 || (i.Attributes & 0x10)==0) { h.Dispose(); throw new IOException(); }
    var p=new StringBuilder(32768); var n=GetFinalPathNameByHandleW(h,p,(uint)p.Capacity,0);
    if(n==0 || n>=p.Capacity || !String.Equals(p.ToString(),@"\\?\"+name.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase) && !String.Equals(p.ToString(),@"\\?\"+name,StringComparison.OrdinalIgnoreCase)) { h.Dispose(); throw new IOException(); }
    return h;
  }
  public static void WriteNew(string name,byte[] bytes) {
    using(var f=new FileStream(name,FileMode.CreateNew,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough)) { f.Write(bytes,0,bytes.Length); f.Flush(true); }
  }
  public static byte[] ReadExact(string name) {
    var h=CreateFileW(name,0x80000000,1,IntPtr.Zero,3,0x00200000,IntPtr.Zero); Info i;
    if(h.IsInvalid || !GetFileInformationByHandle(h,out i) || i.Links!=1 || (i.Attributes & 0x410)!=0) { h.Dispose(); throw new IOException(); }
    using(var f=new FileStream(h,FileAccess.Read)) {
      if(f.Length<1 || f.Length>67108864) throw new IOException();
      var b=new byte[(int)f.Length]; int offset=0;
      try {
        while(offset<b.Length) { int n=f.Read(b,offset,b.Length-offset); if(n==0) throw new IOException(); offset+=n; }
        if(f.Length!=b.Length) throw new IOException(); return b;
      } catch { Array.Clear(b,0,b.Length); throw; }
    }
  }
}
'@
function Hash-Bytes([byte[]]$Value) { $h=[Security.Cryptography.SHA256]::Create(); try { return ([BitConverter]::ToString($h.ComputeHash($Value))).Replace('-','').ToLowerInvariant() } finally { $h.Dispose() } }
function Assert-Private([string]$Name,[string]$Owner,[bool]$Directory) {
  $entry=Get-Item -LiteralPath $Name -Force
  if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $entry.PSIsContainer -ne $Directory) { throw 'path' }
  $acl=if($Directory){[IO.Directory]::GetAccessControl($Name)}else{[IO.File]::GetAccessControl($Name)}
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $Owner -or ($Directory -and -not $acl.AreAccessRulesProtected)) { throw 'owner' }
  $ownerFullControl=$false
  foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and @($Owner,'S-1-5-18','S-1-5-32-544') -notcontains $rule.IdentityReference.Value -and [int64]$rule.FileSystemRights -ne 0) { throw 'acl' }
    if($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference.Value -eq $Owner -and
      ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0 -and
      ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) { $ownerFullControl=$true }
  }
  if(-not $ownerFullControl){throw 'owner_grant'}
}
$handles=[Collections.Generic.List[Microsoft.Win32.SafeHandles.SafeFileHandle]]::new()
$raw=$null; $resultBytes=$null
try {
  $root='C:\Users\USer\Nestory-Recovery\pilot-october-2026'
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $paths=[Collections.Generic.List[string]]::new(); $next=[IO.DirectoryInfo]::new($root)
  while($null -ne $next){$paths.Insert(0,$next.FullName);$next=$next.Parent}
  foreach($name in $paths){$handles.Add([LocalBackupNative]::PinDirectory($name))}
  Assert-Private $root $owner $true
  Assert-Private ([IO.Directory]::GetParent($root).FullName) $owner $true
  $text=[Console]::In.ReadToEnd()
  if($text.Length -lt 1 -or $text.Length -gt 92000000){throw 'request'}
  $request=$text | ConvertFrom-Json
  if((($request.PSObject.Properties.Name | Sort-Object)-join ',') -ne 'action,name,payload' -or @('protect','unprotect','write','read','verify-archives') -notcontains $request.action){throw 'request'}
  if($request.action -eq 'verify-archives'){
    if($null -ne $request.name -or $request.payload -isnot [string]){throw 'request'}
    $raw=[Convert]::FromBase64String($request.payload)
    if($raw.Length -lt 1 -or $raw.Length -gt 65536 -or [Convert]::ToBase64String($raw) -ne $request.payload){throw 'batch'}
    $utf8=[Text.UTF8Encoding]::new($false,$true)
    $batch=$utf8.GetString($raw) | ConvertFrom-Json
    if((($batch.PSObject.Properties.Name | Sort-Object)-join ',') -ne 'format,objects' -or
       $batch.format -ne 'nestory-local-ciphertext-batch-v1' -or $batch.objects -isnot [Array] -or $batch.objects.Count -gt 256){throw 'batch'}
    $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    [long]$total=0
    # Validate the entire roster before opening any file. Only fixed archive UUIDs.
    foreach($object in $batch.objects){
      if((($object.PSObject.Properties.Name | Sort-Object)-join ',') -ne 'archiveId,ciphertextBytes,ciphertextSha256' -or
         $object.archiveId -isnot [string] -or $object.archiveId -cnotmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' -or
         $object.ciphertextSha256 -isnot [string] -or $object.ciphertextSha256 -cnotmatch '^[a-f0-9]{64}$' -or
         ($object.ciphertextBytes -isnot [int] -and $object.ciphertextBytes -isnot [long]) -or
         $object.ciphertextBytes -lt 1 -or $object.ciphertextBytes -gt 8388608 -or -not $seen.Add($object.archiveId)){throw 'object'}
      $total+=$object.ciphertextBytes
      if($total -gt 2147483648){throw 'total'}
    }
    foreach($object in $batch.objects){
      $filename=Join-Path $root ('local-backup-'+$object.archiveId+'.archive.pgp')
      $checkedBytes=$null
      try {
        Assert-Private $filename $owner $false
        $checkedBytes=[LocalBackupNative]::ReadExact($filename)
        Assert-Private $filename $owner $false
        if($checkedBytes.Length -ne $object.ciphertextBytes -or (Hash-Bytes $checkedBytes) -cne $object.ciphertextSha256){throw 'ciphertext'}
      } finally { if($null -ne $checkedBytes){[Array]::Clear($checkedBytes,0,$checkedBytes.Length)} }
    }
    Assert-Private $root $owner $true
    Assert-Private ([IO.Directory]::GetParent($root).FullName) $owner $true
    $receipt=@{format='nestory-local-ciphertext-batch-result-v1';inputSha256=(Hash-Bytes $raw);files=$batch.objects.Count;bytes=$total}
    $resultBytes=$utf8.GetBytes(($receipt | ConvertTo-Json -Compress))
    $result=@{status='ok';payload=[Convert]::ToBase64String($resultBytes);sha256=(Hash-Bytes $resultBytes);bytes=$resultBytes.Length}
  } elseif(@('protect','unprotect') -contains $request.action){
    if($null -ne $request.name -or $request.payload -isnot [string]){throw 'request'}
    $raw=[Convert]::FromBase64String($request.payload)
    if($raw.Length -lt 1 -or $raw.Length -gt 65536 -or [Convert]::ToBase64String($raw) -ne $request.payload){throw 'bytes'}
    $entropy=[Text.Encoding]::UTF8.GetBytes('nestory-pilot-october-2026-recovery-key-v1')
    if($request.action -eq 'protect'){$resultBytes=[Security.Cryptography.ProtectedData]::Protect($raw,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}
    else{$resultBytes=[Security.Cryptography.ProtectedData]::Unprotect($raw,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}
    $result=@{status='ok';payload=[Convert]::ToBase64String($resultBytes)}
  } else {
    if($request.name -isnot [string] -or $request.name -notmatch '^local-backup-[a-f0-9-]{36}\.(public\.asc|private\.dpapi|metadata\.json|archive\.pgp|proof\.json|synthetic\.pgp)$'){throw 'name'}
    $filename=Join-Path $root $request.name
    if($request.action -eq 'write'){
      $raw=[Convert]::FromBase64String($request.payload)
      if($raw.Length -lt 1 -or $raw.Length -gt 67108864 -or [Convert]::ToBase64String($raw) -ne $request.payload){throw 'bytes'}
      [LocalBackupNative]::WriteNew($filename,$raw)
    } elseif($null -ne $request.payload){throw 'request'}
    Assert-Private $filename $owner $false
    $resultBytes=[LocalBackupNative]::ReadExact($filename)
    Assert-Private $filename $owner $false
    if($request.action -eq 'write' -and (Hash-Bytes $raw) -ne (Hash-Bytes $resultBytes)){throw 'readback'}
    $result=@{status='ok';payload=[Convert]::ToBase64String($resultBytes);sha256=(Hash-Bytes $resultBytes);bytes=$resultBytes.Length}
  }
  Assert-Private $root $owner $true
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
} catch {
  [Console]::Out.WriteLine('{"status":"stopped","code":"local_backup_windows_failed"}');exit 1
} finally {
  if($null -ne $raw){[Array]::Clear($raw,0,$raw.Length)}
  if($null -ne $resultBytes){[Array]::Clear($resultBytes,0,$resultBytes.Length)}
  foreach($h in $handles){$h.Dispose()}
}
