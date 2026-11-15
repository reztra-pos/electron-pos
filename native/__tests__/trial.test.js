// Trial (test) builds: the app locks at the end date in src/build-info.json, and moving the clock back doesn't help.

const load = (until) => {
    jest.resetModules();
    jest.doMock('../src/build-info.json', () => ({ trialUntil: until, builtAt: new Date().toISOString(), trialDays: 3 }));
    return require('../src/lib/trial');
};
const DAY = 86400000;
afterEach(async () => { jest.useRealTimers(); await require('@react-native-async-storage/async-storage').default.removeItem('reztra.trialSeen'); });

test('production build: never locks', async () => {
    const t = load(null);
    expect(t.isTrialBuild()).toBe(false);
    expect((await t.checkTrial()).expired).toBe(false);
});

test('3-day trial: days left, then locked after the end date', async () => {
    const t = load(new Date(Date.now() + 3 * DAY - 60000).toISOString());
    let s = await t.checkTrial();
    expect(s).toMatchObject({ trial: true, expired: false, daysLeft: 3 });
    jest.useFakeTimers({ now: Date.now() + 2 * DAY });
    s = await t.checkTrial();
    expect(s).toMatchObject({ expired: false, daysLeft: 1 });
    jest.setSystemTime(Date.now() + 1 * DAY + 1000);
    expect((await t.checkTrial()).expired).toBe(true);
});

test('moving the tablet clock back locks the trial', async () => {
    const t = load(new Date(Date.now() + 3 * DAY).toISOString());
    await t.checkTrial();
    jest.useFakeTimers({ now: Date.now() + 1 * DAY });
    await t.checkTrial();                               // remembered: 1 day later
    jest.setSystemTime(Date.now() - 1 * DAY - 20 * 60000);
    const s = await t.checkTrial();
    expect(s).toMatchObject({ expired: true, tampered: true });
});

test('the server clock counts too (tablet clock set in the past)', async () => {
    const t = load(new Date(Date.now() + 3 * DAY).toISOString());
    t.noteServerDate(new Date(Date.now() + 4 * DAY).toUTCString());   // server says: 4 days later
    expect((await t.checkTrial()).expired).toBe(true);
});

test('screens: trial badge on the PIN screen, lock screen after the end', async () => {
    const show = async (until) => {
        load(until);                                   // fresh modules: React, the app and the build info together
        const React = require('react');
        const { render } = require('@testing-library/react-native/pure');   // pure: no auto hooks inside a test
        global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ success: true, data: { active: true } }) }));
        await require('../src/lib/storage').saveDevice({ url: 'http://pos.test', device_id: 'D1', device_token: 't', device_name: 'Tab', outlet_name: 'Main' });
        return render(React.createElement(require('../src/App').default));
    };
    let screen = await show(new Date(Date.now() + 2 * DAY).toISOString());
    await screen.findByText('Enter your PIN', {}, { timeout: 10000 });
    expect(screen.getByText(/^Test version · works until /)).toBeTruthy();
    screen.unmount();

    screen = await show(new Date(Date.now() - 1000).toISOString());
    await screen.findByText('The trial version has ended', {}, { timeout: 10000 });
    expect(screen.queryByText('Enter your PIN')).toBeNull();
    screen.unmount();
});