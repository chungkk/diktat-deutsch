import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { colors, LEVEL_COLORS } from '../theme';
import { api, Lesson, Subtitle } from '../api';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

function tokenize(text: string): string[] {
  return text.replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
}

function bareWord(w: string): string {
  return w.replace(/^[.,!?;:'"„"»«…–-]+|[.,!?;:'"„"»«…–-]+$/g, '');
}

function isRealWord(w: string): boolean {
  return bareWord(w).length >= 2;
}

function pickBlanks(words: string[], seed: number): Set<number> {
  const blanks = new Set<number>();
  const realWordIndices = words.map((w, i) => ({ w, i })).filter(({ w }) => isRealWord(w)).map(({ i }) => i);
  if (realWordIndices.length <= 1) return blanks;
  for (const i of realWordIndices) {
    if ((seed + i * 3 + 1) % 5 < 3) blanks.add(i);
  }
  if (blanks.size === 0 && realWordIndices.length > 0) blanks.add(realWordIndices[0]);
  return blanks;
}

const norm = (s: string) => s.toLowerCase().replace(/[.,!?;:'"„"»«]/g, '').trim();

export default function LessonScreen({ navigation, route }: any) {
  const { lesson } = route.params;
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [blankInputs, setBlankInputs] = useState<Record<number, Record<number, string>>>({});
  const [blankResults, setBlankResults] = useState<Record<number, Record<number, 'correct' | 'incorrect'>>>({});
  const [revealedWords, setRevealedWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const completedRef = useRef<number[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const playerRef = useRef<any>(null);
  const lastTapRef = useRef<Record<string, number>>({});
  const rowYRef = useRef<Record<number, number>>({});
  const currentIndexRef = useRef(0);

  const subTokens = useMemo(() => {
    return lesson.subtitles.map((sub, i) => {
      const words = tokenize(sub.text);
      const blanks = pickBlanks(words, i * 7 + 3);
      return { words, blanks };
    });
  }, [lesson.subtitles]);

  useEffect(() => {
    (async () => {
      try {
        const prog = await api.getLessonProgress(lesson._id);
        if (Array.isArray(prog?.completedIndices)) {
          completedRef.current = prog.completedIndices;
          setCompletedIndices(prog.completedIndices);
        }
        if (prog?.score) setScore(prog.score);
        if (prog?.totalAttempts) setTotalAttempts(prog.totalAttempts);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, [lesson._id]);

  const saveProgress = useCallback(async (completed: number[], sc: number, attempts: number) => {
    try {
      await api.saveProgress({
        lessonId: lesson._id,
        currentIndex: completed.length > 0 ? Math.max(...completed) : 0,
        completedIndices: completed,
        score: sc,
        totalAttempts: attempts,
        isCompleted: completed.length >= lesson.subtitles.length,
      });
    } catch (e) {
      console.error('Save error:', e);
    }
  }, [lesson._id, lesson.subtitles.length]);

  const scrollToRow = useCallback((index: number) => {
    const y = rowYRef.current[index];
    if (y !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, y - 80), animated: true });
    }
  }, []);

  const setActiveIndex = useCallback((index: number) => {
    if (index === currentIndexRef.current) return;
    currentIndexRef.current = index;
    setCurrentIndex(index);
    scrollToRow(index);
  }, [scrollToRow]);

  const seekToSub = useCallback((index: number) => {
    if (!lesson.subtitles[index] || lesson.videoType !== 'youtube') return;
    const sub = lesson.subtitles[index];
    playerRef.current?.seekTo(sub.start, true);
    setPlaying(true);
    setTimeout(() => setPlaying(false), (sub.dur + 0.5) * 1000);
  }, [lesson]);

  const selectSubtitle = useCallback((index: number) => {
    setActiveIndex(index);
    seekToSub(index);
  }, [seekToSub, setActiveIndex]);

  // Poll YouTube time and sync active subtitle
  useEffect(() => {
    if (!playing || lesson.videoType !== 'youtube') return;
    const subs = lesson.subtitles;
    const interval = setInterval(async () => {
      try {
        const t = await playerRef.current?.getCurrentTime();
        if (t == null) return;
        for (let i = subs.length - 1; i >= 0; i--) {
          if (t >= subs[i].start - 0.15) {
            setActiveIndex(i);
            break;
          }
        }
      } catch {}
    }, 200);
    return () => clearInterval(interval);
  }, [playing, lesson, setActiveIndex]);

  const handleBlankChange = (subIdx: number, wordIdx: number, value: string) => {
    setBlankInputs(prev => ({ ...prev, [subIdx]: { ...(prev[subIdx] || {}), [wordIdx]: value } }));

    const { words, blanks } = subTokens[subIdx];
    const expected = norm(words[wordIdx]);
    const actual = norm(value);

    let result: 'correct' | 'incorrect' | undefined;
    if (actual.length === 0) result = undefined;
    else if (actual === expected) result = 'correct';
    else if (expected.startsWith(actual)) result = undefined;
    else result = 'incorrect';

    setBlankResults(prev => {
      const updated = { ...(prev[subIdx] || {}) };
      if (result) updated[wordIdx] = result;
      else delete updated[wordIdx];
      return { ...prev, [subIdx]: updated };
    });

    if (result === 'correct') {
      const sortedBlanks = Array.from(blanks).sort((a: number, b: number) => a - b);
      const allInputs = { ...(blankInputs[subIdx] || {}), [wordIdx]: value };
      const allCorrect = sortedBlanks.every((wi: number) => norm(allInputs[wi] || '') === norm(words[wi]));

      if (allCorrect) {
        const newAttempts = totalAttempts + 1;
        setTotalAttempts(newAttempts);
        let newScore = score;
        let newCompleted = completedRef.current;
        if (!completedRef.current.includes(subIdx)) {
          newScore = score + 1;
          newCompleted = [...completedRef.current, subIdx];
          completedRef.current = newCompleted;
          setScore(newScore);
          setCompletedIndices(newCompleted);
        }
        const allResults: Record<number, 'correct' | 'incorrect'> = {};
        sortedBlanks.forEach((wi: number) => { allResults[wi] = 'correct'; });
        setBlankResults(prev => ({ ...prev, [subIdx]: allResults }));
        saveProgress(newCompleted, newScore, newAttempts);

        if (subIdx < lesson.subtitles.length - 1) {
          setTimeout(() => {
            setActiveIndex(subIdx + 1);
            seekToSub(subIdx + 1);
          }, 600);
        }
      }
    }
  };

  const revealWord = (subIdx: number, wordIdx: number) => {
    const key = `${subIdx}-${wordIdx}`;
    const next = new Set(revealedWords);
    next.add(key);
    setRevealedWords(next);

    const { words, blanks } = subTokens[subIdx];
    const subResults = blankResults[subIdx] || {};
    const allRevealed = words.every((_, wi) => {
      if (!blanks.has(wi)) return true;
      if (next.has(`${subIdx}-${wi}`)) return true;
      if (subResults[wi] === 'correct') return true;
      return false;
    });

    if (allRevealed && !completedRef.current.includes(subIdx)) {
      const newCompleted = [...completedRef.current, subIdx];
      completedRef.current = newCompleted;
      setCompletedIndices(newCompleted);
      const newAttempts = totalAttempts + 1;
      setTotalAttempts(newAttempts);
      saveProgress(newCompleted, score, newAttempts);
      if (subIdx < lesson.subtitles.length - 1) {
        setTimeout(() => { setActiveIndex(subIdx + 1); seekToSub(subIdx + 1); }, 600);
      }
    }
  };

  const totalSubs = lesson.subtitles.length;
  const pct = totalSubs > 0 ? Math.round((completedIndices.length / totalSubs) * 100) : 0;
  const levelColor = LEVEL_COLORS[lesson.level] || colors.accent;

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }

  return (
    <View style={s.container}>
      {/* YouTube Player */}
      {lesson.videoType === 'youtube' && lesson.youtubeId && (
        <View style={s.playerWrap}>
          <YoutubePlayer
            ref={playerRef}
            height={SCREEN_WIDTH * 9 / 16}
            width={SCREEN_WIDTH}
            videoId={lesson.youtubeId}
            play={playing}
            onChangeState={(e: string) => setPlaying(e === 'playing')}
            webViewProps={{ allowsInlineMediaPlayback: true }}
          />
        </View>
      )}

      {/* Progress bar */}
      <View style={s.progressSection}>
        <View style={s.progressRow}>
          <Text style={s.progressLabel}>{completedIndices.length}/{totalSubs}</Text>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: levelColor }]} />
          </View>
          <Text style={[s.progressPct, { color: levelColor }]}>{pct}%</Text>
        </View>
      </View>

      {/* Subtitle cloze list */}
      <ScrollView ref={scrollRef} style={s.subList} contentContainerStyle={s.subListContent}>
        {lesson.subtitles.map((sub, i) => {
          const tokens = subTokens[i];
          if (!tokens) return null;
          const isActive = i === currentIndex;
          const isCompleted = completedIndices.includes(i);

          return (
            <TouchableOpacity
              key={i}
              style={[s.subRow, isActive && s.subRowActive, isCompleted && s.subRowCompleted]}
              onPress={() => selectSubtitle(i)}
              activeOpacity={0.7}
              onLayout={(e) => { rowYRef.current[i] = e.nativeEvent.layout.y; }}
            >
              <View style={s.subHeader}>
                <Text style={s.subNumber}>{i + 1}</Text>
                {isCompleted && <Text style={s.checkMark}>✓</Text>}
                <TouchableOpacity onPress={() => seekToSub(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.playBtn}>🔊</Text>
                </TouchableOpacity>
              </View>
              <View style={s.clozeRow}>
                {tokens.words.map((word, wi) => {
                  const isBlank = tokens.blanks.has(wi);
                  const key = `${i}-${wi}`;
                  const result = blankResults[i]?.[wi];
                  const isRevealed = revealedWords.has(key);

                  if (!isBlank || isCompleted) {
                    return <Text key={wi} style={s.word}>{word} </Text>;
                  }

                  if (isRevealed) {
                    return <Text key={wi} style={[s.word, s.revealedWord]}>{word} </Text>;
                  }

                  if (result === 'correct') {
                    return <Text key={wi} style={[s.word, s.correctWord]}>{word} </Text>;
                  }

                  const inputWidth = Math.max(60, bareWord(word).length * 11 + 20);
                  const tapKey = `${i}-${wi}`;

                  return (
                    <TouchableOpacity
                      key={wi}
                      activeOpacity={0.8}
                      onPress={() => {
                        const now = Date.now();
                        const last = lastTapRef.current[tapKey] || 0;
                        if (now - last < 400) {
                          revealWord(i, wi);
                          lastTapRef.current[tapKey] = 0;
                        } else {
                          lastTapRef.current[tapKey] = now;
                        }
                      }}
                    >
                      <TextInput
                        style={[
                          s.blankInput,
                          { width: inputWidth },
                          result === 'incorrect' && s.blankIncorrect,
                        ]}
                        value={blankInputs[i]?.[wi] || ''}
                        onChangeText={v => handleBlankChange(i, wi, v)}
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  playerWrap: { backgroundColor: '#000' },
  progressSection: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', minWidth: 42 },
  progressBar: { flex: 1, height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressPct: { fontSize: 13, fontWeight: '900', minWidth: 36, textAlign: 'right' },
  subList: { flex: 1 },
  subListContent: { padding: 12, paddingBottom: 40 },
  subRow: {
    backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  subRowActive: { borderColor: colors.accent, borderWidth: 2 },
  subRowCompleted: { opacity: 0.6 },
  subHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  subNumber: { color: colors.textMuted, fontSize: 11, fontWeight: '900', minWidth: 20 },
  checkMark: { color: colors.accent, fontSize: 14, fontWeight: '900' },
  playBtn: { fontSize: 16 },
  clozeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 3 },
  word: { color: colors.text, fontSize: 15, lineHeight: 28 },
  correctWord: { color: colors.accent, fontWeight: '700' },
  revealedWord: { color: '#f59e0b', fontStyle: 'italic' },
  blankInput: {
    backgroundColor: colors.inputBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    fontSize: 15, color: colors.white, borderWidth: 1.5, borderColor: colors.inputBorder,
    minHeight: 32,
  },
  blankIncorrect: { borderColor: colors.error, backgroundColor: 'rgba(239,68,68,0.1)' },
});
