import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Spacing, Radius } from '../theme/tokens';
import {
  getOfflineLessons,
  getOfflineStorageSize,
  deleteAllOfflineLessons,
} from '../services/storage';

interface SettingsScreenProps {
  navigation: any;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const [lessonCount, setLessonCount] = useState(0);
  const [storageSize, setStorageSize] = useState(0);

  const loadInfo = useCallback(async () => {
    const lessons = await getOfflineLessons();
    const size = await getOfflineStorageSize();
    setLessonCount(lessons.length);
    setStorageSize(size);
  }, []);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  const handleClearData = () => {
    Alert.alert(
      '⚠️ Alle Daten löschen?',
      'Dies löscht alle heruntergeladenen Lektionen und deinen Lernfortschritt.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            await deleteAllOfflineLessons();
            await loadInfo();
            Alert.alert('✅ Gelöscht', 'Alle Offline-Daten wurden entfernt.');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Einstellungen</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* App info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoLabel}>
                <Ionicons name="school-outline" size={18} color={Colors.accent} />
                <Text style={styles.infoLabelText}>App</Text>
              </View>
              <Text style={styles.infoValue}>Shadowing DE v1.0.0</Text>
            </View>
          </View>
        </View>

        {/* Storage */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Offline-Speicher</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoLabel}>
                <Ionicons name="book-outline" size={18} color={Colors.accent} />
                <Text style={styles.infoLabelText}>Lektionen</Text>
              </View>
              <Text style={styles.infoValue}>{lessonCount}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <View style={styles.infoLabel}>
                <Ionicons name="folder-outline" size={18} color={Colors.accent} />
                <Text style={styles.infoLabelText}>Speicherplatz</Text>
              </View>
              <Text style={styles.infoValue}>{formatBytes(storageSize)}</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aktionen</Text>
          <TouchableOpacity style={styles.actionCard} onPress={handleClearData}>
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Alle Offline-Daten löschen</Text>
              <Text style={styles.actionSubtitle}>
                Lektionen und Fortschritt werden entfernt
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* How to use */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Anleitung</Text>
          <View style={styles.infoCard}>
            <View style={styles.tipRow}>
              <Text style={styles.tipEmoji}>📥</Text>
              <Text style={styles.tipText}>
                Tippe "Sync" auf der Startseite um Lektionen herunterzuladen
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.tipRow}>
              <Text style={styles.tipEmoji}>✈️</Text>
              <Text style={styles.tipText}>
                Nach dem Download kannst du ohne Internet lernen
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.tipRow}>
              <Text style={styles.tipEmoji}>🎧</Text>
              <Text style={styles.tipText}>
                Shadowing: Höre zu und sprich nach. Verstecke den Text mit dem 👁 Button
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.tipRow}>
              <Text style={styles.tipEmoji}>✅</Text>
              <Text style={styles.tipText}>
                Markiere Sätze als erledigt mit dem grünen ✓ Button
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 60,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: Fonts.size.lg,
    fontWeight: Fonts.weight.bold,
    color: Colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  section: {
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: Fonts.size.sm,
    fontWeight: Fonts.weight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  infoCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  infoLabelText: {
    fontSize: Fonts.size.md,
    color: Colors.textPrimary,
  },
  infoValue: {
    fontSize: Fonts.size.md,
    color: Colors.textSecondary,
    fontWeight: Fonts.weight.medium,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  actionCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: Fonts.size.md,
    fontWeight: Fonts.weight.semibold,
    color: Colors.error,
  },
  actionSubtitle: {
    fontSize: Fonts.size.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  tipEmoji: {
    fontSize: 18,
    marginTop: 1,
  },
  tipText: {
    fontSize: Fonts.size.md,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 22,
  },
});
