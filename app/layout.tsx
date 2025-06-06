import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '全銀フォーマットを検証する',
  description: '全銀フォーマットを検証するためのツール',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
