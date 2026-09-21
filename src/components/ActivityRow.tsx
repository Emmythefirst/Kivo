import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { encodeLink } from '../lib/requests';
import type { ActivityItem } from '../lib/activity';
import { color, space, radius, type, formatAmount, timeAgo } from '../theme';

/** One row of the Activity feed — shared by HomeScreen's capped preview and the full ActivityScreen. */
export default function ActivityRow({
  item,
  navigation,
}: {
  item: ActivityItem;
  navigation: any;
}) {
  if (item.kind === 'bill') {
    return (
      <Pressable
        style={s.row}
        onPress={() => navigation.navigate('ShareBill', { billId: item.billId })}
      >
        <Avatar name={item.memo || 'Split bill'} colorSeed={item.billId} />
        <View style={s.rowMain}>
          <Text style={s.rowName}>{item.memo || 'Split bill'}</Text>
          <Text style={s.rowSubtitle}>
            Split · {item.count} people · {timeAgo(item.createdAt)}
          </Text>
          <View style={s.progressTrack}>
            <View
              style={[
                s.progressFill,
                { width: `${Math.round((item.paidCount / item.count) * 100)}%` },
              ]}
            />
          </View>
        </View>
        <View style={s.rowRight}>
          <Text style={s.rowAmount}>{formatAmount(item.totalFromOthers, item.token)}</Text>
          <Text style={s.rowStatus}>
            {item.paidCount} of {item.count} paid
          </Text>
        </View>
      </Pressable>
    );
  }

  if (item.kind === 'request') {
    return (
      <Pressable
        style={s.row}
        onPress={() =>
          navigation.navigate('ShareRequest', {
            link: encodeLink(item.sentRequest.request),
            requestedFromLabel: item.sentRequest.requestedFromLabel,
          })
        }
      >
        <Avatar name={item.counterparty} colorSeed={item.id} />
        <View style={s.rowMain}>
          <Text style={s.rowName}>{item.counterparty}</Text>
          <Text style={s.rowSubtitle}>
            {item.memo || '—'} · {timeAgo(item.createdAt)}
          </Text>
        </View>
        <View style={s.rowRight}>
          <Text style={s.rowAmount}>{formatAmount(item.amount, item.token)}</Text>
          <Text style={[s.rowStatus, item.paid ? { color: color.owed } : null]}>
            {item.paid ? 'Paid' : 'Pending'}
          </Text>
        </View>
      </Pressable>
    );
  }

  // Payment — already settled the moment it was recorded, nothing to open.
  const name = item.toUsername ?? `${item.to.slice(0, 4)}…${item.to.slice(-4)}`;
  return (
    <View style={s.row}>
      <Avatar name={item.toUsername ?? item.to} colorSeed={item.to} />
      <View style={s.rowMain}>
        <Text style={s.rowName}>Paid {name}</Text>
        <Text style={s.rowSubtitle}>
          {item.memo || '—'} · {timeAgo(item.createdAt)}
        </Text>
      </View>
      <View style={s.rowRight}>
        <Text style={s.rowAmount}>{formatAmount(item.amount, item.token)}</Text>
        <Text style={s.rowStatus}>Sent</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: space.md + 2,
    gap: space.md,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { ...type.label, fontSize: 14.5, color: color.text },
  rowSubtitle: { ...type.caption, color: color.textFainter, marginTop: 2 },
  progressTrack: {
    marginTop: space.sm,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.borderStrong,
    overflow: 'hidden',
    width: 150,
  },
  progressFill: { height: '100%', backgroundColor: color.owed, borderRadius: 3 },
  rowRight: { alignItems: 'flex-end' },
  rowAmount: { ...type.amountSm, color: color.text },
  rowStatus: { ...type.captionBold, color: color.textDim, marginTop: 3 },
});
