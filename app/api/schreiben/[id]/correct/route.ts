import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import WritingProject from '@/models/WritingProject';
import OpenAI from 'openai';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const userId = (session.user as { id?: string })?.id;
    const { id } = await params;

    await dbConnect();

    const project = await WritingProject.findOne({ _id: id, userId });
    if (!project) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
    }

    if (!project.content || project.content.trim().length < 10) {
      return NextResponse.json(
        { error: 'Der Text muss mindestens 10 Zeichen lang sein' },
        { status: 400 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Du bist ein professioneller Deutschlehrer, der Texte von Deutschlernern (Niveau ${project.level}) korrigiert.

Analysiere den Text und antworte NUR mit einem gültigen JSON-Objekt (kein Markdown, kein \`\`\`):
{
  "correctedText": "Der vollständig korrigierte Text",
  "errors": [
    {
      "original": "Das fehlerhafte Wort/Phrase",
      "corrected": "Die korrigierte Version",
      "type": "Grammatik|Rechtschreibung|Wortschatz|Satzbau|Zeichensetzung",
      "explanation": "Giải thích bằng tiếng Việt tại sao sai và cách sửa"
    }
  ],
  "overallFeedback": "Nhận xét tổng thể bằng tiếng Việt về bài viết: điểm mạnh, điểm yếu, gợi ý cải thiện",
  "score": 75
}

Regeln:
- "type" muss einer dieser Werte sein: Grammatik, Rechtschreibung, Wortschatz, Satzbau, Zeichensetzung
- "explanation" auf Vietnamesisch schreiben
- "overallFeedback" auf Vietnamesisch schreiben
- "score" ist eine Zahl von 0 bis 100
- Wenn keine Fehler gefunden werden, gib ein leeres Array für "errors" zurück und score = 100
- Finde ALLE Fehler, auch kleine
- Sei ermutigend im Feedback`
        },
        {
          role: 'user',
          content: `Bitte korrigiere den folgenden Text (Niveau ${project.level}):\n\n${project.content}`
        }
      ],
      temperature: 0.3,
      max_tokens: 3000,
    });

    const rawContent = response.choices[0]?.message?.content || '';

    // Parse JSON response
    let correction;
    try {
      // Remove potential markdown code blocks
      const cleaned = rawContent.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      correction = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse OpenAI response:', rawContent);
      return NextResponse.json(
        { error: 'KI-Antwort konnte nicht verarbeitet werden' },
        { status: 502 }
      );
    }

    // Validate and sanitize
    const correctionData = {
      correctedText: correction.correctedText || project.content,
      errors: Array.isArray(correction.errors) ? correction.errors.map((e: Record<string, unknown>) => ({
        original: String(e.original || ''),
        corrected: String(e.corrected || ''),
        type: ['Grammatik', 'Rechtschreibung', 'Wortschatz', 'Satzbau', 'Zeichensetzung'].includes(e.type as string)
          ? e.type
          : 'Grammatik',
        explanation: String(e.explanation || ''),
      })) : [],
      overallFeedback: String(correction.overallFeedback || ''),
      score: Math.min(100, Math.max(0, Number(correction.score) || 0)),
      createdAt: new Date(),
    };

    // Push correction to array and update status
    project.corrections.push(correctionData);
    project.status = 'corrected';
    await project.save();

    return NextResponse.json({
      correction: correctionData,
      project,
    });
  } catch (error: unknown) {
    console.error('Correction error:', error);
    return NextResponse.json(
      { error: 'Korrektur fehlgeschlagen' },
      { status: 500 }
    );
  }
}
