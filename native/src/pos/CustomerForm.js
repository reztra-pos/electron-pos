// Add / edit a customer: the same fields as the web POS customer form (Sale::add_customer_by_ajax), incl. the
// ZATCA national address. A customer with a TRN and a complete national address gets a ZATCA standard (B2B)
// invoice from the server (printSaleByAjax, unchanged); this form only shows what is still missing.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Building2, Check, MapPin, ShieldAlert, ShieldCheck } from 'lucide-react-native';
import { get } from '../lib/api';
import { C } from '../lib/catalog';
import { firstError } from '../lib/format';
import { Btn, COLORS, Field, Input, Segment, Sheet, useLayout } from '../ui';

// [key, label, arabic]
export const NATIONAL = [
    ['short_address_en', 'Short address - English'], ['short_address_ar', 'Short address - Arabic', true],
    ['building_no', 'Building no'], ['secondary_no', 'Secondary no'],
    ['street_en', 'Street - English'], ['street_ar', 'Street - Arabic', true],
    ['district_en', 'District - English'], ['district_ar', 'District - Arabic', true],
    ['city_en', 'City - English'], ['city_ar', 'City - Arabic', true],
    ['postal_code', 'Postal code'], ['country_en', 'Country - English'], ['country_ar', 'Country - Arabic', true],
];
// what the server needs to send a standard (B2B) ZATCA invoice with the buyer's details (same list as the desktop app)
// two fields per row (English | Arabic side by side)
const NA_ROWS = [['short_address_en', 'short_address_ar'], ['building_no', 'secondary_no'], ['street_en', 'street_ar'], ['district_en', 'district_ar'],
['city_en', 'city_ar'], ['country_en', 'country_ar'], ['postal_code']];
const B2B_NEEDS = [['name', 'Name'], ['trn_number', 'TRN'], ['postal_code', 'Postal code'], ['street', 'Street'], ['building_no', 'Building no'],
['secondary_no', 'Secondary no'], ['district', 'District'], ['city', 'City']];

/** fields still missing for a B2B invoice (empty list = complete) */
export function b2bMissing(f) {
    const na = f.national_address || {};
    const val = {
        name: f.name, trn_number: f.trn_number, postal_code: na.postal_code, street: na.street_en || na.street_ar, building_no: na.building_no,
        secondary_no: na.secondary_no, district: na.district_en || na.district_ar, city: na.city_en || na.city_ar
    };
    return B2B_NEEDS.filter(([k]) => !String(val[k] || '').trim()).map(([, l]) => l);
}

const EMPTY = { name: '', phone: '', email: '', trn_number: '', cr_number: '', default_discount: '', gst_number: '', same_or_diff_state: '', address: '', national_address: {} };

/**
 * edit: a customer row ({ id, … }) to edit, or null for a new customer.
 * onSave(id|null, body) -> saved row; field errors ({ errors }) are shown on the form.
 */
export function CustomerFormSheet({ edit, onClose, onSave, onError }) {
    const { isTablet } = useLayout();
    const [f, setF] = useState(edit ? { ...EMPTY, name: edit.name || '', phone: edit.phone || '' } : EMPTY);
    const [addresses, setAddresses] = useState([]);
    const [addrId, setAddrId] = useState('new');          // 'new' or a saved address id
    const [loading, setLoading] = useState(!!edit);
    const [saving, setSaving] = useState(false);
    const [errs, setErrs] = useState({});
    const [err, setErr] = useState('');
    const gst = !!C.settings?.tax_is_gst;

    useEffect(() => {
        if (!edit) return;
        get(`/v1/customers/${edit.id}`).then((c) => {
            setF({
                ...EMPTY, ...c, same_or_diff_state: c.same_or_diff_state ? String(c.same_or_diff_state) : '', national_address: c.national_address || {},
                default_discount: c.default_discount || ''
            });
            const list = c.addresses || [];
            setAddresses(list);
            const act = list.find((a) => a.is_active);
            if (act) { setAddrId(String(act.id)); setF((x) => ({ ...x, address: act.address })); }
        }).catch((e) => { onError(e); onClose(); }).finally(() => setLoading(false));
    }, []); // eslint-disable-line

    const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrs((x) => ({ ...x, [k]: undefined })); };
    const setNa = (k) => (v) => { setF((x) => ({ ...x, national_address: { ...x.national_address, [k]: v } })); setErrs((x) => ({ ...x, [`national_address.${k}`]: undefined })); };
    const pickAddr = (id) => { setAddrId(id); setF((x) => ({ ...x, address: id === 'new' ? '' : (addresses.find((a) => String(a.id) === id)?.address || '') })); };
    const na = f.national_address || {};
    const missing = b2bMissing(f);
    const hasTrn = !!String(f.trn_number || '').trim();

    const save = async () => {
        setSaving(true); setErrs({}); setErr('');
        const body = {
            name: f.name.trim(), phone: String(f.phone || '').trim(), email: String(f.email || '').trim(), trn_number: String(f.trn_number || '').trim(),
            cr_number: String(f.cr_number || '').trim(), default_discount: String(f.default_discount || '').trim(), address: String(f.address || '').trim(),
            national_address: Object.fromEntries(NATIONAL.map(([k]) => [k, String(na[k] || '').trim()])),
        };
        if (addrId !== 'new') body.address_id = Number(addrId);
        if (gst) { body.gst_number = String(f.gst_number || '').trim(); if (f.same_or_diff_state) body.same_or_diff_state = Number(f.same_or_diff_state); }
        try { await onSave(edit?.id || null, body); }
        catch (e) { if (e?.errors) setErrs(e.errors); setErr(firstError(e)); setSaving(false); }
    };

    const fld = (k, label, props = {}) => (
        <Field label={label} error={errs[k]} className={isTablet ? 'flex-1 min-w-[200px]' : ''}>
            <Input value={String(f[k] ?? '')} onChangeText={set(k)} accessibilityLabel={typeof label === 'string' ? label : k} {...props} />
        </Field>
    );
    const row = (children) => <View className={isTablet ? 'flex-row flex-wrap' : ''} style={isTablet ? { columnGap: 12 } : null}>{children}</View>;

    return (
        <Sheet title={edit ? 'Edit customer' : 'Add customer'} subtitle={edit ? edit.name : ''} onClose={() => !saving && onClose()} closable={!saving} size="lg"
            footer={<><Btn label="Cancel" disabled={saving} onPress={onClose} className="flex-1" />
                <Btn icon={Check} label={edit ? 'Save customer' : 'Add customer'} variant="primary" busy={saving} disabled={saving || loading || !f.name.trim()} onPress={save} className="flex-1" /></>}>
            {loading ? <ActivityIndicator color={COLORS.brand} /> : (
                <View>
                    {row(<>
                        {fld('name', 'Name *', { autoFocus: !edit })}
                        {fld('phone', 'Phone', { keyboardType: 'phone-pad' })}
                        {fld('email', 'Email', { keyboardType: 'email-address', autoCapitalize: 'none' })}
                    </>)}
                    {row(<>
                        {fld('trn_number', 'TRN (VAT number)', { keyboardType: 'number-pad' })}
                        {fld('cr_number', 'CR number')}
                        {fld('default_discount', 'Default discount', { placeholder: '10 or 10%' })}
                    </>)}
                    {gst ? row(<>
                        {fld('gst_number', 'GST number')}
                        <Field label="Same or different state" error={errs.same_or_diff_state} className={isTablet ? 'flex-1 min-w-[200px]' : ''}>
                            <Segment options={[{ value: '1', label: 'Same state' }, { value: '2', label: 'Different state' }]} value={String(f.same_or_diff_state || '')} onChange={set('same_or_diff_state')} />
                        </Field>
                    </>) : null}

                    <Text className="text-[12.5px] font-semibold text-ink-2 mb-1.5">Delivery address</Text>
                    {addresses.length ? (
                        <View className="mb-2">
                            {[...addresses.map((a) => ({ id: String(a.id), text: a.address })), { id: 'new', text: 'New address' }].map((a) => {
                                const on = addrId === a.id;
                                return (
                                    <Pressable key={a.id} onPress={() => pickAddr(a.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                                        className={`flex-row items-center px-3 py-2.5 rounded-xl mb-1 border ${on ? 'bg-brand-tint border-brand' : 'border-line'}`}>
                                        <MapPin size={16} color={on ? COLORS.brand : COLORS.ink3} />
                                        <Text className={`ml-2 flex-1 ${on ? 'text-brand-dark font-semibold' : 'text-ink'}`} numberOfLines={2}>{a.text}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    ) : null}
                    <Field error={errs.address}>
                        <Input value={f.address} onChangeText={set('address')} placeholder="Delivery address" multiline className="h-20 py-2" style={{ textAlignVertical: 'top' }} accessibilityLabel="Delivery address" />
                    </Field>

                    <View className="flex-row items-center mt-1 mb-1"><Building2 size={18} color={COLORS.ink2} /><Text className="ml-2 font-extrabold text-ink text-[16px]">National address</Text></View>
                    {hasTrn ? (missing.length ? (
                        <View className="flex-row items-start bg-warn-bg rounded-xl px-3 py-2.5 mb-3">
                            <ShieldAlert size={17} color={COLORS.warn} />
                            <Text className="text-warn text-[13px] font-semibold ml-2 flex-1">For a ZATCA standard (B2B) invoice also fill: {missing.join(', ')}</Text>
                        </View>
                    ) : (
                        <View className="flex-row items-center bg-ok-bg rounded-xl px-3 py-2.5 mb-3">
                            <ShieldCheck size={17} color={COLORS.ok} /><Text className="text-ok text-[13px] font-semibold ml-2 flex-1">Complete for a ZATCA standard (B2B) invoice</Text>
                        </View>
                    )) : <Text className="text-ink-3 text-[12.5px] mb-3">With a TRN, these are needed for ZATCA standard (B2B) invoices.</Text>}
                    {NA_ROWS.map((pair) => (
                        <View key={pair.join()} className="flex-row" style={{ columnGap: 12 }}>
                            {pair.map((k) => {
                                const [, label, ar] = NATIONAL.find(([key]) => key === k);
                                return (
                                    <Field key={k} label={label} error={errs[`national_address.${k}`]} className="flex-1">
                                        <Input value={na[k] || ''} onChangeText={setNa(k)} placeholder={label} accessibilityLabel={label}
                                            keyboardType={k === 'postal_code' || k === 'building_no' || k === 'secondary_no' ? 'number-pad' : 'default'}
                                            style={ar ? { textAlign: 'right', writingDirection: 'rtl' } : null} />
                                    </Field>
                                );
                            })}
                            {pair.length === 1 ? <View className="flex-1" /> : null}
                        </View>
                    ))}
                    {err ? <Text className="text-danger font-semibold mt-1">{err}</Text> : null}
                </View>
            )}
        </Sheet>
    );
}