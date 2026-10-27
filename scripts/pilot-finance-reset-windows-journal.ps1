$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

# Fixed private-C metadata journal. No network, credentials, financial rows,
# deletion, overwrite, ACL mutation, volume changes or directory creation.
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class ResetJournalNative {
  [StructLayout(LayoutKind.Sequential)] public struct FileInfo {
    public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation;
    public System.Runtime.InteropServices.ComTypes.FILETIME Access; public System.Runtime.InteropServices.ComTypes.FILETIME Write;
    public uint Volume; public uint SizeHigh; public uint SizeLow; public uint Links; public uint IndexHigh; public uint IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint length, uint flags);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInfo info);
  public static SafeFileHandle PinDirectory(string name) {
    var handle = CreateFileW(name, 0x80000000, 3, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
    if (handle.IsInvalid) throw new IOException("directory_open_failed");
    FileInfo info;
    if (!GetFileInformationByHandle(handle, out info) || (info.Attributes & 0x400) != 0 || (info.Attributes & 0x10) == 0) {
      handle.Dispose(); throw new IOException("directory_invalid");
    }
    var resolved = new StringBuilder(32768);
    var length = GetFinalPathNameByHandleW(handle, resolved, (uint)resolved.Capacity, 0);
    if (length == 0 || length >= resolved.Capacity || !String.Equals(resolved.ToString(), @"\\?\" + name.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase) &&
        !String.Equals(resolved.ToString(), @"\\?\" + name, StringComparison.OrdinalIgnoreCase)) {
      handle.Dispose(); throw new IOException("directory_alias_refused");
    }
    return handle;
  }
  public static string Identity(SafeFileHandle handle) {
    FileInfo info;
    if (!GetFileInformationByHandle(handle, out info)) throw new IOException("identity_failed");
    return info.Volume.ToString("x8") + ":" + info.IndexHigh.ToString("x8") + info.IndexLow.ToString("x8");
  }
  public static void WriteNew(string filename, byte[] bytes) {
    using (var file = new FileStream(filename, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) {
      file.Write(bytes, 0, bytes.Length);
      file.Flush(true);
    }
  }
  public static byte[] ReadExact(string filename) {
    var handle = CreateFileW(filename, 0x80000000, 1, IntPtr.Zero, 3, 0x00200000, IntPtr.Zero);
    FileInfo info;
    if (handle.IsInvalid || !GetFileInformationByHandle(handle, out info) || info.Links != 1 || (info.Attributes & 0x410) != 0) {
      handle.Dispose(); throw new IOException("file_identity_invalid");
    }
    using (var file = new FileStream(handle, FileAccess.Read)) {
      if (file.Length < 1 || file.Length > 1048576) throw new IOException("file_size_invalid");
      var bytes = new byte[(int)file.Length]; var offset = 0;
      while (offset < bytes.Length) { var count = file.Read(bytes, offset, bytes.Length-offset); if (count == 0) throw new IOException("file_read_incomplete"); offset += count; }
      if (file.Length != bytes.Length) throw new IOException("file_changed");
      return bytes;
    }
  }
}
'@ | Out-Null

function Hash-Bytes([byte[]]$Bytes) {
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hash.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose() }
}
function Assert-Private([string]$Name, [string]$OwnerSid, [bool]$IsDirectory) {
  $entry = Get-Item -LiteralPath $Name -Force
  if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $entry.PSIsContainer -ne $IsDirectory) { throw 'private_path_invalid' }
  $acl = if ($IsDirectory) { [IO.Directory]::GetAccessControl($Name) } else { [IO.File]::GetAccessControl($Name) }
  if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $OwnerSid) { throw 'private_owner_required' }
  if ($IsDirectory -and -not $acl.AreAccessRulesProtected) { throw 'private_inheritance_required' }
  $allowed = @($OwnerSid, 'S-1-5-18', 'S-1-5-32-544')
  $rules = $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])
  $ownerFullControl = $false
  foreach ($rule in $rules) {
    # Inherit-only grants matter: new records would inherit them before readback.
    if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
        $allowed -notcontains $rule.IdentityReference.Value -and [int64]$rule.FileSystemRights -ne 0) { throw 'private_acl_required' }
    if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference.Value -eq $OwnerSid -and
        ($rule.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0 -and
        ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) { $ownerFullControl = $true }
  }
  # Null DACLs can have no ACEs yet grant everyone access; never infer privacy
  # from the absence of untrusted entries alone.
  if (-not $ownerFullControl) { throw 'private_owner_grant_required' }
}
function Read-Record([string]$Name, [string]$OwnerSid) {
  Assert-Private $Name $OwnerSid $false
  $bytes = [ResetJournalNative]::ReadExact($Name)
  Assert-Private $Name $OwnerSid $false
  return ,$bytes
}

$handles = [System.Collections.Generic.List[Microsoft.Win32.SafeHandles.SafeFileHandle]]::new()
try {
  $text = [Console]::In.ReadToEnd()
  if ($text.Length -lt 1 -or $text.Length -gt 1048576) { throw 'request_invalid' }
  $request = $text | ConvertFrom-Json
  if ((($request.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'action,payload,root,rootIdentity,slot,storeId' -or
      @('initialize','open','read','put') -notcontains $request.action -or $request.storeId -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') { throw 'request_invalid' }
  $root = [IO.Path]::GetFullPath([string]$request.root).TrimEnd('\')
  if ($root -notmatch '^C:\\[^\r\n]+$' -or $root.Length -lt 8 -or $root -ne [string]$request.root -or $root.IndexOf(':', 2) -ge 0) { throw 'private_c_root_required' }
  $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ([IO.DriveInfo]::new('C:\').DriveFormat -ne 'NTFS') { throw 'ntfs_required' }
  $paths = [System.Collections.Generic.List[string]]::new()
  $next = [IO.DirectoryInfo]::new($root)
  while ($null -ne $next) { $paths.Insert(0, $next.FullName); $next = $next.Parent }
  foreach ($name in $paths) { $handles.Add([ResetJournalNative]::PinDirectory($name)) }
  Assert-Private $root $owner $true
  $identity = [ResetJournalNative]::Identity($handles[$handles.Count - 1])
  if ($request.action -eq 'initialize') { if ($null -ne $request.rootIdentity) { throw 'request_invalid' } }
  elseif ($request.rootIdentity -ne $identity) { throw 'directory_identity_changed' }
  $encoding = [Text.UTF8Encoding]::new($false, $true)
  $marker = [ordered]@{ format='nestory-windows-reset-journal-v1'; storeId=$request.storeId; root=$root; rootIdentity=$identity; ownerSid=$owner; protocol='create-new-write-through-flush-readback' }
  $markerBytes = $encoding.GetBytes(($marker | ConvertTo-Json -Compress))
  $markerPath = Join-Path $root 'store.json'
  if ($request.action -eq 'initialize') {
    if ($null -ne $request.slot -or $null -ne $request.payload) { throw 'request_invalid' }
    if (@(Get-ChildItem -LiteralPath $root -Force).Count -ne 0) { throw 'initialization_requires_empty_directory' }
    [ResetJournalNative]::WriteNew($markerPath, $markerBytes)
  }
  if ((Hash-Bytes (Read-Record $markerPath $owner)) -ne (Hash-Bytes $markerBytes)) { throw 'store_identity_changed' }
  if (@('initialize','open') -contains $request.action) {
    if ($null -ne $request.slot -or $null -ne $request.payload) { throw 'request_invalid' }
    $result = @{status=$(if($request.action -eq 'initialize'){'initialized'}else{'opened'}); rootIdentity=$identity; storeId=$request.storeId}
  }
  else {
    if ($request.slot -notmatch '^[a-f0-9]{64}$') { throw 'slot_invalid' }
    $filename = Join-Path $root ($request.slot + '.json')
    $exists = Test-Path -LiteralPath $filename
    if ($request.action -eq 'put') {
      if ($request.payload -isnot [string]) { throw 'payload_invalid' }
      $payload = [Convert]::FromBase64String($request.payload)
      if ($payload.Length -gt 262144 -or [Convert]::ToBase64String($payload) -ne $request.payload) { throw 'payload_invalid' }
      $record = [ordered]@{format='nestory-windows-reset-journal-slot-v1';storeId=$request.storeId;slot=$request.slot;sha256=(Hash-Bytes $payload);bytes=$payload.Length;payload=$request.payload}
      $recordBytes = $encoding.GetBytes(($record | ConvertTo-Json -Compress))
      if (-not $exists) {
        try { [ResetJournalNative]::WriteNew($filename, $recordBytes) }
        catch { throw 'write_outcome_unknown' }
      }
    } elseif ($null -ne $request.payload) { throw 'payload_invalid' }
    if (-not (Test-Path -LiteralPath $filename)) { $result = @{status='absent'} }
    else {
      $observed = Read-Record $filename $owner
      $parsed = $encoding.GetString($observed) | ConvertFrom-Json
      if ((($parsed.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'bytes,format,payload,sha256,slot,storeId' -or
        $parsed.format -ne 'nestory-windows-reset-journal-slot-v1' -or $parsed.storeId -ne $request.storeId -or $parsed.slot -ne $request.slot) { throw 'slot_binding_mismatch' }
      $body = [Convert]::FromBase64String($parsed.payload)
      if ($body.Length -gt 262144 -or $parsed.bytes -ne $body.Length -or $parsed.sha256 -ne (Hash-Bytes $body) -or
        [Convert]::ToBase64String($body) -ne $parsed.payload) { throw 'slot_incomplete_or_changed' }
      if ($request.action -eq 'put' -and -not $exists -and (Hash-Bytes $recordBytes) -ne (Hash-Bytes $observed)) { throw 'write_readback_mismatch' }
      $result = @{status=$(if($request.action -eq 'read'){'present'}elseif($exists){'exists'}else{'created'});payload=$parsed.payload;sha256=$parsed.sha256}
    }
  }
  Assert-Private $root $owner $true
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
} catch {
  # No exception text, input, path or serialized private record escapes errors.
  [Console]::Out.WriteLine('{"status":"stopped","code":"windows_reset_journal_verification_failed","requiresReconciliation":true}')
  exit 1
} finally { foreach ($handle in $handles) { $handle.Dispose() } }
