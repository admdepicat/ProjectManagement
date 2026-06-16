import { NextRequest, NextResponse } from 'next/server';

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
  const secret = process.env.VPS_REBOOT_SECRET;

  if (!host || !secret) {
    return NextResponse.json(
      { error: 'VPS settings are not configured' },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`http://${host}:8080/reboot`, {
      method: 'POST',
      headers: { 'X-Secret': secret },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      return NextResponse.json({ success: true, message: 'VPS 再起動コマンドを送信しました' });
    } else {
      return NextResponse.json({ error: '認証エラー：シークレットトークンを確認してください' }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: 'VPS に接続できませんでした' }, { status: 502 });
  }
}
