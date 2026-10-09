import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import PaymentSuccess from '../components/PaymentSuccess';
import { color } from '../theme';

/** Receipt for a payment already sent — reopened from the Activity feed. */
export default function PaymentReceiptScreen({ route, navigation }: any) {
  const { to, toUsername, amount, token, memo, createdAt, signature } = route.params;
  const short = `${to.slice(0, 4)}…${to.slice(-4)}`;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top', 'bottom']}>
      <PaymentSuccess
        title="Payment sent"
        amount={amount}
        token={token}
        toLabel={toUsername ? `@${toUsername}` : short}
        toAddress={to}
        memo={memo}
        dateLabel={new Date(createdAt).toLocaleString()}
        signature={signature}
        doneLabel="Close"
        onDone={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
}
