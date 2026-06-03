import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { createMobileToken } from '@/lib/mobile-auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email und Passwort sind erforderlich' }, { status: 400, headers: corsHeaders() });
    }

    await dbConnect();
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: 'Benutzer nicht gefunden' }, { status: 401, headers: corsHeaders() });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'Falsches Passwort' }, { status: 401, headers: corsHeaders() });
    }

    const token = await createMobileToken({ userId: user._id.toString(), email: user.email });

    return NextResponse.json({
      token,
      user: { id: user._id.toString(), username: user.username, email: user.email, role: user.role },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Mobile login error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
