'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { PlatformContactSettings } from '@/lib/actions/super-admin';

interface FaqItem {
  q: string;
  a: string;
}

const FAQ: FaqItem[] = [
  {
    q: '¿Cómo agrego un nuevo producto al menú?',
    a: 'Ve a Catálogo → haz clic en "Nuevo producto". Completa el nombre, precio e imagen. Si quieres agregar variantes (tamaños, extras) usa la sección "Opciones" dentro del producto.',
  },
  {
    q: '¿Cómo activo o desactivo la recepción de pedidos?',
    a: 'Ve a Perfil → busca el interruptor "Pausar pedidos". Cuando está activo, los clientes verán un mensaje de pausa y no podrán enviar pedidos. También puedes personalizar ese mensaje.',
  },
  {
    q: '¿Cómo configuro los horarios de atención?',
    a: 'Ve a Perfil → sección "Horarios". Puedes activar o desactivar cada día de la semana y definir el rango de horas. Los pedidos solo se aceptan dentro de ese horario.',
  },
  {
    q: '¿Cómo configuro las zonas de entrega a domicilio?',
    a: 'Ve a Perfil → sección "Entrega". Puedes definir zonas de texto (ej. "Zona 1, Zona 10") o usar el mapa para establecer un radio de cobertura geográfica en kilómetros.',
  },
  {
    q: '¿Por qué no recibo notificaciones de nuevos pedidos?',
    a: 'Asegúrate de haber dado permiso de notificaciones en el navegador. En la pantalla de Pedidos en vivo aparece un botón de campana en la barra superior — haz clic para activarlas. También revisa que las notificaciones no estén bloqueadas en la configuración de tu navegador o teléfono.',
  },
  {
    q: '¿Cómo cancelo un pedido en el panel?',
    a: 'Desde la pantalla de Pedidos en vivo, busca el pedido y haz clic en "Cancelar". El sistema pedirá confirmación antes de ejecutar la cancelación. El cliente verá el estado actualizado en su pantalla de seguimiento.',
  },
  {
    q: '¿Cómo personalizo los colores y el aspecto de mi menú?',
    a: 'Ve a Personalizar. Ahí puedes cambiar la paleta de colores, la tipografía, el estilo de la portada y más. Los cambios se reflejan en tiempo real para tus clientes.',
  },
  {
    q: '¿Cómo comparto el menú con mis clientes?',
    a: 'Ve a QR para descargar el código QR de tu menú. También puedes copiar el enlace directo desde esa pantalla y compartirlo por WhatsApp, redes sociales o imprimirlo.',
  },
  {
    q: '¿Cómo veo las ventas y estadísticas?',
    a: 'Ve a Métricas. Ahí encontrarás el total de ventas de los últimos 14 días, los productos más vendidos del día, el ticket promedio y un gráfico de ventas diarias. También puedes exportar los pedidos a Excel.',
  },
  {
    q: '¿Puedo tener varios usuarios administradores?',
    a: 'Sí. El Super Admin puede crear usuarios adicionales con rol de Dueño o Staff para tu restaurante. Contáctanos para agregar más usuarios a tu cuenta.',
  },
];

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        borderBottom: '1px solid var(--u-hair)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="press"
        style={{
          width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)', lineHeight: 1.4 }}>
          {item.q}
        </span>
        <span style={{ flexShrink: 0, color: 'var(--u-text-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
          <Icon name="chevronDown" size={16} />
        </span>
      </button>
      {open && (
        <p style={{ fontSize: 13.5, color: 'var(--u-text-2)', lineHeight: 1.6, paddingBottom: 14 }}>
          {item.a}
        </p>
      )}
    </div>
  );
}

export default function SoporteClient({ contact }: { contact: PlatformContactSettings }) {
  const waLink = contact.support_whatsapp
    ? `https://wa.me/${contact.support_whatsapp.replace(/\D/g, '')}`
    : null;
  const mailLink = contact.support_email ? `mailto:${contact.support_email}` : null;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 640 }}>

      {/* Intro */}
      <Card className="px-5.5 py-5">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(139,92,246,0.15)', display: 'grid', placeItems: 'center', color: '#a78bfa' }}>
            <Icon name="helpCircle" size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--u-text)' }}>Centro de ayuda</h2>
            <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 2 }}>Guía rápida y respuestas a las preguntas más frecuentes</p>
          </div>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--u-text-2)', lineHeight: 1.6 }}>
          Aquí encontrarás respuestas a las preguntas más comunes sobre el panel de administración.
          Si no encuentras lo que buscas, puedes contactarnos directamente.
        </p>
      </Card>

      {/* FAQ */}
      <Card className="px-5.5 py-5">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
          Preguntas frecuentes
        </h3>
        <div>
          {FAQ.map((item) => (
            <FaqRow key={item.q} item={item} />
          ))}
        </div>
      </Card>

      {/* Contacto */}
      <Card className="px-5.5 py-5">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
          Contactar soporte
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--u-text-2)', lineHeight: 1.6, marginBottom: 18 }}>
          ¿Tienes un problema que no está en la guía? Escríbenos directamente y te respondemos a la brevedad.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {waLink ? (
            <Button
              render={<a href={waLink} target="_blank" rel="noopener noreferrer" />}
              size="lg"
              /* h-auto + whitespace-normal: el número se apila bajo la etiqueta
                 en vez de forzar una sola línea que desborda en móviles. */
              className="justify-start h-auto py-3 whitespace-normal"
              style={{
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.30)',
                color: '#4ade80',
              }}
            >
              <Icon name="whatsapp" size={18} />
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0, textAlign: 'left' }}>
                <span>Escribir por WhatsApp</span>
                {contact.support_whatsapp && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(74,222,128,0.7)', wordBreak: 'break-all' }}>
                    {contact.support_whatsapp}
                  </span>
                )}
              </span>
            </Button>
          ) : (
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '13px 18px', borderRadius: 'var(--radius-lg)',
                fontSize: 14, opacity: 0.4,
                background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                border: '1px solid var(--u-hair)',
                color: 'var(--u-text-3)',
              }}
            >
              <Icon name="whatsapp" size={18} />
              WhatsApp no configurado
            </div>
          )}

          {mailLink ? (
            <Button
              render={<a href={mailLink} />}
              size="lg"
              className="justify-start h-auto py-3 whitespace-normal"
              style={{
                background: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,0.30)',
                color: '#60a5fa',
              }}
            >
              <Icon name="mail" size={18} />
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0, textAlign: 'left' }}>
                <span>Enviar correo electrónico</span>
                {contact.support_email && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(96,165,250,0.7)', wordBreak: 'break-all' }}>
                    {contact.support_email}
                  </span>
                )}
              </span>
            </Button>
          ) : (
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '13px 18px', borderRadius: 'var(--radius-lg)',
                fontSize: 14, opacity: 0.4,
                background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                border: '1px solid var(--u-hair)',
                color: 'var(--u-text-3)',
              }}
            >
              <Icon name="mail" size={18} />
              Correo no configurado
            </div>
          )}
        </div>
      </Card>

    </div>
  );
}
