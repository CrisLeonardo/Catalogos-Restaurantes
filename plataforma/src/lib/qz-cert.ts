// Certificado PÚBLICO de firma para QZ Tray (seguro de versionar).
// La clave PRIVADA correspondiente vive solo en el servidor (env QZ_PRIVATE_KEY_B64)
// y se usa en /api/print/sign. Ver @/lib/printing y src/app/api/print/sign/route.ts.
//
// Si esta constante está vacía, la capa de impresión opera SIN firma (QZ muestra
// un aviso "permitir" la primera vez por sesión). Con el certificado presente y la
// clave privada configurada en el servidor, la conexión se firma y desaparecen los
// avisos por acción.
//
// Para regenerar el par:
//   openssl req -x509 -newkey rsa:2048 -keyout private-key.pem \
//     -out digital-certificate.txt -days 7300 -nodes -sha256 \
//     -subj "/C=GT/O=Leogin/CN=Leogin Print"
// Pega digital-certificate.txt aquí y guarda `base64 -w0 private-key.pem` en QZ_PRIVATE_KEY_B64.

export const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDSzCCAjOgAwIBAgIUNyFjFgZou6zcsEd2coV1Ff/WuGgwDQYJKoZIhvcNAQEL
BQAwNTELMAkGA1UEBhMCR1QxDzANBgNVBAoMBkxlb2dpbjEVMBMGA1UEAwwMTGVv
Z2luIFByaW50MB4XDTI2MDYxNzE2MzkzMVoXDTQ2MDYxMjE2MzkzMVowNTELMAkG
A1UEBhMCR1QxDzANBgNVBAoMBkxlb2dpbjEVMBMGA1UEAwwMTGVvZ2luIFByaW50
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv/ckOJrPrX/N1N233lHv
DTunCcZm6UzethvJoSxX9mK2L4Ui+ymGlDvNuHM7qsu+NfVuyOMZCboVQJ328dr+
poFJciykBaO1XkOeB3PBj+8l6sSljUqCMNeWU3s+Odnq12B/X4ItITkAVUDabAju
n/8fWOmPiQpfTZh4RWhkNdgbLgUrwEGlJCydnJ+hEHgKCzMV6FSQjqLv5l7AlNW/
ydsvR5Hx7+15M/wOKeNtalKLWewP/t7FPeClDrhSazbbCBM6+RVqBUqEfEGk/ZkD
9xdxrbtE2x2CgkbsP2ChJUzYxYFCOOOabwKuzIIi/Pp9fRAEHBISTQNwNwX9Q0+L
DQIDAQABo1MwUTAdBgNVHQ4EFgQUzVZxfQ4W62E4IxS1BQUTWWDl3AgwHwYDVR0j
BBgwFoAUzVZxfQ4W62E4IxS1BQUTWWDl3AgwDwYDVR0TAQH/BAUwAwEB/zANBgkq
hkiG9w0BAQsFAAOCAQEADuPw6WoU8FTfFAtTKbSEIdYsSqiYGzyZZDZwMAGUmd8y
mzN0yI2+W+Ku7096/LZyGeDIJJXajRvCrrsSfuI+nq92ouxdnma+tkYl1cjDaPB/
CcwR4WSQnNMdKV7yFZeAyw+75hjClba4tPfx/nuRThBoJhWHCtgNzloIz6jiKeXn
7gYL6CwOryQYkB5nRNrzV/8R1XqEhPp25uqcrw3l4q0s36yQRZHRKHBx5tzDr6aC
iIvJE106mOz/OzDYjEZ0xUI/tlGthv7PvTRvR+oLpHdR2X8/1Kmuft83Y+0f81hV
x5tAfSK22NHVDvUD1gen1LPxMQMJ+JWLNwxxzuWdfg==
-----END CERTIFICATE-----`;
