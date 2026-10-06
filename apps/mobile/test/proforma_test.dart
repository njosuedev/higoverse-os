import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/proforma.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';

/// Pages in a PDF: one "/Type /Page" object each (not "/Pages").
int pageCount(List<int> bytes) => RegExp(r'/Type\s*/Page[^s]').allMatches(String.fromCharCodes(bytes)).length;

void main() {
  final s = Session()..shop = Shop(id: 's', name: 'Zhongfu Auto', layout: 'car', phone: '+250 795 018 970', address: 'TIN:135298118|Addr:Kigali - Kicukiro');
  const t = T('en');
  final terms = t('pf.default_terms');
  Map<String, dynamic> proforma({String? termsText, int cars = 1}) => {
        'invoice_no': 'PRO-123456', 'date': '2026-10-06', 'valid_until': '2026-10-20', 'customer': 'Jean Bosco',
        'customer_id_no': '1199180044604345', 'customer_phone': '0783183866',
        'lines': [
          for (var i = 0; i < cars; i++)
            {'product_name': 'BYD Yuan Up', 'qty': 1, 'unit_price': 18500000, 'chassis_no': 'LL3123334$i', 'plate_no': 'RAJ40${i}D', 'year': '2020', 'color': 'WHITE'},
        ],
        'subtotal': 18500000 * cars, 'tax_rate': 0, 'tax_amount': 0, 'grand_total': 18500000 * cars, 'currency': 'RWF',
        'payment_method': 'Bank : 4002201237868',
        'bank_details': 'Equity Bank Account No.: 4002201237868\nAccount holder: ZHONGFU AUTOMOBILE TRADING',
        'terms': termsText ?? terms, 'notes': '50% deposit', 'status': 'approved', 'approved_by': 'Owner',
      };

  test('a proforma becomes an A4 PDF (works offline, built-in font)', () async {
    final bytes = await proformaPdf(proforma(), s, t);
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    expect(bytes.length, greaterThan(1000));
    final out = Platform.environment['HGV_PDF_OUT'];
    if (out != null) File(out).writeAsBytesSync(bytes);
  });

  test('details on sheet 1; bank, terms and signatures fit on sheet 2', () async {
    expect(pageCount(await proformaPdf(proforma(), s, t)), 2);
    // Four times the terms are shrunk to fit, not spilled onto a third page.
    expect(pageCount(await proformaPdf(proforma(termsText: [terms, terms, terms, terms].join('\n')), s, t)), 2);
  });

  test('two cars share sheet 1; a third moves to its own sheet', () async {
    expect(pageCount(await proformaPdf(proforma(cars: 2), s, t)), 2);
    expect(pageCount(await proformaPdf(proforma(cars: 3), s, t)), 3);
  });

  test('deposits: what is paid and what is left', () {
    final pay = proformaPayments({
      'grand_total': 20000000,
      'deposits': [
        {'amount': 5000000, 'method': 'mtn', 'date': '2026-10-05'},
        {'amount': 3000000, 'method': 'bank', 'date': '2026-10-06'},
      ],
    });
    expect(pay.paid, 8000000);
    expect(pay.balance, 12000000);
    expect(proformaPayments({'grand_total': 100}).balance, 100);
  });

  test('deposits are listed on the PDF, still two sheets', () async {
    final withDeposits = {
      ...proforma(),
      'deposit_amount': 8000000,
      'deposits': [
        {'id': 'a', 'amount': 5000000, 'method': 'mtn', 'date': '2026-10-05', 'reference': 'MP2610.1234'},
        {'id': 'b', 'amount': 3000000, 'method': 'bank', 'date': '2026-10-06', 'reference': ''},
      ],
    };
    final bytes = await proformaPdf(withDeposits, s, t);
    expect(pageCount(bytes), 2);
    final out = Platform.environment['HGV_PDF_DEP_OUT'];
    if (out != null) File(out).writeAsBytesSync(bytes);
  });
}
