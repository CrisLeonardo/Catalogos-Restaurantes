/* ============================================================
   Emisión del certificado wildcard del hub (Let's Encrypt, DNS-01).
   ------------------------------------------------------------
   Se emite UN certificado `*.hub.<dominio>` compartido por todos los
   agentes (decisión deliberada: certificado por agente chocaría con el
   rate limit de Let's Encrypt de ~50 certs/semana por dominio — mismo
   motivo por el que Plex terminó con un acuerdo con DigiCert). El
   riesgo del key compartido queda acotado: cada hub sigue exigiendo su
   token propio en /orders y /print, y los hubs viven en LANs físicas
   distintas. Ver ARQUITECTURA_OFFLINE.md §8.1.

   El desafío DNS-01 se responde publicando un TXT en Cloudflare — el
   hub NUNCA necesita ser alcanzable desde internet.
   ============================================================ */

import acme from 'acme-client';
import { createServiceClient } from '@/lib/supabase/service';
import { getZoneId, setTxtRecord, deleteTxtRecord } from './cloudflare';

type Db = ReturnType<typeof createServiceClient>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function directoryUrl(): string {
  const v = process.env.LEOGIN_ACME_DIRECTORY?.trim();
  if (!v || v === 'production') return acme.directory.letsencrypt.production;
  if (v === 'staging') return acme.directory.letsencrypt.staging;
  return v; // URL explícita (tests)
}

function contactEmail(): string {
  return (
    process.env.LEOGIN_ACME_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    'soporte@leogin.online'
  );
}

/** Llave de cuenta ACME persistida (una por directorio prod/staging). */
async function accountKeyFor(db: Db, dirUrl: string): Promise<Buffer> {
  const { data } = await db
    .from('acme_accounts')
    .select('account_key_pem')
    .eq('directory_url', dirUrl)
    .maybeSingle();
  if (data?.account_key_pem) return Buffer.from(data.account_key_pem as string, 'utf8');

  const key = await acme.crypto.createPrivateKey();
  const { error } = await db
    .from('acme_accounts')
    .insert({ directory_url: dirUrl, account_key_pem: key.toString() });
  if (error) throw new Error(`No se pudo guardar la cuenta ACME: ${error.message}`);
  return key;
}

export interface IssuedCert {
  certPem: string;
  keyPem: string;
  expiresAt: string;
}

/**
 * Emite (y persiste en hub_certificates) un wildcard nuevo para `*.<hubDomain>`.
 * Tarda ~30-90s (propagación DNS + validación de Let's Encrypt) — llamar
 * SIEMPRE fuera del camino de una respuesta HTTP (fire-and-forget).
 */
export async function issueWildcardCert(hubDomain: string, rootDomain: string): Promise<IssuedCert> {
  const db = createServiceClient();
  const dirUrl = directoryUrl();
  const accountKey = await accountKeyFor(db, dirUrl);
  const client = new acme.Client({ directoryUrl: dirUrl, accountKey });

  const [keyPem, csr] = await acme.crypto.createCsr({ commonName: `*.${hubDomain}` });
  const zoneId = await getZoneId(rootDomain);

  const certPem = await client.auto({
    csr,
    email: contactEmail(),
    termsOfServiceAgreed: true,
    challengePriority: ['dns-01'],
    challengeCreateFn: async (authz, _challenge, keyAuthorization) => {
      // Para dns-01, keyAuthorization ya viene listo para el TXT.
      await setTxtRecord(zoneId, `_acme-challenge.${authz.identifier.value}`, keyAuthorization);
      // Cloudflare es autoritativo (propaga en segundos); margen conservador.
      await sleep(10_000);
    },
    challengeRemoveFn: async (authz) => {
      await deleteTxtRecord(zoneId, `_acme-challenge.${authz.identifier.value}`);
    },
  });

  const info = acme.crypto.readCertificateInfo(certPem.toString());
  const expiresAt = info.notAfter.toISOString();

  const { error } = await db.from('hub_certificates').insert({
    cert_pem: certPem.toString(),
    key_pem: keyPem.toString(),
    expires_at: expiresAt,
  });
  if (error) throw new Error(`No se pudo guardar el certificado del hub: ${error.message}`);

  return { certPem: certPem.toString(), keyPem: keyPem.toString(), expiresAt };
}
