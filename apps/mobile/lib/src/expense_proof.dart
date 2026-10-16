import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'config.dart';
import 'i18n.dart';
import 'session.dart';
import 'theme.dart';

/// Same limits as the website and expense-service (_MAX_FILES, 5 MB each).
const maxProofFiles = 5;

/// A receipt photo ready to upload.
typedef ProofFile = ({String name, String type, Uint8List bytes});

String _typeOf(String name) {
  final n = name.toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/// The bytes of a proof file's data URL; null when it can't be read. Not
/// cached (media.dart's dataUrlBytes keeps them): receipts are big and rare.
Uint8List? _bytesOf(String d) {
  final i = d.indexOf(',');
  if (!d.startsWith('data:') || i < 0) return null;
  try {
    return base64Decode(d.substring(i + 1));
  } catch (_) {
    return null;
  }
}

/// Asks camera or gallery, then returns the receipt photos: one from the
/// camera, or up to [room] from the gallery. Empty when cancelled. Photos
/// are scaled down on the phone so each stays well under 5 MB.
Future<List<ProofFile>> pickProofPhotos(BuildContext context, {int room = maxProofFiles}) async {
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
  final picker = ImagePicker();
  final List<XFile> files;
  if (source == ImageSource.gallery && room > 1) {
    files = await picker.pickMultiImage(limit: room, maxWidth: 2000, maxHeight: 2000, imageQuality: 85);
  } else {
    final one = await picker.pickImage(source: source, maxWidth: 2000, maxHeight: 2000, imageQuality: 85);
    files = one == null ? const [] : [one];
  }
  return [
    for (final f in files.take(room)) (name: f.name, type: _typeOf(f.name), bytes: await f.readAsBytes()),
  ];
}

/// Attaches [files] as the proof of expense [id] (replaces any earlier proof,
/// as on the website).
Future<void> uploadExpenseProof(Session s, String id, List<ProofFile> files) =>
    s.api.upload('${Svc.expenses}/expenses/$id/proof', files);

/// Shows the proof attached to expense [id]: photos full screen (pinch to
/// zoom); a PDF is named, to open on the website.
Future<void> showExpenseProof(BuildContext context, String id) async {
  final t = T.of(context);
  final res = await SessionScope.of(context).api.get('${Svc.expenses}/expenses/$id/proof');
  final data = res is Map ? res['data'] : null;
  final files = [
    for (final f in (data is Map && data['files'] is List ? data['files'] as List : const []))
      if (f is Map) f,
  ];
  if (!context.mounted) return;
  if (files.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('exp.no_proof'))));
    return;
  }
  await Navigator.of(context).push(MaterialPageRoute<void>(
    builder: (page) => Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(t('exp.proof')),
      ),
      body: PageView(children: [
        for (final f in files)
          Builder(builder: (_) {
            final bytes = '${f['type']}'.startsWith('image/') ? _bytesOf('${f['data']}') : null;
            if (bytes != null) {
              return InteractiveViewer(maxScale: 5, child: Center(child: Image.memory(bytes, fit: BoxFit.contain)));
            }
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.picture_as_pdf_outlined, color: Colors.white70, size: 64),
                  const SizedBox(height: 12),
                  Text('${f['name'] ?? ''}', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Text(t('exp.proof_pdf'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
                ]),
              ),
            );
          }),
      ]),
    ),
  ));
}
