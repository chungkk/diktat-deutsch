import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'fallback-secret');

export async function createMobileToken(payload: { userId: string; email: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret);
}

export async function verifyMobileToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload as { userId: string; email: string };
}

export async function getMobileUser(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifyMobileToken(auth.slice(7));
    await dbConnect();
    const user = await User.findById(payload.userId).select('_id email username role');
    return user;
  } catch {
    return null;
  }
}
