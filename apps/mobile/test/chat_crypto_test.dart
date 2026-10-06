import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/chat/crypto.dart';

void main() {
  test('a message reads on every device it was sealed for, and nowhere else', () async {
    final ownerPhone = await ChatDevice.fromSeed('d_owner_phone', List.filled(32, 1));
    final ownerPc = await ChatDevice.fromSeed('d_owner_pc', List.filled(32, 2));
    final emp = await ChatDevice.fromSeed('d_emp', List.filled(32, 3));
    final outsider = await ChatDevice.fromSeed('d_x', List.filled(32, 4));
    final sealed = await ownerPhone.seal('Murakoze! Sugar is back in stock 🎉',
        senderId: 'u-owner',
        recipientId: 'u-emp',
        devices: {emp.id: emp.publicKey, ownerPhone.id: ownerPhone.publicKey, ownerPc.id: ownerPc.publicKey});
    Future<String?> openOn(ChatDevice d, {String? keyOf, String recipient = 'u-emp', String? cipher}) {
      final k = sealed.keys[keyOf ?? d.id]!;
      return d.open(
          ciphertext: cipher ?? sealed.ciphertext,
          nonce: sealed.nonce,
          wrapped: k.wrapped,
          wrapNonce: k.nonce,
          senderDeviceId: ownerPhone.id,
          senderPublicKey: ownerPhone.publicKey,
          senderId: 'u-owner',
          recipientId: recipient);
    }

    expect(await openOn(emp), 'Murakoze! Sugar is back in stock 🎉');
    expect(await openOn(ownerPhone), isNotNull);
    expect(await openOn(ownerPc), isNotNull);
    expect(await openOn(outsider, keyOf: emp.id), isNull, reason: "another device's key is useless");
    expect(await openOn(emp, recipient: 'u-someone-else'), isNull, reason: 'relabelled by the server');
    final c = base64Decode(sealed.ciphertext)..[0] ^= 1;
    expect(await openOn(emp, cipher: base64Encode(c)), isNull, reason: 'tampered');

    // Fresh randomness every time: same text, different ciphertext and nonce.
    final again = await ownerPhone.seal('Murakoze! Sugar is back in stock 🎉',
        senderId: 'u-owner', recipientId: 'u-emp', devices: {emp.id: emp.publicKey});
    expect(again.nonce == sealed.nonce || again.ciphertext == sealed.ciphertext, isFalse);

    // For the website's interop check (apps/web/lib/chat-crypto.ts).
    final out = Platform.environment['HGV_CHAT_FIXTURE'];
    if (out != null) {
      File(out).writeAsStringSync(jsonEncode({
        'sender': {'id': ownerPhone.id, 'public_key': ownerPhone.publicKey},
        'recipient_seed': List.filled(32, 3),
        'recipient': {'id': emp.id, 'public_key': emp.publicKey},
        'ciphertext': sealed.ciphertext,
        'nonce': sealed.nonce,
        'wrapped': sealed.keys[emp.id]!.wrapped,
        'wrap_nonce': sealed.keys[emp.id]!.nonce,
        'all_keys': [ownerPhone.publicKey, ownerPc.publicKey, emp.publicKey],
        'code': await securityCode([ownerPhone.publicKey, ownerPc.publicKey, emp.publicKey]),
      }));
    }
  });

  test('security code: same for both sides, 6 groups of 5 digits', () async {
    final a = await securityCode(['k1', 'k2', 'k3']);
    expect(a, await securityCode(['k3', 'k1', 'k2']));
    expect(RegExp(r'^\d{5}( \d{5}){5}$').hasMatch(a), isTrue);
    expect(a == await securityCode(['k1', 'k2', 'k4']), isFalse);
  });
}
