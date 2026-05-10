import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, Radius, LEVEL_COLORS } from '../theme/tokens';
import { Lesson, OfflineLesson, LessonProgress } from '../types';
import { fetchLessons } from '../services/api';
import {
  getOfflineLessons,
  saveLessons,
  getAllProgress,
  getOfflineStorageSize,
} from '../services/storage';

interface HomeScreenProps {
  navigation: any;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [lessons, setLessons] = useState<OfflineLesson[]>([]);
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [storageSize, setStorageSize] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [offlineLessons, allProgress, size] = await Promise.all([
        getOfflineLessons(),
        getAllProgress(),
        getOfflineStorageSize(),
      ]);
      setLessons(offlineLessons);
      setProgress(allProgress);
      setStorageSize(size);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh data when coming back from lesson
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const syncFromServer = async () => {
    setSyncing(true);
    try {
      const serverLessons = await fetchLessons();
      await saveLessons(serverLessons);
      await loadData();
      Alert.alert(
        '✅ Synchronisiert',
        `${serverLessons.length} Lektionen heruntergeladen`,
      );
    } catch (err: any) {
      Alert.alert(
        '❌ Fehler',
        'Verbindung zum Server fehlgeschlagen. Überprüfe deine Internetverbindung.',
      );
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncFromServer();
    setRefreshing(false);
  };

  const getLessonProgress = (lessonId: string) => {
    return progress[lessonId] || null;
  };

  const getCompletionPct = (lesson: Lesson) => {
    const prog = getLessonProgress(lesson._id);
    if (!prog) return 0;
    const total = lesson.subtitles?.length || 0;
    if (total === 0) return 0;
    return Math.round((prog.completedIndices.length / total) * 100);
  };

  const renderLesson = ({ item, index }: { item: OfflineLesson; index: number }) => {
    const pct = getCompletionPct(item);
    const levelColor = LEVEL_COLORS[item.level] || Colors.accent;
    const prog = getLessonProgress(item._id);
    const totalSubs = item.subtitles?.length || 0;
    const completed = prog?.completedIndices?.length || 0;
    const thumb = item.thumbnail ||
      (item.youtubeId ? `https://img.youtube.com/vi/${item.youtubeId}/mqdefault.jpg` : null);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Lesson', { lessonId: item._id })}
      >
        {/* Thumbnail */}
        <View style={styles.thumbWrap}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="musical-notes" size={32} color={Colors.textMuted} />
            </View>
          )}
          {/* Level badge */}
          <View style={[styles.levelBadge, { backgroundColor: levelColor }]}>
            <Text style={styles.levelText}>{item.level}</Text>
          </View>
          {/* Duration */}
          {item.duration && item.duration > 0 && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
            </View>
          )}
          {/* Completed overlay */}
          {pct >= 100 && (
            <View style={styles.completedOverlay}>
              <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

          <View style={styles.cardMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="text" size={12} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{totalSubs} Sätze</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons
                name={item.videoType === 'youtube' ? 'logo-youtube' : 'document'}
                size={12}
                color={Colors.textSecondary}
              />
              <Text style={styles.metaText}>
                {item.videoType === 'youtube' ? 'YouTube' : 'Lokal'}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
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
            <Text style={styles.progressText}>
              {completed}/{totalSubs}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Shadowing DE</Text>
          <Text style={styles.headerSubtitle}>
            {lessons.length} Lektionen • {formatBytes(storageSize)}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.syncButton}
            onPress={syncFromServer}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Ionicons name="cloud-download-outline" size={22} color={Colors.accent} />
            )}
            <Text style={styles.syncText}>
              {syncing ? 'Lädt...' : 'Sync'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {lessons.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="headset-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Keine Lektionen</Text>
          <Text style={styles.emptyText}>
            Tippe auf "Sync" um Lektionen vom Server herunterzuladen
          </Text>
          <TouchableOpacity style={styles.downloadButton} onPress={syncFromServer}>
            <Ionicons name="cloud-download" size={20} color="#fff" />
            <Text style={styles.downloadButtonText}>Jetzt herunterladen</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={lessons}
          keyExtractor={(item) => item._id}
          renderItem={renderLesson}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.accent}
            />
          }
        />
      )}
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
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    paddingBottom: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: Fonts.size.xxl,
    fontWeight: Fonts.weight.extrabold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: Fonts.size.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 4,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accentDim,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  syncText: {
    fontSize: Fonts.size.sm,
    color: Colors.accent,
    fontWeight: Fonts.weight.semibold,
  },
  settingsButton: {
    padding: Spacing.sm,
  },
  list: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  thumbWrap: {
    position: 'relative',
    height: 160,
  },
  thumb: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbPlaceholder: {
    backgroundColor: Colors.bgSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  levelText: {
    color: '#fff',
    fontSize: Fonts.size.xs,
    fontWeight: Fonts.weight.bold,
  },
  durationBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  durationText: {
    color: '#fff',
    fontSize: Fonts.size.xs,
    fontWeight: Fonts.weight.medium,
  },
  completedOverlay: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
  },
  cardBody: {
    padding: Spacing.md,
  },
  cardTitle: {
    fontSize: Fonts.size.lg,
    fontWeight: Fonts.weight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    lineHeight: 22,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: Fonts.size.sm,
    color: Colors.textSecondary,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.bgSurface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: Fonts.size.xs,
    color: Colors.textSecondary,
    fontWeight: Fonts.weight.medium,
    minWidth: 35,
    textAlign: 'right',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxxl,
  },
  emptyTitle: {
    fontSize: Fonts.size.xl,
    fontWeight: Fonts.weight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
  },
  emptyText: {
    fontSize: Fonts.size.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 22,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    marginTop: Spacing.xxl,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: Fonts.size.md,
    fontWeight: Fonts.weight.bold,
  },
});
