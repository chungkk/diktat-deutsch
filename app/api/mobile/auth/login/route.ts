import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'diktat-deutsch-mobile-secret';

// Mobile login endpoint — returns JWT token instead of cookie session
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return corsResponse(
        NextResponse.json({ error: 'Email und Passwort sind erforderlich' }, { status: 400 })
      );
    }

    await dbConnect();

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return corsResponse(
        NextResponse.json({ error: 'Benutzer nicht gefunden' }, { status: 401 })
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return corsResponse(
        NextResponse.json({ error: 'Falsches Passwort' }, { status: 401 })
      );
    }

    // Sign JWT token
    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        name: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return corsResponse(
      NextResponse.json({
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.username,
          role: user.role,
        },
      })
    );
  } catch (error: unknown) {
    console.error('Mobile login error:', error);
    return corsResponse(
      NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    );
  }
}

// Handle preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

function corsResponse(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}
