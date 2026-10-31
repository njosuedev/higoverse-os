import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:higoverse_inventory_mobile/src/app_settings.dart';
import 'package:higoverse_inventory_mobile/src/i18n.dart';
import 'package:higoverse_inventory_mobile/src/screens/attendance_screen.dart';
import 'package:higoverse_inventory_mobile/src/screens/more_screen.dart';
import 'package:higoverse_inventory_mobile/src/screens/partners_screen.dart';
import 'package:higoverse_inventory_mobile/src/screens/purchases_screen.dart';
import 'package:higoverse_inventory_mobile/src/screens/reports_screen.dart';
import 'package:higoverse_inventory_mobile/src/screens/settings_screen.dart';
import 'package:higoverse_inventory_mobile/src/session.dart';
import 'package:higoverse_inventory_mobile/src/shop_sale.dart';
import 'package:higoverse_inventory_mobile/src/theme.dart';

// Each new shop screen against a fake server: it loads, shows its figures
// and lays out without overflowing on a phone-sized screen.

final _today = DateTime.now();
String _d(int daysAgo) {
  final d = _today.subtract(Duration(days: daysAgo));
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

final _products = [
  {'id': 'p1', 'name': 'Sugar 1kg', 'quantity': 40, 'cost_price': 800, 'selling_price': 1000, 'supplier_id': 'sup1'},
  {'id': 'p2', 'name': 'Rice 5kg with a long name that does not fit', 'quantity': 3, 'cost_price': 3500, 'selling_price': 4500},
  {'id': 'p3', 'name': 'Soap', 'quantity': 0, 'cost_price': 500, 'selling_price': 700},
];

Object? _answer(Uri u) {
  final p = u.path;
  if (p.endsWith('/suppliers/suppliers')) {
    return {
      'data': {
        'items': [
          {'id': 'sup1', 'name': 'INYANGE Industries', 'address': 'TIN:123456789|KN 5 Ave', 'email': 'a@b.rw'},
          {'id': 'c1', 'name': 'Jean Mugisha', 'phone': '0781234567', 'address': 'Musanze'},
        ],
      },
    };
  }
  if (p.endsWith('/products/products')) {
    return {
      'data': {'items': _products, 'total': _products.length}
    };
  }
  if (p.endsWith('/purchases/purchases')) {
    return {
      'data': {
        'items': [
          {
            'id': 'u1',
            'product_name': 'Sugar 1kg',
            'supplier_id': 'sup1',
            'quantity_added': 50,
            'cost_price': 800,
            'total_cost': 40000,
            'created_at': '${_d(1)}T09:00:00'
          },
          {'id': 'u2', 'product_name': 'Rice 5kg', 'quantity_added': 10, 'cost_price': 3500, 'total_cost': 35000, 'created_at': '${_d(3)}T09:00:00'},
        ],
        'total': 2,
      },
    };
  }
  if (p.endsWith('/reports/summary')) {
    return {
      'data': {'revenue': 1250000, 'profit': 300000, 'items_sold': 420, 'sales_count': 96, 'unique_customers': 12}
    };
  }
  if (p.endsWith('/reports/top-items')) {
    return {
      'data': [
        {'product_id': 'p1', 'product_name': 'Sugar 1kg', 'qty_sold': 300, 'revenue': 300000},
        {'product_id': 'p2', 'product_name': 'Rice 5kg', 'qty_sold': 50, 'revenue': 225000},
      ],
    };
  }
  if (p.endsWith('/reports/daily')) {
    return {
      'data': [
        for (var i = 0; i < 56; i += 3) {'day': _d(i), 'revenue': 20000 + i * 1000, 'sales_count': 3 + i % 5}
      ],
    };
  }
  if (p.endsWith('/expenses/summary')) {
    return {
      'data': {'total_expenses': 180000, 'count': 7}
    };
  }
  if (p.endsWith('/expenses/daily')) {
    return {
      'data': [
        for (var i = 0; i < 56; i += 4) {'day': '${_d(i)}T00:00:00', 'total': 9000}
      ]
    };
  }
  if (p.contains('/payroll/attendance/day/')) {
    return {
      'data': {
        'day': _d(0),
        'today': _d(0),
        'rows': [
          {
            'employee': {'id': 'e1', 'full_name': 'Alice Uwase', 'position': 'Cashier'},
            'mark': {'status': 'present', 'note': 'On time', 'marked_by_name': 'Owner'}
          },
          {
            'employee': {'id': 'e2', 'full_name': 'Eric Habimana', 'position': 'Storekeeper'},
            'mark': null
          },
        ],
      },
    };
  }
  if (p.contains('/payroll/attendance/month/')) {
    return {
      'data': {
        'period': _d(0).substring(0, 7),
        'first': '${_d(0).substring(0, 7)}-01',
        'last': _d(0),
        'today': _d(0),
        'rows': [
          {
            'employee': {'id': 'e1', 'full_name': 'Alice Uwase'},
            'counts': {'present': 20, 'absent': 1, 'late': 2, 'leave': 0, 'sick': 1},
            'days': {_d(0): 'present', '${_d(0).substring(0, 7)}-01': 'late'},
          },
        ],
      },
    };
  }
  if (p.endsWith('/auth/api/v1/shop')) {
    return {
      'data': {
        'id': 's',
        'name': 'Duka rya Kalisa',
        'phone': '+250788123456',
        'tin': '123456789',
        'address': 'KK 15 Ave|Lat:-1.9|Lng:30.1',
        'description': '{"_d":"Groceries"}'
      }
    };
  }
  if (p.endsWith('/settings/settings')) {
    return {
      'data': {
        'currency': 'RWF',
        'low_stock_threshold': 10,
        'tax_rate': 18,
        'bank_accounts': [
          {'id': 'b1', 'bank_name': 'Bank of Kigali', 'bank_account': '00012345678', 'bank_holder': 'KALISA LTD', 'is_default': true},
        ],
      },
    };
  }
  return {'data': {}};
}

Session _session() {
  final client = MockClient((req) async => http.Response(jsonEncode(_answer(req.url)), 200, headers: {'content-type': 'application/json'}));
  return Session(client: client)
    ..accessToken = 't'
    ..user = User(id: 'u', name: 'Kalisa', email: 'k@duka.rw', role: 'owner')
    ..shop = Shop(id: 's', name: 'Duka rya Kalisa', layout: 'retail');
}

Future<void> _open(WidgetTester tester, Widget screen, {double width = 1080}) async {
  tester.view.physicalSize = Size(width, 2340);
  tester.view.devicePixelRatio = 2.625;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(AppSettingsScope(
    settings: AppSettings(),
    child: SessionScope(
      session: _session(),
      child: MaterialApp(
        theme: buildTheme(Brightness.light),
        builder: (context, c) => LangScope(lang: 'en', child: c!),
        home: screen,
      ),
    ),
  ));
  // The fake server answers on real time: let it, then draw.
  for (var i = 0; i < 4; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('purchases: history, then what is in stock', (tester) async {
    await _open(tester, const PurchasesScreen());
    expect(find.text('Sugar 1kg'), findsOneWidget);
    expect(find.textContaining('75,000 RWF'), findsOneWidget);
    expect(find.textContaining('INYANGE Industries'), findsOneWidget);
    await tester.tap(find.text('Inventory'));
    await tester.pump();
    expect(find.text('Soap'), findsOneWidget);
    expect(find.text('Almost Finished'), findsWidgets);
  });

  testWidgets('partners: suppliers and customers', (tester) async {
    await _open(tester, const PartnersScreen());
    expect(find.text('INYANGE Industries'), findsOneWidget);
    expect(find.text('Jean Mugisha'), findsOneWidget);
    await tester.tap(find.text('Suppliers').first);
    await tester.pump();
    expect(find.text('Jean Mugisha'), findsNothing);
  });

  testWidgets('reports: figures, weeks, top sellers and alerts', (tester) async {
    await _open(tester, const ReportsScreen());
    expect(find.textContaining('96 sales'), findsOneWidget);
    expect(find.text('Weekly Performance'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Top Selling Items'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Top Selling Items'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Recent Purchases'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Recent Purchases'), findsOneWidget);
  });

  testWidgets('attendance: the day, then the month', (tester) async {
    await _open(tester, const AttendanceScreen());
    expect(find.text('Alice Uwase'), findsOneWidget);
    expect(find.text('Mark everyone present'), findsOneWidget);
    await tester.tap(find.text('Month'));
    for (var i = 0; i < 4; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('Alice Uwase'), findsOneWidget);
  });

  testWidgets('settings: business, money, bank, password', (tester) async {
    await _open(tester, const SettingsScreen());
    expect(find.text('Duka rya Kalisa'), findsOneWidget);
    expect(find.text('KK 15 Ave'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Bank of Kigali'), 300, scrollable: find.byType(Scrollable).first);
    await tester.scrollUntilVisible(find.text('Change Password'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Change Password'), findsOneWidget);
  });

  testWidgets('business tab: the website\'s sections for a shop', (tester) async {
    PackageInfo.setMockInitialValues(appName: 'Higoverse', packageName: 'com.higoverse', version: '1.0.0', buildNumber: '1', buildSignature: '');
    await _open(tester, const MoreScreen());
    await tester.scrollUntilVisible(find.text('Purchases'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Partners'), findsOneWidget);
    expect(find.text('Reports'), findsOneWidget);
    expect(find.text('Attendance'), findsOneWidget);
  });

  testWidgets('a small phone: nothing overflows', (tester) async {
    PackageInfo.setMockInitialValues(appName: 'Higoverse', packageName: 'com.higoverse', version: '1.0.0', buildNumber: '1', buildSignature: '');
    for (final screen in const [PurchasesScreen(), PartnersScreen(), ReportsScreen(), AttendanceScreen(), SettingsScreen(), MoreScreen()]) {
      await _open(tester, screen, width: 840);
      expect(tester.takeException(), isNull, reason: '${screen.runtimeType}');
    }
    for (final screen in [
      const PurchaseFormScreen(),
      PurchaseFormScreen(product: _products[1]),
      const PartnerFormScreen(others: []),
      ShopSaleFormScreen(product: _products[1]),
    ]) {
      await _open(tester, screen, width: 840);
      expect(tester.takeException(), isNull, reason: '${screen.runtimeType}');
    }
    await _open(tester, const PurchasesScreen(), width: 840);
    await tester.tap(find.text('Inventory'));
    await tester.pump();
    expect(tester.takeException(), isNull, reason: 'inventory');
  });

  test('every screen title exists in Kinyarwanda', () {
    for (final k in ['nav.purchases', 'nav.partners', 'nav.reports', 'att.title', 'settings.title']) {
      expect(const T('rw')(k), isNot(k));
    }
  });
}
