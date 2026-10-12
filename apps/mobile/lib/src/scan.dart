import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'i18n.dart';
import 'theme.dart';

/// Reads one barcode with the camera and returns its text (null if the
/// person goes back). Opened from search: the code is searched at once.
Future<String?> scanBarcode(BuildContext context) =>
    Navigator.of(context).push<String>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const _ScanScreen()));

class _ScanScreen extends StatefulWidget {
  const _ScanScreen();

  @override
  State<_ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<_ScanScreen> {
  final _camera = MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates);
  bool _done = false;

  @override
  void dispose() {
    _camera.dispose();
    super.dispose();
  }

  void _found(BarcodeCapture capture) {
    if (_done) return;
    final code = capture.barcodes.map((b) => b.rawValue).whereType<String>().where((v) => v.trim().isNotEmpty).firstOrNull;
    if (code == null) return;
    _done = true;
    HapticFeedback.mediumImpact();
    Navigator.of(context).pop(code.trim());
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(t('search.scan')),
        actions: [
          IconButton(
            tooltip: t('scan.torch'),
            icon: const Icon(Icons.flashlight_on_outlined),
            onPressed: _camera.toggleTorch,
          ),
        ],
      ),
      body: Stack(fit: StackFit.expand, children: [
        MobileScanner(
          controller: _camera,
          onDetect: _found,
          errorBuilder: (context, error) => Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(t('scan.no_camera'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 16)),
            ),
          ),
        ),
        // Where to hold the code.
        IgnorePointer(
          child: Center(
            child: Container(
              width: 260,
              height: 160,
              decoration: BoxDecoration(border: Border.all(color: c.ink, width: 3), borderRadius: BorderRadius.circular(16)),
            ),
          ),
        ),
        Positioned(
          left: 24,
          right: 24,
          bottom: 48,
          child: Text(t('scan.hint'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}
