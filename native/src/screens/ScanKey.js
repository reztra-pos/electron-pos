// Full-screen QR scanner for the device API key (the QR shown in the web app: Settings -> POS Devices -> Device Key).
// Reads only codes that look like a device key ("RZT1."), then closes and hands the key back.
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal, PermissionsAndroid, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { X, CameraOff } from 'lucide-react-native';
import { Btn, COLORS } from '../ui';
import { tr } from '../lib/i18n';

async function askCamera() {
    if (Platform.OS !== 'android') return 'granted';
    const P = PermissionsAndroid.PERMISSIONS.CAMERA;
    if (await PermissionsAndroid.check(P)) return 'granted';
    const r = await PermissionsAndroid.request(P);
    return r === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied');
}

export default function ScanKey({ visible, onClose, onScan }) {
    const [perm, setPerm] = useState('asking');
    const [hint, setHint] = useState('');
    const done = useRef(false);
    const { width, height } = useWindowDimensions();
    // square frame, 80% of the short side: only codes fully INSIDE the frame are read, and the
    // default frame is a wide barcode strip that a QR code never fits into
    const frame = Math.round(Math.min(width, height) * 0.8);

    useEffect(() => {
        if (!visible) return;
        done.current = false;
        setHint('');
        setPerm('asking');
        askCamera().then(setPerm).catch(() => setPerm('denied'));
    }, [visible]);

    const onRead = (e) => {
        if (done.current) return;
        const v = String(e?.nativeEvent?.codeStringValue || '').trim();
        if (!v.startsWith('RZT1.')) { setHint(tr("This QR is not a device key.")); return; }
        done.current = true;
        onScan(v);
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                {perm === 'granted' ? (
                    <Camera style={{ flex: 1 }} cameraType={CameraType.Back} scanBarcode allowedBarcodeTypes={['qr']}
                        onReadCode={onRead} showFrame barcodeFrameSize={{ width: frame, height: frame }} laserColor={COLORS.brand || '#7c3aed'} frameColor="#ffffff" />
                ) : perm === 'asking' ? null : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                        <CameraOff size={42} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>
                            {tr("Camera permission is needed to scan the QR code.")}
                        </Text>
                        <View style={{ marginTop: 16 }}>
                            {perm === 'blocked'
                                ? <Btn label={tr("Open settings")} variant="primary" onPress={() => Linking.openSettings()} />
                                : <Btn label={tr("Allow camera")} variant="primary" onPress={() => askCamera().then(setPerm)} />}
                        </View>
                    </View>
                )}
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 40, alignItems: 'center', paddingHorizontal: 24 }}>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{hint || tr("Point the camera at the device key QR code")}</Text>
                </View>
                <Pressable onPress={onClose} hitSlop={12}
                    style={{ position: 'absolute', top: 44, right: 18, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={24} color="#fff" />
                </Pressable>
            </View>
        </Modal>
    );
}