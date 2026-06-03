import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { colors, LEVEL_COLORS, LEVEL_EMOJI } from '../theme';
import { api, Lesson, Progress } from '../api';
import { useAuth } from '../auth';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function HomeScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const { user, logout } = useAuth();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([api.getLessons(), api.getProgress()]);
      setLessons(l);
      setProgress(p);
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchData);
    return unsubscribe;
  }, [navigation, fetchData]);

  const getProgress = (lessonId: string) => {
    return progress.find(p => {
      const id = typeof p.lessonId === 'object' ? (p.lessonId as any)._id : p.lessonId;
      return id === lessonId;
    });
  };

  const getThumbnail = (lesson: Lesson) => {
    if (lesson.thumbnail) return lesson.thumbnail;
    if (lesson.youtubeId) return `https://img.youtube.com/vi/${lesson.youtubeId}/mqdefault.jpg`;
    return null;
  };

  const renderLesson = ({ item: lesson }: { item: Lesson }) => {
    const prog = getProgress(lesson._id);
    const totalSubs = lesson.subtitles?.length || 0;
    const completed = prog?.completedIndices?.length || 0;
    const pct = totalSubs > 0 ? Math.round((completed / totalSubs) * 100) : 0;
    const thumb = getThumbnail(lesson);
    const levelColor = LEVEL_COLORS[lesson.level] || colors.accent;
    const emoji = LEVEL_EMOJI[lesson.level] || '📝';

    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('Lesson', { lesson })}
      >
        {thumb ? (
          <Image source={{ uri: thumb }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbPlaceholder]}>
            <Text style={{ fontSize: 32 }}>🎬</Text>
          </View>
        )}
        <View style={s.cardBody}>
          <View style={s.cardHeader}>
            <View style={[s.levelBadge, { backgroundColor: levelColor }]}>
              <Text style={s.levelText}>{emoji} {lesson.level}</Text>
            </View>
            {lesson.duration && lesson.duration > 0 && (
              <Text style={s.duration}>{formatDuration(lesson.duration)}</Text>
            )}
          </View>
          <Text style={s.cardTitle} numberOfLines={2}>{lesson.title}</Text>
          <Text style={s.cardMeta}>{totalSubs} Sätze</Text>
          <View style={s.progressRow}>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: levelColor }]} />
            </View>
            <Text style={[s.progressText, { color: levelColor }]}>{pct}%</Text>
          </View>
          {prog?.isCompleted && (
            <Text style={s.completedBadge}>🎉 Abgeschlossen</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={s.loadingText}>Lektionen werden geladen...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Hallo, {user?.username || 'Lerner'}! 👋</Text>
          <Text style={s.headerSub}>{lessons.length} Lektionen verfügbar</Text>
        </View>
        <TouchableOpacity onPress={logout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Abmelden</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={lessons}
        keyExtractor={item => item._id}
        renderItem={renderLesson}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 48 }}>🌱</Text>
            <Text style={s.emptyText}>Noch keine Lektionen</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textMuted, marginTop: 12, fontSize: 14 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, backgroundColor: colors.card,
    borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
  greeting: { fontSize: 20, fontWeight: '900', color: colors.white },
  headerSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  logoutBtn: { backgroundColor: colors.inputBg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder },
  logoutText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: colors.card, borderRadius: 16, marginBottom: 16,
    borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden',
  },
  thumb: { width: '100%', height: 160, backgroundColor: colors.inputBg },
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  cardBody: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  levelText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  duration: { color: colors.textMuted, fontSize: 12, marginLeft: 'auto', fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.white, marginBottom: 4 },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBar: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 13, fontWeight: '900', minWidth: 36, textAlign: 'right' },
  completedBadge: { fontSize: 12, color: colors.accent, fontWeight: '800', marginTop: 6 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: colors.textMuted, fontSize: 16, marginTop: 12 },
});
