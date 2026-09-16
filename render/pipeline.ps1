# Full render pipeline, meant to run detached (Start-Process) so it survives the session:
#   build.py  -> render/street.blend
#   render.py --stills all  (1920x1080, 192 spp)      -> render/out/stills
#   render.py --anim        (1920x1080, 96 spp, 432 f) -> render/out/hero/frames
#   render.py --encode      (ffmpeg: mp4 / webm / posters)
# Progress: render/out/logs/pipeline.txt (+ one log per stage).
$B = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
$R = "C:\Users\james\Projects\sidequest-atx\render"
$L = "$R\out\logs"
New-Item -ItemType Directory -Force $L | Out-Null
$stages = $args
if (-not $stages) { $stages = @('build', 'stills', 'anim', 'encode') }

function Run($name, $blenderArgs) {
  $t0 = Get-Date
  Add-Content "$L\pipeline.txt" ("{0} START {1}" -f (Get-Date -Format HH:mm:ss), $name)
  & $B @blenderArgs *> "$L\$name.log"
  $dt = [int]((Get-Date) - $t0).TotalSeconds
  Add-Content "$L\pipeline.txt" ("{0} END {1} exit={2} {3}s" -f (Get-Date -Format HH:mm:ss), $name, $LASTEXITCODE, $dt)
}

if ($stages -contains 'build')  { Run "build"  @('-b', '--python', "$R\build.py", '--', '--out', "$R\street.blend") }
if ($stages -contains 'stills') { Run "stills" @('-b', "$R\street.blend", '--python', "$R\render.py", '--', '--stills', 'all', '--samples', '192') }
if ($stages -contains 'stills_downtown') { Run "stills_downtown" @('-b', "$R\street.blend", '--python', "$R\render.py", '--', '--stills', 'precedent,count', '--samples', '192') }
if ($stages -contains 'anim')   { Run "anim"   @('-b', "$R\street.blend", '--python', "$R\render.py", '--', '--anim', '--samples', '96', '--threshold', '0.03') }
if ($stages -contains 'encode') { Run "encode" @('-b', "$R\street.blend", '--python', "$R\render.py", '--', '--encode') }
Add-Content "$L\pipeline.txt" ("{0} PIPELINE DONE" -f (Get-Date -Format HH:mm:ss))
