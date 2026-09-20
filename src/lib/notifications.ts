import * as Notifications from 'expo-notifications';
import type { PaymentRequest } from './requests';
import { formatAmount } from '../theme';

/**
 * Local-only reminders, not real push notifications. Notifying the
 * *recipient* the instant a request lands would need a backend to map
 * their identity (username or address) to a device push token — exactly
 * the kind of directory this project deliberately doesn't have anywhere
 * else (no server, no contact directory, no on-chain request lifecycle).
 * This instead reminds the *requester*, on their own device, to follow
 * up — zero infrastructure, matching what "remind" is actually used for
 * (nudging someone who hasn't paid yet), just initiated locally instead
 * of via a push banner on the recipient's phone. The recipient still
 * gets the request itself through the existing link/QR/username flow;
 * this only nudges the person who's still owed money to go re-share it.
 */

const REMINDER_DELAY_SECONDS = 2 * 24 * 60 * 60; // 2 days — inside the 7-day TTL

let deniedThisSession = false;

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (deniedThisSession) return false; // don't re-prompt every single time
  const result = await Notifications.requestPermissionsAsync();
  if (!result.granted) deniedThisSession = true;
  return result.granted;
}

async function schedule(title: string, body: string): Promise<void> {
  const granted = await ensurePermission();
  if (!granted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: REMINDER_DELAY_SECONDS,
        repeats: false,
      },
    });
  } catch {
    // Scheduling failures shouldn't block the request itself from being
    // created — this is a nicety, not the core flow.
  }
}

export async function scheduleRequestReminder(
  request: PaymentRequest,
  label?: string,
): Promise<void> {
  await schedule(
    'Still waiting to get paid?',
    `Check whether ${label ?? 'they'} have paid you ${formatAmount(
      request.amount,
      request.token,
    )} yet.`,
  );
}

export async function scheduleBillReminder(
  memo: string | undefined,
  peopleCount: number,
): Promise<void> {
  await schedule(
    'Split bill check-in',
    `See who's still paid up on ${memo || 'your split bill'} (${
      peopleCount - 1
    } people).`,
  );
}
