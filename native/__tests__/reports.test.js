// Register report A4 / PDF: the HTML document and the hand-off to Android's print screen ("Save as PDF").
import { C } from '../src/lib/catalog';
import { registerA4Html } from '../src/lib/reports';
import { printDocument } from '../src/lib/printer';

test('register report A4 html', async () => {
    C.settings = { outlet: { firm_name_1: 'Reztra Cafe', firm_name_2: 'ريزترا', name: 'Main', trn: '300000000000003' }, invoice: {} };
    C.outlet = { ...C.outlet, currency: 'SAR', precision: 2 };
    const html = registerA4Html({
        user: 'Admin', opened_at: '2026-11-11 09:00', status: 'open',
        totals: { opening: 100, sale: 250.5, pre_order: 40, refund: 10, closing: 380.5 },
        methods: [{ payment_method_id: 1, name: 'Cash', opening: 100, sale: 150.5, pre_order: 40, refund: 10, closing: 280.5 },
        { payment_method_id: 2, name: 'Card', opening: 0, sale: 100, closing: 100 }, { payment_method_id: 3, name: 'Loyalty Point', is_loyalty: true, sale: 5 }],
        item_sales: [{ name: 'Pepsi <cold>', qty: 3, amount: 15 }], modifier_sales: [],
    });
    expect(html).toContain('Register Report');
    expect(html).toContain('Reztra Cafe');
    expect(html).toContain('Pre-order payment');
    expect(html).toContain('380.50');
    expect(html).toContain('Pepsi &lt;cold&gt;');              // escaped
    expect(html).not.toContain('Loyalty Point');               // loyalty is not used in this app
    await printDocument(html, 'register-report-2026-11-11');
    expect(global.__docs.pop()).toMatchObject({ name: 'register-report-2026-11-11' });
});