// Payment: methods, split payments, quick cash, keypad, order discount / service charge (server totals),
// then the invoice. Same rules as the desktop app's PaymentModal.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Banknote, CreditCard, Smartphone, Printer, X, Plus, Percent, ShieldCheck, ChevronLeft } from 'lucide-react-native';
import { C } from '../lib/catalog';
import { amountStr, firstError, money, r2 } from '../lib/format';
import { Btn, COLORS, Input, Keypad, Money, Row, Segment, Sheet, useLayout } from '../ui';

const ICON = { cash: Banknote, card: CreditCard, other: Smartphone };

function Adjust({ label, value, onChange }) {
  return (
    <View className="flex-row items-center mb-2" style={{ gap: 8 }}>
      <Text className="text-ink-2 font-semibold w-24">{label}</Text>
      <Input keyboardType="decimal-pad" value={value.value ? String(value.value) : ''} placeholder="0" onChangeText={(v) => onChange({ ...value, value: v })} className="flex-1 h-11" />
      <Segment className="w-28" options={[{ value: 'fixed', label: C.outlet.currency || '#' }, { value: 'percent', label: '%' }]} value={value.mode === 'percent' ? 'percent' : 'fixed'} onChange={(m) => onChange({ ...value, mode: m })} />
    </View>
  );
}

export function PaymentSheet({ pos, m, onClose }) {
  const { isTablet } = useLayout();
  const [tot, setTot] = useState(m.totals);
  const [due, setDue] = useState(r2(m.due));
  const [odisc, setOdisc] = useState(m.adjust?.discount || { mode: 'fixed', value: 0 });
  const [ochg, setOchg] = useState(m.adjust?.charge || { mode: 'fixed', value: 0 });
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjErr, setAdjErr] = useState('');
  const [method, setMethod] = useState(C.paymentMethods.find((x) => x.cash)?.id ?? C.paymentMethods[0]?.id);
  const [amount, setAmount] = useState('');
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState('');
  const first = useRef(true);
  const seq = useRef(0);

  // order discount / service charge changed: the server works out the new total
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    setAdjBusy(true);
    const s = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const t2 = await pos.adjustTotals({ discount: amountStr({ mode: odisc.mode, value: Number(odisc.value) || 0 }), charge: amountStr({ mode: ochg.mode, value: Number(ochg.value) || 0 }) });
        if (s !== seq.current) return;
        setTot(t2); setDue(r2(t2.total_payable)); setAdjErr(''); setLines([]);
      } catch (e) { if (s === seq.current) setAdjErr(firstError(e)); }
      finally { if (s === seq.current) setAdjBusy(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [odisc.mode, odisc.value, ochg.mode, ochg.value]); // eslint-disable-line

  const mt = C.paymentMethods.find((x) => x.id === method);
  const paid = r2(lines.reduce((s, l) => s + l.amount, 0));
  const left = r2(Math.max(0, due - paid));
  const lineFor = (meth, value, rest) => {
    if (!meth) return [null, 'Choose a payment method'];
    if (lines.some((l) => l.id === meth.id)) return [null, `${meth.name} is already added`];
    const v = value === '' ? rest : r2(value);
    if (!(v > 0)) return [null, rest > 0 ? 'Enter an amount' : 'Nothing left to pay'];
    if (rest <= 0) return [null, 'Nothing left to pay'];
    if (!meth.cash && v > rest) return [null, `${meth.name} can't be more than the amount left (${money(rest)})`];
    return [{ id: meth.id, name: meth.name, cash: meth.cash, amount: Math.min(v, rest), given: meth.cash ? v : Math.min(v, rest) }, ''];
  };
  const add = () => {
    const [line, msg] = lineFor(mt, amount, left);
    if (!line) return setErr(msg);
    setErr(''); setLines((ls) => [...ls, line]); setAmount('');
    const next = C.paymentMethods.find((x) => x.id !== line.id && !lines.some((l) => l.id === x.id));
    if (next) setMethod(next.id);
  };
  const onKey = (k) => {
    setErr('');
    if (k === 'del') return setAmount((a) => a.slice(0, -1));
    if (k === '.' && amount.includes('.')) return;
    setAmount((a) => (a.length > 9 ? a : a + k));
  };
  const typed = amount !== '' || !lines.length;
  const [lastLine, lastMsg] = typed && left > 0 ? lineFor(mt, amount, left) : [null, ''];
  const fl = lastLine ? [...lines, lastLine] : lines;
  const flPaid = r2(fl.reduce((s, l) => s + l.amount, 0));
  const flDue = r2(Math.max(0, due - flPaid));
  const cash = fl.find((l) => l.cash);
  const change = cash ? r2(Math.max(0, cash.given - cash.amount)) : 0;
  const received = r2(fl.reduce((s, l) => s + l.given, 0));
  const blocked = (typed && left > 0 ? lastMsg : '') || (flDue > 0 && !m.allowDue ? 'Walk-in Customer must pay the full amount. Choose a customer to leave a due balance.' : '');
  const submit = () => {
    if (adjBusy) return setErr('Updating the total…');
    if (adjErr) return setErr(adjErr);
    if (blocked) return setErr(blocked);
    pos.completePayment({ payments: fl.map((l) => ({ payment_method_id: l.id, amount: l.amount })), given: cash ? cash.given : '', reference: '',
      discount: amountStr({ mode: odisc.mode, value: Number(odisc.value) || 0 }), charge: amountStr({ mode: ochg.mode, value: Number(ochg.value) || 0 }) });
  };
  const quick = [...new Set([due, ...C.denominations.filter((d) => d > due).slice(0, 3)])].slice(0, 4);

  const header = (
    <View className="flex-row items-center bg-card rounded-2xl border border-line p-4 mb-3">
      <View className="flex-1"><Text className="text-ink-2 text-[12.5px] font-semibold">Amount due</Text><Money value={due} bold className="text-[34px] font-extrabold text-ink" /></View>
      <View className="flex-1 border-l border-line pl-3"><Text className="text-ink-2 text-[12.5px] font-semibold">Received</Text><Money value={received} bold className="text-[20px] font-extrabold text-ink" /></View>
      <View className="flex-1 border-l border-line pl-3"><Text className="text-ink-2 text-[12.5px] font-semibold">{flDue > 0 ? 'Due' : 'Change'}</Text><Money value={flDue > 0 ? flDue : change} bold className={`text-[20px] font-extrabold ${flDue > 0 ? 'text-danger' : 'text-ok'}`} /></View>
    </View>
  );
  const methods = (
    <View className="flex-row flex-wrap -m-1 mb-2">
      {C.paymentMethods.map((x) => {
        const Icon = ICON[x.kind] || Smartphone;
        const on = x.id === method;
        const used = lines.some((l) => l.id === x.id);
        return (
          <View key={x.id} className={isTablet ? 'w-1/5 p-1' : 'w-1/4 p-1'}>
            <Pressable disabled={used} onPress={() => { setMethod(x.id); setErr(''); }}
              className={`h-[72px] rounded-2xl items-center justify-center border ${on ? 'border-2 border-brand bg-brand-tint' : 'border-line bg-card'} ${used ? 'opacity-40' : ''}`}>
              <Icon size={22} color={on ? COLORS.brandDark : COLORS.ink2} />
              <Text numberOfLines={1} className={`mt-1 text-[12.5px] font-bold ${on ? 'text-brand-dark' : 'text-ink-2'}`}>{x.name}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
  const payList = (
    <View>
      {lines.map((l) => (
        <View key={l.id} className="flex-row items-center h-12 rounded-xl bg-soft px-3 mb-2">
          <Text className="font-bold text-ink flex-1">{l.name}</Text>
          <Money value={l.amount} bold className="font-extrabold text-ink text-[16px]" />
          <Pressable onPress={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="ml-3" accessibilityLabel={`Remove ${l.name}`}><X size={18} color={COLORS.ink3} /></Pressable>
        </View>
      ))}
      <View className="flex-row items-center h-14 rounded-xl border border-line bg-card px-3 mb-2">
        <Text className="text-ink-2 font-semibold flex-1">{mt?.name || 'Amount'}</Text>
        <Text className="text-[24px] font-extrabold text-ink">{amount || money(left)}</Text>
      </View>
      {left > 0 && C.paymentMethods.length > 1 ? <Btn label="Add as split payment" icon={Plus} size="sm" variant="outline" onPress={add} className="mb-2" /> : null}
      <View className="flex-row flex-wrap -m-1">
        {quick.map((v) => (
          <View key={v} className="w-1/4 p-1"><Pressable onPress={() => setAmount(String(v))} className={`h-11 rounded-xl items-center justify-center ${Number(amount) === v ? 'bg-inverse' : 'bg-card border border-line'}`}>
            {v === due ? <Text className={`font-bold ${Number(amount) === v ? 'text-white' : 'text-ink'}`}>Exact</Text>
              : <Money value={v} bold className={`font-bold ${Number(amount) === v ? 'text-white' : 'text-ink'}`} />}
          </Pressable></View>
        ))}
      </View>
    </View>
  );
  const adjust = (
    <View>
      <Adjust label="Discount" value={odisc} onChange={setOdisc} />
      <Adjust label={m.delivery || pos.orderType === 'delivery' ? 'Delivery' : 'Service'} value={ochg} onChange={setOchg} />
      {adjErr ? <Text className="text-danger text-[13px]">{adjErr}</Text> : null}
      {tot ? (
        <View className="mt-1">
          {Number(tot.total_discount_amount) > 0 ? <Row label="Discount" value={<Money sign="−" value={tot.total_discount_amount} className="font-bold text-ok" />} /> : null}
          {Number(tot.charge_amount) > 0 ? <Row label="Charge" value={<Money value={tot.charge_amount} className="font-bold text-ink" />} /> : null}
          <Row label="VAT" value={<Money value={tot.total_vat} className="font-bold text-ink" />} />
          <Row strong label={`Total${adjBusy ? ' …' : ''}`} value={<Money value={tot.total_payable} bold className="text-[20px] font-extrabold text-ink" />} />
        </View>
      ) : null}
    </View>
  );
  const go = (
    <Btn variant="primary" size="lg" icon={Printer} busy={pos.busy === 'pay'} onPress={submit} className="flex-1 justify-between" textClass="flex-1"
      label={flDue > 0 ? 'Complete with due' : 'Complete & print'} right={<Money value={due} bold className="text-white text-[17px] font-extrabold" />} />
  );

  return (
    <Sheet title="Payment" subtitle={m.label} onClose={() => pos.busy !== 'pay' && onClose()} closable={pos.busy !== 'pay'} size="xl" footer={go}>
      {isTablet ? (
        <View className="flex-row" style={{ gap: 18 }}>
          <View style={{ flex: 1 }}>
            <View className="flex-row items-center mb-2"><Percent size={15} color={COLORS.ink2} /><Text className="ml-1.5 text-[12.5px] font-bold text-ink-2">ORDER DISCOUNT & CHARGE</Text></View>
            {adjust}
            <View className="flex-row items-center mt-4 bg-ok-bg rounded-xl p-3"><ShieldCheck size={18} color={COLORS.ok} /><Text className="ml-2 text-ok font-semibold flex-1">Simplified tax invoice — reported to ZATCA after payment</Text></View>
          </View>
          <View style={{ flex: 1.6 }}>
            {header}{methods}
            <View className="flex-row" style={{ gap: 14 }}>
              <View style={{ flex: 1.1 }}>{payList}</View>
              <View style={{ flex: 1 }}><Keypad onKey={onKey} keyClass="h-[54px]" /></View>
            </View>
          </View>
        </View>
      ) : (
        <View>
          {header}{methods}{payList}
          <Keypad onKey={onKey} className="mt-2" />
          <View className="mt-4 bg-card rounded-2xl border border-line p-3">{adjust}</View>
        </View>
      )}
      {err ? <Text className="text-danger font-semibold mt-3">{err}</Text> : null}
    </Sheet>
  );
}

export function DoneSheet({ pos, m, onClose }) {
  const inv = m.invoice;
  const z = inv?.zatca || {};
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    setPrinting(true);
    if (!m.printed && inv.print_job?.print_bytes) await pos.printJob(inv.print_job);
    else await pos.reprintInvoice(inv.id);
    setPrinting(false);
    onClose();
  };
  return (
    <Sheet title="Payment received" onClose={onClose} size="sm"
      footer={<><Btn label="Print invoice" icon={Printer} busy={printing} disabled={m.waiting} onPress={print} className="flex-1" />
        <Btn label="New order" icon={Plus} variant="primary" onPress={onClose} className="flex-1" /></>}>
      <View className="items-center">
        <Text className="text-ink-2">Invoice</Text>
        <Text className="text-[28px] font-extrabold text-ink">{inv?.sale_no}</Text>
      </View>
      <View className="mt-3">
        <Row label="Total" value={<Money value={inv?.totals?.total_payable ?? inv?.total_payable ?? 0} bold className="text-[18px] font-extrabold text-ink" />} />
        {Number(inv?.totals?.change_amount) > 0 ? <Row label="Change to return" value={<Money value={inv.totals.change_amount} bold className="text-[18px] font-extrabold text-ok" />} /> : null}
        {Number(inv?.totals?.due_amount) > 0 ? <Row label="Due" value={<Money value={inv.totals.due_amount} bold className="text-[16px] font-extrabold text-danger" />} /> : null}
      </View>
      <View className={`flex-row items-center mt-4 rounded-xl p-3 ${m.waiting ? 'bg-info-bg' : z.synced === false ? 'bg-warn-bg' : 'bg-ok-bg'}`}>
        <ShieldCheck size={20} color={m.waiting ? COLORS.info : z.synced === false ? COLORS.warn : COLORS.ok} />
        <Text className={`ml-2 font-semibold flex-1 ${m.waiting ? 'text-info' : z.synced === false ? 'text-warn' : 'text-ok'}`}>
          {m.waiting ? 'Sending to ZATCA…' : z.synced === false ? `ZATCA: ${z.message || 'not reported yet'}` : z.phase === '2' || z.synced ? 'Reported to ZATCA' : 'Invoice saved'}
          {m.auto && !m.waiting && m.printed ? ' · printed' : ''}
        </Text>
      </View>
    </Sheet>
  );
}

export { ChevronLeft };