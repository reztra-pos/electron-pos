// Date and time pickers (pure JavaScript: no native library, no rebuild needed).
// DateField: a calendar (month grid, quick days). TimeField: hour + minute buttons.
// Values stay in the API's format: date "YYYY-MM-DD", time "HH:MM" (24 h) or '' for no time.
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react-native';
import { Btn, COLORS, Sheet } from '../ui';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thu, 12 Nov 2026" */
export const dateLabel = (s) => { const d = parse(s); return d ? `${DAYS[d.getDay()]}, ${d.getDate()} ${SHORT[d.getMonth()]} ${d.getFullYear()}` : ''; };
/** "2:30 PM" */
export const timeLabel = (s) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(s || ''));
    if (!m) return '';
    const h = +m[1];
    return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

function FieldButton({ icon: Icon, text, placeholder, onPress, onClear, label }) {
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
            className="h-12 rounded-xl border border-line bg-card px-3 flex-row items-center active:opacity-80">
            <Icon size={18} color={text ? COLORS.brand : COLORS.ink3} />
            <Text className={`flex-1 ml-2 text-[15px] ${text ? 'text-ink font-semibold' : 'text-ink-3'}`} numberOfLines={1}>{text || placeholder}</Text>
            {text && onClear ? <Pressable onPress={onClear} hitSlop={10} accessibilityLabel={`Clear ${label}`}><X size={16} color={COLORS.ink3} /></Pressable> : null}
        </Pressable>
    );
}

/* ---------------- date ---------------- */
export function DateField({ value, onChange, min, label = 'Delivery date', placeholder = 'Choose a date' }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <FieldButton icon={CalendarDays} text={dateLabel(value)} placeholder={placeholder} onPress={() => setOpen(true)} label={label} />
            {open ? <CalendarSheet title={label} value={value} min={min} onClose={() => setOpen(false)} onPick={(v) => { onChange(v); setOpen(false); }} /> : null}
        </>
    );
}

function CalendarSheet({ title, value, min, onClose, onPick }) {
    const today = useMemo(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }, []);
    const minD = parse(min);
    const sel = parse(value);
    const [month, setMonth] = useState(() => { const b = sel || today; return new Date(b.getFullYear(), b.getMonth(), 1); });
    const cells = useMemo(() => {
        const first = month.getDay();
        const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        const out = Array(first).fill(null);
        for (let d = 1; d <= days; d++) out.push(new Date(month.getFullYear(), month.getMonth(), d));
        while (out.length % 7) out.push(null);
        return out;
    }, [month]);
    const blocked = (d) => !!minD && d < minD && !(sel && ymd(d) === ymd(sel));     // the saved date of an old pre-order stays pickable
    const canPrev = !minD || new Date(month.getFullYear(), month.getMonth(), 0) >= minD;
    const quick = [['Today', today], ['Tomorrow', addDays(today, 1)], ['In 2 days', addDays(today, 2)], ['In a week', addDays(today, 7)]];

    return (
        <Sheet title={title} subtitle={sel ? dateLabel(value) : ''} onClose={onClose} size="sm">
            <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
                {quick.filter(([, d]) => !blocked(d)).map(([l, d]) => {
                    const on = sel && ymd(d) === ymd(sel);
                    return (
                        <Pressable key={l} onPress={() => onPick(ymd(d))} accessibilityLabel={l}
                            className={`h-9 px-3 rounded-full border items-center justify-center ${on ? 'bg-brand border-brand' : 'bg-card border-line'}`}>
                            <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-ink'}`}>{l}</Text>
                        </Pressable>
                    );
                })}
            </View>
            <View className="flex-row items-center justify-between mb-2">
                <Pressable onPress={() => canPrev && setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} disabled={!canPrev}
                    accessibilityLabel="Previous month" className={`w-10 h-10 rounded-xl items-center justify-center ${canPrev ? '' : 'opacity-30'}`}>
                    <ChevronLeft size={22} color={COLORS.ink} />
                </Pressable>
                <Text className="font-extrabold text-ink text-[16px]">{MONTHS[month.getMonth()]} {month.getFullYear()}</Text>
                <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} accessibilityLabel="Next month"
                    className="w-10 h-10 rounded-xl items-center justify-center"><ChevronRight size={22} color={COLORS.ink} /></Pressable>
            </View>
            <View className="flex-row">
                {DAYS.map((d) => <Text key={d} className="flex-1 text-center text-ink-3 text-[12px] font-semibold mb-1">{d}</Text>)}
            </View>
            {Array.from({ length: cells.length / 7 }).map((_, r) => (
                <View key={r} className="flex-row">
                    {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
                        if (!d) return <View key={i} className="flex-1 h-11" />;
                        const on = sel && ymd(d) === ymd(sel);
                        const isToday = ymd(d) === ymd(today);
                        const off = blocked(d);
                        return (
                            <Pressable key={i} disabled={off} onPress={() => onPick(ymd(d))} accessibilityLabel={ymd(d)} accessibilityState={{ selected: !!on, disabled: off }}
                                className="flex-1 h-11 items-center justify-center">
                                <View className={`w-10 h-10 rounded-full items-center justify-center ${on ? 'bg-brand' : isToday ? 'border-2 border-brand' : ''}`}>
                                    <Text className={`text-[15px] ${on ? 'text-white font-extrabold' : off ? 'text-ink-3 opacity-40' : 'text-ink font-semibold'}`}>{d.getDate()}</Text>
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
            ))}
        </Sheet>
    );
}

/* ---------------- time ---------------- */
const MINUTES = ['00', '15', '30', '45'];

export function TimeField({ value, onChange, label = 'Delivery time', placeholder = 'Any time' }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <FieldButton icon={Clock3} text={timeLabel(value)} placeholder={placeholder} onPress={() => setOpen(true)} onClear={value ? () => onChange('') : null} label={label} />
            {open ? <TimeSheet title={label} value={value} onClose={() => setOpen(false)} onPick={(v) => { onChange(v); setOpen(false); }} /> : null}
        </>
    );
}

function TimeSheet({ title, value, onClose, onPick }) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    const [h, setH] = useState(m ? +m[1] : null);
    const [min, setMin] = useState(m ? (MINUTES.includes(m[2]) ? m[2] : m[2]) : '00');
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const chip = (on, text, onPress, key, a11y) => (
        <Pressable key={key} onPress={onPress} accessibilityLabel={a11y || text} accessibilityState={{ selected: on }}
            className={`h-11 rounded-xl border items-center justify-center ${on ? 'bg-brand border-brand' : 'bg-card border-line'}`} style={{ width: '23%' }}>
            <Text className={`text-[14px] font-bold ${on ? 'text-white' : 'text-ink'}`}>{text}</Text>
        </Pressable>
    );
    const mins = MINUTES.includes(min) ? MINUTES : [...MINUTES, min].sort();
    return (
        <Sheet title={title} subtitle={h != null ? timeLabel(`${pad(h)}:${min}`) : ''} onClose={onClose} size="sm"
            footer={<>
                <Btn label="No time" onPress={() => onPick('')} className="flex-1" />
                <Btn label="Set time" variant="primary" disabled={h == null} onPress={() => onPick(`${pad(h)}:${min}`)} className="flex-1" />
            </>}>
            <Text className="text-[12.5px] font-semibold text-ink-2 mb-1.5">Hour</Text>
            <View className="flex-row flex-wrap justify-between" style={{ rowGap: 8 }}>
                {hours.map((x) => chip(h === x, timeLabel(`${x}:00`).replace(':00', ''), () => setH(x), x, `${pad(x)}:00`))}
            </View>
            <Text className="text-[12.5px] font-semibold text-ink-2 mt-4 mb-1.5">Minutes</Text>
            <View className="flex-row flex-wrap justify-between" style={{ rowGap: 8 }}>
                {mins.map((x) => chip(min === x, `:${x}`, () => setMin(x), x, `${x} minutes`))}
            </View>
        </Sheet>
    );
}