// Autoinstalación del agente — el corazón del "un solo botón".
//
// Cuando el restaurante hace DOBLE CLIC en el instalador descargado del panel
// (LeoginAgent~LG1~<token>~.exe), este módulo:
//   1. Lee la URL + token del propio nombre del archivo (sin copiar/pegar nada).
//   2. Se copia a %LOCALAPPDATA%\Leogin\Agente\LeoginAgent.exe.
//   3. Escribe config.local.json.
//   4. Se registra para arrancar solo (carpeta Inicio + Tarea Programada).
//   5. Abre el puerto del hub (47100) en el Firewall de Windows — único paso
//      que pide una confirmación de UAC; si se cancela, todo lo demás queda
//      instalado igual (ver ensureFirewallRule).
//   6. Se lanza en silencio y muestra una confirmación.
//
// Todo corre en el contexto del usuario: no requiere PowerShell por parte del
// cliente, y solo la regla de firewall (paso 5, opcional) pide elevación.

import { execFileSync, spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { extractInstallParams, type InstallParams } from './config.ts';
import { logger } from './logger.ts';

const TASK_NAME = 'LeoginAgenteImpresion';
const INSTALLED_EXE = 'LeoginAgent.exe';
const FIREWALL_RULE = 'Leogin Hub (LAN)';
/** Nombre viejo (v0.2.x, solo puerto 47100) — se elimina al crear el nuevo. */
const FIREWALL_RULE_LEGACY = 'Leogin Hub (LAN 47100)';
const FIREWALL_PORTS = '47100,47443';

/** Carpeta estable de instalación, por usuario (no requiere admin). */
export function installDir(): string {
  const base = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || tmpdir(), 'AppData', 'Local');
  return join(base, 'Leogin', 'Agente');
}

/** ¿El exe en ejecución YA es la copia instalada? (entonces toca correr el daemon). */
export function isInstalledLocation(execPath = process.execPath): boolean {
  return resolve(dirname(execPath)).toLowerCase() === resolve(installDir()).toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Muestra un cuadro de diálogo nativo (no bloquea si PowerShell falla). */
function messageBox(text: string, title = 'Agente Leogin'): void {
  const safe = text.replace(/'/g, "''");
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${safe}','${title}') | Out-Null`,
      ],
      { windowsHide: true, timeout: 120_000 },
    );
  } catch {
    /* si no hay GUI disponible, no es crítico */
  }
}

/** Resuelve apiUrl+token: del nombre del archivo, o de un config.local.json al lado. */
function resolveParams(): InstallParams | null {
  const fromName = extractInstallParams();
  if (fromName) return fromName;

  // Plan B: config.local.json junto al instalador descargado (instalación manual).
  const sidecar = join(dirname(process.execPath), 'config.local.json');
  if (existsSync(sidecar)) {
    try {
      const cfg = JSON.parse(readFileSync(sidecar, 'utf8')) as { apiUrl?: string; token?: string };
      if (cfg.apiUrl && cfg.token) return { apiUrl: cfg.apiUrl.replace(/\/+$/, ''), token: cfg.token };
    } catch {
      /* ignora */
    }
  }

  // Plan C: variables de entorno (para pruebas).
  const apiUrl = (process.env.LEOGIN_API_URL || '').trim();
  const token = (process.env.LEOGIN_AGENT_TOKEN || '').trim();
  if (apiUrl && token) return { apiUrl: apiUrl.replace(/\/+$/, ''), token };

  return null;
}

function hiddenLauncherVbs(exePath: string): string {
  return [
    'Set s = CreateObject("WScript.Shell")',
    `s.Run """${exePath}""", 0, False`,
    '',
  ].join('\r\n');
}

/** Detiene cualquier instancia previa para poder sobrescribir el exe. */
function stopExisting(): void {
  for (const cmd of [
    ['schtasks', ['/end', '/tn', TASK_NAME]],
    ['taskkill', ['/im', INSTALLED_EXE, '/f', '/t']],
  ] as const) {
    try {
      execFileSync(cmd[0], cmd[1], { stdio: 'ignore', windowsHide: true, timeout: 15_000 });
    } catch {
      /* puede no existir aún — está bien */
    }
  }
}

/** Registra la Tarea Programada (arranque al iniciar sesión + reintento c/3 min). */
function registerScheduledTask(vbsPath: string): void {
  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Agente de impresion Leogin</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>PT3M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>"${vbsPath}"</Arguments>
    </Exec>
  </Actions>
</Task>`;

  const xmlPath = join(tmpdir(), `leogin-task-${Date.now()}.xml`);
  try {
    // schtasks /xml exige Unicode (UTF-16LE con BOM).
    writeFileSync(xmlPath, '﻿' + xml, 'utf16le');
    execFileSync('schtasks', ['/create', '/tn', TASK_NAME, '/xml', xmlPath, '/f'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 20_000,
    });
  } catch (err) {
    // No es fatal: la carpeta Inicio ya garantiza el arranque automático.
    logger.warn('No se pudo registrar la Tarea Programada:', (err as Error).message);
  } finally {
    try {
      rmSync(xmlPath, { force: true });
    } catch {
      /* ignora */
    }
  }
}

/** Abre los puertos del hub (47100 HTTP + 47443 HTTPS) en el Firewall de
    Windows. Sin esta regla,
    Windows bloquea las conexiones ENTRANTES desde otros dispositivos de la LAN
    (tablets del personal, celulares de comensales) y el respaldo offline solo
    funciona en esta misma PC — la prueba local con localhost no pasa por el
    firewall, por eso el hueco no se nota en desarrollo. Crear reglas de entrada
    exige elevación: Windows muestra UN aviso de UAC durante la instalación. Si
    el usuario lo cancela, la instalación continúa; la impresión por nube no se
    afecta. La regla se crea sin restringir el perfil de red a propósito: muchos
    Windows clasifican el WiFi del local como "red pública", y tanto /orders
    como /print del hub exigen el token de todos modos. */
function ensureFirewallRule(): void {
  try {
    execFileSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE}`], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 15_000,
    });
    return; // la regla ya existe (reinstalación / actualización)
  } catch {
    /* no existe → crearla */
  }

  // Un solo aviso de UAC para todo: borra la regla vieja (si existe) y crea
  // la nueva con ambos puertos (HTTP 47100 + HTTPS 47443).
  const innerCmd =
    `netsh advfirewall firewall delete rule name="${FIREWALL_RULE_LEGACY}" | Out-Null; ` +
    `netsh advfirewall firewall add rule name="${FIREWALL_RULE}" dir=in action=allow protocol=TCP localport=${FIREWALL_PORTS}`;
  const innerB64 = Buffer.from(innerCmd, 'utf16le').toString('base64');
  const psCmd =
    `Start-Process -FilePath powershell -ArgumentList '-NoProfile','-NonInteractive',` +
    `'-WindowStyle','Hidden','-EncodedCommand','${innerB64}' -Verb RunAs -Wait`;
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        // EncodedCommand evita el infierno de comillas anidadas cmd/PowerShell.
        '-EncodedCommand',
        Buffer.from(psCmd, 'utf16le').toString('base64'),
      ],
      { stdio: 'ignore', windowsHide: true, timeout: 120_000 },
    );
    logger.info(`Regla de firewall "${FIREWALL_RULE}" creada (puertos ${FIREWALL_PORTS}).`);
  } catch (err) {
    logger.warn('No se pudo abrir el puerto del hub en el firewall:', (err as Error).message);
  }
}

/** Copia el lanzador oculto a la carpeta Inicio del usuario (arranque sin admin). */
function installStartupEntry(vbsContent: string): void {
  const appData = process.env.APPDATA;
  if (!appData) return;
  const startup = join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  try {
    mkdirSync(startup, { recursive: true });
    writeFileSync(join(startup, 'LeoginAgente.vbs'), vbsContent, 'ascii');
  } catch (err) {
    logger.warn('No se pudo escribir en la carpeta Inicio:', (err as Error).message);
  }
}

/**
 * Ejecuta la instalación completa. Pensado para correr cuando el usuario hace
 * doble clic en el instalador descargado.
 */
export async function runSetup(): Promise<void> {
  const params = resolveParams();
  if (!params) {
    messageBox(
      'No se encontro el codigo de vinculacion del restaurante.\n\n' +
        'Descarga el instalador desde tu panel (Perfil -> Agente Leogin -> ' +
        'Descargar) y NO le cambies el nombre al archivo. Luego haz doble clic.',
    );
    process.exit(1);
  }

  const dir = installDir();
  mkdirSync(dir, { recursive: true });
  const destExe = join(dir, INSTALLED_EXE);

  logger.info(`Instalando agente Leogin en ${dir} ...`);

  // 1. Detener cualquier instancia previa para poder sobrescribir el binario.
  stopExisting();
  await sleep(1200);

  // 2. Copiar el ejecutable (con reintentos: el proceso viejo puede tardar en
  //    soltar el archivo).
  let copied = false;
  for (let attempt = 0; attempt < 5 && !copied; attempt++) {
    try {
      copyFileSync(process.execPath, destExe);
      copied = true;
    } catch (err) {
      if (attempt === 4) {
        messageBox(
          'No se pudo completar la instalacion porque el agente anterior sigue ' +
            'en uso. Cierra la sesion de Windows (o reinicia la PC) y vuelve a ' +
            'abrir el instalador.',
        );
        throw err;
      }
      await sleep(1000);
    }
  }

  // 3. Escribir la configuración (apiUrl + token).
  writeFileSync(
    join(dir, 'config.local.json'),
    JSON.stringify({ apiUrl: params.apiUrl, token: params.token }, null, 2),
    'utf8',
  );

  // 4. Lanzador oculto + autoarranque (carpeta Inicio + Tarea Programada).
  const vbs = hiddenLauncherVbs(destExe);
  const vbsPath = join(dir, 'launch-hidden.vbs');
  writeFileSync(vbsPath, vbs, 'ascii');
  installStartupEntry(vbs);
  registerScheduledTask(vbsPath);

  // 5. Abrir el puerto del hub en el firewall (respaldo LAN sin internet).
  ensureFirewallRule();

  // 6. Lanzar el agente ya instalado, en silencio.
  try {
    const child = spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch (err) {
    logger.warn('No se pudo lanzar el agente automaticamente:', (err as Error).message);
  }

  // 7. Confirmar al usuario.
  messageBox(
    'El Agente de impresion Leogin se instalo correctamente.\n\n' +
      'Ya quedo funcionando y se iniciara solo cada vez que enciendas esta PC.\n' +
      'Vuelve al panel: en unos segundos veras "Agente conectado".\n\n' +
      'Ya puedes cerrar esta ventana.',
  );

  // Pequeña espera para que el lanzamiento tome el candado antes de salir.
  await sleep(500);
}
