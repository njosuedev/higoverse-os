import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// End-to-end encryption for Messages. The website does exactly the same
/// with WebCrypto (apps/web/lib/chat-crypto.ts); keep the two in step.
///
/// * Each device has an X25519 key pair. The private key stays on the
///   device (secure storage); the server keeps the public key (base64).
/// * A message is encrypted once with a fresh random 32-byte key and a fresh
///   random 12-byte nonce (AES-256-GCM). Associated data binds it to its
///   sender and recipient: `hgv-chat-v1|<sender id>|<recipient id>`.
/// * That key is wrapped for each device of both people: X25519(sender
///   device, device) → HKDF-SHA256 (salt "hgv-chat-wrap-v1", info
///   `<sender device id>|<device id>`) → AES-256-GCM with its own random
///   nonce, associated data = the message's nonce (base64).
/// * The server only ever stores ciphertexts, nonces and public keys.

final _x25519 = X25519();
final _aes = AesGcm.with256bits();
final _hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);
final _rand = Random.secure();
const _salt = 'hgv-chat-wrap-v1';

Uint8List _random(int n) => Uint8List.fromList(List<int>.generate(n, (_) => _rand.nextInt(256)));
String _b64(List<int> b) => base64Encode(b);
Uint8List _unb64(String s) => base64Decode(s);

/// The parts of a sealed message as the API takes them.
class Sealed {
  Sealed({required this.ciphertext, required this.nonce, required this.keys});
  final String ciphertext, nonce;

  /// device id → (wrapped key, its nonce).
  final Map<String, ({String wrapped, String nonce})> keys;
}

/// This device's identity for Messages.
class ChatDevice {
  ChatDevice._(this.id, this._pair, this.publicKey);
  final String id;
  final SimpleKeyPair _pair;

  /// Base64 of the 32-byte X25519 public key.
  final String publicKey;

  static const _kId = 'hgv_chat_device_id', _kSeed = 'hgv_chat_device_seed';

  /// The device's key pair, made the first time and kept in secure storage
  /// (per account: [owner] is the user id, so a shared phone keeps them apart).
  static Future<ChatDevice> load(String owner, {FlutterSecureStorage storage = const FlutterSecureStorage()}) async {
    final idKey = '$_kId:$owner', seedKey = '$_kSeed:$owner';
    var id = await storage.read(key: idKey);
    final seed = await storage.read(key: seedKey);
    SimpleKeyPair pair;
    if (id != null && seed != null) {
      pair = await _x25519.newKeyPairFromSeed(_unb64(seed));
    } else {
      pair = await _x25519.newKeyPair();
      id = 'd_${_b64(_random(12)).replaceAll(RegExp(r'[^A-Za-z0-9]'), '')}';
      await storage.write(key: seedKey, value: _b64(await pair.extractPrivateKeyBytes()));
      await storage.write(key: idKey, value: id);
    }
    final pub = await pair.extractPublicKey();
    return ChatDevice._(id, pair, _b64(pub.bytes));
  }

  /// For tests: a device from a known seed.
  static Future<ChatDevice> fromSeed(String id, List<int> seed) async {
    final pair = await _x25519.newKeyPairFromSeed(seed);
    return ChatDevice._(id, pair, _b64((await pair.extractPublicKey()).bytes));
  }

  Future<SecretKey> _kek(String publicKey, String senderDevice, String receiverDevice) async {
    final shared = await _x25519.sharedSecretKey(
      keyPair: _pair,
      remotePublicKey: SimplePublicKey(_unb64(publicKey), type: KeyPairType.x25519),
    );
    return _hkdf.deriveKey(secretKey: shared, nonce: utf8.encode(_salt), info: utf8.encode('$senderDevice|$receiverDevice'));
  }

  /// Encrypts [text] from [senderId] to [recipientId], with the key wrapped
  /// for every device in [devices] (device id → public key).
  Future<Sealed> seal(String text, {required String senderId, required String recipientId, required Map<String, String> devices}) async {
    final key = _random(32), nonce = _random(12);
    final box = await _aes.encrypt(utf8.encode(jsonEncode({'t': text})),
        secretKey: SecretKey(key), nonce: nonce, aad: utf8.encode('hgv-chat-v1|$senderId|$recipientId'));
    final nonceB64 = _b64(nonce);
    final keys = <String, ({String wrapped, String nonce})>{};
    for (final d in devices.entries) {
      final wrapNonce = _random(12);
      final w = await _aes.encrypt(key, secretKey: await _kek(d.value, id, d.key), nonce: wrapNonce, aad: utf8.encode(nonceB64));
      keys[d.key] = (wrapped: _b64([...w.cipherText, ...w.mac.bytes]), nonce: _b64(wrapNonce));
    }
    return Sealed(ciphertext: _b64([...box.cipherText, ...box.mac.bytes]), nonce: nonceB64, keys: keys);
  }

  /// The text of a message to or from this device; null when it can't be
  /// read here (sent before this device was set up, or tampered with).
  Future<String?> open({
    required String ciphertext,
    required String nonce,
    required String wrapped,
    required String wrapNonce,
    required String senderDeviceId,
    required String senderPublicKey,
    required String senderId,
    required String recipientId,
  }) async {
    try {
      final w = _unb64(wrapped);
      final key = await _aes.decrypt(
        SecretBox(w.sublist(0, w.length - 16), nonce: _unb64(wrapNonce), mac: Mac(w.sublist(w.length - 16))),
        secretKey: await _kek(senderPublicKey, senderDeviceId, id),
        aad: utf8.encode(nonce),
      );
      final c = _unb64(ciphertext);
      final clear = await _aes.decrypt(
        SecretBox(c.sublist(0, c.length - 16), nonce: _unb64(nonce), mac: Mac(c.sublist(c.length - 16))),
        secretKey: SecretKey(key),
        aad: utf8.encode('hgv-chat-v1|$senderId|$recipientId'),
      );
      final j = jsonDecode(utf8.decode(clear));
      return j is Map && j['t'] is String ? j['t'] as String : null;
    } catch (_) {
      return null;
    }
  }
}

/// The conversation's security code: the same 30 digits on both sides when
/// nobody is in the middle (compare them in person or on a call). Made from
/// every device key of both people, sorted.
Future<String> securityCode(Iterable<String> publicKeys) async {
  final sorted = publicKeys.toList()..sort();
  final hash = await Sha256().hash(utf8.encode(sorted.join('|')));
  final b = hash.bytes;
  final digits = StringBuffer();
  // Six groups of five digits, each from four bytes (same in the browser).
  for (var g = 0; g < 6; g++) {
    final n = ((b[4 * g] << 24) | (b[4 * g + 1] << 16) | (b[4 * g + 2] << 8) | b[4 * g + 3]) % 100000;
    if (g > 0) digits.write(' ');
    digits.write(n.toString().padLeft(5, '0'));
  }
  return digits.toString();
}
