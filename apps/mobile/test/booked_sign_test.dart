import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/booked_sign.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';

/// Pages in a PDF: one "/Type /Page" object each (not "/Pages").
int pageCount(List<int> bytes) => RegExp(r'/Type\s*/Page[^s]').allMatches(String.fromCharCodes(bytes)).length;

void main() {
  final s = Session()..shop = Shop(id: 's', name: 'Zhongfu Auto', layout: 'car');
  Map<String, dynamic> proforma({int cars = 1}) => {
        'invoice_no': 'PRO-123456', 'date': '2026-11-13', 'valid_until': '2026-11-27', 'customer': 'Jean Bosco',
        'customer_phone': '0783183866', 'salesperson': 'Alice', 'grand_total': 18500000, 'currency': 'RWF',
        'lines': [
          for (var i = 0; i < cars; i++)
            {'product_name': 'BYD Yuan Up', 'chassis_no': 'LL3123334$i', 'plate_no': 'RAJ40${i}D', 'year': '2020', 'color': 'WHITE', 'mileage': '12000'},
        ],
      };

  test('the BOOKED sign is one landscape A4 page, also with several cars', () async {
    final bytes = await bookedSignPdf(proforma(), s, const T('en'));
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    expect(pageCount(bytes), 1);
    expect(pageCount(await bookedSignPdf(proforma(cars: 3), s, const T('fr'))), 1);
    final out = Platform.environment['HGV_PDF_OUT'];
    if (out != null) File(out).writeAsBytesSync(bytes);
  });
}
