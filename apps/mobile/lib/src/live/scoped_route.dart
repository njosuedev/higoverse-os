import 'package:flutter/material.dart';

import 'activity.dart';
import 'live.dart';

/// Opens [page] on top of the signed-in shell. Pushed pages sit above the
/// shell in the widget tree, so they would lose the live connection and the
/// activity feed; this hands both on.
Future<T?> pushScoped<T>(BuildContext context, Widget page) {
  final live = LiveScope.read(context);
  final feed = FeedScope.read(context);
  Widget w = page;
  if (feed != null) w = FeedScope(feed: feed, child: w);
  if (live != null) w = LiveScope(live: live, child: w);
  return Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => w));
}
