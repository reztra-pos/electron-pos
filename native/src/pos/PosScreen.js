// POS shell. Tablet (landscape, >= 600dp): navigation rail + menu + docked order panel (392dp).
// Phone (portrait): header, menu, floating order bar -> order sheet, bottom tab bar.
import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Store, LayoutGrid, Clock3, History, Wallet, Settings, ShieldCheck, WifiOff, ChevronRight, CircleUserRound, Loader2, Sun, Moon, CalendarClock, Smartphone, Bell } from 'lucide-react-native';
import { C } from '../lib/catalog';
import { COLORS, Money, Sheet, useLayout, useTheme, useUi } from '../ui';
import { usePos } from './usePos';
import { CategoryBar, ItemGrid, MenuViewToggle, SearchBox, useMenuFilter, useMenuView } from './Menu';
import { CartActions, CartHeader, CartLines, CartPanel, CartTotals, OrderMeta, TYPE_OPTIONS } from './Cart';
import { ItemSheet, VariationSheet } from './ItemSheet';
import { CustomerSheet, OrderTypeSheet, PartnerSheet, TableSheet, WaiterSheet } from './Pickers';
import { DoneSheet, PaymentSheet } from './Payment';
import { ClearRunningSheet, DraftsSheet, LeaveSheet, OpenRegisterSheet, OrderSheet, RegisterSheet, RunningView, SalesView, SettingsView, TableOrdersSheet, TablesView } from './Views';
import { Segment } from '../ui';
import { InvoiceSheet, RefundSheet } from './Refund';
import { SelfOrdersView } from './SelfOrders';
import { PreOrderDeliverSheet, PreOrderFormSheet, PreOrdersView } from './PreOrders';
import { useNotifications, NotificationsView, HeaderBell } from './Notifications';
import { flipX, tr, trn } from '../lib/i18n';
import { trialNow } from '../lib/trial';

const NAV = [
    { id: 'order', label: 'Order', icon: Store },
    { id: 'tables', label: 'Tables', icon: LayoutGrid },
    { id: 'running', label: 'Running', icon: Clock3 },
    { id: 'sales', label: 'Sales', icon: History },
    { id: 'preorders', label: 'Pre-orders', icon: CalendarClock, tablet: true },     // phone: under More
    { id: 'self', label: 'Online', icon: Smartphone, tablet: true },                  // phone: button at the top
    { id: 'alerts', label: 'Alerts', icon: Bell, tablet: true },                      // phone: bell at the top
    { id: 'more', label: 'Settings', icon: Settings },
];

export default function PosScreen({ user, device, onLogout, registerOpen: regInitial }) {
    const pos = usePos(user);
    const notes = useNotifications();
    const theme = useTheme();
    const { isTablet, width, wide } = useLayout();
    const inset = useSafeAreaInsets();
    const [view, setView] = useState('order');
    const [cartOpen, setCartOpen] = useState(false);
    // Modify a running order (from Running, Tables or Online): it is loaded into the cart -> go to the Order screen
    useEffect(() => { if (pos.editingId) setView('order'); }, [pos.editingId]);
    const menu = useMenuFilter();
    const [menuView, setMenuView] = useMenuView();        // pictures / names only, saved on this device
    const plain = menuView === 'text';
    const qtyById = useMemo(() => pos.cart.reduce((m, l) => {
        const key = C.byId[l.itemId]?.parentId || l.itemId;
        return { ...m, [key]: (m[key] || 0) + l.qty };
    }, {}), [pos.cart]);
    const needRegister = !pos.isWaiter && pos.registerOpen === false;
    const closeModal = () => pos.setModal(null);
    const m = pos.modal;

    // log out: with the register still open, ask first (close it, keep it open, or stay) - same as the desktop app
    const registerIsOpen = !pos.isWaiter && !!pos.registerOpen;
    const requestLogout = () => (registerIsOpen ? pos.setModal({ name: 'leave', exit: false }) : onLogout());
    // Android back button on the main screen: back to the menu, then "Close the app" (with the register question)
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (pos.modal) { pos.setModal(null); return true; }
            if (cartOpen) { setCartOpen(false); return true; }
            if (view !== 'order') { setView('order'); return true; }
            if (registerIsOpen) { pos.setModal({ name: 'leave', exit: true }); return true; }
            return false;                                   // Android closes the app
        });
        return () => sub.remove();
    }, [pos.modal, cartOpen, view, registerIsOpen]); // eslint-disable-line

    const startOrderAt = (t) => { pos.resetOrder(); pos.setOrderType('dine'); pos.setTable([{ id: t.id, name: t.name, persons: Math.max(1, t.capacity || 1) }]); setView('order'); };

    const modals = (
        <>
            {m?.name === 'orderType' ? <OrderTypeSheet pos={pos} onClose={closeModal} /> : null}
            {m?.name === 'table' ? <TableSheet pos={pos} onClose={closeModal} /> : null}
            {m?.name === 'customer' ? <CustomerSheet pos={pos} onClose={closeModal} /> : null}
            {m?.name === 'waiter' ? <WaiterSheet pos={pos} onClose={closeModal} /> : null}
            {m?.name === 'partner' ? <PartnerSheet pos={pos} onClose={closeModal} /> : null}
            {m?.name === 'item' ? <ItemSheet pos={pos} item={m.item} line={m.line} onClose={closeModal} /> : null}
            {m?.name === 'variations' ? <VariationSheet pos={pos} item={m.item} onClose={closeModal} /> : null}
            {m?.name === 'payment' && pos.canInvoice ? <PaymentSheet pos={pos} m={m} onClose={closeModal} /> : null}
            {m?.name === 'done' ? <DoneSheet pos={pos} m={m} onClose={closeModal} /> : null}
            {m?.name === 'order' ? <OrderSheet pos={pos} id={m.id} onClose={closeModal} /> : null}
            {m?.name === 'tableOrders' ? <TableOrdersSheet pos={pos} table={m.table} onClose={closeModal} /> : null}
            {m?.name === 'register' ? <RegisterSheet pos={pos} onClose={closeModal} onClosed={() => { closeModal(); onLogout(); }} /> : null}
            {m?.name === 'drafts' ? <DraftsSheet pos={pos} onClose={closeModal} /> : null}
            {m?.name === 'leave' ? <LeaveSheet pos={pos} exit={m.exit} onClose={closeModal} onLeave={() => { closeModal(); if (m.exit) BackHandler.exitApp(); else onLogout(); }} /> : null}
            {m?.name === 'clearRunning' ? <ClearRunningSheet pos={pos} onClose={closeModal} /> : null}
            {m?.name === 'invoice' ? <InvoiceSheet pos={pos} id={m.id} onClose={closeModal} onRefund={(sale) => pos.setModal({ name: 'refund', sale })} /> : null}
            {m?.name === 'refund' && pos.canRefund ? <RefundSheet pos={pos} sale={m.sale} onClose={closeModal} onDone={(id, refund) => pos.setSales((s) => s.map((x) => (x.id === id ? { ...x, refund } : x)))} /> : null}
            {m?.name === 'poForm' ? <PreOrderFormSheet pos={pos} po={m.po} onClose={closeModal} /> : null}
            {m?.name === 'poDeliver' && pos.canInvoice ? <PreOrderDeliverSheet pos={pos} po={m.po} onClose={closeModal} /> : null}
            {needRegister ? <OpenRegisterSheet pos={pos} user={user} onOpened={() => pos.setRegisterOpen(true)} onLogout={onLogout} /> : null}
        </>
    );

    const content = view === 'tables' ? <TablesView pos={pos} onStartOrder={startOrderAt} />
        : view === 'running' ? <RunningView pos={pos} />
            : view === 'sales' ? <SalesView pos={pos} />
                : view === 'preorders' ? <PreOrdersView pos={pos} />
                    : view === 'self' ? <SelfOrdersView pos={pos} onModify={() => setView('order')} />
                        : view === 'alerts' ? <NotificationsView notes={notes} />
                            : view === 'more' ? <SettingsView pos={pos} user={user} device={device} onLogout={requestLogout} onOpenRegister={() => pos.setModal({ name: 'register' })} onOpenPreOrders={() => setView('preorders')} />
                                : null;

    const status = (
        <View className="flex-row items-center" style={{ gap: 8 }}>
            {trialNow().trial ? <View className="flex-row items-center bg-warn-bg rounded-full px-3 h-8"><Text className="text-warn font-bold text-[12.5px]">{trn(trialNow().daysLeft, 'Trial · {n} day left', 'Trial · {n} days left')}</Text></View> : null}
            {pos.zatcaQueue.length ? <View className="flex-row items-center bg-info-bg rounded-full px-3 h-8"><Loader2 size={14} color={COLORS.info} /><Text className="text-info font-semibold text-[12.5px] ml-1.5">{tr("ZATCA")} {pos.zatcaQueue.length}</Text></View> : null}
            {pos.online ? <View className="flex-row items-center bg-ok-bg rounded-full px-3 h-8"><ShieldCheck size={14} color={COLORS.ok} /><Text className="text-ok font-semibold text-[12.5px] ml-1.5">{tr("ZATCA")}</Text></View>
                : <View className="flex-row items-center bg-danger-bg rounded-full px-3 h-8"><WifiOff size={14} color={COLORS.danger} /><Text className="text-danger font-semibold text-[12.5px] ml-1.5">{tr("Offline")}</Text></View>}
        </View>
    );

    /* ================= tablet ================= */
    if (isTablet) {
        const cartW = 392;
        const menuW = width - 84 - cartW - 36;
        const cols = Math.max(3, Math.floor(menuW / (wide ? 190 : 200))) + (plain ? 1 : 0);
        return (
            <View className="flex-1 flex-row bg-app" style={{ paddingTop: inset.top }}>
                {/* side rail: scrolls on smaller tablets (9") so nothing is cut off */}
                <View className="w-[84px] bg-rail">
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingVertical: 14, gap: 6 }}>
                        <View className="w-[46px] h-[46px] rounded-2xl bg-brand items-center justify-center mb-3"><Text className="text-white font-extrabold text-[22px]">R</Text></View>
                        {NAV.filter((n) => (n.id !== 'preorders' || pos.canPay) && (n.id !== 'self' || pos.canSelf)).map((n) => {
                            const on = view === n.id;
                            const Icon = n.icon;
                            const badge = n.id === 'running' ? pos.running.length : n.id === 'self' ? pos.selfCount : n.id === 'alerts' ? notes.count : 0;
                            return (
                                <Pressable key={n.id} onPress={() => setView(n.id)} accessibilityLabel={tr(n.id === 'self' ? 'Self / Online orders' : n.id === 'alerts' ? 'Notifications' : n.label)}
                                    className={`w-[68px] h-[62px] rounded-2xl items-center justify-center ${on ? 'bg-[#7B5CFF38]' : ''}`}>
                                    <Icon size={22} color={on ? '#fff' : COLORS.railText} strokeWidth={1.9} />
                                    <Text className={`text-[11px] font-semibold mt-1 ${on ? 'text-white' : 'text-[#AEB6CC]'}`} numberOfLines={1}>{tr(n.label)}</Text>
                                    {badge ? <View className="absolute top-1.5 right-2 min-w-[18px] h-[18px] rounded-full bg-[#FF5A5F] items-center justify-center px-1"><Text className="text-white text-[10px] font-bold">{badge > 99 ? '99+' : badge}</Text></View> : null}
                                </Pressable>
                            );
                        })}
                        <View className="flex-1 min-h-[12px]" />
                        <Pressable onPress={() => theme.setMode(theme.scheme === 'dark' ? 'light' : 'dark')} accessibilityLabel={theme.scheme === 'dark' ? tr("Light mode") : tr("Dark mode")}
                            className="w-[52px] h-[44px] rounded-xl items-center justify-center mb-1 active:opacity-70">
                            {theme.scheme === 'dark' ? <Sun size={21} color={COLORS.railText} strokeWidth={1.9} /> : <Moon size={21} color={COLORS.railText} strokeWidth={1.9} />}
                        </Pressable>
                        <View className="w-10 h-10 rounded-full bg-[#2A3350] items-center justify-center"><Text className="text-white font-bold text-[13px]">{(user?.name || '?').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()}</Text></View>
                    </ScrollView>
                </View>
                {view === 'order' ? (
                    <>
                        <View className="flex-1 px-[18px] pt-4">
                            <View className="flex-row items-center mb-3.5" style={{ gap: 12 }}>
                                <View><Text className="text-[17px] font-extrabold text-ink">{C.outlet.name || device?.outlet_name}</Text><Text className="text-ink-2 text-[12.5px]">{device?.device_name} · {user?.name}</Text></View>
                                <SearchBox value={menu.query} onChange={menu.setQuery} className="flex-1" />
                                <MenuViewToggle value={menuView} onChange={setMenuView} />
                                {status}
                            </View>
                            <CategoryBar cat={menu.cat} setCat={menu.setCat} />
                            <View className="flex-1 mt-3 -mx-1.5">
                                <ItemGrid items={menu.items} columns={cols} width={menuW + 12} qtyById={qtyById} orderType={pos.orderType} partner={pos.partner} onPress={pos.onItemPress} plain={plain} />
                            </View>
                        </View>
                        <View style={{ width: cartW }} className="border-l border-line"><CartPanel pos={pos} /></View>
                    </>
                ) : <View className="flex-1 px-[18px] pt-4">{content}</View>}
                {modals}
            </View>
        );
    }

    /* ================= phone ================= */
    const total = pos.totals?.total_payable ?? 0;
    return (
        <View className="flex-1 bg-app" style={{ paddingTop: inset.top }}>
            {view === 'order' ? (
                <View className="flex-1">
                    <View className="flex-row items-center px-[18px] pt-1.5 pb-2.5">
                        <View className="flex-1"><Text className="text-[20px] font-extrabold text-ink" numberOfLines={1}>{C.outlet.name || device?.outlet_name}</Text><Text className="text-ink-2 text-[12.5px]">{user?.name}</Text></View>
                        <HeaderBell notes={notes} onPress={() => setView('alerts')} />
                        {pos.canSelf ? (
                            <Pressable onPress={() => setView('self')} accessibilityLabel={tr("Self / Online orders")} className="w-10 h-10 rounded-xl bg-card border border-line items-center justify-center mr-2 active:opacity-70">
                                <Smartphone size={20} color={COLORS.ink2} />
                                {pos.selfCount ? <View className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-[#FF5A5F] items-center justify-center px-1"><Text className="text-white text-[10px] font-bold">{pos.selfCount}</Text></View> : null}
                            </Pressable>
                        ) : null}
                        {status}
                    </View>
                    <View className="px-[18px]"><Segment options={TYPE_OPTIONS} value={pos.orderType} onChange={(t) => pos.pickOrderType(t, null)} /></View>
                    <View className="px-[18px] mt-3 flex-row" style={{ gap: 8 }}><SearchBox value={menu.query} onChange={menu.setQuery} className="flex-1" /><MenuViewToggle value={menuView} onChange={setMenuView} /></View>
                    <View className="px-[18px] py-3"><CategoryBar cat={menu.cat} setCat={menu.setCat} /></View>
                    <View className="flex-1 px-3">
                        <ItemGrid items={menu.items} columns={2} width={width - 24} qtyById={qtyById} orderType={pos.orderType} partner={pos.partner} onPress={pos.onItemPress} footerSpace={pos.cart.length ? 80 : 0} plain={plain} />
                    </View>
                    {pos.cart.length ? (
                        <Pressable onPress={() => setCartOpen(true)} className="absolute left-3.5 right-3.5 bottom-3 h-[62px] rounded-[18px] bg-inverse flex-row items-center px-3" style={{ elevation: 8 }}>
                            <View className="w-[38px] h-[38px] rounded-xl bg-brand items-center justify-center"><Text className="text-white font-extrabold">{pos.itemCount}</Text></View>
                            <View className="ml-3 flex-1"><Text className="text-[#AEB6CC] text-[11.5px] font-semibold">{tr(TYPE_OPTIONS.find((o) => o.value === pos.orderType)?.label) || tr("Choose order type")}{pos.table ? ` · ${pos.table.map((t) => t.name).join(', ')}` : ''}</Text>
                                <Money value={total} bold className="text-white text-[17px] font-extrabold" /></View>
                            <View className="h-11 rounded-xl bg-card flex-row items-center pl-4 pr-3"><Text className="text-ink font-extrabold">{tr("View order")}</Text><ChevronRight size={18} color={COLORS.ink} style={flipX()} /></View>
                        </Pressable>
                    ) : null}
                </View>
            ) : <View className="flex-1 px-[18px] pt-2">{content}</View>}
            <View className="flex-row bg-card border-t border-line" style={{ paddingBottom: Math.max(inset.bottom, 8), paddingTop: 8 }}>
                {NAV.filter((n) => !n.tablet).map((n) => {
                    const on = view === n.id || (n.id === 'more' && view === 'preorders');
                    const Icon = n.id === 'more' ? CircleUserRound : n.icon;
                    const badge = n.id === 'running' ? pos.running.length : 0;
                    return (
                        <Pressable key={n.id} onPress={() => setView(n.id)} className="flex-1 items-center" accessibilityLabel={tr(n.label)}>
                            <Icon size={24} color={on ? COLORS.brand : COLORS.ink3} strokeWidth={on ? 2.2 : 1.8} />
                            <Text className={`text-[11px] font-semibold mt-0.5 ${on ? 'text-brand' : 'text-ink-3'}`}>{n.id === 'more' ? tr("More") : tr(n.label)}</Text>
                            {badge ? <View className="absolute -top-1 left-[56%] min-w-[17px] h-[17px] rounded-full bg-[#FF5A5F] items-center justify-center px-1"><Text className="text-white text-[10px] font-bold">{badge}</Text></View> : null}
                        </Pressable>
                    );
                })}
            </View>
            {cartOpen ? (
                <Sheet title={pos.editingId ? tr("Editing order") : tr("Order")} subtitle={tr("{itemCount} items", { itemCount: pos.itemCount })} onClose={() => setCartOpen(false)} size="md" scroll={false}
                    footer={null}>
                    <View style={{ maxHeight: 640 }}>
                        <OrderMeta pos={pos} />
                        <View style={{ flexShrink: 1, minHeight: 120 }} className="mt-2"><CartLines pos={pos} /></View>
                    </View>
                    <View className="-mx-5 -mb-5"><CartTotals pos={pos} /><CartActions pos={pos} onDone={() => setCartOpen(false)} /></View>
                </Sheet>
            ) : null}
            {modals}
        </View>
    );
}