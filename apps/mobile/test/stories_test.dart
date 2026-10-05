import 'package:flutter_test/flutter_test.dart';
import 'package:higoverse_inventory_mobile/src/stories.dart';

void main() {
  final now = DateTime(2026, 10, 5, 12);
  String days(int n) => now.subtract(Duration(days: n)).toUtc().toIso8601String();

  test('shops: sold out, running low, best sellers and new stock, empty topics left out', () {
    final g = storyGroups(
      isCar: false,
      now: now,
      alerts: [
        {'id': 'a', 'name': 'Sugar', 'quantity': 0},
        {'id': 'b', 'name': 'Rice', 'quantity': 3},
        {'id': 'c', 'name': 'Salt', 'quantity': 0},
      ],
      top: [
        {'product_id': 'd', 'product_name': 'Soap', 'qty_sold': 12, 'revenue': 6000},
        {'product_id': 'e', 'product_name': 'Oil', 'qty_sold': 0},
      ],
      newest: [
        {'id': 'f', 'name': 'Tea', 'quantity': 20, 'created_at': days(2)},
        {'id': 'g', 'name': 'Old', 'quantity': 5, 'created_at': days(30)},
      ],
    );
    expect(g.map((x) => x.kind), [StoryKind.soldOut, StoryKind.low, StoryKind.best, StoryKind.fresh]);
    expect(g[0].stories.map((s) => s.itemId), ['a', 'c']);
    expect(g[2].stories.single.item['name'], 'Soap', reason: 'nothing sold is no best seller');
    expect(g[3].stories.single.itemId, 'f', reason: 'only stock added this week is new');
  });

  test('car dealers: fines and transfers only', () {
    final g = storyGroups(isCar: true, now: now, fined: [{'id': 'v1', 'attributes': '{"penalty_count":"2"}'}], alerts: [{'id': 'x', 'quantity': 0}]);
    expect(g.map((x) => x.kind), [StoryKind.fines]);
  });

  test('a story is new again when its situation changes', () {
    const a = Story(StoryKind.low, {'id': 'b', 'quantity': 3});
    const b = Story(StoryKind.low, {'id': 'b', 'quantity': 1});
    expect(a.id == b.id, isFalse);
  });
}
