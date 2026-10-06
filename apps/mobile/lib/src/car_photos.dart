import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:gal/gal.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';

import 'config.dart';
import 'i18n.dart';
import 'session.dart';
import 'theme.dart';

/// Same limit as the website and the server (MAX_IMAGES).
const maxCarPhotos = 7;

/// A photo ready to store: the full picture and the list thumbnail, both as
/// JPEG data URLs sized like the website makes them (1280 px at 0.78, and
/// 160 px at 0.7; see apps/web/lib/image.ts).
typedef CarPhoto = ({String photo, String thumb});

String _dataUrl(Uint8List jpg) => 'data:image/jpeg;base64,${base64Encode(jpg)}';

img.Image _fit(img.Image src, int maxPx) {
  final longest = src.width > src.height ? src.width : src.height;
  if (longest <= maxPx) return src;
  return src.width >= src.height ? img.copyResize(src, width: maxPx) : img.copyResize(src, height: maxPx);
}

/// Runs off the UI thread: decode (JPEG, PNG, WebP…), turn upright the way
/// the camera held it, then re-encode at the website's sizes.
CarPhoto? _prepare(Uint8List bytes) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) return null;
  final upright = img.bakeOrientation(decoded);
  final photo = img.encodeJpg(_fit(upright, 1280), quality: 78);
  final thumb = img.encodeJpg(_fit(upright, 160), quality: 70);
  return (photo: _dataUrl(photo), thumb: _dataUrl(thumb));
}

/// The 160 px thumbnail of a stored photo (the list shows the first one).
String? _thumbOf(String photo) {
  final i = photo.indexOf(',');
  if (i < 0) return null;
  try {
    final decoded = img.decodeImage(base64Decode(photo.substring(i + 1)));
    return decoded == null ? null : _dataUrl(img.encodeJpg(_fit(decoded, 160), quality: 70));
  } catch (_) {
    return null;
  }
}

/// Asks camera or gallery, then prepares the pictures: one from the
/// camera, or up to [room] at once from the gallery (cars and shop products
/// alike, at most [maxCarPhotos] each). Empty when cancelled; throws
/// [FormatException] when none of the pictures can be read (e.g. HEIC).
Future<List<CarPhoto>> pickPhotos(BuildContext context, {required int room}) async {
  if (room <= 0) return const [];
  final t = T.of(context);
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    showDragHandle: true,
    useSafeArea: true,
    backgroundColor: Hgv.of(context).elevated,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(
          leading: const Icon(Icons.photo_camera_outlined),
          title: Text(t('photo.camera')),
          onTap: () => Navigator.pop(c, ImageSource.camera),
        ),
        ListTile(
          leading: const Icon(Icons.photo_library_outlined),
          title: Text(t('photo.gallery')),
          onTap: () => Navigator.pop(c, ImageSource.gallery),
        ),
        const SizedBox(height: 8),
      ]),
    ),
  );
  if (source == null) return const [];
  // A first downscale on the device keeps memory low; the exact sizes come after.
  final picker = ImagePicker();
  final List<XFile> files;
  if (source == ImageSource.gallery && room > 1) {
    files = await picker.pickMultiImage(limit: room, maxWidth: 2560, maxHeight: 2560, imageQuality: 92);
  } else {
    final one = await picker.pickImage(source: source, maxWidth: 2560, maxHeight: 2560, imageQuality: 92);
    files = one == null ? const [] : [one];
  }
  final out = <CarPhoto>[];
  for (final f in files.take(room)) {
    final prepared = await compute(_prepare, await f.readAsBytes());
    if (prepared != null) out.add(prepared);
  }
  if (files.isNotEmpty && out.isEmpty) throw const FormatException('unreadable photo');
  return out;
}

String? _tinyOf(String photo) {
  final i = photo.indexOf(',');
  if (i < 0) return null;
  try {
    final decoded = img.decodeImage(base64Decode(photo.substring(i + 1)));
    return decoded == null ? null : _dataUrl(img.encodeJpg(_fit(decoded, 40), quality: 50));
  } catch (_) {
    return null;
  }
}

/// A 40 px preview of a photo (about 1 KB): what Messages shows, blurred,
/// until the photo itself has loaded.
Future<String?> tinyPreview(String photo) => compute(_tinyOf, photo);

/// The JPEG bytes inside a photo data URL.
Uint8List photoBytes(String photo) => base64Decode(photo.substring(photo.indexOf(',') + 1));

/// Reads the car's photos from the server, applies [change] to that fresh
/// list (so photos someone else just added are kept), and saves the result
/// with the matching thumbnail ([thumbs] holds ones already made, by photo).
/// Returns the photos now stored.
Future<List<String>> updateCarPhotos(
  Session s,
  String id,
  List<String> Function(List<String> fresh) change, {
  Map<String, String> thumbs = const {},
}) async {
  final res = await s.api.get('${Svc.products}/products/$id');
  final data = (res as Map)['data'];
  final fresh = <String>[];
  try {
    final list = jsonDecode('${data is Map ? data['images'] ?? '[]' : '[]'}');
    if (list is List) fresh.addAll(list.whereType<String>().where((x) => x.startsWith('data:image/')));
  } catch (_) {}
  final next = change(fresh).take(maxCarPhotos).toList();
  final thumb = next.isEmpty ? '' : (thumbs[next.first] ?? await compute(_thumbOf, next.first) ?? '');
  await s.api.put('${Svc.products}/products/$id', {
    // "" clears them, as the website does when every photo is removed.
    'images': next.isEmpty ? '' : jsonEncode(next),
    'thumbnail': thumb,
  });
  return next;
}

/// Saves a photo into the phone's gallery. False when the person refused
/// access or saving failed.
Future<bool> savePhotoToPhone(String dataUrl) async {
  final i = dataUrl.indexOf(',');
  if (i < 0) return false;
  try {
    if (!await Gal.hasAccess() && !await Gal.requestAccess()) return false;
    await Gal.putImageBytes(base64Decode(dataUrl.substring(i + 1)), name: 'higoverse_${DateTime.now().millisecondsSinceEpoch}');
    return true;
  } catch (_) {
    return false;
  }
}
