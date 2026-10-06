import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/proforma.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';

void main() {
  test('a proforma becomes an A4 PDF (works offline, built-in font)', () async {
    final s = Session()..shop = Shop(id: 's', name: 'Zhongfu Auto', layout: 'car', phone: '+250 795 018 970', address: 'Kigali');
    final bytes = await proformaPdf({
      'invoice_no': 'PRO-123456', 'date': '2026-10-06', 'valid_until': '2026-10-20', 'customer': 'Jean Bosco',
      'lines': [{'product_name': 'Toyota RAV4', 'qty': 1, 'unit_price': 18500000}],
      'subtotal': 18500000, 'tax_rate': 0, 'tax_amount': 0, 'grand_total': 18500000, 'currency': 'RWF', 'notes': '50% deposit',
    }, s, const T('en'));
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    expect(bytes.length, greaterThan(1000));
    final out = Platform.environment['HGV_PDF_OUT'];
    if (out != null) File(out).writeAsBytesSync(bytes);
  });
}
