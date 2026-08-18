/** Logo "G" oficial de Google (multicolor). Compartido por los dos botones de
    "Continuar con Google": el del COMENSAL (menu/google-signin.tsx) y el del
    PERSONAL (auth/google-staff-button.tsx). Vive aparte para que el logo no
    se desincronice entre las dos pantallas. */
export default function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 4.5 29.5 2.5 24 2.5 12.1 2.5 2.5 12.1 2.5 24S12.1 45.5 24 45.5 45.5 35.9 45.5 24c0-1.2-.1-2.4-.3-3.5z" />
      <path fill="#FF3D00" d="M5.3 14.7l6.6 4.8C13.6 16 18.4 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16 4.5 9 9.2 5.3 14.7z" transform="translate(0 -2)" />
      <path fill="#4CAF50" d="M24 45.5c5.4 0 10.3-2 14-5.3l-6.5-5.3c-2 1.5-4.6 2.4-7.5 2.4-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9 40.7 16 45.5 24 45.5z" />
      <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.5 5.3c-.5.4 6.8-4.9 6.8-15.2 0-1.2-.1-2.4-.3-3.5z" />
    </svg>
  );
}
