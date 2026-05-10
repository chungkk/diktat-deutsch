import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import YoutubePlayer, { YoutubeIframeRef } from 'react-native-youtube-iframe';
import { Colors, Fonts, Spacing, Radius, LEVEL_COLORS } from '../theme/tokens';
import { Subtitle, OfflineLesson, LessonProgress } from '../types';
import { getOfflineLesson, getProgress, saveProgress } from '../services/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface LessonScreenProps {
  navigation: any;
  route: {
    params: {
      lessonId: string;
    };
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function LessonScreen({ navigation, route }: LessonScreenProps) {
  const { lessonId } = route.params;
  const [lesson, setLesson] = useState<OfflineLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [phase, setPhase] = useState<'shadowing' | 'diktat'>('shadowing');
  const [isPlaying, setIsPlaying] = useState(false);
  const [showText, setShowText] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const playerRef = useRef<YoutubeIframeRef>(null);
  const flatListRef = useRef<FlatList>(null);
  const autoPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load lesson and progress
  useEffect(() => {
    (async () => {
      const lessonData = await getOfflineLesson(lessonId);
      if (!lessonData) {
        Alert.alert('Fehler', 'Lektion nicht gefunden');
        navigation.goBack();
        return;
      }
      setLesson(lessonData);

      const prog = await getProgress(lessonId);
      if (prog) {
        setCurrentIndex(prog.currentIndex);
        setCompletedIndices(prog.completedIndices);
        setPhase(prog.phase);
      }
      setLoading(false);
    })();

    return () => {
      if (autoPauseTimer.current) {
        clearTimeout(autoPauseTimer.current);
      }
    };
  }, [lessonId, navigation]);

  // Save progress
  const persistProgress = useCallback(async (
    idx: number,
    completed: number[],
    currentPhase: 'shadowing' | 'diktat'
  ) => {
    await saveProgress({
      lessonId,
      currentIndex: idx,
      completedIndices: completed,
      phase: currentPhase,
      lastAccessedAt: new Date().toISOString(),
    });
  }, [lessonId]);

  // Play a specific subtitle segment
  const playSubtitle = useCallback((index: number) => {
    if (!lesson) return;
    const sub = lesson.subtitles[index];
    if (!sub) return;

    setCurrentIndex(index);

    if (lesson.videoType === 'youtube' && playerRef.current) {
      playerRef.current.seekTo(sub.start, true);
      // Small delay to ensure seek completes before playing
      setTimeout(() => {
        setIsPlaying(true);
      }, 100);

      // Auto-pause after subtitle duration
      if (autoPauseTimer.current) clearTimeout(autoPauseTimer.current);
      const durationMs = ((sub.dur + 0.3) / playbackSpeed) * 1000;
      autoPauseTimer.current = setTimeout(() => {
        setIsPlaying(false);
      }, durationMs);
    }

    // Scroll to the subtitle
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.3,
      });
    }, 100);
  }, [lesson, playbackSpeed]);

  const replayCurrent = useCallback(() => {
    playSubtitle(currentIndex);
  }, [currentIndex, playSubtitle]);

  const goNext = useCallback(() => {
    if (!lesson) return;
    const next = Math.min(currentIndex + 1, lesson.subtitles.length - 1);
    playSubtitle(next);
  }, [currentIndex, lesson, playSubtitle]);

  const goPrev = useCallback(() => {
    const prev = Math.max(currentIndex - 1, 0);
    playSubtitle(prev);
  }, [currentIndex, playSubtitle]);

  const markCompleted = useCallback(async () => {
    if (!lesson) return;
    const newCompleted = completedIndices.includes(currentIndex)
      ? completedIndices
      : [...completedIndices, currentIndex];
    setCompletedIndices(newCompleted);
    await persistProgress(currentIndex, newCompleted, phase);

    // Auto advance
    if (currentIndex < lesson.subtitles.length - 1) {
      setTimeout(() => {
        playSubtitle(currentIndex + 1);
      }, 400);
    }
  }, [currentIndex, completedIndices, lesson, phase, persistProgress, playSubtitle]);

  const toggleSpeed = useCallback(() => {
    const speeds = [0.5, 0.75, 1.0, 1.25];
    const idx = speeds.indexOf(playbackSpeed);
    const next = speeds[(idx + 1) % speeds.length];
    setPlaybackSpeed(next);
  }, [playbackSpeed]);

  const togglePhase = useCallback(() => {
    const newPhase = phase === 'shadowing' ? 'diktat' : 'shadowing';
    setPhase(newPhase);
    persistProgress(currentIndex, completedIndices, newPhase);
  }, [phase, currentIndex, completedIndices, persistProgress]);

  // YouTube player state change handler
  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') {
      setIsPlaying(false);
    }
    if (state === 'paused') {
      setIsPlaying(false);
    }
    if (state === 'playing') {
      // Player is playing
    }
  }, []);

  const renderSubtitle = ({ item, index }: { item: Subtitle; index: number }) => {
    const isActive = index === currentIndex;
    const isCompleted = completedIndices.includes(index);

    return (
      <TouchableOpacity
        style={[
          styles.subRow,
          isActive && styles.subRowActive,
          isCompleted && styles.subRowCompleted,
        ]}
        activeOpacity={0.7}
        onPress={() => playSubtitle(index)}
      >
        <View style={styles.subHeader}>
          <Text style={[styles.subNumber, isActive && styles.subNumberActive]}>
            {index + 1}
          </Text>
          <Text style={styles.subTime}>{formatTime(item.start)}</Text>
          {isActive && (
            <View style={[styles.phaseBadge, phase === 'diktat' && styles.phaseBadgeDiktat]}>
              <Text style={styles.phaseBadgeText}>
                {phase === 'shadowing' ? '🎧 Shadowing' : '✍️ Diktat'}
              </Text>
            </View>
          )}
          {isCompleted && (
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
          )}
        </View>

        <Text
          style={[
            styles.subText,
            isActive && styles.subTextActive,
            isCompleted && styles.subTextCompleted,
            !showText && !isCompleted && !isActive && styles.subTextHidden,
          ]}
        >
          {showText || isActive || isCompleted ? item.text : '● ● ● ● ●'}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading || !lesson) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  const totalSubs = lesson.subtitles.length;
  const pct = totalSubs > 0 ? Math.round((completedIndices.length / totalSubs) * 100) : 0;
  const levelColor = LEVEL_COLORS[lesson.level] || Colors.accent;

  return (
    <View style={styles.container}>
      {/* Header bar — always on top */}
      <View style={styles.controlsBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.controlsInfo}>
          <Text style={styles.controlsTitle} numberOfLines={1}>{lesson.title}</Text>
          <View style={styles.controlsProgressRow}>
            <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
            <Text style={styles.controlsProgressText}>
              {completedIndices.length}/{totalSubs} • {pct}%
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.phaseToggle} onPress={togglePhase}>
          <Text style={styles.phaseToggleText}>
            {phase === 'shadowing' ? '🎧' : '✍️'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* YouTube Player — below header */}
      {lesson.videoType === 'youtube' && lesson.youtubeId && (
        <View style={styles.videoContainer}>
          <YoutubePlayer
            ref={playerRef}
            height={SCREEN_WIDTH * 9 / 16}
            width={SCREEN_WIDTH}
            videoId={lesson.youtubeId}
            play={isPlaying}
            onChangeState={onStateChange}
            initialPlayerParams={{
              controls: false,
              modestbranding: true,
              rel: false,
              preventFullScreen: true,
            }}
            webViewProps={{
              allowsInlineMediaPlayback: true,
              mediaPlaybackRequiresUserAction: false,
            }}
          />
        </View>
      )}

      {/* Playback controls */}
      <View style={styles.playbackControls}>
        <TouchableOpacity onPress={goPrev} style={styles.controlBtn}>
          <Ionicons name="play-skip-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity onPress={replayCurrent} style={styles.controlBtnMain}>
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={goNext} style={styles.controlBtn}>
          <Ionicons name="play-skip-forward" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleSpeed} style={styles.speedBtn}>
          <Text style={styles.speedText}>{playbackSpeed}x</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowText(!showText)}
          style={styles.controlBtn}
        >
          <Ionicons
            name={showText ? 'eye' : 'eye-off'}
            size={20}
            color={showText ? Colors.accent : Colors.textMuted}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={markCompleted} style={styles.doneBtn}>
          <Ionicons name="checkmark" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${pct}%`,
              backgroundColor: pct >= 100 ? Colors.success : Colors.accent,
            },
          ]}
        />
      </View>

      {/* Subtitle list */}
      <FlatList
        ref={flatListRef}
        data={lesson.subtitles}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderSubtitle}
        contentContainerStyle={styles.subtitleList}
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: info.index,
              animated: true,
              viewPosition: 0.3,
            });
          }, 200);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoContainer: {
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: 56,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  controlsInfo: {
    flex: 1,
  },
  controlsTitle: {
    fontSize: Fonts.size.md,
    fontWeight: Fonts.weight.bold,
    color: Colors.textPrimary,
  },
  controlsProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  levelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  controlsProgressText: {
    fontSize: Fonts.size.xs,
    color: Colors.textSecondary,
  },
  phaseToggle: {
    backgroundColor: Colors.bgSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  phaseToggleText: {
    fontSize: Fonts.size.md,
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  controlBtn: {
    padding: Spacing.sm,
  },
  controlBtnMain: {
    backgroundColor: Colors.accent,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedBtn: {
    backgroundColor: Colors.bgSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  speedText: {
    fontSize: Fonts.size.sm,
    color: Colors.accent,
    fontWeight: Fonts.weight.bold,
  },
  doneBtn: {
    backgroundColor: Colors.success,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressTrack: {
    height: 3,
    backgroundColor: Colors.bgSurface,
  },
  progressFill: {
    height: '100%',
  },
  subtitleList: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  subRow: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subRowActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentDim,
  },
  subRowCompleted: {
    borderColor: Colors.success,
    backgroundColor: Colors.successDim,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  subNumber: {
    fontSize: Fonts.size.xs,
    color: Colors.textMuted,
    fontWeight: Fonts.weight.bold,
    minWidth: 20,
  },
  subNumberActive: {
    color: Colors.accent,
  },
  subTime: {
    fontSize: Fonts.size.xs,
    color: Colors.textMuted,
  },
  phaseBadge: {
    backgroundColor: Colors.accentDim,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  phaseBadgeDiktat: {
    backgroundColor: Colors.successDim,
  },
  phaseBadgeText: {
    fontSize: Fonts.size.xs,
    color: Colors.textPrimary,
    fontWeight: Fonts.weight.medium,
  },
  subText: {
    fontSize: Fonts.size.lg,
    color: Colors.textSecondary,
    lineHeight: 26,
  },
  subTextActive: {
    color: Colors.textPrimary,
    fontWeight: Fonts.weight.medium,
  },
  subTextCompleted: {
    color: Colors.success,
  },
  subTextHidden: {
    color: Colors.textMuted,
    letterSpacing: 2,
  },
});
