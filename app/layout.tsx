import './globals.css'

export const metadata = {
  title: 'CardVault - Your Digital Rolodex',
  description: 'Digital business card management application',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
