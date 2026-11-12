// Notifications from the kitchen screen / web app (tbl_notifications): "ready to serve", "order ready" ...
// GET /v1/notifications every 15 s (waiters get only their own orders' notifications, same as the web POS);
// a new one shows a message at once; the bell popup lists them and dismisses one or all.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Bell, BellOff, X } from 'lucide-react-native';
import { del, get } from '../lib/api';
import { Btn, COLORS, useUi } from '../ui';
import { tr } from '../lib/i18n';

const POLL_MS = 15000;

/** { list, count, loaded, refresh, dismiss(ids) } */
export function useNotifications() {
    const { notify } = useUi();
    const notifyRef = useRef(notify);
    notifyRef.current = notify;
    const [list, setList] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const known = useRef(null);                          // ids already seen (null until the first load: no message for old ones)
    const refresh = useCallback(async () => {
        try {
            const rows = await get('/v1/notifications');
            const arr = Array.isArray(rows) ? rows : [];
            if (known.current) {
                const fresh = arr.filter((n) => !known.current.has(n.id));
                if (fresh.length === 1) notifyRef.current(`🔔 ${fresh[0].message}`, 7000);
                else if (fresh.length > 1) notifyRef.current(`🔔 ${tr('{n} new notifications', { n: fresh.length })} — ${fresh[0].message}`, 7000);
            }
            known.current = new Set(arr.map((n) => n.id));
            setList(arr);
            setLoaded(true);
        } catch { /* next time */ }
    }, []);
    useEffect(() => { refresh(); const t = setInterval(refresh, POLL_MS); return () => clearInterval(t); }, [refresh]);
    const dismiss = async (ids) => {
        setList((l) => l.filter((n) => !ids.includes(n.id)));           // at once; the server is told next
        try { await (ids.length === 1 ? del(`/v1/notifications/${ids[0]}`) : del('/v1/notifications', { ids })); } catch { /* back on the next refresh */ }
        refresh();
    };
    return { list, count: list.length, loaded, refresh, dismiss };
}

const when = (s) => {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(s);
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return tr('just now');
    if (min < 60) return tr('{min} min ago', { min });
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** a screen like Running orders */
export function NotificationsView({ notes }) {
    const [busy, setBusy] = useState(false);
    useEffect(() => { notes.refresh(); }, []); // eslint-disable-line
    const clearAll = async () => { setBusy(true); await notes.dismiss(notes.list.map((n) => n.id)); setBusy(false); };
    return (
        <View className="flex-1">
            <View className="flex-row items-end justify-between mb-3">
                <View>
                    <Text className="text-[22px] font-extrabold text-ink">{tr("Notifications")}</Text>
                    {notes.count ? <Text className="text-ink-2">{tr("{count} from the kitchen", { count: notes.count })}</Text> : null}
                </View>
                {notes.count ? <Btn size="sm" label={tr("Clear all")} icon={BellOff} busy={busy} onPress={clearAll} /> : null}
            </View>
            {!notes.loaded ? <ActivityIndicator color={COLORS.brand} /> : !notes.count ? (
                <View className="items-center py-10">
                    <Bell size={38} color={COLORS.ink3} strokeWidth={1.6} />
                    <Text className="text-ink-3 mt-2">{tr("You're all caught up.")}</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 100, gap: 8 }}>
                    {notes.list.map((n) => (
                        <View key={n.id} className="flex-row items-start bg-card rounded-2xl border border-line p-3.5">
                            <View className="w-10 h-10 rounded-xl bg-ok-bg items-center justify-center"><Bell size={18} color={COLORS.ok} /></View>
                            <View className="flex-1 ml-3 pr-2">
                                <Text className="text-ink font-semibold text-[15px]">{n.message}</Text>
                                {n.created_at ? <Text className="text-ink-3 text-[12px] mt-0.5">{when(n.created_at)}</Text> : null}
                            </View>
                            <Pressable onPress={() => notes.dismiss([n.id])} accessibilityLabel={tr("Dismiss {message}", { message: n.message })} hitSlop={8} className="w-9 h-9 items-center justify-center active:opacity-60">
                                <X size={18} color={COLORS.ink3} />
                            </Pressable>
                        </View>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

const Badge = ({ n, className }) => (n ? (
    <View className={`absolute min-w-[18px] h-[18px] rounded-full bg-[#FF5A5F] items-center justify-center px-1 ${className}`}>
        <Text className="text-white text-[10px] font-bold">{n > 99 ? '99+' : n}</Text>
    </View>
) : null);

/** phone header button */
export function HeaderBell({ notes, onPress }) {
    return (
        <Pressable onPress={onPress} accessibilityLabel={tr("Notifications")} className="w-10 h-10 rounded-xl bg-card border border-line items-center justify-center mr-2 active:opacity-70">
            <Bell size={20} color={COLORS.ink2} />
            <Badge n={notes.count} className="-top-1.5 -right-1.5" />
        </Pressable>
    );
}