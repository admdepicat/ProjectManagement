import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'ssh2';

function checkBasicAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Basic ')) return false;

  const base64 = authHeader.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');
  const [user, password] = decoded.split(':');

  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPass) return false;
  return user === expectedUser && password === expectedPass;
}

export async function POST(request: NextRequest) {
  if (!checkBasicAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="VPS Control"' },
    });
  }

  const host = process.env.VPS_HOST;
  const port = parseInt(process.env.VPS_PORT || '22');
  const username = process.env.VPS_USER;
  const password = process.env.VPS_PASSWORD;

  if (!host || !username || !password) {
    return NextResponse.json(
      { error: 'VPS connection settings are not configured' },
      { status: 500 }
    );
  }

  return new Promise<NextResponse>((resolve) => {
    const conn = new Client();

    const timeout = setTimeout(() => {
      conn.end();
      resolve(NextResponse.json({ error: 'Connection timed out' }, { status: 504 }));
    }, 15000);

    conn
      .on('ready', () => {
        conn.exec('sudo reboot', (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            resolve(NextResponse.json({ error: err.message }, { status: 500 }));
            return;
          }
          stream
            .on('close', () => {
              clearTimeout(timeout);
              conn.end();
              resolve(NextResponse.json({ success: true, message: 'VPS 再起動コマンドを送信しました' }));
            })
            .on('data', () => {})
            .stderr.on('data', () => {});
        });
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        resolve(NextResponse.json({ error: `SSH 接続に失敗しました: ${err.message}` }, { status: 502 }));
      })
      .connect({ host, port, username, password, readyTimeout: 10000 });
  });
}
