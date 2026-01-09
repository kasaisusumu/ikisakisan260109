/** @type {import('next').NextConfig} */
const nextConfig = {
  // 画像（Unsplashや楽天など）を表示できるように全ドメインを許可
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  
  // ★ 今回の警告を消すための設定
  experimental: {
    // あなたのPCのIPアドレスを指定 (ポート番号がある場合は含める、通常は3000)
    // 警告に出ているIP "192.168.1.211" を許可リストに追加
    allowedDevOrigins: [
      'localhost:3000', 
      '192.168.1.211:3000', 
      '192.168.1.211:8000', // 必要に応じて
      'localhost:3000', 
      '192.168.0.13:3000' // ★今の場所（家）のIPを追加
    ],
  },
};


export default nextConfig;