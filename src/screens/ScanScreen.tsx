import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PublicKey } from '@solana/web3.js';
import { decodeLink } from '../lib/requests';
import { color, space, radius, type } from '../theme';

type Picked = { address: string; username?: string };

/**
 * Scans either one of Kivo's own request-link QR codes (extracting the
 * recipient it already encodes) or a plain Solana address QR — there's
 * no separate "profile QR" feature, so this is the honest scope: scanning
 * something that genuinely identifies a payable recipient, not a fake
 * decode of an imagined format.
 */
function parseScanned(value: string): Picked | null {
  const asRequest = decodeLink(value);
  if (asRequest) return { address: asRequest.to.toBase58(), username: asRequest.toUsername };
  try {
    // eslint-disable-next-line no-new
    new PublicKey(value.trim());
    return { address: value.trim() };
  } catch {
    return null;
  }
}

export default function ScanScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onScanned({ data }: { data: string }) {
    if (handled) return;
    const picked = parseScanned(data);
    if (!picked) {
      setError("That QR code isn't a Kivo link or a Solana address.");
      return;
    }
    setHandled(true);
    navigation.navigate('New', { selectedRecipient: picked });
  }

  if (!permission) {
    return <SafeAreaView style={s.root} edges={['top', 'bottom']} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.centerBody}>
          <Text style={s.title}>Camera access needed</Text>
          <Text style={s.body}>Kivo needs camera access to scan a QR code.</Text>
          <Pressable style={s.cta} onPress={requestPermission}>
            <Text style={s.ctaText}>Allow camera</Text>
          </Pressable>
          <Pressable style={s.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      <SafeAreaView style={s.overlay} edges={['top', 'bottom']}>
        <Text style={s.overlayTitle}>Scan a Kivo QR</Text>
        <View style={s.spacer} />
        <View style={s.frame}>
          <View style={[s.corner, s.cornerTL]} />
          <View style={[s.corner, s.cornerTR]} />
          <View style={[s.corner, s.cornerBL]} />
          <View style={[s.corner, s.cornerBR]} />
        </View>
        <View style={s.spacer} />
        <Text style={s.hint}>Point at someone's Kivo request link QR</Text>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelBtnText}>Cancel</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050507' },
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  title: { ...type.title, color: color.text },
  body: { ...type.body, color: color.textDim, textAlign: 'center' },
  cta: {
    paddingVertical: space.md + 2,
    paddingHorizontal: space.xxl,
    borderRadius: radius.lg,
    backgroundColor: color.owed,
  },
  ctaText: { ...type.labelLg, color: color.bg },
  cancelBtn: {
    paddingVertical: space.md,
    paddingHorizontal: space.xxl,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  cancelBtnText: { ...type.label, color: color.text },

  overlay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.xl,
  },
  overlayTitle: { ...type.label, fontSize: 16, color: color.text },
  spacer: { flex: 1 },
  frame: {
    width: 230,
    height: 230,
    borderRadius: 24,
    backgroundColor: 'rgba(23,23,31,0.4)',
    overflow: 'hidden',
  },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: color.owed },
  cornerTL: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 22 },
  cornerTR: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 22 },
  cornerBL: { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 22 },
  cornerBR: { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 22 },
  hint: {
    ...type.caption,
    color: color.textFainter,
    textAlign: 'center',
    maxWidth: 240,
    marginBottom: space.lg,
  },
  error: { ...type.caption, color: color.danger, textAlign: 'center', marginBottom: space.md },
});
