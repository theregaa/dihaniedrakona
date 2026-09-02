import './globals.css';

export const metadata={
  title:'Дыхание Дракона — Официант',
  description:'Внутренняя система заказов',
  manifest:'/manifest.webmanifest',
  icons:{icon:'/icon-192.png',apple:'/icon-192.png'}
};

export const viewport={
  width:'device-width',
  initialScale:1,
  viewportFit:'cover',
  userScalable:false
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="ru"><head>
    <meta name="apple-mobile-web-app-capable" content="yes"/>
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
    <meta name="apple-mobile-web-app-title" content="Дыхание Дракона"/>
    <meta name="mobile-web-app-capable" content="yes"/>
    <link rel="apple-touch-icon" href="/icon-192.png"/>
  </head><body><div className="shell">{children}</div></body></html>
}
