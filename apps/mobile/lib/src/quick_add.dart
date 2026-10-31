import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import 'forms.dart';
import 'i18n.dart';
import 'live/scoped_route.dart';
import 'proforma.dart';
import 'screens/purchases_screen.dart';
import 'session.dart';
import 'theme.dart';

/// One thing that can be created from anywhere: its name, icon and form.
typedef QuickAction = ({String label, IconData icon, Future<void> Function() run});

/// What the "+" at the top creates — the same list as search's shortcuts.
/// Expenses only for those who keep the expense book.
List<QuickAction> quickActions(BuildContext context) {
  final s = SessionScope.of(context);
  final t = T.of(context);
  return [
    (label: t('form.new_sale'), icon: PhosphorIconsRegular.receipt, run: () async => recordSale(context)),
    if (s.isCar)
      (label: t('vehicle.new'), icon: PhosphorIconsRegular.car, run: () async => addVehicle(context))
    else
      (label: t('form.new_product'), icon: PhosphorIconsRegular.package, run: () async => editProduct(context)),
    // Shops buy stock from suppliers; car companies stock in from Vehicles.
    if (!s.isCar) (label: t('purchases.add'), icon: PhosphorIconsRegular.truck, run: () async => recordPurchase(context)),
    if (s.canUseExpenses) (label: t('form.new_expense'), icon: PhosphorIconsRegular.wallet, run: () async => recordExpense(context)),
    (label: t('form.new_debt'), icon: PhosphorIconsRegular.handCoins, run: () async => recordDebt(context)),
    (label: t('pf.new'), icon: PhosphorIconsRegular.fileText, run: () => newProforma(context)),
  ];
}

/// A new proforma, then the proforma itself (to print or share).
Future<void> newProforma(BuildContext context) async {
  final p = await pushScoped<Map<String, dynamic>>(context, const ProformaFormScreen());
  if (p != null && context.mounted) await pushScoped<bool>(context, ProformaScreen(proforma: p));
}

/// The "+" sheet: every form one tap away, as a grid of big tiles.
Future<void> showQuickAdd(BuildContext context) {
  HapticFeedback.selectionClick();
  final actions = quickActions(context);
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    useSafeArea: true,
    backgroundColor: Hgv.of(context).elevated,
    builder: (sheet) {
      final c = Hgv.of(sheet);
      final t = T.of(sheet);
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t('add.title'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
          const SizedBox(height: 14),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.05,
            children: [
              for (final a in actions)
                Material(
                  color: c.paper,
                  borderRadius: BorderRadius.circular(16),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () {
                      Navigator.pop(sheet);
                      a.run();
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(color: c.ink.withValues(alpha: 0.12), shape: BoxShape.circle),
                          child: Icon(a.icon, color: c.ink, size: 24),
                        ),
                        const SizedBox(height: 8),
                        Text(a.label,
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, height: 1.15)),
                      ]),
                    ),
                  ),
                ),
            ],
          ),
        ]),
      );
    },
  );
}
