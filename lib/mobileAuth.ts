import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'diktat-deutsch-mobile-secret';

interface MobileUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Verify JWT token from mobile app Authorization header.
 * Returns the decoded user payload or null if invalid.
 */
export function verifyMobileToken(req: NextRequest): MobileUser | null {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as MobileUser;

    if (!decoded.id) return null;
    return decoded;
  } catch {
    return null;
  }
}
