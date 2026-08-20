"""
Valida los XML que genera Leogin contra los XSD oficiales del SAT.

Tres ajustes al esquema publicado, todos justificados:

1. PATRONES MAL ESCRITOS. Varios `xs:pattern` del SAT terminan en `$` y
   algunos empiezan por `^`. En XSD esos caracteres son LITERALES (el patrón
   ya va anclado implícitamente), así que el esquema exige un `$` al final
   del valor. Comprobado: bajo lectura estricta, ni siquiera el literal "CF"
   —que el propio SAT documenta como consumidor final— valida contra su
   esquema. Se les quitan las anclas para que el patrón signifique lo que
   evidentemente quiso decir.

2. FIRMA DE RELLENO. El XML que produce Leogin va SIN firmar a propósito:
   la firma la aplica el certificador. Para validar la forma EXACTA que
   tendrá el documento certificado, se le inyecta una ds:Signature mínima
   antes de validar. (Relajar el esquema en su lugar rompe el modelo de
   contenido: lxml no puede decidirlo.)

3. COMPLEMENTOS IMPORTADOS. El wildcard estricto de dte:Complemento exige
   que la declaración global del complemento esté en el conjunto de
   esquemas; se importa GT_Complemento_Referencia_Nota.

Todo lo demás se valida tal cual: orden de elementos, atributos
obligatorios, enumeraciones, decimales, longitudes.
"""
import sys, os, re
from lxml import etree

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'xsd')
XML = sys.argv[1]

NS_XS = 'http://www.w3.org/2001/XMLSchema'


class Resolver(etree.Resolver):
    def resolve(self, url, pubid, context):
        base = os.path.basename(url)
        if 'xmldsig' in url:
            return self.resolve_filename(os.path.join(D, 'xmldsig-core-schema.xsd'), context)
        local = os.path.join(D, base)
        if os.path.exists(local):
            return self.resolve_filename(local, context)
        return None


# Quita SOLO anclas: un `^` al principio del patrón, o justo tras `(` o `|`.
# Nunca dentro de una clase de caracteres — `[^\s]*` significa "sin espacios"
# y borrarle el `^` lo convierte en su contrario.
ANCLA_INICIO = re.compile(r'(^|(?<=\()|(?<=\|))\^')


def limpiar(arbol):
    """Quita las anclas que el SAT escribió como si fueran regex de PCRE."""
    arreglados = 0
    for pat in arbol.iter(f'{{{NS_XS}}}pattern'):
        v = pat.get('value') or ''
        nuevo = ANCLA_INICIO.sub('', re.sub(r'\$$', '', v))
        if nuevo != v:
            pat.set('value', nuevo)
            arreglados += 1
    return arreglados


def cargar(nombre, importar=None):
    parser = etree.XMLParser(no_network=True)
    parser.resolvers.add(Resolver())
    arbol = etree.parse(os.path.join(D, nombre), parser)
    raiz = arbol.getroot()

    if importar:
        for ns, ruta in importar:
            imp = etree.SubElement(raiz, f'{{{NS_XS}}}import')
            imp.set('namespace', ns)
            imp.set('schemaLocation', ruta)
            raiz.remove(imp)
            raiz.insert(0, imp)

    arreglados = limpiar(arbol)
    return etree.XMLSchema(arbol), arreglados


NS_DS = 'http://www.w3.org/2000/09/xmldsig#'

FIRMA = f"""<ds:Signature xmlns:ds="{NS_DS}">
 <ds:SignedInfo>
  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
  <ds:Reference URI="">
   <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
   <ds:DigestValue>AAAA</ds:DigestValue>
  </ds:Reference>
 </ds:SignedInfo>
 <ds:SignatureValue>AAAA</ds:SignatureValue>
</ds:Signature>"""


def con_firma(ruta):
    """El documento tal como quedará tras firmarlo el certificador."""
    doc = etree.parse(ruta)
    doc.getroot().append(etree.fromstring(FIRMA))
    return doc


COMPLEMENTOS = [(
    'http://www.sat.gob.gt/face2/ComplementoReferenciaNota/0.1.0',
    'GT_Complemento_Referencia_Nota-0.1.0.xsd',
)]

CASOS = [
    ('factura.xml',   'GT_Documento-0.2.1.xsd',          COMPLEMENTOS),
    ('fpeq.xml',      'GT_Documento-0.2.1.xsd',          COMPLEMENTOS),
    ('cui.xml',       'GT_Documento-0.2.1.xsd',          COMPLEMENTOS),
    ('ncre.xml',      'GT_Documento-0.2.1.xsd',          COMPLEMENTOS),
    ('anulacion.xml', 'GT_AnulacionDocumento-0.1.0.xsd', None),
]

fallos = 0
info = None
for archivo, xsd, imports in CASOS:
    ruta = os.path.join(XML, archivo)
    if not os.path.exists(ruta):
        print(f'  ?  {archivo}: no existe'); fallos += 1; continue
    try:
        esquema, arreglados = cargar(xsd, imports)
        info = info or arreglados
    except Exception as e:
        print(f'  !  no se pudo cargar {xsd}: {e}'); fallos += 1; continue
    doc = con_firma(ruta)
    if esquema.validate(doc):
        print(f'  OK     {archivo:16} contra {xsd}')
    else:
        fallos += 1
        print(f'  FALLA  {archivo:16} contra {xsd}:')
        for err in esquema.error_log:
            print(f'         {err.message}')

if info:
    print()
    print(f'(ajustes: {info} patrones del SAT con anclas literales; firma de relleno inyectada)')
print('TODOS VALIDOS' if fallos == 0 else f'{fallos} archivo(s) con problemas')
sys.exit(1 if fallos else 0)
