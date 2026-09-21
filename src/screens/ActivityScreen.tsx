import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, SectionList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useWallet } from '../lib/WalletProvider';
import { loadActivity, monthLabel, type ActivityItem } from '../lib/activity';
import ActivityRow from '../components/ActivityRow';
import { color, space, radius, type } from '../theme';

type Section = { title: string; data: ActivityItem[] };

export default function ActivityScreen({ navigation }: any) {
  const { connection } = useWallet();
  const [items, setItems] = useState<ActivityItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadActivity(connection).then((all) => {
        if (!cancelled) setItems(all);
      });
      return () => {
        cancelled = true;
      };
    }, [connection]),
  );

  // `items` is already sorted newest-first, and Map preserves insertion
  // order, so grouping in a single pass naturally yields sections ordered
  // newest month to oldest — no separate section sort needed.
  const sections = useMemo<Section[]>(() => {
    const groups = new Map<string, ActivityItem[]>();
    for (const item of items) {
      const label = monthLabel(item.createdAt);
      groups.set(label, [...(groups.get(label) ?? []), item]);
    }
    return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
  }, [items]);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.topRow}>
        <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnText}>‹</Text>
        </Pressable>
        <Text style={s.title}>Activity</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={s.rowWrap}>
            <ActivityRow item={item} navigation={navigation} />
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <Text style={s.sectionHeader}>{section.title}</Text>
        )}
        contentContainerStyle={s.content}
        ListEmptyComponent={<Text style={s.empty}>Nothing here yet.</Text>}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  backBtn: { width: 28 },
  backBtnText: { fontSize: 20, color: color.text },
  title: { ...type.title, fontSize: 17, color: color.text },

  content: { padding: space.lg, paddingTop: space.xs, gap: space.sm },
  sectionHeader: {
    ...type.sectionLabel,
    color: color.textFaint,
    backgroundColor: color.bg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  rowWrap: { marginBottom: space.sm },
  empty: { ...type.body, color: color.textFainter, textAlign: 'center', marginTop: space.xxl },
});
