/* Layout raíz de /central — pass-through. El guard + shell viven en
   /central/(protected)/layout.tsx para no envolver /central/login. */
export default function CentralRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
