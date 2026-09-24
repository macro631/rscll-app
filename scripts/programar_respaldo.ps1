# Programa el respaldo automático de RSCLL en el Programador de tareas de Windows.
# Se ejecuta lunes y jueves a las 09:00. Si el computador está apagado a esa hora, corre al encenderlo.
# Dos veces por semana también mantiene activo el proyecto gratuito de Supabase, que se pausa tras 7 días sin uso.
#
# Uso (PowerShell, desde prototipo/):   powershell -ExecutionPolicy Bypass -File scripts\programar_respaldo.ps1
# Para quitarlo:                        Unregister-ScheduledTask -TaskName 'RSCLL respaldo' -Confirm:$false

$ErrorActionPreference = 'Stop'
$prototipo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
if (-not (Test-Path $node)) { throw "No se encontró Node.js en $node" }

$accion = New-ScheduledTaskAction -Execute $node -Argument 'scripts\respaldo.mjs' -WorkingDirectory $prototipo
$cuando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Thursday -At 9:00
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName 'RSCLL respaldo' -Description 'Respaldo de datos y fotos de la app RSCLL (scripts\respaldo.mjs)' `
  -Action $accion -Trigger $cuando -Settings $ajustes -Force | Out-Null

$tarea = Get-ScheduledTask -TaskName 'RSCLL respaldo'
$info = $tarea | Get-ScheduledTaskInfo
"Tarea '$($tarea.TaskName)' programada. Próxima ejecución: $($info.NextRunTime)"
