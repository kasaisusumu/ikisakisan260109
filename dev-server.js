const { networkInterfaces } = require('os');
const { spawn } = require('child_process');

// PCのIPアドレス（IPv4）を自動で探す関数
function getLocalExternalIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // IPv4かつ、自分自身(127.0.0.1)でないものを探す
      if (net.family === 'IPv4' && !net.internal) {
        // 一般的なWi-FiのIPアドレス（192.168... や 172... 10...）を優先して返す
        return net.address;
      }
    }
  }
  return 'localhost'; // 見つからなかったらlocalhost
}

const ip = getLocalExternalIp();
const port = 3000;
const backendPort = 8000;

console.log('\x1b[32m%s\x1b[0m', '---------------------------------------------------');
console.log(` 🚀 Network Mode Detected!`);
console.log(` 🏠 Server IP: ${ip}`);
console.log(` 📱 Access from Phone: http://${ip}:${port}`);
console.log(` 🔗 Backend URL set to: http://${ip}:${backendPort}`);
console.log('\x1b[32m%s\x1b[0m', '---------------------------------------------------');

// 環境変数を上書きして、Next.jsを起動する
// (WindowsでもMacでも動くようにcross-env的な挙動をします)
const nextDev = spawn('npm', ['run', 'next-dev', '--', '-H', '0.0.0.0'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_API_URL: `http://${ip}:${backendPort}`, // ここで自動設定！
  },
});

nextDev.on('close', (code) => {
  process.exit(code);
});