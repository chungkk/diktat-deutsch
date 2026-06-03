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
    const { username, email, password } = await req.json();

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Alle Felder sind erforderlich' }, { status: 400, headers: corsHeaders() });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' }, { status: 400, headers: corsHeaders() });
    }

    await dbConnect();

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return NextResponse.json({ error: 'E-Mail oder Benutzername bereits vergeben' }, { status: 400, headers: corsHeaders() });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'user';

    const user = await User.create({ username, email, password: hashedPassword, role });

    const token = await createMobileToken({ userId: user._id.toString(), email: user.email });

    return NextResponse.json({
      token,
      user: { id: user._id.toString(), username: user.username, email: user.email, role: user.role },
    }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Mobile register error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
