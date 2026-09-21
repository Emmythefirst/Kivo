import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import qrcode from 'qrcode-generator';

type Props = { value: string; size?: number };

/**
 * Renders as a grid of plain Views, not an image or SVG — deliberately,
 * so this doesn't need react-native-svg or any other native module. This
 * project already exited Expo Go for MWA's sake, so any new native
 * dependency means a full prebuild + rebuild cycle; a pure-JS matrix
 * (qrcode-generator has zero native code) plus RN's own View is free by
 * comparison, and plenty fast for a one-off render like this.
 *
 * White background and black modules are hardcoded rather than themed —
 * a QR code needs real black-on-white contrast (and a blank quiet-zone
 * margin) to scan reliably, independent of the app's own dark theme.
 */
export default function QrCode({ value, size = 220 }: Props) {
  const modules = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const grid: boolean[][] = [];
    for (let row = 0; row < count; row++) {
      const line: boolean[] = [];
      for (let col = 0; col < count; col++) {
        line.push(qr.isDark(row, col));
      }
      grid.push(line);
    }
    return grid;
  }, [value]);

  const cell = size / modules.length;
  // Spec wants a quiet zone of >=4 modules' worth of plain white margin
  // around the code — a fixed padding would fall short of that once the
  // payload is long enough to need smaller modules (a link with a billId
  // param, say), so this scales with cell size instead.
  const quietZonePadding = cell * 4;

  return (
    <View style={[s.quietZone, { padding: quietZonePadding }]}>
      <View style={{ width: size, height: size }}>
        {modules.map((line, row) => (
          <View key={row} style={s.row}>
            {line.map((dark, col) => (
              <View
                key={col}
                style={{
                  width: cell,
                  height: cell,
                  backgroundColor: dark ? '#000000' : '#FFFFFF',
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  quietZone: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row' },
});
