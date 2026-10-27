$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System; using System.IO; using System.Text; using System.Runtime.InteropServices; using Microsoft.Win32.SafeHandles;
public static class BusinessSpillNative {
 [StructLayout(LayoutKind.Sequential)] public struct Info { public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write; public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint a,uint s,IntPtr q,uint c,uint f,IntPtr t);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder p,uint n,uint f);
 public static SafeFileHandle Pin(string path,bool directory) {
  var h=CreateFileW(path,0x80000000,directory?3u:1u,IntPtr.Zero,3,0x00200000u|(directory?0x02000000u:0u),IntPtr.Zero); Info i;
  if(h.IsInvalid||!GetFileInformationByHandle(h,out i)||(i.Attributes&0x400)!=0||((i.Attributes&0x10)!=0)!=directory||(!directory&&i.Links!=1)){h.Dispose();throw new IOException();}
  var p=new StringBuilder(32768);var n=GetFinalPathNameByHandleW(h,p,(uint)p.Capacity,0);
  if(n==0||n>=p.Capacity||(!String.Equals(p.ToString(),@"\\?\"+path.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase)&&!String.Equals(p.ToString(),@"\\?\"+path,StringComparison.OrdinalIgnoreCase))){h.Dispose();throw new IOException();}return h;
 }
 public static byte[] Read(SafeFileHandle h) { using(var borrowed=new SafeFileHandle(h.DangerousGetHandle(),false))using(var f=new FileStream(borrowed,FileAccess.Read)){if(f.Length<1||f.Length>1048576)throw new IOException();var b=new byte[(int)f.Length];int p=0;while(p<b.Length){int n=f.Read(b,p,b.Length-p);if(n==0)throw new IOException();p+=n;}return b;} }
}
'@
function Digest([byte[]]$Bytes){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function PrivateAcl([string]$Path,[string]$Owner,[bool]$Directory){
 $acl=if($Directory){[IO.Directory]::GetAccessControl($Path)}else{[IO.File]::GetAccessControl($Path)}
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $Owner -or ($Directory -and -not $acl.AreAccessRulesProtected)){throw 'custody'}
 $ownerFull=$false
 foreach($r in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($r.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and [int64]$r.FileSystemRights -ne 0 -and @($Owner,'S-1-5-18','S-1-5-32-544') -notcontains $r.IdentityReference.Value){throw 'custody'}
  if($r.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $r.IdentityReference.Value -eq $Owner -and ($r.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0 -and ($r.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl){$ownerFull=$true}
 }
 if(-not $ownerFull){throw 'custody'}
}
$pins=[Collections.Generic.List[Microsoft.Win32.SafeHandles.SafeFileHandle]]::new()
try{
 if($args.Count -gt 1 -or ($args.Count -eq 1 -and $args[0] -ne '-Hold')){throw 'arguments'}
 $root='C:\Users\USer\Nestory-Recovery\pilot-october-2026'
 $crash=Join-Path $root 'wsl-crashes'
 $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $dirs=[Collections.Generic.List[string]]::new();$d=[IO.DirectoryInfo]::new($crash)
 while($null -ne $d){$dirs.Insert(0,$d.FullName);$d=$d.Parent}
 foreach($p in $dirs){$pins.Add([BusinessSpillNative]::Pin($p,$true))}
 foreach($p in @([IO.Directory]::GetParent($root).FullName,$root,$crash)){PrivateAcl $p $owner $true}
 $config='C:\Users\USer\.wslconfig'
 $proposal=Join-Path $root 'proposed-wslconfig.ini'
 $proof=Join-Path $root 'wsl-restart-proof-20261027.json'
 $files=@{}
 foreach($p in @($config,$proposal,$proof)){
  $h=[BusinessSpillNative]::Pin($p,$false);$pins.Add($h)
  if($p -ne $config){PrivateAcl $p $owner $false}
  $files[$p]=[BusinessSpillNative]::Read($h)
 }
 if((Digest $files[$config]) -ne 'd3d609da96b511d8d553315005bc47ee2be8db5c3d4b624f3790e14cafe19697' -or (Digest $files[$proposal]) -ne (Digest $files[$config])){throw 'configuration'}
 $restart=[Text.Encoding]::UTF8.GetString($files[$proof])|ConvertFrom-Json
 if($restart.format -ne 'nestory-approved-wsl-restart-proof-v1' -or $restart.configSha256 -ne (Digest $files[$config]) -or $restart.wslSwapEntries -ne 0 -or $restart.dockerRuntimeRestored -ne $true){throw 'restart'}
 do{
  foreach($p in @([IO.Directory]::GetParent($root).FullName,$root,$crash)){PrivateAcl $p $owner $true}
  $swaps=& 'C:\Windows\System32\wsl.exe' -d docker-desktop -- cat /proc/swaps 2>$null
  if($LASTEXITCODE -ne 0){throw 'swap'}
  $lines=@($swaps|Where-Object{-not [string]::IsNullOrWhiteSpace($_)})
  if($lines.Count -ne 1 -or $lines[0] -notmatch '^Filename\s+Type\s+Size\s+Used\s+Priority\s*$'){throw 'swap'}
  $result=@{format='nestory-local-business-spill-observation-v1';observedAtUtc=[DateTime]::UtcNow.ToString('o');configSha256=(Digest $files[$config]);restartProofSha256=(Digest $files[$proof]);wslSwapEntries=0;privateCrashDirectoryVerified=$true;ancestorHandlesPinned=$true}
  [Console]::Out.WriteLine(($result|ConvertTo-Json -Compress));[Console]::Out.Flush()
  if($args.Count -eq 0){break}
  $command=[Console]::In.ReadLine()
  if($null -eq $command -or $command -eq 'close'){break}
  if($command -ne 'check'){throw 'command'}
 }while($true)
}catch{[Console]::Error.WriteLine('local_business_runtime_spill_unverified');exit 1}finally{foreach($h in $pins){$h.Dispose()}}
