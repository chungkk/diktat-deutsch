import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const { sentence } = await req.json();

    if (!sentence || typeof sentence !== 'string' || sentence.trim().length === 0) {
      return NextResponse.json({ error: 'Kein Satz angegeben' }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Bạn là một giáo viên tiếng Đức chuyên nghiệp, đang giải thích câu tiếng Đức cho học viên người Việt. 
Hãy trả lời bằng tiếng Việt, theo đúng 4 mục sau (dùng emoji để phân cách rõ ràng):

🌐 **Dịch tự nhiên**
Dịch câu sang tiếng Việt một cách tự nhiên, không dịch word-by-word.

📝 **Phân tích từng từ**
Liệt kê từng từ/cụm từ quan trọng, kèm loại từ (danh từ, động từ, tính từ...), giống (der/die/das nếu là danh từ), và nghĩa.
Format: **từ** (loại từ) — nghĩa

🔍 **Cấu trúc thú vị**
Chỉ ra các cấu trúc ngữ pháp đáng chú ý trong câu (trật tự từ, Nebensatz, thì, Konjunktiv, trợ động từ tách...). Giải thích ngắn gọn.

🎨 **Sắc thái toàn câu**
Giải thích sắc thái, ngữ cảnh sử dụng, mức độ trang trọng (formal/informal), và cảm xúc mà câu truyền tải.`
        },
        {
          role: 'user',
          content: `Hãy giải thích câu tiếng Đức sau:\n\n"${sentence}"`
        }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const explanation = response.choices[0]?.message?.content || 'Không thể giải thích câu này.';

    return NextResponse.json({ explanation });
  } catch (error: unknown) {
    console.error('Explain error:', error);
    return NextResponse.json(
      { error: 'Giải thích thất bại' },
      { status: 500 }
    );
  }
}
